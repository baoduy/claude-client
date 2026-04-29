# Provider capabilities

This document tracks the differences between the Claude and Copilot
providers exposed by `@baoduy2412/ai-cli-client`. The `AICliClient`
interface (the unified API) covers the surface both providers can be
made to share, including optional capability slots that some providers
fill and others omit. Anything listed below as provider-specific is
intentionally not on the unified interface.

> **Maintenance rule:** every PR that adds a method or event to either
> concrete client must add a row here, marked with the appropriate
> Claude/Copilot column.

## In the unified `AICliClient` interface

### Required surface (everything portable across providers)

| Member            | Claude | Copilot | Notes |
| ----------------- | :----: | :-----: | ----- |
| `provider`        |   ✅   |   ✅    | runtime discriminator (`'claude'` / `'copilot'`) |
| `sessionId`       |   ✅   |   ✅    |  |
| `capabilities`    |   ✅   |   ✅    | `AICliCapabilities` map for runtime feature detection |
| `start`           |   ✅   |   ✅    |  |
| `close`           |   ✅   |   ✅    | Claude's `close()` is an async alias for `kill()`; both providers fire `closed` event on close |
| `send`            |   ✅   |   ✅    | accepts `SendInput` (rich content); returns provider's `TurnHandle` (handle types diverge — use `getCurrentTurn()` for unified shape) |
| `sendMessage`     |   ✅   |   ✅    | accepts `SendInput` |
| `queueMessage`    |   ✅   |   ✅    | accepts `SendInput`; pre-scans synchronously |
| `interrupt`       |   ✅   |   ✅    |  |
| `getStatus`       |   ✅   |   ✅    | returns `UnifiedStatus` (3-state); Claude maps internal `'input_needed'` → `'running'` |
| `isProcessing`    |   ✅   |   ✅    |  |
| `getCurrentTurn`  |   ✅   |   ✅    | returns `TurnSnapshot \| null` |
| `getHistory`      |   ✅   |   ✅    | returns `TurnSnapshot[]` |
| `on` / `off`      |   ✅   |   ✅    | strongly typed over `UnifiedEventMap` (12 events) |

### Optional capabilities (Group E)

Methods present iff the corresponding `capabilities` flag is `true`. Use
`client.capabilities.<flag>` for runtime detection or `client.method?.()`
for TypeScript optional chaining.

| Method                  | Claude | Copilot | `capabilities.<flag>` |
| ----------------------- | :----: | :-----: | --------------------- |
| `setModel`              |   ✅   |   ❌    | `setModel`            |
| `setPermissionMode`     |   ✅   |   ❌    | `setPermissionMode`   |
| `setMaxThinkingTokens`  |   ✅   |   ❌    | `setMaxThinkingTokens`|
| `listSupportedModels`   |   ✅   |   ❌    | `listSupportedModels` |
| Rich `SendInput`        |   ✅   |   ❌    | `richContent` — Copilot accepts `string` and text-only `content[]`; image blocks throw `UnsupportedContentError` |

## Provider-specific (concrete class only)

Reach via the `provider` discriminant — `if (client.provider === 'claude') { ... }`.

| Member                     | Claude | Copilot | Notes |
| -------------------------- | :----: | :-----: | ----- |
| `kill`                     |   ✅   |   ❌    | Claude-specific synchronous terminate |
| `getOpenRequests`          |   ✅   |   ❌    | interactive permission flow (Group D — deferred) |
| `approveRequest`           |   ✅   |   ❌    | same |
| `denyRequest`              |   ✅   |   ❌    | same |
| `answerQuestion`           |   ✅   |   ❌    | Claude interactive question flow |
| `createQuestionSession`    |   ✅   |   ❌    | same |
| `getDetailedStatus`        |   ✅   |   ❌    | full 4-state Claude status (`'idle' \| 'running' \| 'input_needed' \| 'error'`) |
| `getCurrentTurnDetailed`   |   ✅   |   ❌    | rich `ClaudeTurnSnapshot` (with `thinking`, `currentMessage`, `metadata`, etc.) |
| `getHistoryDetailed`       |   ✅   |   ❌    | rich `ClaudeTurnSnapshot[]` |
| `getCurrentTurnHandle`     |   ❌   |   ✅    | live `CopilotTurnHandle` instance |
| `getPendingAction`         |   ✅   |   ❌    | Claude `PendingAction` (interactive permissions) |
| `sendControlRequest`       |   ✅   |   ❌    | Claude wire-protocol primitive (Group F — deferred) |
| `sendMcpMessage`           |   ✅   |   ❌    | same |
| `sendMcpControlResponse`   |   ✅   |   ❌    | same |
| `sendMessageWithContent`   |   ✅   |   ❌    | superseded by unified `send(input: SendInput)` |
| `interruptTurn(turnId?)`   |   ✅   |   ❌    | Claude per-turn interrupt |

## Snapshot shapes

`AICliClient.getCurrentTurn()` and `.getHistory()` return the unified
`TurnSnapshot`. Each provider's snapshot extends the base with its own
extras for narrowed access.

| Field on `TurnSnapshot`     | Claude | Copilot | Notes |
| --------------------------- | :----: | :-----: | ----- |
| `id: string`                |   ✅   |   ✅    | Copilot ids are prefixed `copilot-<uuid>` |
| `status: 'pending' \| 'completed' \| 'errored'` | ✅ (mapped) | ✅ | Claude's `TurnStatus` collapses queued/running/waiting → pending, error → errored |
| `text: string`              |   ✅   |   ✅    |  |
| `reasoning?: string`        |   ✅ (aliased from `thinking`) | ✅ | optional |
| `toolUses: TurnToolUse[]`   |   ✅ (adapted from `ToolUseState`) | ✅ |  |
| `toolResults: TurnToolResult[]` | ✅ (adapted) | ✅ |  |
| `usage?: { inputTokens, outputTokens }` | ✅ (renamed from snake_case) | ✅ |  |
| `error?: { message, code? }` | ✅ (mapped from `result.error`) | ✅ (mapped from `{ name, message }`) |  |
| `startedAt: number` (epoch ms) | ✅ (parsed from ISO string) | ✅ |  |
| `completedAt?: number` (epoch ms) | ✅ (parsed) | ✅ |  |

Provider-specific extras stay on the concrete snapshot:
- Claude: `input`, `currentOutputKind`, `currentMessage`, `openRequests`,
  `history`, `result`, `metadata`
- Copilot: `copilotToolCalls`, `copilotUsageRaw`

## Events

All 12 events in `UnifiedEventMap` are available on both providers via
`AICliClient.on()`. Provider-specific events stay on the concrete classes.

### Unified vocabulary

| Event              | Claude | Copilot | Payload |
| ------------------ | :----: | :-----: | ------- |
| `ready`            |   ✅   |   ✅    | `()` |
| `text`             |   ✅   |   ✅    | `(chunk: string)` |
| `text_done`        |   ✅   |   ✅    | `(text: string)` — fires once at turn end if any text emitted |
| `reasoning`        |   ✅   |   ✅    | `(chunk: string)` |
| `reasoning_done`   |   ✅   |   ✅    | `(text: string)` — same semantics as `text_done` |
| `tool_use_start`   |   ✅   |   ✅    | `({ id, name, input })` |
| `tool_result`      |   ✅   |   ✅    | `({ toolUseId, content, isError })` |
| `usage_update`     |   ✅   |   ✅    | `({ inputTokens, outputTokens })` |
| `status_change`    |   ✅   |   ✅    | `(status: UnifiedStatus)` |
| `result`           |   ✅   |   ✅    | `(snapshot: TurnSnapshot)` |
| `error`            |   ✅   |   ✅    | `(err: Error)` |
| `closed`           |   ✅   |   ✅    | `(exitCode: number \| null)` — terminal; no events fire after this |

### Claude-only

| Event                    | Payload |
| ------------------------ | ------- |
| `system`                 | `SystemMessage` |
| `message`                | `AssistantMessage` |
| `user_message`           | `UserMessage` |
| `stream_event`           | `StreamEventMessage` (raw Anthropic SDK) |
| `mcp_message`            | `McpMessageEvent` |
| `hook_callback`          | `HookCallbackEvent` |
| `task_message`           | `TaskMessageEvent` |
| `control_request`        | `ControlRequestMessage` |
| `control_cancel_request` | `ControlCancelRequestMessage` |
| `control_response`       | `ControlResponseEnvelope` |

## Configuration divergence

| Field                       | Claude | Copilot | Notes |
| --------------------------- | :----: | :-----: | ----- |
| `cwd`                       |   ✅   |   ✅    | shared semantics |
| `model`                     |   ✅   |   ✅    | shared semantics; valid values differ |
| `allowTools` / `denyTools`  |   ❌   |   ✅    | Copilot declarative permission DSL |
| `permissionMode`            |   ✅   |   ❌    | Claude interactive permissions |
| `apiKey`                    |   ❌   |   ✅    | Copilot BYOK |
| `hooks`                     |   ✅   |   ❌    | Claude hook callbacks |
| `mcp`                       |   ✅   |   ❌    | Claude MCP server config |
| `printMode`                 |   ✅   |   ❌    | Claude one-shot mode |
| `sessionId`                 |   ✅   |   ✅    | both providers support session resume |

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

## Deferred

- **Group D** (interactive approval unification) — `getOpenRequests`,
  `approveRequest`, `denyRequest`, `answerQuestion`,
  `createQuestionSession` remain on `ClaudeClient` only. Lifting these
  onto the unified surface requires Copilot SDK support; revisit when
  `@github/copilot-sdk` exposes interactive approval primitives.
- **Group F** (low-level escape hatches) — `sendControlRequest`,
  `sendMcpMessage`, `sendMcpControlResponse` are pure Claude
  wire-protocol primitives; consumers needing them narrow via
  `provider` discriminant.
- **Generic-parameterized event maps** — explicitly chose against this
  in 1.0; the small fixed `UnifiedEventMap` is the simpler default.
