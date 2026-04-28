import { spawn } from 'child_process';
export class ClaudeTransport {
    spawn(opts) {
        return spawn(opts.bin, opts.args, {
            cwd: opts.cwd,
            env: opts.env,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });
    }
}
