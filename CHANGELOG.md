# Changelog

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
- `CopilotClient` (`@baoduy2412/ai-cli-client/copilot`) — wraps `@github/copilot-sdk` with a surface that mirrors `ClaudeClient`. Supports streaming events, multi-turn sessions (auto-managed or caller-supplied), permission DSL (allow/deny tool patterns), BYOK (Anthropic/OpenAI/Azure keys), and disk-backed session browsing.
- Top-level barrel: `import { ClaudeClient, CopilotClient } from '@baoduy2412/ai-cli-client'` works directly.
- New `./copilot` subpath in `package.json` `exports`.
- New examples under `examples/copilot/`: `basic.ts`, `streaming.ts`, `permissions.ts`, `byok.ts`.
- Shared `TurnHandleBase<TSnapshot, TUpdate>` interface at the top of `src/`.
- `npm run integration:copilot` smoke script.

### Changed
- **Package renamed to `@baoduy2412/ai-cli-client`.**
- Top-level dist layout reorganized: Claude module is now at `./dist/esm/claude/...` (was `./dist/esm/...`). Subpath imports keep working: `@baoduy2412/ai-cli-client/sessions`, `/mcp`, `/task-store`, `/task-queue` resolve to the same Claude submodules they always did.
- `ClaudeClient.init()` now returns `ClaudeClient` (was `StructuredClaudeClient`). Existing callers using `await ClaudeClient.init(config)` keep working — the methods previously on `StructuredClaudeClient` (`send`, `getHistory`, `getOpenRequests`, `approveRequest`, `answerQuestion`, etc.) are now on `ClaudeClient` directly.

### Removed
- **`StructuredClaudeClient` class.** Its methods folded onto `ClaudeClient`. Replace any `import { StructuredClaudeClient } from '@<old>'` with `import { ClaudeClient } from '@baoduy2412/ai-cli-client'` and use `ClaudeClient.init(config)` (signature unchanged).
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
