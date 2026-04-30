import type { GhCopilotSession, PlanReadResult, PlanUpdateRequest } from '../sdk.js';
import { makeSessionResolver, callRpc, type SessionGetter } from './_resolver.js';

/**
 * Wrapper for `session.rpc.plan` (`@github/copilot-sdk`).
 *
 * Persistent plan-mode planning state for a Copilot session. Maps 1:1 to
 * the upstream `plan` RPC namespace.
 */
export class CopilotPlanApi {
  private readonly _resolveRead: () => GhCopilotSession;
  private readonly _resolveUpdate: () => GhCopilotSession;
  private readonly _resolveDelete: () => GhCopilotSession;

  /** @internal */
  constructor(getter: SessionGetter) {
    this._resolveRead = makeSessionResolver(getter, 'plan.read');
    this._resolveUpdate = makeSessionResolver(getter, 'plan.update');
    this._resolveDelete = makeSessionResolver(getter, 'plan.delete');
  }

  /** Read the session's current plan content. */
  async read(): Promise<PlanReadResult> {
    const session = this._resolveRead();
    return callRpc('plan', 'read', false, () => session.rpc.plan.read());
  }

  /** Replace the plan content. */
  async update(params: PlanUpdateRequest): Promise<void> {
    const session = this._resolveUpdate();
    return callRpc('plan', 'update', false, () => session.rpc.plan.update(params));
  }

  /** Delete the plan entirely. */
  async delete(): Promise<void> {
    const session = this._resolveDelete();
    return callRpc('plan', 'delete', false, () => session.rpc.plan.delete());
  }
}
