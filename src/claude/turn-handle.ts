import { EventEmitter } from 'events';

import { AssistantMessage, Suggestion, Usage } from './types.js';

export type OutputKind =
    | 'idle'
    | 'text'
    | 'thinking'
    | 'tool_use'
    | 'tool_result'
    | 'tool_approval'
    | 'question'
    | 'hook'
    | 'mcp'
    | 'complete'
    | 'error';

export type TurnStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'error';

export interface ClaudeSendContentBlock {
    type: string;
    [key: string]: any;
}

export type ClaudeSendInput =
    | string
    | { text: string }
    | { content: ClaudeSendContentBlock[] };

export interface ClaudeSendOptions {
    metadata?: Record<string, unknown>;
}

export interface TurnMessageState {
    type: OutputKind;
    content: string;
    toolName?: string;
    toolUseId?: string;
    requestId?: string;
}

export interface ToolUseState {
    id: string;
    name: string;
    input: Record<string, any>;
    startedAt: string;
}

export interface ToolResultState {
    toolUseId: string;
    content: string;
    isError: boolean;
    receivedAt: string;
}

export interface QuestionOption {
    label: string;
    value: string;
    description?: string;
}

export interface QuestionPrompt {
    id: string;
    header?: string;
    prompt: string;
    options: QuestionOption[];
    multiSelect: boolean;
}

interface BaseOpenRequest {
    id: string;
    kind: 'tool_approval' | 'question' | 'hook' | 'mcp';
    status: 'open' | 'resolved' | 'canceled';
    createdAt: string;
    turnId: string;
}

export interface ToolApprovalRequest extends BaseOpenRequest {
    kind: 'tool_approval';
    toolName: string;
    toolUseId?: string;
    input: Record<string, any>;
    suggestions: Suggestion[];
    blockedPath?: string;
    decisionReason?: string;
}

export interface QuestionRequest extends BaseOpenRequest {
    kind: 'question';
    title?: string;
    prompt: string;
    questions: QuestionPrompt[];
    allowOther: boolean;
    multiSelect: boolean;
    currentQuestionIndex: number;
}

export interface HookRequest extends BaseOpenRequest {
    kind: 'hook';
    callbackId?: string;
    toolUseId?: string;
    input: Record<string, any>;
}

export interface McpRequest extends BaseOpenRequest {
    kind: 'mcp';
    serverName: string;
    message: any;
}

export type OpenRequest = ToolApprovalRequest | QuestionRequest | HookRequest | McpRequest;

export interface TurnHistoryEntry {
    kind: 'status' | 'output' | 'tool_use' | 'tool_result' | 'request_opened' | 'request_closed' | 'assistant_message' | 'completed' | 'error';
    timestamp: string;
    outputKind?: OutputKind;
    content?: string;
    toolUse?: ToolUseState;
    toolResult?: ToolResultState;
    request?: OpenRequest;
    status?: TurnStatus;
    message?: TurnMessageState;
    result?: TurnResult;
}

export interface TurnResult {
    subtype: 'success' | 'error';
    isError: boolean;
    result: string;
    error?: string;
    durationMs: number;
    durationApiMs: number;
    numTurns: number;
}

export interface TurnSnapshot {
    id: string;
    input: ClaudeSendInput;
    status: TurnStatus;
    currentOutputKind: OutputKind;
    currentMessage: TurnMessageState;
    text: string;
    thinking: string;
    toolUses: ToolUseState[];
    toolResults: ToolResultState[];
    openRequests: OpenRequest[];
    history: TurnHistoryEntry[];
    usage?: Usage;
    startedAt: string;
    completedAt?: string;
    result?: TurnResult;
    metadata?: Record<string, unknown>;
}

export interface TurnUpdate {
    turnId: string;
    snapshot: TurnSnapshot;
    kind:
        | 'queued'
        | 'started'
        | 'output'
        | 'tool_use'
        | 'tool_result'
        | 'request_opened'
        | 'request_closed'
        | 'assistant_message'
        | 'completed'
        | 'error';
}

export type QuestionAnswerValue = string | string[];
export type QuestionAnswerInput =
    | QuestionAnswerValue
    | QuestionAnswerValue[]
    | Record<string, QuestionAnswerValue>;

export interface ClaudeQuestionSessionSnapshot {
    requestId: string;
    request: QuestionRequest;
    currentIndex: number;
    answers: Record<string, QuestionAnswerValue>;
}

/** Minimal interface for the session object TurnHandle needs. Breaks the circular dependency with StructuredClaudeClient. */
export interface ITurnSession {
    getOpenRequestsForTurn(turnId: string): OpenRequest[];
}

export function nowIso(): string {
    return new Date().toISOString();
}

function normalizeSendInput(input: ClaudeSendInput): ClaudeSendInput {
    if (typeof input === 'string') {
        return input;
    }

    if ('text' in input) {
        return { text: input.text };
    }

    return {
        content: input.content.map((block) => ({ ...block }))
    };
}

export function cloneQuestionPrompt(prompt: QuestionPrompt): QuestionPrompt {
    return {
        ...prompt,
        options: prompt.options.map((option) => ({ ...option }))
    };
}

export function cloneOpenRequest(request: OpenRequest): OpenRequest {
    if (request.kind === 'question') {
        return {
            ...request,
            questions: request.questions.map(cloneQuestionPrompt)
        };
    }

    if (request.kind === 'tool_approval') {
        return {
            ...request,
            input: { ...request.input },
            suggestions: request.suggestions.map((suggestion) => ({ ...suggestion }))
        };
    }

    if (request.kind === 'hook') {
        return {
            ...request,
            input: { ...request.input }
        };
    }

    return {
        ...request,
        message: request.message
    };
}

function cloneHistoryEntry(entry: TurnHistoryEntry): TurnHistoryEntry {
    return {
        ...entry,
        toolUse: entry.toolUse ? { ...entry.toolUse, input: { ...entry.toolUse.input } } : undefined,
        toolResult: entry.toolResult ? { ...entry.toolResult } : undefined,
        request: entry.request ? cloneOpenRequest(entry.request) : undefined,
        message: entry.message ? { ...entry.message } : undefined,
        result: entry.result ? { ...entry.result } : undefined
    };
}

export function cloneSnapshot(snapshot: TurnSnapshot): TurnSnapshot {
    return {
        ...snapshot,
        currentMessage: { ...snapshot.currentMessage },
        toolUses: snapshot.toolUses.map((toolUse) => ({ ...toolUse, input: { ...toolUse.input } })),
        toolResults: snapshot.toolResults.map((toolResult) => ({ ...toolResult })),
        openRequests: snapshot.openRequests.map(cloneOpenRequest),
        history: snapshot.history.map(cloneHistoryEntry),
        usage: snapshot.usage ? { ...snapshot.usage } : undefined,
        result: snapshot.result ? { ...snapshot.result } : undefined,
        metadata: snapshot.metadata ? { ...snapshot.metadata } : undefined
    };
}

function toTextContent(input: ClaudeSendInput): string {
    if (typeof input === 'string') {
        return input;
    }

    if ('text' in input) {
        return input.text;
    }

    return input.content
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('\n');
}

export function buildQuestionPrompts(input: any): QuestionPrompt[] {
    const questions = Array.isArray(input)
        ? input
        : Array.isArray(input?.questions)
        ? input.questions
        : input?.question
        ? [input]
        : [];

    return questions.map((question: any, index: number) => {
        const options = Array.isArray(question?.options) ? question.options : [];
        const mappedOptions = options.map((option: any, optionIndex: number) => {
            if (typeof option === 'string') {
                return {
                    label: option,
                    value: option
                };
            }

            return {
                label: option?.label || option?.value || `Option ${optionIndex + 1}`,
                value: option?.value || option?.label || `option-${optionIndex + 1}`,
                description: typeof option?.description === 'string' ? option.description : undefined
            };
        });

        return {
            id: String(question?.id || question?.header || `question-${index + 1}`),
            header: typeof question?.header === 'string' ? question.header : undefined,
            prompt: String(question?.question || question?.prompt || 'Please provide input.'),
            options: mappedOptions,
            multiSelect: Boolean(question?.multiSelect)
        };
    });
}

export function getQuestionLookupKeys(question: QuestionPrompt): string[] {
    const keys = [question.id, question.header, question.prompt].filter((value): value is string => typeof value === 'string' && value.length > 0);
    return Array.from(new Set(keys));
}

export function resolveQuestionPrompt(questions: QuestionPrompt[], questionKey: string | number): { index: number; question: QuestionPrompt } {
    if (typeof questionKey === 'number') {
        const question = questions[questionKey];
        if (!question) {
            throw new Error(`Unknown question index: ${questionKey}`);
        }
        return { index: questionKey, question };
    }

    const index = questions.findIndex((question) => getQuestionLookupKeys(question).includes(questionKey));
    if (index < 0) {
        throw new Error(`Unknown question: ${questionKey}`);
    }

    return { index, question: questions[index] };
}

export class TurnHandle extends EventEmitter {
    private snapshot: TurnSnapshot;
    private updateQueue: TurnUpdate[] = [];
    private updateWaiters: Array<(update: TurnUpdate | null) => void> = [];
    readonly done: Promise<TurnSnapshot>;
    private resolveDone!: (snapshot: TurnSnapshot) => void;
    private rejectDone!: (error: Error) => void;

    constructor(
        private readonly session: ITurnSession,
        id: string,
        input: ClaudeSendInput,
        metadata?: Record<string, unknown>
    ) {
        super();
        const startedAt = nowIso();
        this.snapshot = {
            id,
            input: normalizeSendInput(input),
            status: 'queued',
            currentOutputKind: 'idle',
            currentMessage: {
                type: 'idle',
                content: ''
            },
            text: '',
            thinking: '',
            toolUses: [],
            toolResults: [],
            openRequests: [],
            history: [
                {
                    kind: 'status',
                    status: 'queued',
                    timestamp: startedAt
                }
            ],
            startedAt,
            metadata
        };

        this.done = new Promise<TurnSnapshot>((resolve, reject) => {
            this.resolveDone = resolve;
            this.rejectDone = reject;
        });
    }

    current(): TurnSnapshot {
        return cloneSnapshot(this.snapshot);
    }

    history(): TurnHistoryEntry[] {
        return this.snapshot.history.map(cloneHistoryEntry);
    }

    getOpenRequests(): OpenRequest[] {
        return this.snapshot.openRequests.map(cloneOpenRequest);
    }

    onUpdate(listener: (update: TurnUpdate) => void): this {
        this.on('update', listener);
        return this;
    }

    async *updates(): AsyncIterableIterator<TurnUpdate> {
        while (true) {
            if (this.updateQueue.length > 0) {
                const update = this.updateQueue.shift()!;
                yield update;
                if (update.kind === 'completed' || update.kind === 'error') {
                    return;
                }
                continue;
            }

            const nextUpdate = await new Promise<TurnUpdate | null>((resolve) => {
                this.updateWaiters.push(resolve);
            });

            if (!nextUpdate) {
                return;
            }

            yield nextUpdate;
            if (nextUpdate.kind === 'completed' || nextUpdate.kind === 'error') {
                return;
            }
        }
    }

    markQueued(): void {
        this.snapshot.status = 'queued';
        this.snapshot.history.push({
            kind: 'status',
            status: 'queued',
            timestamp: nowIso()
        });
        this.emitUpdate('queued');
    }

    markStarted(): void {
        this.snapshot.status = 'running';
        this.snapshot.history.push({
            kind: 'status',
            status: 'running',
            timestamp: nowIso()
        });
        this.emitUpdate('started');
    }

    updateStatus(status: TurnStatus): void {
        this.snapshot.status = status;
        this.snapshot.history.push({
            kind: 'status',
            status,
            timestamp: nowIso()
        });
    }

    updateOutput(kind: OutputKind, content: string): void {
        this.snapshot.currentOutputKind = kind;
        this.snapshot.currentMessage = {
            type: kind,
            content
        };
        if (kind === 'text') {
            this.snapshot.text = content;
        } else if (kind === 'thinking') {
            this.snapshot.thinking = content;
        }
        this.snapshot.history.push({
            kind: 'output',
            outputKind: kind,
            content,
            message: { ...this.snapshot.currentMessage },
            timestamp: nowIso()
        });
        this.emitUpdate('output');
    }

    updateUsage(usage: Usage): void {
        this.snapshot.usage = { ...usage };
    }

    addToolUse(tool: ToolUseState): void {
        const existingIndex = this.snapshot.toolUses.findIndex((entry) => entry.id === tool.id);
        if (existingIndex >= 0) {
            this.snapshot.toolUses[existingIndex] = tool;
        } else {
            this.snapshot.toolUses.push(tool);
        }
        this.snapshot.currentOutputKind = 'tool_use';
        this.snapshot.currentMessage = {
            type: 'tool_use',
            content: tool.name,
            toolName: tool.name,
            toolUseId: tool.id
        };
        this.snapshot.history.push({
            kind: 'tool_use',
            toolUse: { ...tool, input: { ...tool.input } },
            message: { ...this.snapshot.currentMessage },
            timestamp: nowIso()
        });
        this.emitUpdate('tool_use');
    }

    addToolResult(toolResult: ToolResultState): void {
        this.snapshot.toolResults.push({ ...toolResult });
        this.snapshot.currentOutputKind = 'tool_result';
        this.snapshot.currentMessage = {
            type: 'tool_result',
            content: toolResult.content,
            toolUseId: toolResult.toolUseId
        };
        this.snapshot.history.push({
            kind: 'tool_result',
            toolResult: { ...toolResult },
            message: { ...this.snapshot.currentMessage },
            timestamp: nowIso()
        });
        this.emitUpdate('tool_result');
    }

    setOpenRequests(requests: OpenRequest[]): void {
        this.snapshot.openRequests = requests.map(cloneOpenRequest);
    }

    openRequest(request: OpenRequest): void {
        this.snapshot.openRequests = this.session.getOpenRequestsForTurn(this.snapshot.id);
        this.snapshot.currentOutputKind = request.kind === 'question' ? 'question' : request.kind === 'tool_approval' ? 'tool_approval' : request.kind;
        this.snapshot.currentMessage = {
            type: this.snapshot.currentOutputKind,
            content: request.kind === 'question' ? request.prompt : request.kind === 'tool_approval' ? request.toolName : request.kind,
            requestId: request.id
        };
        this.snapshot.history.push({
            kind: 'request_opened',
            request: cloneOpenRequest(request),
            message: { ...this.snapshot.currentMessage },
            timestamp: nowIso()
        });
        this.emitUpdate('request_opened');
    }

    closeRequest(request: OpenRequest): void {
        this.snapshot.openRequests = this.session.getOpenRequestsForTurn(this.snapshot.id);
        this.snapshot.history.push({
            kind: 'request_closed',
            request: cloneOpenRequest(request),
            timestamp: nowIso()
        });
        this.emitUpdate('request_closed');
    }

    addAssistantMessage(message: AssistantMessage): void {
        const content = message.message?.content || message.content || [];
        const textBlocks = content
            .filter((block: any) => block.type === 'text' && typeof block.text === 'string')
            .map((block: any) => block.text)
            .join('');
        if (textBlocks) {
            this.snapshot.text = textBlocks;
            this.snapshot.currentOutputKind = 'text';
            this.snapshot.currentMessage = {
                type: 'text',
                content: textBlocks
            };
        }
        this.snapshot.history.push({
            kind: 'assistant_message',
            content: textBlocks,
            message: { ...this.snapshot.currentMessage },
            timestamp: nowIso()
        });
        this.emitUpdate('assistant_message');
    }

    complete(result: TurnResult): void {
        this.snapshot.status = result.isError ? 'error' : 'completed';
        this.snapshot.result = { ...result };
        this.snapshot.completedAt = nowIso();
        this.snapshot.currentOutputKind = result.isError ? 'error' : 'complete';
        this.snapshot.currentMessage = {
            type: this.snapshot.currentOutputKind,
            content: result.error || result.result
        };
        this.snapshot.history.push({
            kind: result.isError ? 'error' : 'completed',
            result: { ...result },
            message: { ...this.snapshot.currentMessage },
            timestamp: this.snapshot.completedAt
        });
        this.emitUpdate(result.isError ? 'error' : 'completed');
        this.resolveDone(cloneSnapshot(this.snapshot));
        this.closeIterators();
    }

    fail(error: Error): void {
        this.snapshot.status = 'error';
        this.snapshot.completedAt = nowIso();
        this.snapshot.currentOutputKind = 'error';
        this.snapshot.currentMessage = {
            type: 'error',
            content: error.message
        };
        this.snapshot.history.push({
            kind: 'error',
            content: error.message,
            message: { ...this.snapshot.currentMessage },
            timestamp: this.snapshot.completedAt
        });
        this.emitUpdate('error');
        this.rejectDone(error);
        this.closeIterators();
    }

    private emitUpdate(kind: TurnUpdate['kind']): void {
        const update: TurnUpdate = {
            kind,
            turnId: this.snapshot.id,
            snapshot: cloneSnapshot(this.snapshot)
        };
        const waiter = this.updateWaiters.shift();
        if (waiter) {
            waiter(update);
        } else {
            this.updateQueue.push(update);
        }
        this.emit('update', update);
    }

    private closeIterators(): void {
        while (this.updateWaiters.length > 0) {
            const waiter = this.updateWaiters.shift();
            waiter?.(null);
        }
    }
}
