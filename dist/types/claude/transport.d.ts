import { ChildProcess } from 'child_process';
export interface SpawnOptions {
    bin: string;
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
}
export declare class ClaudeTransport {
    spawn(opts: SpawnOptions): ChildProcess;
}
