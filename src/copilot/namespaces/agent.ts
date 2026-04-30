import type {
  GhCopilotSession,
  AgentList,
  AgentGetCurrentResult,
  AgentSelectRequest,
  AgentSelectResult,
  AgentReloadResult,
} from '../sdk.js';
import { makeSessionResolver, callRpc, type SessionGetter } from './_resolver.js';

/**
 * Wrapper for `session.rpc.agent` (`@github/copilot-sdk`).
 *
 * @experimental
 * Custom-agent management is an experimental RPC namespace; older CLI
 * versions may not implement it. Method-not-found failures are surfaced as
 * `CopilotExperimentalUnavailableError`.
 */
export class CopilotAgentApi {
  private readonly _resolveList: () => GhCopilotSession;
  private readonly _resolveGetCurrent: () => GhCopilotSession;
  private readonly _resolveSelect: () => GhCopilotSession;
  private readonly _resolveDeselect: () => GhCopilotSession;
  private readonly _resolveReload: () => GhCopilotSession;

  /** @internal */
  constructor(getter: SessionGetter) {
    this._resolveList = makeSessionResolver(getter, 'agent.list');
    this._resolveGetCurrent = makeSessionResolver(getter, 'agent.getCurrent');
    this._resolveSelect = makeSessionResolver(getter, 'agent.select');
    this._resolveDeselect = makeSessionResolver(getter, 'agent.deselect');
    this._resolveReload = makeSessionResolver(getter, 'agent.reload');
  }

  /** List all available agents. */
  async list(): Promise<AgentList> {
    const session = this._resolveList();
    return callRpc('agent', 'list', true, () => session.rpc.agent.list());
  }

  /** Get the currently-selected agent. */
  async getCurrent(): Promise<AgentGetCurrentResult> {
    const session = this._resolveGetCurrent();
    return callRpc('agent', 'getCurrent', true, () => session.rpc.agent.getCurrent());
  }

  /** Select an agent. */
  async select(params: AgentSelectRequest): Promise<AgentSelectResult> {
    const session = this._resolveSelect();
    return callRpc('agent', 'select', true, () => session.rpc.agent.select(params));
  }

  /** Deselect the active agent. */
  async deselect(): Promise<void> {
    const session = this._resolveDeselect();
    return callRpc('agent', 'deselect', true, () => session.rpc.agent.deselect());
  }

  /** Reload the agent registry. */
  async reload(): Promise<AgentReloadResult> {
    const session = this._resolveReload();
    return callRpc('agent', 'reload', true, () => session.rpc.agent.reload());
  }
}
