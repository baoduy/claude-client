import type { GhCopilotSession, InstructionsGetSourcesResult } from '../sdk.js';
import { makeSessionResolver, callRpc, type SessionGetter } from './_resolver.js';

/**
 * Wrapper for `session.rpc.instructions` (`@github/copilot-sdk`).
 *
 * Read instruction sources (e.g. CLAUDE.md / instructions files) loaded by
 * the session.
 */
export class CopilotInstructionsApi {
  private readonly _resolveGetSources: () => GhCopilotSession;

  /** @internal */
  constructor(getter: SessionGetter) {
    this._resolveGetSources = makeSessionResolver(getter, 'instructions.getSources');
  }

  /** List instruction sources active for this session. */
  async getSources(): Promise<InstructionsGetSourcesResult> {
    const session = this._resolveGetSources();
    return callRpc('instructions', 'getSources', false, () =>
      session.rpc.instructions.getSources(),
    );
  }
}
