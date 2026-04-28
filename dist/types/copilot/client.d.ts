import { EventEmitter } from 'events';
import { GhCopilotClient } from './sdk.js';
import { CopilotTurnHandle } from './turn-handle.js';
import type { CopilotClientConfig, CopilotStatus, CopilotPendingAction, CopilotTurnSnapshot } from './types.js';
export interface CopilotClientInternals {
    /** Test injection point for the SDK constructor. */
    GhClientCtor?: typeof GhCopilotClient;
}
export declare interface CopilotClient {
    on(event: 'ready', listener: () => void): this;
    on(event: 'output_delta', listener: (delta: string) => void): this;
    on(event: 'reasoning_delta', listener: (delta: string) => void): this;
    on(event: 'tool_use_start', listener: (tool: {
        id: string;
        name: string;
        input: Record<string, any>;
    }) => void): this;
    on(event: 'tool_result', listener: (res: {
        toolUseId: string;
        content: string;
        isError: boolean;
    }) => void): this;
    on(event: 'usage_update', listener: (u: {
        inputTokens: number;
        outputTokens: number;
    }) => void): this;
    on(event: 'result', listener: (snapshot: CopilotTurnSnapshot) => void): this;
    on(event: 'status_change', listener: (status: CopilotStatus, action: CopilotPendingAction | null) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
}
export declare class CopilotClient extends EventEmitter {
    private readonly config;
    private readonly transport;
    private _status;
    private _currentTurn;
    private _history;
    private _messageQueue;
    constructor(config: CopilotClientConfig, internals?: CopilotClientInternals);
    start(): Promise<void>;
    close(): Promise<void>;
    get sessionId(): string | null;
    getStatus(): CopilotStatus;
    isProcessing(): boolean;
    getCurrentTurn(): CopilotTurnHandle | null;
    getHistory(): CopilotTurnSnapshot[];
    /** Internal: status transitions emit `status_change`. */
    private setStatus;
    send(prompt: string): CopilotTurnHandle;
    sendMessage(text: string): Promise<void>;
    queueMessage(text: string): void;
    private runTurn;
    private handleSdkEvent;
    private processNextQueued;
    interrupt(): Promise<void>;
}
