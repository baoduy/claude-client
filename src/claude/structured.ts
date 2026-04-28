import { EventEmitter } from 'events';

import { ClaudeClient, ClaudeClientConfig, ToolResultEvent, ToolUseStartEvent } from './client.js';
import {
    buildQuestionPrompts,
    cloneOpenRequest,
    cloneQuestionPrompt,
    cloneSnapshot,
    getQuestionLookupKeys,
    ITurnSession,
    nowIso,
    resolveQuestionPrompt,
    TurnHandle
} from './turn-handle.js';
import {
    AssistantMessage,
    ControlRequestMessage,
    ControlResponseData,
    McpMessageRequest,
    PermissionScope,
    ResultMessage,
    StreamEventMessage,
    Suggestion,
    Usage
} from './types.js';

export {
    type ClaudeQuestionSessionSnapshot,
    type ClaudeSendContentBlock,
    type ClaudeSendInput,
    type ClaudeSendOptions,
    type HookRequest,
    type McpRequest,
    type OpenRequest,
    type OutputKind,
    type QuestionAnswerInput,
    type QuestionAnswerValue,
    type QuestionOption,
    type QuestionPrompt,
    type QuestionRequest,
    TurnHandle,
    type TurnHistoryEntry,
    type TurnMessageState,
    type TurnResult,
    type TurnSnapshot,
    type TurnStatus,
    type TurnUpdate,
    type ToolApprovalRequest,
    type ToolResultState,
    type ToolUseState
} from './turn-handle.js';

import {
    ClaudeQuestionSessionSnapshot,
    ClaudeSendInput,
    ClaudeSendOptions,
    HookRequest,
    McpRequest,
    OpenRequest,
    QuestionAnswerInput,
    QuestionAnswerValue,
    QuestionPrompt,
    QuestionRequest,
    ToolApprovalRequest,
    TurnSnapshot
} from './turn-handle.js';

interface InternalBaseRequest {
    sdkRequestId: string;
    request: OpenRequest;
}

interface InternalQuestionRequest extends InternalBaseRequest {
    request: QuestionRequest;
}

interface InternalToolRequest extends InternalBaseRequest {
    request: ToolApprovalRequest;
}

interface InternalHookRequest extends InternalBaseRequest {
    request: HookRequest;
}

interface InternalMcpRequest extends InternalBaseRequest {
    request: McpRequest;
}

type InternalOpenRequest = InternalQuestionRequest | InternalToolRequest | InternalHookRequest | InternalMcpRequest;

import { ClaudeQuestionSession } from './question-session.js';
export { ClaudeQuestionSession };

export class StructuredClaudeClient extends EventEmitter implements ITurnSession {
    private readonly rawClient: ClaudeClient;
    private readonly turns: TurnHandle[] = [];
    private readonly pendingTurns: TurnHandle[] = [];
    private readonly openRequests = new Map<string, InternalOpenRequest>();
    private activeTurn: TurnHandle | null = null;
    private turnCounter = 0;

    constructor(rawClient: ClaudeClient) {
        super();
        this.rawClient = rawClient;
        this.attachRawEventHandlers();
    }

    static async init(config: ClaudeClientConfig): Promise<StructuredClaudeClient> {
        const rawClient = new ClaudeClient(config);
        await rawClient.start();
        return new StructuredClaudeClient(rawClient);
    }

    static fromRawClient(rawClient: ClaudeClient): StructuredClaudeClient {
        return new StructuredClaudeClient(rawClient);
    }

    get sessionId(): string | null {
        return this.rawClient.sessionId;
    }

    get raw(): ClaudeClient {
        return this.rawClient;
    }

    send(input: ClaudeSendInput, options?: ClaudeSendOptions): TurnHandle {
        const turnId = `turn-${++this.turnCounter}`;
        const handle = new TurnHandle(this, turnId, input, options?.metadata);
        this.turns.push(handle);

        if (this.activeTurn) {
            handle.markQueued();
            this.pendingTurns.push(handle);
        } else {
            void this.startTurn(handle);
        }

        return handle;
    }

    getCurrentTurn(): TurnSnapshot | null {
        return this.activeTurn ? this.activeTurn.current() : null;
    }

    getHistory(): TurnSnapshot[] {
        return this.turns
            .filter((turn) => {
                const snapshot = turn.current();
                return snapshot.status === 'completed' || snapshot.status === 'error';
            })
            .map((turn) => turn.current());
    }

    getOpenRequests(): OpenRequest[] {
        return Array.from(this.openRequests.values()).map((entry) => cloneOpenRequest(entry.request));
    }

    getOpenRequest(id: string): OpenRequest | null {
        const entry = this.openRequests.get(id);
        return entry ? cloneOpenRequest(entry.request) : null;
    }

    createQuestionSession(id: string): ClaudeQuestionSession {
        const entry = this.requireOpenRequest(id);
        if (entry.request.kind !== 'question') {
            throw new Error(`Request ${id} is not a question request.`);
        }

        return new ClaudeQuestionSession(this, entry.request);
    }

    async approveRequest(
        id: string,
        decision?: {
            message?: string;
            updatedInput?: Record<string, any>;
            updatedPermissions?: any[];
            scope?: PermissionScope;
            always?: boolean;
        }
    ): Promise<void> {
        const entry = this.requireOpenRequest(id);
        if (entry.request.kind !== 'tool_approval' && entry.request.kind !== 'hook') {
            throw new Error(`Request ${id} cannot be approved with approveRequest.`);
        }

        const responseData: ControlResponseData = {
            behavior: 'allow',
            message: decision?.message,
            updatedInput: decision?.updatedInput,
            updatedPermissions: decision?.updatedPermissions,
            scope: decision?.scope
        };

        if (entry.request.kind === 'tool_approval') {
            responseData.toolUseID = entry.request.toolUseId;
            if (responseData.updatedInput === undefined) {
                responseData.updatedInput = { ...entry.request.input };
            }
            if (decision?.always && entry.request.suggestions.length > 0 && responseData.updatedPermissions === undefined) {
                responseData.updatedPermissions = entry.request.suggestions.map((suggestion) => ({ ...suggestion }));
                responseData.scope = responseData.scope || 'session';
            }
        } else if (entry.request.kind === 'hook' && responseData.updatedInput === undefined) {
            responseData.updatedInput = { ...entry.request.input };
        }

        await this.rawClient.sendControlResponse(entry.sdkRequestId, responseData);
        this.resolveOpenRequest(id, 'resolved');
    }

    async denyRequest(id: string, reason?: string): Promise<void> {
        const entry = this.requireOpenRequest(id);
        if (entry.request.kind !== 'tool_approval' && entry.request.kind !== 'hook') {
            throw new Error(`Request ${id} cannot be denied with denyRequest.`);
        }

        const responseData: ControlResponseData = {
            behavior: 'deny',
            message: reason || 'Denied by user.'
        };

        if (entry.request.kind === 'tool_approval') {
            responseData.toolUseID = entry.request.toolUseId;
        }

        await this.rawClient.sendControlResponse(entry.sdkRequestId, responseData);
        this.resolveOpenRequest(id, 'resolved');
    }

    async answerQuestion(id: string, answers: QuestionAnswerInput): Promise<void> {
        const entry = this.requireOpenRequest(id);
        if (entry.request.kind !== 'question') {
            throw new Error(`Request ${id} is not a question request.`);
        }

        const updatedInput = buildQuestionUpdatedInput(entry.request, answers);
        await this.rawClient.sendControlResponse(entry.sdkRequestId, {
            behavior: 'allow',
            updatedInput
        });
        this.resolveOpenRequest(id, 'resolved');
    }

    async interruptTurn(_turnId?: string): Promise<void> {
        await this.rawClient.interrupt();
    }

    async setPermissionMode(mode: 'acceptEdits' | 'bypassPermissions' | 'default' | 'dontAsk' | 'plan'): Promise<void> {
        await this.rawClient.setPermissionMode(mode);
    }

    async setModel(model: string): Promise<void> {
        await this.rawClient.setModel(model);
    }

    async setMaxThinkingTokens(tokens: number): Promise<void> {
        await this.rawClient.setMaxThinkingTokens(tokens);
    }

    async listSupportedModels(timeoutMs?: number) {
        return this.rawClient.listSupportedModels(timeoutMs);
    }

    close(): void {
        this.rawClient.kill();
    }

    getOpenRequestsForTurn(turnId: string): OpenRequest[] {
        return Array.from(this.openRequests.values())
            .filter((entry) => entry.request.turnId === turnId && entry.request.status === 'open')
            .map((entry) => cloneOpenRequest(entry.request));
    }

    private turnFromRemote(createIfMissing = false): TurnHandle | null {
        if (this.activeTurn) {
            return this.activeTurn;
        }

        if (!createIfMissing) {
            return null;
        }

        const handle = new TurnHandle(this, `attached-${++this.turnCounter}`, { text: '' }, {
            resumed: true,
            synthetic: true
        });
        this.turns.push(handle);
        this.activeTurn = handle;
        handle.markStarted();
        return handle;
    }

    private async startTurn(handle: TurnHandle): Promise<void> {
        this.activeTurn = handle;
        handle.markStarted();

        try {
            const input = handle.current().input;
            if (typeof input === 'string') {
                await this.rawClient.sendMessage(input);
            } else if ('text' in input) {
                await this.rawClient.sendMessage(input.text);
            } else {
                await this.rawClient.sendMessageWithContent(input.content);
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            handle.fail(err);
            this.activeTurn = null;
            this.drainPendingTurns();
        }
    }

    private drainPendingTurns(): void {
        if (this.activeTurn || this.pendingTurns.length === 0) {
            return;
        }

        const nextTurn = this.pendingTurns.shift()!;
        void this.startTurn(nextTurn);
    }

    private attachRawEventHandlers(): void {
        this.rawClient.on('stream_event', (message) => {
            const turn = this.activeTurn;
            if (!turn) {
                return;
            }

            this.handleStreamEvent(turn, message);
        });

        this.rawClient.on('text_accumulated', (text) => {
            this.activeTurn?.updateOutput('text', text);
        });

        this.rawClient.on('thinking_accumulated', (thinking) => {
            this.activeTurn?.updateOutput('thinking', thinking);
        });

        this.rawClient.on('usage_update', (usage) => {
            this.activeTurn?.updateUsage(usage);
        });

        this.rawClient.on('tool_use_start', (tool) => {
            this.handleToolUse(tool);
        });

        this.rawClient.on('tool_result', (toolResult) => {
            this.handleToolResult(toolResult);
        });

        this.rawClient.on('message', (message) => {
            this.activeTurn?.addAssistantMessage(message);
        });

        this.rawClient.on('control_request', (message) => {
            this.handleControlRequest(message);
        });

        this.rawClient.on('control_cancel_request', (message) => {
            this.handleControlCancel(message.request_id);
        });

        this.rawClient.on('result', (message) => {
            const turn = this.activeTurn;
            if (!turn) {
                return;
            }

            turn.setOpenRequests([]);
            for (const [requestId, entry] of this.openRequests.entries()) {
                if (entry.request.turnId === turn.current().id) {
                    this.openRequests.delete(requestId);
                }
            }

            turn.complete({
                subtype: message.subtype,
                isError: message.is_error,
                result: message.result,
                error: message.error,
                durationMs: message.duration_ms,
                durationApiMs: message.duration_api_ms,
                numTurns: message.num_turns
            });
            this.activeTurn = null;
            this.drainPendingTurns();
        });

        this.rawClient.on('error', (error) => {
            if (this.activeTurn) {
                this.activeTurn.fail(error);
                this.activeTurn = null;
            }
            this.drainPendingTurns();
        });
    }

    private handleStreamEvent(turn: TurnHandle, message: StreamEventMessage): void {
        const event = message.event;
        if (event.type === 'message_start') {
            turn.updateStatus('running');
            return;
        }

        if (event.type === 'content_block_start') {
            if (event.content_block?.type === 'thinking') {
                turn.updateOutput('thinking', turn.current().thinking);
            } else if (event.content_block?.type === 'text') {
                turn.updateOutput('text', turn.current().text);
            } else if (event.content_block?.type === 'tool_use') {
                turn.updateStatus('running');
            }
            return;
        }

        if (event.type === 'message_delta' && event.usage) {
            turn.updateUsage(event.usage);
        }
    }

    private handleToolUse(tool: ToolUseStartEvent): void {
        this.activeTurn?.addToolUse({
            id: tool.id,
            name: tool.name,
            input: { ...tool.input },
            startedAt: nowIso()
        });
    }

    private handleToolResult(toolResult: ToolResultEvent): void {
        this.activeTurn?.addToolResult({
            toolUseId: toolResult.toolUseId,
            content: toolResult.content,
            isError: toolResult.isError,
            receivedAt: nowIso()
        });
    }

    private handleControlRequest(message: ControlRequestMessage): void {
        const turn = this.turnFromRemote(true);
        if (!turn) {
            return;
        }

        const request = message.request;
        const requestId = `${turn.current().id}-request-${this.openRequests.size + 1}`;
        let openRequest: OpenRequest | null = null;

        if (request.subtype === 'can_use_tool') {
            if (request.tool_name === 'AskUserQuestion') {
                const questions = buildQuestionPrompts(request.input);
                openRequest = {
                    id: requestId,
                    kind: 'question',
                    status: 'open',
                    createdAt: nowIso(),
                    turnId: turn.current().id,
                    title: questions[0]?.header,
                    prompt: questions.map((question) => question.prompt).join('\n\n'),
                    questions,
                    allowOther: true,
                    multiSelect: questions.some((question) => question.multiSelect),
                    currentQuestionIndex: 0
                };
            } else {
                openRequest = {
                    id: requestId,
                    kind: 'tool_approval',
                    status: 'open',
                    createdAt: nowIso(),
                    turnId: turn.current().id,
                    toolName: request.tool_name || 'unknown',
                    toolUseId: request.tool_use_id,
                    input: { ...(request.input || {}) },
                    suggestions: (request.permission_suggestions || []).map((suggestion: Suggestion) => ({ ...suggestion })),
                    blockedPath: request.blocked_path,
                    decisionReason: request.decision_reason
                };
            }
        } else if (request.subtype === 'hook_callback') {
            openRequest = {
                id: requestId,
                kind: 'hook',
                status: 'open',
                createdAt: nowIso(),
                turnId: turn.current().id,
                callbackId: request.callback_id,
                toolUseId: request.tool_use_id,
                input: { ...(request.input || {}) }
            };
        } else if (request.subtype === 'mcp_message') {
            openRequest = {
                id: requestId,
                kind: 'mcp',
                status: 'open',
                createdAt: nowIso(),
                turnId: turn.current().id,
                serverName: request.server_name,
                message: request.message
            };
        }

        if (!openRequest) {
            return;
        }

        turn.updateStatus('waiting');
        this.openRequests.set(requestId, {
            sdkRequestId: message.request_id,
            request: openRequest
        } as InternalOpenRequest);
        turn.setOpenRequests(this.getOpenRequestsForTurn(turn.current().id));
        turn.openRequest(openRequest);
    }

    private handleControlCancel(sdkRequestId: string): void {
        for (const [requestId, entry] of this.openRequests.entries()) {
            if (entry.sdkRequestId !== sdkRequestId) {
                continue;
            }

            entry.request.status = 'canceled';
            const turn = this.turns.find((candidate) => candidate.current().id === entry.request.turnId);
            this.openRequests.delete(requestId);
            if (turn) {
                turn.setOpenRequests(this.getOpenRequestsForTurn(entry.request.turnId));
                turn.closeRequest(entry.request);
                if (turn === this.activeTurn) {
                    turn.updateStatus('running');
                }
            }
            break;
        }
    }

    private requireOpenRequest(id: string): InternalOpenRequest {
        const entry = this.openRequests.get(id);
        if (!entry) {
            throw new Error(`Open request ${id} was not found.`);
        }
        return entry;
    }

    private resolveOpenRequest(id: string, status: 'resolved' | 'canceled'): void {
        const entry = this.openRequests.get(id);
        if (!entry) {
            return;
        }

        entry.request.status = status;
        const turn = this.turns.find((candidate) => candidate.current().id === entry.request.turnId);
        this.openRequests.delete(id);

        if (turn) {
            turn.setOpenRequests(this.getOpenRequestsForTurn(entry.request.turnId));
            turn.closeRequest(entry.request);
            if (turn === this.activeTurn) {
                turn.updateStatus('running');
            }
        }
    }
}

function buildQuestionUpdatedInput(request: QuestionRequest, answers: QuestionAnswerInput): Record<string, any> {
    const normalizedAnswers = normalizeQuestionAnswers(request, answers);
    const answersObject: Record<string, QuestionAnswerValue> = {};

    request.questions.forEach((question, index) => {
        const key = question.header || question.prompt || `Question ${index + 1}`;
        answersObject[key] = normalizedAnswers[index];
    });

    const questionSummary = request.questions.length === 1
        ? request.questions[0].prompt
        : request.questions.map((question) => question.header || question.prompt).join(', ');

    return {
        question: questionSummary,
        answers: answersObject
    };
}

function normalizeQuestionAnswers(request: QuestionRequest, answers: QuestionAnswerInput): QuestionAnswerValue[] {
    if (Array.isArray(answers)) {
        return answers.map((answer) => normalizeQuestionAnswerValue(answer));
    }

    if (typeof answers === 'string') {
        return [answers];
    }

    const mappedAnswers: QuestionAnswerValue[] = [];
    for (const question of request.questions) {
        const matchingKey = getQuestionLookupKeys(question).find((key) => answers[key] !== undefined);
        mappedAnswers.push(normalizeQuestionAnswerValue(matchingKey ? answers[matchingKey] : undefined));
    }
    return mappedAnswers;
}

function normalizeQuestionAnswerValue(value: QuestionAnswerValue | undefined): QuestionAnswerValue {
    if (Array.isArray(value)) {
        return value;
    }

    if (typeof value === 'string') {
        return value;
    }

    return '';
}
