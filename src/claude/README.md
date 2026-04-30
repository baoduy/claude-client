# `claude` — Claude Code CLI provider

## Purpose

Provider implementation for Anthropic's Claude Code CLI. Spawns `claude` as a subprocess, drives it over its stdio control protocol, and exposes a `ClaudeClient` that implements the unified `AICliClient` interface plus several Claude-specific extensions (in-process MCP handlers, tool-approval interaction, hook callbacks, on-disk session inspection).

This is the older and more featureful of the two providers; the unified surface was designed to fit both, but Claude exposes capabilities Copilot does not (model setting, permission-mode setting, max-thinking-tokens, model listing, in-process MCP server hosting, hooks, fine-grained interrupt). Capability flags on `client.capabilities` reflect this.

For backward compatibility, `src/index.ts` re-exports this module's public surface at the package root, so `import { ClaudeClient } from '@baoduy2412/ai-cli-client'` works.

## Public exports

| Name | Source | Purpose |
| --- | --- | --- |
| `ClaudeClient` | `client.ts` | Provider client. `extends EventEmitter implements ITurnSession, AICliClient`. |
| `ClaudeClientConfig` | `client.ts` | Constructor options. |
| `ClaudePermissionMode` | `client.ts` | Native Claude permission vocabulary (`default`, `acceptEdits`, `auto`, `plan`, `dontAsk`, `bypassPermissions`). |
| `ToolUseStartEvent`, `ToolResultEvent` | `client.ts` | Claude-typed event payloads (the unified events use the unified shapes). |
| `SessionStatus` | `client.ts` | `'running' \| 'input_needed' \| 'idle' \| 'error'`. |
| `PendingAction` | `client.ts` | Provider-native pending-action shape. |
| `attachMcpHandlers` | `mcp.ts` | Register in-process MCP server handlers against a client. Returns a cleanup function. |
| `McpHandler`, `McpHandlers` | `mcp.ts` | Handler signatures. |
| `TurnHandle` | `turn-handle.ts` | Concrete `TurnHandleBase` returned by `client.send(...)`. |
| `TurnSnapshot`, `TurnUpdate`, `TurnHistoryEntry`, `TurnResult` | `turn-handle.ts` | Provider-native turn shapes (the unified `TurnSnapshot` lives in [`../unified/`](../unified/)). |
| `ClaudeSendOptions`, `TurnMessageState`, `ToolUseState`, `ToolResultState` | `turn-handle.ts` | Send-time options and turn-state component types. |
| `QuestionPrompt`, `QuestionOption`, `ToolApprovalRequest`, `QuestionRequest`, `HookRequest`, `McpRequest` | `turn-handle.ts` | Open-request shapes (Claude-native). |
| `ITurnSession`, `cloneSnapshot`, `cloneOpenRequest`, `cloneQuestionPrompt`, `buildQuestionPrompts`, `getQuestionLookupKeys`, `resolveQuestionPrompt`, `nowIso` | `turn-handle.ts` | Internal-use helpers leaked through the barrel for consumers extending the session model. |
| `ClaudeQuestionSession`, `QuestionAnswerSubmitter` | `question-session.ts` | Standalone question-flow primitive used by the client. |
| `TaskStore` | `task-store.ts` | Event-emitting registry of in-flight tasks. |
| `TaskMessageQueue` | `task-queue.ts` | FIFO queue for task messages awaiting delivery. |
| Session-on-disk helpers (`escapeProjectPath`, `unescapeProjectPath`, `getProjectStoragePath`, `listProjects`, `getSessionDetails`, `getMessagesSince`, `normalizeClaudeSessionMessages`) | `sessions.ts` | Read and parse Claude's per-project session storage on disk. |
| `SessionWatcher` | `sessions.ts` | `EventEmitter` that watches a project's session directory for new messages. |
| Other types from `types.ts` | `types.ts` | Wire-protocol message shapes (`SystemMessage`, `StreamEventMessage`, `ControlRequest`/`ControlResponse*`, `McpMessageEvent`, `HookCallbackEvent`, `TaskMessageEvent`, etc.). |

## Key interfaces

### `ClaudeClient`

The provider client. Construct with `new ClaudeClient(config)` then `await client.start()`, **or** use the static `ClaudeClient.init(config)` which constructs and starts in one call. The unified factory (`createAICliClient`) uses `init`. Implements every `AICliClient` member, including all four optional setters.

Beyond the unified surface, `ClaudeClient` exposes provider-specific methods (sending raw MCP messages, replying to control requests, approving/denying tool calls with scope) — see `client.ts` TSDoc for the full list. Use `client.provider === 'claude'` to narrow types.

### `attachMcpHandlers`

In-process MCP server hosting. Register handlers keyed by server name; the helper subscribes to the client's `mcp_message` event, dispatches each incoming JSON-RPC request to the right handler, and writes a JSON-RPC response back. Returns a cleanup function that detaches the listener.

This is Claude's MCP integration model: your Node process *is* the MCP server, no external binary needed. (Copilot's `mcp` namespace, by contrast, only manages external MCP servers — see [`../copilot/namespaces/README.md`](../copilot/namespaces/README.md).)

### `TurnHandle`

Concrete `TurnHandleBase` for Claude. Streams `TurnUpdate`s, exposes the rich `TurnSnapshot` (with open-request lists, hooks, MCP requests). Many consumers prefer the unified snapshot via `client.getCurrentTurn()`/`getHistory()`, but the per-turn handle gives access to live updates and Claude-specific request types.

### Session-on-disk helpers (`sessions.ts`)

Standalone utilities for inspecting the JSONL session files Claude writes per-project. Useful for replaying or auditing past sessions without driving the CLI. `SessionWatcher` is an event emitter that tails the active project's directory.

### `TaskStore`, `TaskMessageQueue`, `ClaudeQuestionSession`

Smaller pieces used internally by `ClaudeClient` and exposed for consumers building richer UIs around the wire protocol. Not required for ordinary use of `client.send(...)`.

## Usage

```ts
import {
  ClaudeClient,
  attachMcpHandlers,
  type McpHandlers,
} from '@baoduy2412/ai-cli-client';

const client = await ClaudeClient.init({ cwd: process.cwd() });

// Optional: host an in-process MCP server.
const handlers: McpHandlers = {
  echo: async (msg) => ({ jsonrpc: '2.0', id: msg.id, result: msg.params }),
};
const detach = attachMcpHandlers(client, handlers);

client.on('text', (c) => process.stdout.write(c));

const handle = client.send('hello');
const final = await handle.done;
console.log(final.text);

// Claude-only setters.
await client.setModel?.('claude-opus-4-7');
await client.setPermissionMode?.('plan');

detach();
await client.close();
```

## Internal files

- `client.ts` — `ClaudeClient` implementation; large file owning lifecycle, control-protocol dispatch, MCP/hooks bridging, and most of the public surface.
- `transport.ts` — child-process spawn + framed stdio transport (small wrapper).
- `turn-handle.ts` — turn-state model, `TurnHandle`, and the helpers re-exported from the barrel.
- `mcp.ts` — `attachMcpHandlers` helper.
- `question-session.ts` — `ClaudeQuestionSession` primitive.
- `task-store.ts`, `task-queue.ts` — task subsystem.
- `sessions.ts` — on-disk session inspection.
- `types.ts` — wire-protocol type declarations.
- `index.ts` — barrel.

## See also

- Root [`README.md`](../../README.md) — package overview, common API, full event table.
- [`../copilot/README.md`](../copilot/README.md) — sibling provider.
- [`../unified/README.md`](../unified/README.md) — shared types and event vocabulary.
- [`../copilot/namespaces/README.md`](../copilot/namespaces/README.md) — Copilot's `mcp` namespace, for context on the asymmetry described under `attachMcpHandlers`.
- [`docs/provider-capabilities.md`](../../docs/provider-capabilities.md) — divergence matrix.
