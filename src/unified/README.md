# `unified` — Provider-agnostic types and errors

## Purpose

The shared vocabulary that `claude` and `copilot` agree on. Defines the unified turn/snapshot/event/permission shapes consumed by `AICliClient`, plus the cross-provider error types. No runtime classes, no I/O — pure type definitions, one error pair, and one permission-mode translation helper.

This module is imported by `src/ai-cli-client.ts`, both provider modules, and re-exported from `src/index.ts`. Consumers usually import from the package root, not from here directly.

## Public exports

| Name | Purpose |
| --- | --- |
| `UnifiedStatus` | `'idle' \| 'running' \| 'error'`. |
| `TurnSnapshot` | Cross-provider turn state. The unified read-model returned by `getCurrentTurn()` / `getHistory()`. |
| `TurnToolUse` | Snapshot shape for one tool invocation. |
| `TurnToolResult` | Snapshot shape for one tool result. |
| `SendInput` | Accepted shapes for `client.send(...)`: `string`, `{ text }`, or `{ content: ContentBlock[] }`. |
| `ContentBlock` | Discriminated union of supported rich-content blocks (text, image, file path, directory path, selection). |
| `ImageSource` | `base64` or `url` source for `image` blocks. |
| `AICliCapabilities` | Runtime feature-detection map exposed at `client.capabilities`. |
| `PermissionMode` | Unified permission vocabulary (`prompt`, `auto-edit`, `auto-all`, `plan`, `autopilot`). |
| `LegacyPermissionMode` | Deprecated pre-1.0 vocabulary; kept for backward-compat callers. |
| `translateLegacyPermissionMode` | Map a legacy mode value to the current vocabulary. |
| `SupportedModelsResponse` | Shape returned by `listSupportedModels()`. |
| `UnifiedMessage`, `UnifiedMessageRaw` | Provider-tagged historical message shape used by `getMessages()`. |
| `UnifiedEventMap`, `UnifiedEventName` | Strongly-typed event vocabulary shared by both clients. |
| `PendingRequest` and friends (`PermissionPendingRequest`, `ElicitationPendingRequest`, `UserInputPendingRequest`) | Phase 1.2 interactive-approval request shapes. |
| `ApproveDecision`, `QuestionResponse`, `DetailedStatus`, `PendingAction` | Companions to interactive approval. |
| `UnsupportedContentError` | Thrown when a `send()` call passes a content block the provider can't render. |
| `UnsupportedModeError` | Thrown when `setPermissionMode()` receives a mode the provider doesn't support. |

## Key interfaces

### `TurnSnapshot`

Cross-provider snapshot of a single turn. Both `getCurrentTurn()` and `getHistory()` return this shape regardless of provider.

Fields of interest: `id`, `status` (`'pending' | 'completed' | 'errored'`), `text`, optional `reasoning`, `toolUses`, `toolResults`, optional `usage`, optional `error`, `startedAt`, optional `completedAt`. See `types.ts` for the full TSDoc.

### `AICliCapabilities`

Runtime feature-detection map. Keys mirror optional methods on `AICliClient` — if a key is `true` (or the string-typed flags are non-`'none'`), the corresponding method is present.

Notable flags: `richContent`, `setModel`, `setPermissionMode`, `setMaxThinkingTokens`, `listSupportedModels`, `getMessages`, `hooks`, `mcp`, `permissionModes`, `interactiveApproval`, `interruptTurnGranularity`, `detailedStatus`.

### `UnifiedEventMap`

Type-level map from event name to listener arg tuple. Drives the typed `on(event, listener)` overloads on both clients. Event names: `ready`, `text`, `text_done`, `reasoning`, `reasoning_done`, `tool_use_start`, `tool_result`, `usage_update`, `status_change`, `result`, `error`, `closed`, plus the Phase 1.2 `pending_request_*` triplet.

### `UnsupportedContentError` / `UnsupportedModeError`

Thrown when callers ask a provider to do something it doesn't support. `UnsupportedContentError` carries `provider`, `unsupportedBlock`, `inputIndex`. `UnsupportedModeError` carries `provider` and `mode`.

## Usage

```ts
import {
  type TurnSnapshot,
  type AICliCapabilities,
  UnsupportedContentError,
} from '@baoduy2412/ai-cli-client';

function summarise(snapshot: TurnSnapshot): string {
  const tools = snapshot.toolUses.map((t) => t.name).join(', ');
  return `${snapshot.status}: ${snapshot.text.slice(0, 60)} (tools: ${tools || 'none'})`;
}

function canSendImages(caps: AICliCapabilities): boolean {
  return caps.richContent !== 'none';
}
```

## Internal files

- `types.ts` — all type/interface declarations and the `translateLegacyPermissionMode` helper.
- `events.ts` — `UnifiedEventMap` declaration.
- `errors.ts` — `UnsupportedContentError`, `UnsupportedModeError`.
- `index.ts` — barrel.

## See also

- Root [`README.md`](../../README.md) — package overview and full event semantics.
- [`../ai-cli-client.ts`](../ai-cli-client.ts) — the `AICliClient` interface that consumes these types.
- [`docs/provider-capabilities.md`](../../docs/provider-capabilities.md) — full divergence matrix between providers.
