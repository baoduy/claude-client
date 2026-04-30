import type { GhCopilotSession, UsageGetMetricsResult } from '../sdk.js';
import { makeSessionResolver, callRpc, type SessionGetter } from './_resolver.js';

/**
 * Wrapper for `session.rpc.usage` (`@github/copilot-sdk`).
 *
 * @experimental
 * Usage metrics is an experimental RPC namespace; older CLI versions may not
 * implement it.
 */
export class CopilotUsageApi {
  private readonly _resolveGetMetrics: () => GhCopilotSession;

  /** @internal */
  constructor(getter: SessionGetter) {
    this._resolveGetMetrics = makeSessionResolver(getter, 'usage.getMetrics');
  }

  /** Get usage metrics for the session. */
  async getMetrics(): Promise<UsageGetMetricsResult> {
    const session = this._resolveGetMetrics();
    return callRpc('usage', 'getMetrics', true, () => session.rpc.usage.getMetrics());
  }
}
