# Copilot CLI Client + Claude Simplification — Design

**Date:** 2026-04-28
**Status:** Draft (Phase 1 of a two-phase project)
**Phase 2 (deferred):** Multi-provider unified abstraction with PTY transport for Electron embedding.

## 1. Goal

Add a `CopilotClient` to `@baoduy2412/ai-cli-client` (renamed from `@raylin01/claude-client`) with similar — not identical — functionality to the existing `ClaudeClient`, by wrapping the official `@github/copilot-sdk`. In the same change, simplify `ClaudeClient` by collapsing the legacy `ClaudeClient` / `StructuredClaudeClient` two-layer split into a single class.

The Phase 1 deliverable is two clients shaped similarly enough that Phase 2's unification is mostly type-merging rather than behavior-bridging.

## 2. Out of scope (Phase 2 work)

- Multi-provider unified abstraction (a single high-level interface over both clients).
- PTY transport for embedding Claude / Copilot terminals inside an Electron application.
- Polyfilling provider-only features across providers (e.g., transcript sharing on Claude).
- Promoting shared types into a top-level `src/core/` or `src/shared/` directory.

## 3. Architecture

### 3.1 File layout

```
src/copilot/
├── index.ts          # public exports
├── client.ts         # CopilotClient — single-layer; events + send() returning TurnHandle
├── transport.ts      # SDK lifecycle + capability detection
├── types.ts          # CopilotClientConfig, CopilotEvent kinds, CopilotTurnSnapshot
├── turn-handle.ts    # CopilotTurnHandle (concrete class)
├── errors.ts         # CopilotError class hierarchy
└── sessions.ts       # disk-backed session browser

src/claude/
├── client.ts         # ClaudeClient — now exposes send() / getHistory() / getOpenRequests / etc.
├── transport.ts      # extracted process-spawning seam (was inline in start())
├── turn-handle.ts    # ClaudeTurnHandle (concrete class with Claude-only extras)
├── structured.ts     # DELETED
├── sessions.ts, mcp.ts, task-store.ts, task-queue.ts   # unchanged
└── index.ts          # remove StructuredClaudeClient export

src/turn-handle.ts    # shared TurnHandleBase interface (universal subset)
src/index.ts          # top-level barrel; re-export both clients + shared base
```

### 3.2 Build configuration changes

Adding `src/copilot/` and `src/turn-handle.ts` as siblings of `src/claude/` requires moving `rootDir` in `tsconfig.json` from `./src/claude` to `./src`, and updating `include` from `["src/claude/**/*"]` to `["src/**/*"]`. Concrete consequences:

- Output paths shift from `dist/{esm,cjs,types}/*.js` to `dist/{esm,cjs,types}/claude/*.js`, plus new `dist/{esm,cjs,types}/copilot/*.js`, plus a top-level `dist/{esm,cjs,types}/index.js` from `src/index.ts`.
- `package.json` `main` / `module` / `types` keep pointing at `dist/{cjs,esm,types}/index.{js,d.ts}`, but those files now come from `src/index.ts` (the top-level barrel) rather than `src/claude/index.ts`.
- `package.json` `exports` map updated to reflect the new layout (see §10).
- `scripts/write-cjs-package-json.mjs` keeps working unchanged (writes `{"type":"commonjs"}` into `dist/cjs/`).
- `test/*.test.mjs` and `scripts/integration-*.mjs` import paths shift (`../dist/esm/index.js` keeps working because the top-level barrel re-exports everything; `../dist/esm/claude/client.js` becomes the path for direct imports if any tests use them).

### 3.3 Naming

- The public class is `CopilotClient`, mirroring `ClaudeClient`.
- The SDK's class of the same name is aliased on import inside our adapter:
  ```ts
  import { CopilotClient as GhCopilotClient } from '@github/copilot-sdk';
  ```
- The SDK's types never escape our module boundary. The public API uses our types exclusively.

### 3.4 Two-layer collapse on the Claude side

Methods that fold from `StructuredClaudeClient` onto `ClaudeClient`:

- `send(input, options?)` returning `ClaudeTurnHandle`
- `getCurrentTurn()`, `getHistory()`
- `getOpenRequests()`, `getOpenRequest(id)`
- `approveRequest(id, decision?)`, `denyRequest(id, reason?)`
- `answerQuestion(id, answers)`
- `createQuestionSession(id)`
- `interruptTurn(turnId?)` — top-level `interrupt()` stays as the catch-all

Methods unchanged on `ClaudeClient`: `sendMessage`, `sendMessageWithContent`, `setModel`, `setPermissionMode`, `setMaxThinkingTokens`, `listSupportedModels`, `interrupt`, `kill`, `queueMessage`, the entire event-emitter surface, all getters.

`ClaudeClient.init(config)` static factory — kept; signature unchanged. Returns a fully-initialized `ClaudeClient` (was `StructuredClaudeClient`). Existing callers continue to work after rebuild.

`StructuredClaudeClient` — deleted entirely. No deprecation alias.

## 4. CopilotClient public API

### 4.1 Construction & lifecycle

```ts
import { CopilotClient } from '@baoduy2412/ai-cli-client/copilot';

const client = new CopilotClient({ /* config — see §5 */ });
await client.start();    // initializes SDK + opens session
// ... use the client
await client.close();    // stops the SDK process
```

### 4.2 Per-turn API

```ts
const turn = client.send('Refactor the worker pool');

// Async iterator for live updates
for await (const update of turn.updates()) {
  if (update.kind === 'output')   process.stdout.write(update.delta);
  if (update.kind === 'tool_use') console.log('Tool:', update.name);
}

// Or await the final snapshot
const snapshot = await turn.done;
console.log(snapshot.text, snapshot.toolCalls, snapshot.usage);
```

### 4.3 Events

Event names match `ClaudeClient` to maximize parity for Phase 2:

```ts
client.on('output_delta',    (delta) => { /* text streaming chunk */ });
client.on('tool_use_start',  (tool)  => { /* tool invocation begin */ });
client.on('tool_result',     (res)   => { /* tool invocation end */ });
client.on('reasoning_delta', (d)     => { /* reasoning summary chunk */ });
client.on('usage_update',    (u)     => { /* token count update */ });
client.on('result',          (r)     => { /* turn complete */ });
client.on('status_change',   (s, a)  => { /* idle | running | error */ });
client.on('error',           (err)   => { /* see §7 */ });
client.on('ready',           ()      => { /* SDK ready, session open */ });
```

### 4.4 Lifecycle / introspection methods

| Method | Purpose |
|---|---|
| `start()` | Initialize SDK, capability-check config, open session. Emits `ready` on success. |
| `close()` | `GhCopilotClient.stop()` under the hood. |
| `interrupt()` | Cancel in-flight turn via SDK cancellation primitive. |
| `send(prompt)` | Returns `CopilotTurnHandle` synchronously. |
| `sendMessage(text)` | Convenience wrapper over `send()` for parity with `ClaudeClient`. |
| `queueMessage(text)` | If a turn is in flight, queue; otherwise call `sendMessage`. Mirrors `ClaudeClient.queueMessage`. |
| `getStatus()` | Returns `'running' \| 'idle' \| 'error'` (no `input_needed`). |
| `isProcessing()` | Boolean. |
| `getCurrentTurn()` | Active `CopilotTurnHandle` or `null`. |
| `getHistory()` | Completed turn snapshots. |
| `sessionId` getter | Populated after `start()`. |

### 4.5 TurnHandle hierarchy

```ts
// src/turn-handle.ts — shared base
export interface TurnHandleBase<TSnapshot, TUpdate> {
  updates(): AsyncIterableIterator<TUpdate>;
  current(): TSnapshot;
  history(): TUpdate[];
  done: Promise<TSnapshot>;
}

// src/copilot/turn-handle.ts — concrete class
export class CopilotTurnHandle implements TurnHandleBase<CopilotTurnSnapshot, CopilotTurnUpdate> {}

// src/claude/turn-handle.ts — concrete class with Claude-only extras
export class ClaudeTurnHandle implements TurnHandleBase<ClaudeTurnSnapshot, ClaudeTurnUpdate> {
  getOpenRequests(): OpenRequest[];
  // … other Claude-only methods
}
```

No unified turn-handle interface in Phase 1. Phase 2 designs that.

## 5. CopilotClientConfig

```ts
export interface CopilotClientConfig {
  cwd: string;

  // Core (parity with ClaudeClientConfig field shape)
  model?: string;                       // → SDK createSession({ model })
  sessionId?: string;                   // auto-generated UUID if omitted and no resumeSessionId
  resumeSessionId?: string;
  sessionName?: string;                 // SDK supports session naming

  // Mode (Copilot-native)
  mode?: 'interactive' | 'plan' | 'autopilot';
  maxAutopilotContinues?: number;       // honored only when mode === 'autopilot'

  // Permission DSL (passed through; CLI enforces deny-precedence)
  allowTools?: string[];                // e.g. ['shell(git:*)', 'read']
  denyTools?: string[];                 // e.g. ['shell(rm:*)']
  availableTools?: string[];            // visibility allowlist
  excludedTools?: string[];             // visibility denylist

  // Blanket overrides — defaults all false per GitHub best practices
  allowAllTools?: boolean;
  allowAllPaths?: boolean;
  allowAllUrls?: boolean;
  noAskUser?: boolean;

  // Auth (BYOK; falls back to system keychain / env when unset)
  apiKey?: { provider: 'anthropic' | 'openai' | 'azure'; key: string };

  // Lifecycle / transport
  cliPath?: string;                     // override bundled CLI binary
  cliUrl?: string;                      // connect to remote CLI server

  // Streaming control
  streaming?: boolean;                  // default true; off → final-only mode

  // Logging
  debug?: boolean;
  debugLogger?: (msg: string) => void;

  // Reserved for Phase 2 (typed but throws if used in Phase 1)
  transport?: 'programmatic' | 'pty';
}
```

### 5.1 Capability detection

`start()` validates the installed `@github/copilot-sdk` against the requested config. Fields that may not be honored by the current SDK preview:

- `mode` / `maxAutopilotContinues`
- `availableTools` / `excludedTools` (if SDK does not pass through to `--available-tools` / `--excluded-tools`)
- `cliUrl` (depending on SDK version)

If a configured field cannot be honored, `start()` rejects with `CopilotFeatureUnsupportedError` naming the field. The field stays in the config type — it lights up automatically when the SDK adds support; we just lift the guard.

### 5.2 Mid-session model switching

`ClaudeClient.setModel(model)` works mid-session via the stream-json control protocol. `@github/copilot-sdk` only documents per-session model selection (`createSession({ model })`); mid-session switching is not in the public preview surface. Phase 1 disposition: `CopilotClient` does **not** expose a `setModel()` method. Callers who need a different model close the current client and construct a new one. Reconsidered if/when the SDK exposes mid-session model change.

## 6. Data flow for one turn

1. `client.send(prompt)` returns a `CopilotTurnHandle` synchronously. Handle registered as `currentTurn`. Empty snapshot seeded.
2. SDK call queued onto a microtask so callers can subscribe to `turn.updates()` before any event fires.
3. Adapter calls `session.sendAndWait({ prompt })` (or streaming variant if exposed) and subscribes to SDK events.
4. Per SDK event, the adapter does three things:
   - Mutates the snapshot (text accumulator, tool-call list, usage running totals).
   - Emits the analogous `CopilotClient`-level event with our type names.
   - Pushes an update onto the handle's iterator.
5. On terminal event:
   - Snapshot frozen.
   - `turn.done` resolves (or rejects on error).
   - `currentTurn` cleared, snapshot appended to history.
   - Status returns to `idle` (or `error`).

The SDK keeps `copilot` running between turns. Multi-turn = sequential `send()` on the same session.

## 7. Error handling

Discriminated subclasses of `CopilotError`:

| Class | When | Surfaced |
|---|---|---|
| `CopilotAuthError` | Credential lookup failed or token rejected | rejects `start()` |
| `CopilotLaunchError` | Bundled CLI fails to spawn / version mismatch | rejects `start()` |
| `CopilotFeatureUnsupportedError` | Capability check fails for a configured field | rejects `start()`, names the field |
| `CopilotTurnError` | In-turn model / tool / network failure | rejects `turn.done`, emits `error` |
| `CopilotInterruptedError` | `interrupt()` called or process killed mid-turn | rejects `turn.done`, emits `error` |
| `CopilotPermissionDeniedError` | Tool denied by `--deny-tool` / `permissionHandler` | surfaces as `tool_result` event with `isError: true` (matches Claude's pattern) |

State machine: `idle → running → idle` (success), `running → error` (terminal). Error state in Phase 1 is sticky; client must be closed and recreated to recover.

## 8. Testing

### 8.1 Unit tests

- `test/copilot-client.test.mjs` — mocks `@github/copilot-sdk` at the import boundary. Scripted-event mock returns. Exercises: `ready` emission, `send` → `TurnHandle`, event mapping, history, error paths, capability-detection messages.
- `test/turn-handle.test.mjs` — assertions over both `ClaudeTurnHandle` and `CopilotTurnHandle`'s common subset (the `TurnHandleBase` contract).

### 8.2 Integration

- `scripts/integration-copilot-smoke.mjs` — real-CLI E2E behind `npm run integration:copilot`. Skipped in CI without credentials.

### 8.3 Existing test fallout

- `test/structured-client.test.mjs` rewritten in-place against `ClaudeClient` (the structured class is gone).
- `test/client.test.mjs` and `test/client-comprehensive.test.mjs` largely unaffected (raw-API).

## 9. Dependencies

- New `dependencies` (not devDependencies): `@github/copilot-sdk`, pinned to a single minor version. Public-preview status means we pin and bump deliberately.
- `engines.node`: stays at `>=18`.
- No new peer dependencies.

## 10. README + examples + housekeeping

- README rewrite split into "Claude" and "Copilot" sections, with a shared "Common API" intro that covers the events + `TurnHandle` shape both clients share.
- New examples under `examples/copilot/`: `basic.ts`, `streaming.ts`, `permissions.ts`, `byok.ts`.
- All `@raylin01/claude-client` import strings in `examples/` updated to `@baoduy2412/ai-cli-client`.
- `package.json` `exports` updates (reflecting the §3.2 build path shift):
  - `"."` keeps pointing at `./dist/{esm,cjs,types}/index.{js,d.ts}` — the new top-level barrel re-exports both providers and the shared `TurnHandleBase`.
  - Add `"./claude"` → `./dist/{esm,cjs,types}/claude/index.{js,d.ts}`.
  - Add `"./copilot"` → `./dist/{esm,cjs,types}/copilot/index.{js,d.ts}`.
  - Existing subpaths (`"./sessions"`, `"./mcp"`, `"./task-store"`, `"./task-queue"`) repoint to `./dist/{esm,cjs,types}/claude/{name}.{js,d.ts}`. Subpath names stay backwards-compatible with current consumers.
- CHANGELOG entry: rename + Copilot client + structured-class removal.

## 11. Known gaps / explicitly NOT in Phase 1

These are documented in README but not implemented in Phase 1.

| Gap | Side | Disposition |
|---|---|---|
| AskUserQuestion / mid-turn protocol | Claude-only | `getOpenRequests()` etc. on `ClaudeClient` only. |
| Permission mode enum | Claude-only | Stays as `permissionMode` on Claude. Copilot uses `mode` + DSL. |
| Loop modes (autopilot / plan) | Copilot-only | `mode` field on Copilot only. |
| Programmatic system-prompt override | Claude-only | Not exposed on Copilot. Users rely on `AGENTS.md` / `.github/copilot-instructions.md`. |
| Transcript sharing | Copilot-only | Deferred to Phase 2. `share` field NOT in Phase 1 config. |
| Worktree / tmux | Claude-only | Not exposed on Copilot. |
| `--from-pr` / `--remote` / `--teleport` | Claude-only | Not exposed on Copilot. |
| `--json-schema` structured output | Claude-only | Not exposed on Copilot. |
| `--max-budget-usd` / `--max-turns` | Claude-only | Copilot has only `--max-autopilot-continues`. |
| `--effort` / reasoning summaries on Copilot | Copilot-only flag | Not exposed in current SDK preview; surfaces as `CopilotFeatureUnsupportedError` if used. |
| `--mode` programmatic passthrough | Copilot-only flag | Same as above — typed in config, throws via capability check until SDK exposes it. |
| BYOK | Copilot-only | Exposed via `apiKey` field on `CopilotClientConfig`. |
| Multi-vendor models | Copilot-only | Exposed via `model` field with vendor-prefixed string. |
| Hooks (wire-level) | Claude-only | Copilot SDK lists hooks as a feature category but the wire-level surface is undocumented. Skip Phase 1. |

## 12. Forward-compat hooks for Phase 2

- `transport: 'programmatic' | 'pty'` config field reserved on both clients (typed; throws on `'pty'` in Phase 1).
- `transport.ts` extracted on the Claude side as a single seam for the future PTY swap.
- Shared `TurnHandleBase` interface in `src/turn-handle.ts` ready to grow.
- Both clients keep their adapter internals (`GhCopilotClient`, raw stream-json transport) private — Phase 2 can swap implementations without breaking consumers.
- No premature `core/` / `shared/` extraction. Phase 2 designs that based on what the two clients actually have in common after Phase 1 ships.
