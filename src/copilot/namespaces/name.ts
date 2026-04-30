import type { GhCopilotSession, NameGetResult, NameSetRequest } from '../sdk.js';
import { makeSessionResolver, callRpc, type SessionGetter } from './_resolver.js';

/**
 * Wrapper for `session.rpc.name` (`@github/copilot-sdk`).
 *
 * Get/set the human-readable session name.
 */
export class CopilotNameApi {
  private readonly _resolveGet: () => GhCopilotSession;
  private readonly _resolveSet: () => GhCopilotSession;

  /** @internal */
  constructor(getter: SessionGetter) {
    this._resolveGet = makeSessionResolver(getter, 'name.get');
    this._resolveSet = makeSessionResolver(getter, 'name.set');
  }

  /** Get the session name. */
  async get(): Promise<NameGetResult> {
    const session = this._resolveGet();
    return callRpc('name', 'get', false, () => session.rpc.name.get());
  }

  /** Set the session name. */
  async set(params: NameSetRequest): Promise<void> {
    const session = this._resolveSet();
    return callRpc('name', 'set', false, () => session.rpc.name.set(params));
  }
}
