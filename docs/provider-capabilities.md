# Provider capabilities

This document tracks the differences between the Claude and Copilot providers
exposed by `@baoduy2412/ai-cli-client`. The `AICliClient` interface (the
unified API) covers only the surface both providers support identically.
Anything listed below as provider-specific is intentionally not on the
unified interface.

> **Maintenance rule:** every PR that adds a method or event to either
> concrete client must add a row here, marked with the appropriate
> Claude/Copilot column.

## In the unified `AICliClient` interface

| Member         | Claude | Copilot | Notes                                          |
| -------------- | :----: | :-----: | ---------------------------------------------- |
| `provider`     |   ✅   |   ✅    | runtime discriminator (`'claude'` / `'copilot'`) |
| `sessionId`    |   ✅   |   ✅    |                                                |
| `start`        |   ✅   |   ✅    |                                                |
| `close`        |   ✅   |   ✅    | Claude's `close()` is an async alias for `kill()` |
| `send`         |   ✅   |   ✅    | returns `TurnHandleBase<unknown, unknown>`     |
| `sendMessage`  |   ✅   |   ✅    |                                                |
| `queueMessage` |   ✅   |   ✅    |                                                |
| `interrupt`    |   ✅   |   ✅    |                                                |
| `on` / `off`   |   ✅   |   ✅    | loosely typed in the interface; concrete classes preserve strong types |

## Provider-specific (concrete class only)

| Member               | Claude | Copilot | Notes                                          |
| -------------------- | :----: | :-----: | ---------------------------------------------- |
| `kill`               |   ✅   |   ❌    | Claude-specific synchronous terminate; `close()` is the unified equivalent |
| `getOpenRequests`    |   ✅   |   ❌    | Copilot uses declarative `allowTools`/`denyTools`; no interactive permission flow |
| `approveRequest`     |   ✅   |   ❌    | same                                           |
| `answerQuestion`     |   ✅   |   ❌    | Claude-specific interactive question flow      |
| `getHistory`         |   ✅ `TurnSnapshot[]`   |   ✅ `CopilotTurnSnapshot[]`    | **Divergent return type — Phase 2.x follow-up to add to the unified interface once shapes are reconciled.** |
| `getStatus`          |   ✅ `SessionStatus`   |   ✅ `CopilotStatus` | divergent enum values |
| `isProcessing`       |   ✅   |   ✅    | convenience boolean over `getStatus()`        |
| `getCurrentTurn`     |   ❌   |   ✅    | returns the in-flight `CopilotTurnHandle`     |
| `getPendingAction`   |   ✅   |   ❌    | Claude `PendingAction` (interactive permissions) |

## Event names

Events are not normalized by the unified interface. Strongly-typed event
overloads live on each concrete class. Use the concrete class when you need
type-safe `on()`.

### Shared

| Event name       | Claude | Copilot | Claude payload | Copilot payload |
| ---------------- | :----: | :-----: | -------------- | --------------- |
| `error`          |   ✅   |   ✅    | `Error`        | `Error`         |
| `ready`          |   ✅   |   ✅    | `void`         | `void`          |
| `tool_use_start` |   ✅   |   ✅    | `ToolUseStartEvent` | `{ id: string; name: string; input: Record<string, any> }` |
| `tool_result`    |   ✅   |   ✅    | `ToolResultEvent` | `{ toolUseId: string; content: string; isError: boolean }` |
| `usage_update`   |   ✅   |   ✅    | `Usage`        | `{ inputTokens: number; outputTokens: number }` |
| `result`         |   ✅   |   ✅    | `ResultMessage` | `CopilotTurnSnapshot` |
| `status_change`  |   ✅   |   ✅    | `(status: SessionStatus, pendingAction: PendingAction \| null)` | `(status: CopilotStatus, action: CopilotPendingAction \| null)` |

### Copilot-only

| Event name        | Payload                         |
| ----------------- | ------------------------------- |
| `output_delta`    | `(delta: string)`               |
| `reasoning_delta` | `(delta: string)`               |

### Claude-only

| Event name               | Payload                              |
| ------------------------ | ------------------------------------ |
| `system`                 | `SystemMessage`                      |
| `mcp_message`            | `McpMessageEvent`                    |
| `hook_callback`          | `HookCallbackEvent`                  |
| `task_message`           | `TaskMessageEvent`                   |
| `message`                | `AssistantMessage`                   |
| `stream_event`           | `StreamEventMessage`                 |
| `text_delta`             | `(text: string)`                     |
| `thinking_delta`         | `(thinking: string)`                 |
| `text_accumulated`       | `(text: string)`                     |
| `thinking_accumulated`   | `(thinking: string)`                 |
| `control_request`        | `ControlRequestMessage`              |
| `control_cancel_request` | `ControlCancelRequestMessage`        |
| `control_response`       | `ControlResponseEnvelope`            |
| `user_message`           | `UserMessage`                        |
| `exit`                   | `(code: number \| null)`             |

## Configuration divergence

| Field               | Claude | Copilot | Notes                                          |
| ------------------- | :----: | :-----: | ---------------------------------------------- |
| `cwd`               |   ✅   |   ✅    | shared semantics                               |
| `model`             |   ✅   |   ✅    | shared semantics; valid values differ          |
| `allowTools` / `denyTools` |   ❌   |   ✅    | Copilot declarative permission DSL      |
| `permissionMode`    |   ✅   |   ❌    | Claude interactive permissions                 |
| `apiKey`            |   ❌   |   ✅    | Copilot BYOK                                   |
| `hooks`             |   ✅   |   ❌    | Claude hook callbacks                          |
| `mcp`               |   ✅   |   ❌    | Claude MCP server config                       |
| `printMode`         |   ✅   |   ❌    | Claude one-shot mode                           |
| `sessionId`         |   ✅   |   ❌    | Claude session resume                          |

## PTY transport

PTY transport is exposed via the separate `PtyClient` interface
(`createPtyClient` factory) — **not** through `AICliClient`. Both
providers are supported; Copilot bypasses `@github/copilot-sdk` and
spawns the `copilot` binary directly.

| Capability | Claude | Copilot |
| ---------- | :----: | :-----: |
| `createPtyClient({ provider, ... })` | ✅ | ✅ |
| Mapped flags: `model` | ✅ | ✅ |
| Mapped flags: `permissionMode` | ✅ | ❌ (Claude-specific) |
| Mapped flags: `allowTools`/`denyTools`/`addDir`/`allowAll*`/`noAskUser` | ❌ | ✅ |
| Structured methods (`send`, `getHistory`, etc.) in PTY mode | ❌ | ❌ |
| BYOK in PTY mode | ❌ | ❌ — use `CopilotClient` for BYOK |
| Session resume in PTY mode | via `extraArgs: ['--resume', '<id>']` | via UI slash commands |

Anything not mapped above is reachable via `extraArgs`. See
[`docs/pty-transport.md`](./pty-transport.md) for the full guide.

## Future work

- **`getHistory()` normalization.** Add to the `AICliClient` interface once
  `TurnSnapshot` and `CopilotTurnSnapshot` are reconciled. Decision pending:
  shared minimal snapshot type vs generic `AICliClient<H>`.
- **Event normalization.** Possibly add a thin "common events" layer in a
  future phase if a real consumer needs cross-provider event handling.
- **PTY transport (Phase 3).** Forward-compat hooks already in place; will
  add an opt-in `transport: 'pty'` mode for Electron/xterm.js embedding.
