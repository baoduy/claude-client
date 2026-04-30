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
| `close`           |   ✅   |   ✅    | Claude's `close()` is an async alias for `kill()`; Copilot's `close()` runs `session.abort()` → `session.disconnect()` → `client.stop()`, idempotent. Both providers fire `closed` event on close. |
| `send`            |   ✅   |   ✅    | accepts `SendInput` (rich content); returns provider's `TurnHandle` (handle types diverge — use `getCurrentTurn()` for unified shape) |
| `sendMessage`     |   ✅   |   ✅    | accepts `SendInput` |
| `queueMessage`    |   ✅   |   ✅    | accepts `SendInput`; pre-scans synchronously |
| `interrupt`       |   ✅   |   ✅    |  |
| `getStatus`       |   ✅   |   ✅    | returns `UnifiedStatus` (3-state); Claude maps internal `'input_needed'` → `'running'` |
| `isProcessing`    |   ✅   |   ✅    |  |
| `getCurrentTurn`  |   ✅   |   ✅    | returns `TurnSnapshot \| null` |
| `getHistory`      |   ✅   |   ✅    | returns `TurnSnapshot[]` |
| `on` / `off`      |   ✅   |   ✅    | strongly typed over `UnifiedEventMap` (15 events) |

### Optional capabilities (Group E)

Methods present iff the corresponding `capabilities` flag is `true`. Use
`client.capabilities.<flag>` for runtime detection or `client.method?.()`
for TypeScript optional chaining.

| Method                  | Claude | Copilot | `capabilities.<flag>` |
| ----------------------- | :----: | :-----: | --------------------- |
| `setModel`              |   ✅   |   ✅    | `setModel`            |
| `setPermissionMode`     |   ✅   |   ✅    | `setPermissionMode` — both providers; vocab: `'prompt' \| 'auto-edit' \| 'auto-all' \| 'plan' \| 'autopilot'`. `'autopilot'` is Copilot-only. Legacy `'default' \| 'acceptEdits' \| 'auto' \| 'bypassPermissions' \| 'dontAsk'` accepted via `LegacyPermissionMode` alias (deprecated; removed in 2.0.0). |
| `setMaxThinkingTokens`  |   ✅   |   ❌    | `setMaxThinkingTokens`|
| `listSupportedModels`   |   ✅   |   ✅    | `listSupportedModels` |
| `getMessages`           |   ✅   |   ✅    | `getMessages` — projects to `UnifiedMessage[]`; preserves the full provider event under `.raw.event` |
| `getOpenRequests`       |   ✅   |   ✅    | `interactiveApproval` — returns `PendingRequest[]` (discriminated union of permission/elicitation/question variants) |
| `approveRequest`        |   ✅   |   ✅    | `interactiveApproval` — accepts `ApproveDecision`. Copilot's `'session'`/`'location'` scopes degrade to `'once'` for unknown request kinds (logged via `console.warn`). |
| `denyRequest`           |   ✅   |   ✅    | `interactiveApproval` |
| `answerQuestion`        |   ✅   |   ✅    | `interactiveApproval` — accepts `QuestionResponse` |
| `getPendingAction`      |   ✅   |   ✅    | `interactiveApproval` — returns `{id, kind}` reference |
| `interruptTurn`         |   ✅   |   ✅    | `interruptTurnGranularity` — Claude `'per-turn'` (turnId honored); Copilot `'session-only'` (turnId ignored) |
| `getDetailedStatus`     |   ✅   |   ✅    | `detailedStatus` — provider-aware unified `DetailedStatus` |
| Rich `SendInput`        | partial | full   | `richContent` — `'none' \| 'partial' \| 'full'`. Claude accepts text + image; Copilot accepts text + image (base64) + file_path + directory_path + selection (mapped to SDK attachments). |

### Permission mode vocabulary

The unified `PermissionMode` type used by `setPermissionMode` and exposed via
`capabilities.permissionModes`:

| Mode         | Claude maps to        | Copilot maps to                              |
| ------------ | --------------------- | -------------------------------------------- |
| `prompt`     | `default`             | `mode.set('interactive')` + `setApproveAll(false)` |
| `auto-edit`  | `acceptEdits`         | `mode.set('interactive')` + queue auto-approves write-kind permissions |
| `auto-all`   | `bypassPermissions`   | `mode.set('interactive')` + `setApproveAll(true)` |
| `plan`       | `plan`                | `mode.set('plan')`                           |
| `autopilot`  | (throws — Copilot-only) | `mode.set('autopilot')`                    |

The legacy vocab (`'default' | 'acceptEdits' | 'auto' | 'bypassPermissions' | 'dontAsk' | 'plan'`) is accepted at runtime via the `LegacyPermissionMode` type alias and translated to the new vocab. The alias is **deprecated** and will be removed in 2.0.0. Migration:

```
sed -i.bak "s/'default'/'prompt'/g; s/'acceptEdits'/'auto-edit'/g; s/'bypassPermissions'/'auto-all'/g" <files>
```

## Provider-specific (concrete class only)

Reach via the `provider` discriminant — `if (client.provider === 'claude') { ... }`.

| Member                     | Claude | Copilot | Notes |
| -------------------------- | :----: | :-----: | ----- |
| `kill`                     |   ✅   |   ❌    | Claude-specific synchronous terminate |
| `createQuestionSession`    |   ✅   |   ❌    | Claude interactive question flow |
| `getOpenRequestsDetailed`  |   ✅   |   ❌    | rich Claude `OpenRequest[]` (preserved); the unified `getOpenRequests()` is the projection |
| `approveRequestDetailed`   |   ✅   |   ❌    | accepts Claude's full `{message, updatedInput, updatedPermissions, scope, always}` decision shape |
| `denyRequestDetailed`      |   ✅   |   ❌    | rich Claude deny |
| `answerQuestionDetailed`   |   ✅   |   ❌    | accepts Claude's `QuestionAnswerInput` (`Record<string, QuestionAnswerValue>`) |
| `getPendingActionDetailed` |   ✅   |   ❌    | rich Claude `PendingAction` shape |
| `getClaudeStatus`          |   ✅   |   ❌    | Claude's 4-state `'idle' \| 'running' \| 'input_needed' \| 'error'` (was `getDetailedStatus`) |
| `getCurrentTurnDetailed`   |   ✅   |   ❌    | rich `ClaudeTurnSnapshot` (with `thinking`, `currentMessage`, `metadata`, etc.) |
| `getHistoryDetailed`       |   ✅   |   ❌    | rich `ClaudeTurnSnapshot[]` |
| `getCurrentTurnHandle`     |   ❌   |   ✅    | live `CopilotTurnHandle` instance |
| `sendControlRequest`       |   ✅   |   ❌    | Claude wire-protocol primitive (Group F — deferred) |
| `sendMcpMessage`           |   ✅   |   ❌    | same |
| `sendMcpControlResponse`   |   ✅   |   ❌    | same |
| `sendMessageWithContent`   |   ✅   |   ❌    | superseded by unified `send(input: SendInput)` |

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

All 15 events in `UnifiedEventMap` are available on both providers via
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
| `pending_request_added`    | ✅ | ✅ | `({ id: string; kind: 'permission' \| 'elicitation' \| 'question' })` |
| `pending_request_removed`  | ✅ | ✅ | `({ id: string })` |
| `pending_request_resolved` | ✅ | ✅ | `({ id: string; outcome: 'approved' \| 'denied' \| 'answered' \| 'cancelled' })` |

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
| `hooks`                     |   ✅   |   ✅    | provider-specific shape — Claude hooks vs Copilot `SessionHooks` (onPreToolUse, onPostToolUse, onUserPromptSubmitted, onSessionStart, onSessionEnd, onErrorOccurred) |
| `mcp` / `mcpServers`        |   ✅   |   ✅    | provider-specific shape — Claude `mcp` config vs Copilot `mcpServers: Record<string, MCPServerConfig>` (stdio + http/sse) |
| `printMode`                 |   ✅   |   ❌    | Claude one-shot mode |
| `sessionId`                 |   ✅   |   ✅    | both providers support session resume |

## Copilot bonus namespaces

Reach via `client.<namespace>.<method>` on a `CopilotClient` instance.
All map to the upstream `session.rpc.<namespace>.*` namespaces in
`@github/copilot-sdk@0.3.0`. Methods marked **(@experimental)** wrap
upstream methods marked `@experimental` and may change shape in minor
SDK releases.

Constructed via lazy session resolver — calls before `start()` throw
`SessionNotStartedError`. RPC failures are wrapped as `CopilotRpcError`
with `namespace`/`method`/`cause` context, except for experimental
namespaces where "method not found" responses (older CLI) become
`CopilotExperimentalUnavailableError` with `cliVersion`.

Tree-shake-friendly subpath import:

```ts
import { CopilotPlanApi } from '@baoduy2412/ai-cli-client/copilot/namespaces';
```

| Namespace | Methods | Stability |
| --------- | ------- | --------- |
| `plan` | `read`, `update`, `delete` | stable |
| `skills` | `list`, `enable`, `disable`, `reload` | @experimental |
| `agent` | `list`, `getCurrent`, `select`, `deselect`, `reload` | @experimental |
| `history` | `compact`, `truncate` | @experimental |
| `usage` | `getMetrics` | @experimental |
| `shell` | `exec`, `kill` | stable |
| `workspaces` | `getWorkspace`, `listFiles`, `readFile`, `createFile` | stable |
| `name` | `get`, `set` | stable |
| `instructions` | `getSources` | stable |
| `mcp` | `list`, `enable`, `disable`, `reload`, **nested** `mcp.oauth.login` | @experimental |

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

- **Group F** (low-level escape hatches) — `sendControlRequest`,
  `sendMcpMessage`, `sendMcpControlResponse` are pure Claude
  wire-protocol primitives; consumers needing them narrow via
  `provider` discriminant.
- **Generic-parameterized event maps** — explicitly chose against this
  in 1.0; the small fixed `UnifiedEventMap` is the simpler default.
