import type {
  GhCopilotSession,
  ShellExecRequest,
  ShellExecResult,
  ShellKillRequest,
  ShellKillResult,
} from '../sdk.js';
import { makeSessionResolver, callRpc, type SessionGetter } from './_resolver.js';

/**
 * Wrapper for `session.rpc.shell` (`@github/copilot-sdk`).
 *
 * Shell command execution within the session.
 */
export class CopilotShellApi {
  private readonly _resolveExec: () => GhCopilotSession;
  private readonly _resolveKill: () => GhCopilotSession;

  /** @internal */
  constructor(getter: SessionGetter) {
    this._resolveExec = makeSessionResolver(getter, 'shell.exec');
    this._resolveKill = makeSessionResolver(getter, 'shell.kill');
  }

  /** Execute a shell command. */
  async exec(params: ShellExecRequest): Promise<ShellExecResult> {
    const session = this._resolveExec();
    return callRpc('shell', 'exec', false, () => session.rpc.shell.exec(params));
  }

  /** Kill a running shell command. */
  async kill(params: ShellKillRequest): Promise<ShellKillResult> {
    const session = this._resolveKill();
    return callRpc('shell', 'kill', false, () => session.rpc.shell.kill(params));
  }
}
