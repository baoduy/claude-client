# Changelog

## 1.3.0 — 2026-04-29

### Added
- `CopilotClient` now exposes 10 namespace wrappers for upstream `session.rpc.*`:
  `plan`, `skills`, `agent`, `history`, `usage`, `shell`, `workspaces`,
  `name`, `instructions`, `mcp` (with nested `mcp.oauth.login`).
- Subpath export `@drunkcoding/ai-cli-clients/copilot/namespaces` for
  tree-shake-friendly imports of wrapper classes and their derived
  request/result types.
- New error classes: `SessionNotStartedError` (callsite tag),
  `CopilotRpcError` (namespace/method/cause), and
  `CopilotExperimentalUnavailableError` (with `cliVersion`).
- `test/unit/capability-matrix.test.mjs` — CI guard that asserts
  `docs/provider-capabilities.md` matches runtime `client.capabilities`.

### Notes
- Five namespaces are marked `@experimental` upstream and may change
  shape in minor SDK releases: `skills`, `agent`, `history`, `usage`,
  `mcp`. Method-not-found errors (JSON-RPC -32601) are translated to
  `CopilotExperimentalUnavailableError` so consumers can detect older
  CLI versions.
- All wrappers use a lazy session resolver — methods called before
  `client.start()` throw `SessionNotStartedError`.

## 1.2.0 — 2026-04-29

### Added
- `AICliClient.getOpenRequests/approveRequest/denyRequest/answerQuestion/getPendingAction`: pull-style interactive approval surface on both providers. Capability flag `interactiveApproval: true`.
- `AICliClient.interruptTurn(turnId?)`: granular interrupt. Claude honors `turnId` (per-turn granularity); Copilot ignores it (session-only). Capability flag `interruptTurnGranularity: 'per-turn' | 'session-only'`.
- `AICliClient.getDetailedStatus()`: provider-aware unified `DetailedStatus`.
- `AICliClient.setPermissionMode(mode)`: now portable. Capability `setPermissionMode: true` for Copilot.
- `AICliCapabilities` extended with `permissionModes: PermissionMode[]`, `interactiveApproval`, `interruptTurnGranularity`, `detailedStatus`.
- New unified events `pending_request_added` / `pending_request_removed` / `pending_request_resolved` on `UnifiedEventMap`.
- `RequestNotHandled` sentinel error: throw from a user-provided permission/elicitation/userInput handler to fall through to the internal queue.
- `CopilotClientConfig` now accepts `onPermissionRequest`, `onElicitationRequest`, `onUserInputRequest` callbacks; chained with the internal `PendingRequestQueue` via `RequestNotHandled`.
- New types: `PendingRequest`, `PermissionPendingRequest`, `ElicitationPendingRequest`, `UserInputPendingRequest`, `ApproveDecision`, `QuestionResponse`, `DetailedStatus`, `PendingAction`.
- `UnsupportedModeError` raised when `setPermissionMode` receives a mode not in `capabilities.permissionModes`.
- Cross-provider contract tests under `test/contract/`.

### Changed (BREAKING — string-literal rename, gated by deprecation alias)
- `PermissionMode` vocabulary renamed to `'prompt' | 'auto-edit' | 'auto-all' | 'plan' | 'autopilot'`. Legacy values (`'default' | 'acceptEdits' | 'auto' | 'bypassPermissions' | 'dontAsk' | 'plan'`) remain accepted at runtime via the deprecated `LegacyPermissionMode` alias and `translateLegacyPermissionMode()` helper. The alias will be removed in 2.0.0.
- Migration `sed`:
  ```
  sed -i.bak "s/'default'/'prompt'/g; s/'acceptEdits'/'auto-edit'/g; s/'bypassPermissions'/'auto-all'/g" <files>
  ```
- Claude's pre-existing rich-shape methods preserved as `*Detailed` siblings (following the existing `getCurrentTurn`/`getCurrentTurnDetailed` pattern):
  - `getOpenRequests` → `getOpenRequestsDetailed`
  - `approveRequest` → `approveRequestDetailed`
  - `denyRequest` → `denyRequestDetailed`
  - `answerQuestion` → `answerQuestionDetailed`
  - `getPendingAction` → `getPendingActionDetailed`
  - `getDetailedStatus` (Claude's 4-state shape) → `getClaudeStatus`. The new unified `getDetailedStatus()` returns `DetailedStatus`.
  - Consumers calling the old method names with the rich Claude shape should migrate to the `*Detailed` versions.

### Known limitations
- **Copilot `approve-for-session` / `approve-for-location` shape synthesis is best-effort.** The SDK's `PermissionRequest` only exposes `kind` + `toolCallId`; the queue cannot fully reconstruct a `commands`-style approval payload for shell, MCP server names for `mcp`, etc. Consequence: scope `'session'` and `'location'` decisions degrade to `'once'` (with a `console.warn`) for `mcp`, `custom-tool`, `url`, `hook` permission kinds. Consumers needing full-fidelity multi-turn approvals should install a user-provided `onPermissionRequest` handler.
- **Copilot `auto-edit` matches `PermissionRequest.kind === 'write'` only.** Other "edit-like" operations (file rename, delete) are not auto-approved — they go through the queue normally.
- **Copilot `interruptTurn(turnId)` ignores `turnId`** — the SDK's `session.abort()` is session-scoped. Use `capabilities.interruptTurnGranularity` to detect.
- **Default `CopilotClient` blocks indefinitely on unhandled permission requests** until the consumer drains them via `approveRequest`/`denyRequest`. This is the intended pull-style API but a behavior shift from prior versions where `approveAll` was the silent default. Consumers wanting silent auto-approve should explicitly call `setPermissionMode('auto-all')` after `start()` or pass `onPermissionRequest: approveAll` (re-export from `@github/copilot-sdk`).

### Provider-specific (Claude)
- Claude's permission internals untouched; the wire-protocol `ClaudePermissionMode` and `permissionMode?` config field remain. The public `setPermissionMode` accepts the unified vocab and translates internally.

## 1.1.0 — 2026-04-29

### Added
- `AICliClient.getMessages()`: unified message history projection on both providers, returning `UnifiedMessage[]`. Capability flag `getMessages: true`.
- `CopilotClient.setModel(model)`: maps to `session.setModel`. Capability flag `setModel: true` for Copilot.
- `CopilotClient.listSupportedModels()`: maps to `client.listModels()`, projected to `SupportedModelsResponse`. Capability flag `listSupportedModels: true` for Copilot.
- `CopilotClientConfig.hooks?: SessionHooks`: full Copilot hook lifecycle (`onPreToolUse`, `onPostToolUse`, `onUserPromptSubmitted`, `onSessionStart`, `onSessionEnd`, `onErrorOccurred`). Capability flag `hooks: true` for Copilot.
- `CopilotClientConfig.mcpServers?: Record<string, MCPServerConfig>`: stdio + http/sse MCP servers at session creation. Capability flag `mcp: true` for Copilot.
- `SendInput` content blocks: `file_path`, `directory_path`, `selection` (Copilot-only at runtime — passing them to Claude throws `UnsupportedContentError`).
- `CopilotClient.send/sendMessage/queueMessage` now accept image content blocks (base64 → blob attachment); URL image source remains unsupported.

### Changed
- **Breaking (TS):** `AICliCapabilities.richContent` widened from `boolean` → `'none' | 'partial' | 'full'`. Truthy/falsy runtime checks remain semantically correct (`'none'` is falsy, `'partial' | 'full'` are truthy). Migration: replace `caps.richContent === true` with `caps.richContent !== 'none'`.
- `CopilotClient.close()`: harmonized to `session.abort()` → `session.disconnect()` → `client.stop()`, idempotent. Both providers now emit `closed` event with `null` exit code on graceful close.

## 1.0.0 — 2026-04-29

### Breaking changes — unified surface expansion

The `AICliClient` interface expanded from a "lowest common denominator"
(10 members) to a capability superset (~22 members). Both providers now
share an event vocabulary, a snapshot shape, and runtime feature
detection. Provider-specific surfaces remain accessible via the
`provider` discriminant.

#### Migration table

```
0.6 → 1.0 migration

Events on AICliClient (now strongly typed over UnifiedEventMap):
  text_delta / output_delta         →  text
  thinking_delta / reasoning_delta  →  reasoning
  text_accumulated                  →  text_done
  thinking_accumulated              →  reasoning_done
  exit                              →  closed
  tool_use (Claude legacy)          →  removed (use tool_use_start)

Status:
  ClaudeClient.getStatus()          →  returns UnifiedStatus (3-state).
                                       'input_needed' maps to 'running'.
                                       Use getDetailedStatus() for the
                                       4-state value.

Send input:
  AICliClient.send(string)          →  AICliClient.send(SendInput)
                                       (SendInput = string | {text} | {content[]}).
                                       String inputs unchanged. Rich
                                       content blocks (text + image) on
                                       Claude. Copilot rejects images
                                       synchronously via UnsupportedContentError.

Capabilities (new):
  client.capabilities.{flag}        →  runtime feature detection
                                       (richContent, setModel,
                                        setPermissionMode,
                                        setMaxThinkingTokens,
                                        listSupportedModels)
  client.setModel?.(...)            →  TypeScript optional invocation
                                       (Claude implements all four
                                        Group E methods; Copilot none)

Snapshots:
  Claude TurnSnapshot.startedAt     →  number (epoch ms; was ISO string)
  Claude TurnSnapshot.completedAt   →  number (epoch ms; was ISO string)
  Copilot TurnSnapshot.turnId       →  id  (Copilot ids prefixed 'copilot-')
  Copilot TurnSnapshot.reasoningText → reasoning?
  Copilot TurnSnapshot.endedAt      →  completedAt?
  Copilot snapshot status           →  'pending'|'completed'|'errored'
                                       (was 'queued'|'running'|'completed'|'error')
  Copilot error shape               →  { message, code? }  (was { name, message })
  Copilot tool calls                →  toolUses[] / toolResults[]
                                       (raw SDK records on copilotToolCalls)

CopilotClient.getCurrentTurn()      →  returns CopilotTurnSnapshot | null
                                       (was CopilotTurnHandle | null).
                                       Use getCurrentTurnHandle() for
                                       the live handle.

ClaudeClient.getCurrentTurn()       →  returns unified TurnSnapshot | null
                                       (was rich Claude shape).
                                       Use getCurrentTurnDetailed() for
                                       the rich shape.

Removed Claude internal:
  ClaudeSendInput                   →  unified SendInput (alias kept for
                                       source-compat at the type level)
  ClaudeSendContentBlock            →  unified ContentBlock (text|image
                                       discriminated union, replacing the
                                       loose {type: string; ...} shape)
```

### Added

- `src/unified/*` — shared types module:
  - `UnifiedStatus`, `TurnSnapshot`, `TurnToolUse`, `TurnToolResult`
  - `SendInput`, `ContentBlock`, `ImageSource`
  - `AICliCapabilities`, `PermissionMode`, `SupportedModelsResponse`
  - `UnifiedEventMap` (12 events)
  - `UnsupportedContentError`
- `./unified` subpath export in `package.json`.
- `AICliClient.capabilities` runtime feature-detection map.
- `AICliClient.getStatus()`, `isProcessing()`, `getCurrentTurn()`,
  `getHistory()`, `off()` lifted onto the unified interface.
- Strongly-typed `AICliClient.on()` / `off()` over `UnifiedEventMap`.
- Optional `setModel`, `setPermissionMode`, `setMaxThinkingTokens`,
  `listSupportedModels` on `AICliClient` (Claude implements all four;
  Copilot omits all four).
- Rich `SendInput` accepted on `send`/`sendMessage`/`queueMessage`.
- Unified events: `text`, `text_done`, `reasoning`, `reasoning_done`,
  `closed`.
- `ClaudeClient.getDetailedStatus()` for the 4-state Claude status.
- `ClaudeClient.getCurrentTurnDetailed()` /
  `ClaudeClient.getHistoryDetailed()` for rich Claude snapshot access.
- `CopilotClient.getCurrentTurnHandle()` for the live `CopilotTurnHandle`.
- `npm run integration:cross-provider` smoke script.
- Tests: `unified-events`, `unified-snapshot`, `unified-capabilities`,
  `event-ordering`, `unified-errors`, plus expanded
  `unified-contract.test.mjs`. Suite grows from 128 to 172 cases.

### Changed

- `AICliClient.getStatus()` now returns `UnifiedStatus` (3-state).
  Claude maps `'input_needed'` to `'running'` at the unified layer.
- `CopilotTurnSnapshot` now extends unified `TurnSnapshot`; field
  renames per migration table above.
- `ClaudeTurnSnapshot.startedAt` / `completedAt` are now epoch ms
  (number) instead of ISO strings when surfaced through the unified
  adapter.
- `CopilotClient.sendMessage` is no longer `async` — synchronous
  validation surfaces before the Promise is constructed.

### Removed

Events on Claude (renamed/dropped):
  `text_delta`, `text_accumulated`, `thinking_delta`,
  `thinking_accumulated`, `exit`, `tool_use` (legacy).

Events on Copilot:
  `output_delta`, `reasoning_delta`.

### Deferred

- **Group D** — interactive approval unification (`getOpenRequests`,
  `approveRequest`, `denyRequest`, `answerQuestion`,
  `createQuestionSession`) remains on `ClaudeClient` only. Lifting
  requires a Copilot SDK upgrade.
- **Group F** — low-level escape hatches (`sendControlRequest`,
  `sendMcpMessage`, `sendMcpControlResponse`) remain on `ClaudeClient`
  only.

PTY transport is unaffected by this release.

## 0.6.0 — 2026-04-29

### Added
- `createPtyClient(config)` factory and `PtyClient` interface — pure
  passthrough PTY transport for daemon-layer embedding (typically Electron
  main processes forwarding bytes to xterm.js or a custom renderer).
  Spawns the underlying CLI in a real OS-level pseudo-terminal via
  `node-pty`; library does not render.
- `PtyClientConfig` discriminated union with provider-specific arg
  mapping. Common fields: `cwd`, `cols`, `rows`, `env`, `bin`,
  `extraArgs`. Claude maps `model`, `permissionMode`. Copilot maps
  `model`, `allowAll`, `allowAllPaths`, `allowAllUrls`, `noAskUser`,
  `allowTools`, `denyTools`, `addDir`.
- Error types: `PtyError`, `PtyDependencyMissingError`,
  `PtyBinaryNotFoundError`, `PtySpawnError` — with `code` discriminator
  and `cause` chaining.
- New `./pty` subpath: `import { createPtyClient } from '@drunkcoding/ai-cli-clients/pty'`.
- Examples under `examples/pty/`: `basic-claude.ts`, `basic-copilot.ts`,
  `electron-main.ts`.
- Consumer guide at `docs/pty-transport.md`.
- `npm run integration:pty` smoke script.

### Changed
- `package.json` declares `node-pty: ">=1.0.0"` as an **optional peer
  dependency**. Consumers using PTY mode must install it explicitly:
  `npm install node-pty`. For Electron, rebuild via `npx @electron/rebuild`.
- `CopilotClient` config field `transport: 'pty'` now points users at
  `createPtyClient({ provider: 'copilot' })` in its error message
  (still throws — the SDK-based path does not implement PTY).
- `docs/provider-capabilities.md` documents the new PTY transport row.

### Notes
- PTY mode is a separate surface from `AICliClient`. The structured
  surfaces (`ClaudeClient`, `CopilotClient`, `createAICliClient`) are
  unaffected.
- Copilot PTY mode bypasses `@github/copilot-sdk` and spawns the
  `copilot` binary directly. BYOK and SDK-only features are not
  available in PTY mode — use `CopilotClient` for those.

## 0.5.0 — 2026-04-29

### Added
- `AICliClient` interface — provider-agnostic, lowest-common-denominator
  surface that both `ClaudeClient` and `CopilotClient` implement.
- `createAICliClient(config)` factory — discriminated-union dispatch on
  `config.provider`. Auto-starts the client.
- `AICliClientConfig` discriminated-union type. Provider-specific fields
  narrow automatically based on the `provider` discriminator.
- `readonly provider` field on both `ClaudeClient` and `CopilotClient`
  for runtime discrimination.
- `ClaudeClient.close()` — async alias for `kill()`, satisfies the unified
  interface's `close(): Promise<void>` requirement. `kill()` is preserved.
- `docs/provider-capabilities.md` — capability matrix tracking what's on
  the unified interface vs what's provider-specific.
- README "Unified API" section.

### Changed
- `package.json` `test` script glob now matches both `test/*.test.mjs` and
  `test/**/*.test.mjs` — required so root-level cross-provider tests
  (`factory.test.mjs`, `unified-contract.test.mjs`, `barrel-exports.test.mjs`)
  are discovered.

### Notes
- `getHistory()` is intentionally not yet on the unified interface —
  `TurnSnapshot[]` (Claude) and `CopilotTurnSnapshot[]` (Copilot) need
  to be reconciled first. Tracked in `docs/provider-capabilities.md`
  as a Phase 2.x follow-up.
- Strongly-typed events are not normalized in Phase 2. Use the concrete
  class when you need type-safe `on()`.
- PTY transport for Electron embedding remains Phase 3.

## 0.4.0 — 2026-04-28

### Added
- `CopilotClient` (`@drunkcoding/ai-cli-clients/copilot`) — wraps `@github/copilot-sdk` with a surface that mirrors `ClaudeClient`. Supports streaming events, multi-turn sessions (auto-managed or caller-supplied), permission DSL (allow/deny tool patterns), BYOK (Anthropic/OpenAI/Azure keys), and disk-backed session browsing.
- Top-level barrel: `import { ClaudeClient, CopilotClient } from '@drunkcoding/ai-cli-clients'` works directly.
- New `./copilot` subpath in `package.json` `exports`.
- New examples under `examples/copilot/`: `basic.ts`, `streaming.ts`, `permissions.ts`, `byok.ts`.
- Shared `TurnHandleBase<TSnapshot, TUpdate>` interface at the top of `src/`.
- `npm run integration:copilot` smoke script.

### Changed
- **Package renamed to `@drunkcoding/ai-cli-clients`.**
- Top-level dist layout reorganized: Claude module is now at `./dist/esm/claude/...` (was `./dist/esm/...`). Subpath imports keep working: `@drunkcoding/ai-cli-clients/sessions`, `/mcp`, `/task-store`, `/task-queue` resolve to the same Claude submodules they always did.
- `ClaudeClient.init()` now returns `ClaudeClient` (was `StructuredClaudeClient`). Existing callers using `await ClaudeClient.init(config)` keep working — the methods previously on `StructuredClaudeClient` (`send`, `getHistory`, `getOpenRequests`, `approveRequest`, `answerQuestion`, etc.) are now on `ClaudeClient` directly.

### Removed
- **`StructuredClaudeClient` class.** Its methods folded onto `ClaudeClient`. Replace any `import { StructuredClaudeClient } from '@<old>'` with `import { ClaudeClient } from '@drunkcoding/ai-cli-clients'` and use `ClaudeClient.init(config)` (signature unchanged).
- `src/claude/structured.ts` deleted.

### Known Limitations
- `@github/copilot-sdk` is in public preview. The following `CopilotClientConfig` fields are not yet honored by the SDK and throw `CopilotFeatureUnsupportedError` at `start()`: `mode`, `maxAutopilotContinues`, `availableTools`, `excludedTools`, `allowAllTools`, `allowAllPaths`, `allowAllUrls`, `noAskUser`, `sessionName`. These will light up automatically as the SDK adds passthrough support.

## 0.3.3

- Added synthetic attached-turn handling so structured Claude clients can take over resumed waiting `control_request` prompts.
- Added regression coverage for answering provider-originated question requests without a locally started turn.

## 0.3.2

- Added shared provider-neutral session browser types for raw plus normalized transcript access.
- Added `listClaudeSessionSummaries(...)` and `readClaudeSessionRecord(...)` on top of the existing Claude filesystem session store.
- Added normalized Claude transcript extraction for text, thinking, tool use, tool results, plans, and pending approvals.
- Added session browser tests and optional locator overrides for Claude session discovery helpers.

## 0.3.1

- Added `createQuestionSession(...)` to the structured client for incremental multi-question workflows.
- Allowed structured Claude question answers to be keyed by question id as well as header/prompt labels.
- Updated tests and README examples for the new question helper.

## 0.3.0

- Added a new structured client layer via `ClaudeClient.init(...)`
- Added `TurnHandle`-based streaming with `updates()`, `current()`, `done`, and per-turn history
- Added structured open request handling for questions, tool approvals, hooks, and MCP requests
- Added high-level request helpers: `approveRequest`, `denyRequest`, and `answerQuestion`
- Added structured examples and updated the README to document when to use raw `client.on(...)` versus structured turns
- Added real Claude validation scripts for structured smoke tests and multi-pass live validation
- Expanded test coverage for the structured client surface while preserving the raw event API

## 0.2.0

- **New Feature**: Print mode (`printMode: true`) - spawns process per message with session persistence via `--session-id`/`--resume`
- `printModeAutoSession` option to auto-generate session IDs (default: true)
- Added comprehensive unit tests (46 total)
- Removed unused imports and dead code
- Added `queueMessage()` method for queuing messages when busy
- Added `getStatus()`, `getPendingAction()`, `isProcessing()` getters
- Added `text_accumulated`, `thinking_accumulated`, `tool_use_start`, `tool_result`, `status_change` events
- New examples: `print-mode.ts`, `print-mode-session.ts`
- Updated README with print mode documentation and mode comparison table

## 0.1.0

- Initial standalone public package release.
- Added dual ESM/CJS builds with typed exports.
- Added tests, examples, and expanded package documentation.
