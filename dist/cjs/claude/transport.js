"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeTransport = void 0;
const child_process_1 = require("child_process");
class ClaudeTransport {
    spawn(opts) {
        return (0, child_process_1.spawn)(opts.bin, opts.args, {
            cwd: opts.cwd,
            env: opts.env,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });
    }
}
exports.ClaudeTransport = ClaudeTransport;
