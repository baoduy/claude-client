import { EventEmitter } from 'events';
import { AssistantMessage, Suggestion, Usage } from './types.js';
export type OutputKind = 'idle' | 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'tool_approval' | 'question' | 'hook' | 'mcp' | 'complete' | 'error';
export type TurnStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'error';
export interface ClaudeSendContentBlock {
    type: string;
    [key: string]: any;
}
export type ClaudeSendInput = string | {
    text: string;
} | {
    content: ClaudeSendContentBlock[];
};
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
    kind: 'queued' | 'started' | 'output' | 'tool_use' | 'tool_result' | 'request_opened' | 'request_closed' | 'assistant_message' | 'completed' | 'error';
}
export type QuestionAnswerValue = string | string[];
export type QuestionAnswerInput = QuestionAnswerValue | QuestionAnswerValue[] | Record<string, QuestionAnswerValue>;
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
export declare function nowIso(): string;
export declare function cloneQuestionPrompt(prompt: QuestionPrompt): QuestionPrompt;
export declare function cloneOpenRequest(request: OpenRequest): OpenRequest;
export declare function cloneSnapshot(snapshot: TurnSnapshot): TurnSnapshot;
export declare function buildQuestionPrompts(input: any): QuestionPrompt[];
export declare function getQuestionLookupKeys(question: QuestionPrompt): string[];
export declare function resolveQuestionPrompt(questions: QuestionPrompt[], questionKey: string | number): {
    index: number;
    question: QuestionPrompt;
};
export declare class TurnHandle extends EventEmitter {
    private readonly session;
    private snapshot;
    private updateQueue;
    private updateWaiters;
    readonly done: Promise<TurnSnapshot>;
    private resolveDone;
    private rejectDone;
    constructor(session: ITurnSession, id: string, input: ClaudeSendInput, metadata?: Record<string, unknown>);
    current(): TurnSnapshot;
    history(): TurnHistoryEntry[];
    getOpenRequests(): OpenRequest[];
    onUpdate(listener: (update: TurnUpdate) => void): this;
    updates(): AsyncIterableIterator<TurnUpdate>;
    markQueued(): void;
    markStarted(): void;
    updateStatus(status: TurnStatus): void;
    updateOutput(kind: OutputKind, content: string): void;
    updateUsage(usage: Usage): void;
    addToolUse(tool: ToolUseState): void;
    addToolResult(toolResult: ToolResultState): void;
    setOpenRequests(requests: OpenRequest[]): void;
    openRequest(request: OpenRequest): void;
    closeRequest(request: OpenRequest): void;
    addAssistantMessage(message: AssistantMessage): void;
    complete(result: TurnResult): void;
    fail(error: Error): void;
    private emitUpdate;
    private closeIterators;
}
export {};
