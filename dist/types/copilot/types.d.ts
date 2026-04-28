/** Configuration for CopilotClient. Matches the spec §5 verbatim. */
export interface CopilotClientConfig {
    cwd: string;
    model?: string;
    sessionId?: string;
    resumeSessionId?: string;
    sessionName?: string;
    mode?: 'interactive' | 'plan' | 'autopilot';
    maxAutopilotContinues?: number;
    allowTools?: string[];
    denyTools?: string[];
    availableTools?: string[];
    excludedTools?: string[];
    allowAllTools?: boolean;
    allowAllPaths?: boolean;
    allowAllUrls?: boolean;
    noAskUser?: boolean;
    apiKey?: {
        provider: 'anthropic' | 'openai' | 'azure';
        key: string;
    };
    cliPath?: string;
    cliUrl?: string;
    streaming?: boolean;
    debug?: boolean;
    debugLogger?: (msg: string) => void;
    transport?: 'programmatic' | 'pty';
}
/** Cumulative snapshot of a Copilot turn. */
export interface CopilotTurnSnapshot {
    turnId: string;
    status: 'queued' | 'running' | 'completed' | 'error';
    text: string;
    reasoningText: string;
    toolCalls: CopilotToolCall[];
    usage: CopilotUsage | null;
    startedAt: number;
    endedAt: number | null;
    error: {
        name: string;
        message: string;
    } | null;
}
/** Per-step update pushed onto the TurnHandle iterator. */
export type CopilotTurnUpdate = {
    kind: 'output';
    delta: string;
    snapshot: CopilotTurnSnapshot;
} | {
    kind: 'reasoning';
    delta: string;
    snapshot: CopilotTurnSnapshot;
} | {
    kind: 'tool_use';
    tool: CopilotToolCall;
    snapshot: CopilotTurnSnapshot;
} | {
    kind: 'tool_result';
    toolUseId: string;
    content: string;
    isError: boolean;
    snapshot: CopilotTurnSnapshot;
} | {
    kind: 'usage';
    usage: CopilotUsage;
    snapshot: CopilotTurnSnapshot;
} | {
    kind: 'result';
    snapshot: CopilotTurnSnapshot;
} | {
    kind: 'error';
    error: Error;
    snapshot: CopilotTurnSnapshot;
};
export interface CopilotToolCall {
    id: string;
    name: string;
    input: Record<string, any>;
    result: {
        content: string;
        isError: boolean;
    } | null;
}
export interface CopilotUsage {
    inputTokens: number;
    outputTokens: number;
}
export type CopilotStatus = 'idle' | 'running' | 'error';
export interface CopilotPendingAction {
    type: 'permission';
    toolName?: string;
}
