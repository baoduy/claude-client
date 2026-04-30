import type {
  GhCopilotSession,
  HistoryCompactResult,
  HistoryTruncateRequest,
  HistoryTruncateResult,
} from '../sdk.js';
import { makeSessionResolver, callRpc, type SessionGetter } from './_resolver.js';

/**
 * Wrapper for `session.rpc.history` (`@github/copilot-sdk`).
 *
 * @experimental
 * History compaction/truncation is an experimental RPC namespace; older CLI
 * versions may not implement it.
 */
export class CopilotHistoryApi {
  private readonly _resolveCompact: () => GhCopilotSession;
  private readonly _resolveTruncate: () => GhCopilotSession;

  /** @internal */
  constructor(getter: SessionGetter) {
    this._resolveCompact = makeSessionResolver(getter, 'history.compact');
    this._resolveTruncate = makeSessionResolver(getter, 'history.truncate');
  }

  /** Compact the conversation history. */
  async compact(): Promise<HistoryCompactResult> {
    const session = this._resolveCompact();
    return callRpc('history', 'compact', true, () => session.rpc.history.compact());
  }

  /** Truncate the conversation history. */
  async truncate(params: HistoryTruncateRequest): Promise<HistoryTruncateResult> {
    const session = this._resolveTruncate();
    return callRpc('history', 'truncate', true, () => session.rpc.history.truncate(params));
  }
}
