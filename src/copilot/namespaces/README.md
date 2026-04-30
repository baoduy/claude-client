# `copilot/namespaces` — RPC-namespace wrappers for Copilot

## Purpose

Thin object-oriented wrappers over the namespaced RPC surface exposed by `@github/copilot-sdk` (`session.rpc.<namespace>.<method>`). Each class is owned by a parent `CopilotClient` and accessed as a property on it (`client.plan.list()`, `client.workspaces.readFile()`, …). Users never construct these classes directly.

Each wrapper:

- Defers session lookup until call time via `_resolver.ts` — methods throw `SessionNotStartedError` if invoked before the parent client has started.
- Normalises errors to `CopilotRpcError` (with namespace/method context).
- For `@experimental` namespaces, surfaces "method not found" failures as `CopilotExperimentalUnavailableError` so callers can detect older CLI versions that lack the method.

## Public exports

| Name | Underlying RPC namespace | Stability | Purpose |
| --- | --- | --- | --- |
| `CopilotPlanApi` | `plan` | stable | Persistent plan-mode state for the session. |
| `CopilotSkillsApi` | `skills` | experimental | Skills management (custom skill registration). |
| `CopilotAgentApi` | `agent` | experimental | Custom-agent management. |
| `CopilotHistoryApi` | `history` | experimental | History compaction / truncation. |
| `CopilotUsageApi` | `usage` | experimental | Token usage metrics. |
| `CopilotShellApi` | `shell` | stable | Shell command execution within the session. |
| `CopilotWorkspacesApi` | `workspaces` | stable | Workspace inspection and file I/O. |
| `CopilotNameApi` | `name` | stable | Get/set human-readable session name. |
| `CopilotInstructionsApi` | `instructions` | stable | Read instruction sources loaded by the session. |
| `CopilotMcpApi` | `mcp` | experimental | MCP server config (list / enable / disable / reload) plus nested `oauth.login`. |

## Key interfaces

### Shape of every wrapper

Each class follows the same pattern:

- A private `_resolveX` getter per method (built by `makeSessionResolver`).
- One public method per upstream RPC method, with the same name where possible.
- Each method calls `callRpc(namespace, method, experimental, () => session.rpc.<ns>.<method>(...))`.

Read the individual files for the exact method names — they map 1:1 to the upstream Copilot SDK and are TSDoc-documented inline.

### `CopilotMcpApi` — note the nested `oauth`

Unlike the others, `CopilotMcpApi` exposes a nested `CopilotMcpOauthApi` at `client.mcp.oauth`. So MCP server *management* lives on `client.mcp.{list, enable, disable, reload}` and OAuth flows live on `client.mcp.oauth.login(...)`.

This is also the only namespace that has a Claude analogue, but in a different shape — see [`../../claude/README.md`](../../claude/README.md) for details on Claude's in-process MCP-handler model.

## Usage

These classes are accessed through the parent client; you never `new` them directly:

```ts
import {
  CopilotClient,
  CopilotExperimentalUnavailableError,
} from '@drunkcoding/ai-cli-clients';

const client = new CopilotClient({ cwd: process.cwd() });
await client.start();

// Stable namespaces — call freely.
const plan = await client.plan.list();
await client.workspaces.readFile({ path: 'package.json' });

// Experimental namespaces — handle the unavailable case.
try {
  const usage = await client.usage.get();
  console.log(usage);
} catch (err) {
  if (err instanceof CopilotExperimentalUnavailableError) {
    console.warn('Update copilot CLI to enable usage metrics.');
  } else {
    throw err;
  }
}

// MCP — nested oauth sub-API.
const servers = await client.mcp.list();
await client.mcp.oauth.login({ name: 'my-server' });
```

## Internal files

- `_resolver.ts` — `makeSessionResolver`, `callRpc`, `SessionGetter`. Shared by every wrapper; not exported.
- One file per namespace: `plan.ts`, `skills.ts`, `agent.ts`, `history.ts`, `usage.ts`, `shell.ts`, `workspaces.ts`, `name.ts`, `instructions.ts`, `mcp.ts`. Each contains exactly one exported class (plus `mcp.ts` which has two — the main `CopilotMcpApi` and the nested `CopilotMcpOauthApi`). Note: `CopilotMcpOauthApi` is not barrel-exported; it is reachable only as the `.oauth` property of a `CopilotMcpApi` instance (i.e. `client.mcp.oauth`).
- `index.ts` — barrel.

## See also

- [`../README.md`](../README.md) — `CopilotClient` and how it wires these wrappers as properties.
- [`@github/copilot-sdk`](https://www.npmjs.com/package/@github/copilot-sdk) — the upstream SDK whose RPC namespaces these wrap.
- [`docs/superpowers/specs/2026-04-29-copilot-claude-feature-gap-fill-design.md`](../../../docs/superpowers/specs/2026-04-29-copilot-claude-feature-gap-fill-design.md) — design notes covering several namespaces.
