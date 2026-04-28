import type { SessionBrowserSummary, SessionBrowserRecord } from '../claude/types.js';
export interface CopilotSessionLocatorOptions {
    /** Override $HOME (test injection point). */
    homeDir?: string;
    /** Override the absolute path to .copilot directory. */
    copilotDir?: string;
}
interface CopilotSessionMetadata {
    sessionId: string;
    title?: string;
    createdAt?: string;
    updatedAt?: string;
    messageCount?: number;
    projectPath?: string;
    gitBranch?: string;
}
export declare function listCopilotSessionSummaries(opts?: CopilotSessionLocatorOptions): Promise<SessionBrowserSummary<CopilotSessionMetadata>[]>;
export declare function readCopilotSessionRecord(sessionId: string, opts?: CopilotSessionLocatorOptions): Promise<SessionBrowserRecord<CopilotSessionMetadata, unknown>>;
export {};
