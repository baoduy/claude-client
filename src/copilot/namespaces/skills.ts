import type {
  GhCopilotSession,
  SkillList,
  SkillsEnableRequest,
  SkillsDisableRequest,
} from '../sdk.js';
import { makeSessionResolver, callRpc, type SessionGetter } from './_resolver.js';

/**
 * Wrapper for `session.rpc.skills` (`@github/copilot-sdk`).
 *
 * @experimental
 * Skills management is an experimental RPC namespace; older CLI versions may
 * not implement it. Method-not-found failures are surfaced as
 * `CopilotExperimentalUnavailableError`.
 */
export class CopilotSkillsApi {
  private readonly _resolveList: () => GhCopilotSession;
  private readonly _resolveEnable: () => GhCopilotSession;
  private readonly _resolveDisable: () => GhCopilotSession;
  private readonly _resolveReload: () => GhCopilotSession;

  /** @internal */
  constructor(getter: SessionGetter) {
    this._resolveList = makeSessionResolver(getter, 'skills.list');
    this._resolveEnable = makeSessionResolver(getter, 'skills.enable');
    this._resolveDisable = makeSessionResolver(getter, 'skills.disable');
    this._resolveReload = makeSessionResolver(getter, 'skills.reload');
  }

  /** List all skills available in the session. */
  async list(): Promise<SkillList> {
    const session = this._resolveList();
    return callRpc('skills', 'list', true, () => session.rpc.skills.list());
  }

  /** Enable a skill. */
  async enable(params: SkillsEnableRequest): Promise<void> {
    const session = this._resolveEnable();
    return callRpc('skills', 'enable', true, () => session.rpc.skills.enable(params));
  }

  /** Disable a skill. */
  async disable(params: SkillsDisableRequest): Promise<void> {
    const session = this._resolveDisable();
    return callRpc('skills', 'disable', true, () => session.rpc.skills.disable(params));
  }

  /** Reload the skills registry. */
  async reload(): Promise<void> {
    const session = this._resolveReload();
    return callRpc('skills', 'reload', true, () => session.rpc.skills.reload());
  }
}
