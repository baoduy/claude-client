import { spawn, ChildProcess } from 'child_process';

export interface SpawnOptions {
  bin: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export class ClaudeTransport {
  spawn(opts: SpawnOptions): ChildProcess {
    return spawn(opts.bin, opts.args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  }
}
