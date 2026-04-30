import type {
  GhCopilotSession,
  McpServerList,
  McpEnableRequest,
  McpDisableRequest,
  McpOauthLoginRequest,
  McpOauthLoginResult,
} from '../sdk.js';
import { makeSessionResolver, callRpc, type SessionGetter } from './_resolver.js';

/**
 * Nested wrapper for `session.rpc.mcp.oauth` (`@github/copilot-sdk`).
 *
 * @experimental
 * Exposed as `client.mcp.oauth.<method>`.
 */
export class CopilotMcpOauthApi {
  private readonly _resolveLogin: () => GhCopilotSession;

  /** @internal */
  constructor(getter: SessionGetter) {
    this._resolveLogin = makeSessionResolver(getter, 'mcp.oauth.login');
  }

  /** Trigger an OAuth login flow for an MCP server. */
  async login(params: McpOauthLoginRequest): Promise<McpOauthLoginResult> {
    const session = this._resolveLogin();
    return callRpc('mcp.oauth', 'login', true, () => session.rpc.mcp.oauth.login(params));
  }
}

/**
 * Wrapper for `session.rpc.mcp` (`@github/copilot-sdk`).
 *
 * @experimental
 * MCP server management is an experimental RPC namespace; older CLI versions
 * may not implement it. Includes a nested `oauth` sub-API exposed as
 * `client.mcp.oauth.login(...)`.
 */
export class CopilotMcpApi {
  readonly oauth: CopilotMcpOauthApi;

  private readonly _resolveList: () => GhCopilotSession;
  private readonly _resolveEnable: () => GhCopilotSession;
  private readonly _resolveDisable: () => GhCopilotSession;
  private readonly _resolveReload: () => GhCopilotSession;

  /** @internal */
  constructor(getter: SessionGetter) {
    this.oauth = new CopilotMcpOauthApi(getter);
    this._resolveList = makeSessionResolver(getter, 'mcp.list');
    this._resolveEnable = makeSessionResolver(getter, 'mcp.enable');
    this._resolveDisable = makeSessionResolver(getter, 'mcp.disable');
    this._resolveReload = makeSessionResolver(getter, 'mcp.reload');
  }

  /** List MCP servers. */
  async list(): Promise<McpServerList> {
    const session = this._resolveList();
    return callRpc('mcp', 'list', true, () => session.rpc.mcp.list());
  }

  /** Enable an MCP server. */
  async enable(params: McpEnableRequest): Promise<void> {
    const session = this._resolveEnable();
    return callRpc('mcp', 'enable', true, () => session.rpc.mcp.enable(params));
  }

  /** Disable an MCP server. */
  async disable(params: McpDisableRequest): Promise<void> {
    const session = this._resolveDisable();
    return callRpc('mcp', 'disable', true, () => session.rpc.mcp.disable(params));
  }

  /** Reload the MCP server registry. */
  async reload(): Promise<void> {
    const session = this._resolveReload();
    return callRpc('mcp', 'reload', true, () => session.rpc.mcp.reload());
  }
}
