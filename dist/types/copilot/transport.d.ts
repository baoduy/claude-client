import type { CopilotClientConfig } from './types.js';
import { GhCopilotClient } from './sdk.js';
export interface CopilotTransportOptions {
    config: CopilotClientConfig;
    /** Injection point for tests; defaults to the real SDK class. */
    GhClientCtor?: typeof GhCopilotClient;
}
export declare class CopilotTransport {
    private readonly config;
    private readonly GhClientCtor;
    private gh;
    session: any;
    sessionId: string | null;
    constructor(opts: CopilotTransportOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    private checkUnsupportedFields;
    /** Options for the GhCopilotClient constructor. */
    private buildClientOptions;
    /** SessionConfig for createSession. */
    private buildSessionConfig;
    /** ResumeSessionConfig for resumeSession (subset of SessionConfig). */
    private buildResumeSessionConfig;
}
