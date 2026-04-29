# Phase 4 — Unified Surface Expansion (`AICliClient` 1.0.0)

**Date:** 2026-04-29
**Status:** Approved (brainstorming complete) — ready for implementation plan
**Predecessors:**
- `2026-04-28-copilot-cli-client-design.md` (Phase 1 — shipped as v0.4.0)
- `2026-04-28-unified-ai-cli-client-design.md` (Phase 2 — shipped as v0.5.0)
- `2026-04-29-pty-transport-design.md` (Phase 3 — shipped as v0.6.0)

**Successor:** None planned. Future scope (Groups D, F, third providers, orchestration) captured in §10.

---

## 1. Goal

Harden the unified `AICliClient` abstraction by lifting more shared
actions onto the unified surface. The current interface (10 members) is
intentionally a "lowest common denominator." This phase expands it into a
**capability superset** — required methods that both providers share,
plus optional methods that providers may implement, plus a runtime
`capabilities` map for feature detection.

The driving observation: `ClaudeClient` exposes ~30 useful methods,
`CopilotClient` exposes ~13. About a third of Claude's surface
(introspection, runtime config, content richness) is portable in
principle but not yet on the unified interface. Consumers writing
provider-agnostic code keep narrowing to `ClaudeClient` to access basic
introspection like `getStatus()` or `getHistory()`. That's a sign the
abstraction is too thin.

The package is on `origin/main` but **unpublished + untagged on npm** —
no real-world consumers — so this phase ships as `1.0.0` with a clean
break (no deprecation cycle).

## 2. Scope

In scope (groups labeled per the brainstorming gap analysis):

- **A — Methods both providers already have**: `getStatus()`,
  `isProcessing()`, `getCurrentTurn()`, `getHistory()`, `off()`
- **B — Common event vocabulary**: unify `text_delta` / `output_delta`
  → `text`; `thinking_delta` / `reasoning_delta` → `reasoning`; introduce
  `text_done` / `reasoning_done` / `closed`
- **C — Rich content via `SendInput`**: multi-block content (text +
  images on Claude, graceful degradation on Copilot via
  `UnsupportedContentError`)
- **E — Optional capabilities**: `setModel`, `setPermissionMode`,
  `setMaxThinkingTokens`, `listSupportedModels` — Claude implements,
  Copilot omits

Out of scope:

- **D — Interactive approval unification** (`getOpenRequests`,
  `approveRequest`, `denyRequest`, `answerQuestion`). Stays on
  `ClaudeClient`. Lifting requires Copilot SDK upgrade.
- **F — Low-level escape hatches** (`sendControlRequest`,
  `sendMcpMessage`, `sendMcpControlResponse`). Stays on `ClaudeClient`.
  Consumers narrow via `provider` discriminant for access.
- Generic-parameterized event maps (rejected in favor of a small,
  fixed `UnifiedEventMap`).
- Type-level test framework (`tsd` / `expect-type`) — relying on `tsc`
  for type regressions.
- Property-based / mutation testing.
- Adding a third provider (Gemini, Codex, Aider, etc.) — separate phase.
- Higher-level orchestration (workflows, retries) — separate phase.
- PTY transport changes — unaffected by this work.

## 3. File layout

### Files added

```
src/
  unified/
    index.ts          # barrel: re-exports types, events, errors
    types.ts          # UnifiedStatus, TurnSnapshot, TurnToolUse, TurnToolResult,
                      # SendInput, ContentBlock, ImageSource, AICliCapabilities,
                      # PermissionMode, SupportedModelsResponse
    events.ts         # UnifiedEventMap
    errors.ts         # UnsupportedContentError

tests/
  unified-events.test.mjs
  unified-snapshot.test.mjs
  unified-capabilities.test.mjs
  send-input.test.mjs
  event-ordering.test.mjs
```

### Files modified

| File | Change |
| ---- | ------ |
| `src/ai-cli-client.ts` | Replace minimal interface with full unified surface (see §5) |
| `src/index.ts` | Re-export `unified/*` types, errors, event map |
| `src/claude/client.ts` | Add `capabilities` getter; rename `getStatus()` → `getDetailedStatus()`; add unified `getStatus()` returning 3-state; drop emission of `text_delta`, `thinking_delta`, `text_accumulated`, `thinking_accumulated`, `exit`, `tool_use`; emit `text`, `reasoning`, `text_done`, `reasoning_done`, `closed` instead |
| `src/claude/types.ts` | `ClaudeTurnSnapshot extends TurnSnapshot`; rename `turnId` → `id`; add `startedAt` / `completedAt` |
| `src/claude/turn-handle.ts` | Replace local `ClaudeSendInput` with imported `SendInput`; align `TurnUpdate` types |
| `src/claude/index.ts` (barrel) | Re-export renamed types |
| `src/copilot/client.ts` | Add `capabilities` getter; accept `SendInput` with text-flatten + image-throw (synchronous pre-scan); drop emission of `output_delta`, `reasoning_delta`; emit unified events including `text_done`, `reasoning_done`, `closed` |
| `src/copilot/types.ts` | `CopilotTurnSnapshot extends TurnSnapshot`; gain `id` (UUID via `randomUUID()`), `status`, `toolUses[]`, `toolResults[]`, `reasoning?`, `startedAt`, `completedAt`, `error?` |
| `src/copilot/turn-handle.ts` | Align `TurnUpdate` types |
| `src/copilot/index.ts` (barrel) | Re-export updated types |
| `package.json` | Bump `version` to `1.0.0`; add `"./unified"` to `exports` map |
| `CHANGELOG.md` | New `1.0.0` entry with full BREAKING CHANGES list and migration table |
| `README.md` | Update event names, snapshot shape, capabilities docs |
| `docs/provider-capabilities.md` | Refresh divergence matrix; add capabilities-map documentation |
| `tests/unified-contract.test.mjs` | Assert full new surface (capabilities, getStatus, getCurrentTurn, getHistory) for both providers |
| `tests/factory.test.mjs` | Adjust capability assertions |
| `tests/barrel-exports.test.mjs` | Assert unified types exported at top level |
| `tests/claude-*.test.mjs` (all) | Rename event listeners to unified vocab; replace `turnId` → `id` |
| `tests/copilot-*.test.mjs` (all) | Same |
| `examples/claude-*.ts` | Update to unified vocab |
| `examples/copilot-*.ts` (3 files) | Update to unified vocab |

### Files unchanged

- `src/turn-handle-base.ts` (or equivalent generic base) — base interface stays
- `src/pty/*` — PTY surface unaffected; this work applies only to structured clients
- `examples/pty/*` — no changes expected
- `tests/pty-*.test.mjs` — no changes expected (PTY is byte-stream passthrough)

## 4. Approach

**Approach 2 (selected): Capability superset with optional methods.**

`AICliClient` declares Group E methods as optional (`?:`), plus a runtime
`capabilities` map. Required methods cover Groups A + B + C. Concrete
classes implement the union of unified + provider-specific surfaces;
provider-only events stay on the concrete class for narrowed access.

Rejected alternatives:

- **Approach 1 — thin contract + provider narrowing.** Keeps the
  interface minimal, drops Group E entirely. Doesn't satisfy the
  user's request to lift Group E onto the unified surface.
- **Approach 3 — generic-parameterized contract**
  (`AICliClient<TSnapshot, TEvents>`). Phase 2 explicitly chose against
  generic event maps for ergonomics; re-litigating that decision for
  marginal type-safety gain is over-engineering. Consumers can already
  narrow via `provider` for exact-type access.

The capability-superset pattern matches established Web platform APIs
(WebRTC, Web Audio) where feature detection via a capabilities object
is idiomatic.

## 5. Design specification

### 5.1 Unified types (`src/unified/types.ts`)

```ts
export type UnifiedStatus = 'idle' | 'running' | 'error';

export interface TurnSnapshot {
  readonly id: string;
  readonly status: 'pending' | 'completed' | 'errored';
  readonly text: string;
  readonly reasoning?: string;
  readonly toolUses: TurnToolUse[];
  readonly toolResults: TurnToolResult[];
  readonly usage?: { inputTokens: number; outputTokens: number };
  readonly error?: { message: string; code?: string };
  readonly startedAt: number;        // epoch ms
  readonly completedAt?: number;     // epoch ms
}

export interface TurnToolUse  { id: string; name: string; input: unknown }
export interface TurnToolResult { toolUseId: string; content: unknown; isError: boolean }

export type SendInput =
  | string
  | { text: string }
  | { content: ContentBlock[] };

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: ImageSource };

export type ImageSource =
  | { type: 'base64'; mediaType: string; data: string }
  | { type: 'url'; url: string };

export interface AICliCapabilities {
  readonly richContent: boolean;
  readonly setModel: boolean;
  readonly setPermissionMode: boolean;
  readonly setMaxThinkingTokens: boolean;
  readonly listSupportedModels: boolean;
}

export type PermissionMode =
  | 'default' | 'acceptEdits' | 'auto'
  | 'bypassPermissions' | 'dontAsk' | 'plan';

export interface SupportedModelsResponse {
  models: Array<{ id: string; displayName?: string }>;
  default?: string;
}
```

### 5.2 Unified event map (`src/unified/events.ts`)

```ts
export interface UnifiedEventMap {
  ready:           [];
  text:            [chunk: string];
  text_done:       [text: string];
  reasoning:       [chunk: string];
  reasoning_done:  [text: string];
  tool_use_start:  [event: { id: string; name: string; input: unknown }];
  tool_result:     [event: { toolUseId: string; content: unknown; isError: boolean }];
  usage_update:    [usage: { inputTokens: number; outputTokens: number }];
  status_change:   [status: UnifiedStatus];
  result:          [snapshot: TurnSnapshot];
  error:           [err: Error];
  closed:          [exitCode: number | null];
}
```

### 5.3 `AICliClient` interface (`src/ai-cli-client.ts`)

```ts
import type {
  AICliCapabilities, SendInput, TurnSnapshot, UnifiedEventMap,
  UnifiedStatus, PermissionMode, SupportedModelsResponse,
} from './unified/index.js';
import type { TurnHandleBase } from './turn-handle-base.js';

export interface AICliClient {
  // Identity
  readonly provider: 'claude' | 'copilot';
  readonly sessionId: string | null;
  readonly capabilities: AICliCapabilities;

  // Lifecycle
  start(): Promise<void>;
  close(): Promise<void>;

  // Send / queue (Group C — rich content)
  send(input: SendInput): TurnHandleBase<TurnSnapshot, TurnUpdate>;
  sendMessage(input: SendInput): Promise<void>;
  queueMessage(input: SendInput): void;
  interrupt(): Promise<void>;

  // Introspection (Group A)
  getStatus(): UnifiedStatus;
  isProcessing(): boolean;
  getCurrentTurn(): TurnSnapshot | null;
  getHistory(): TurnSnapshot[];

  // Events (Group B) — strongly typed
  on<E extends keyof UnifiedEventMap>(
    event: E, listener: (...args: UnifiedEventMap[E]) => void
  ): this;
  off<E extends keyof UnifiedEventMap>(
    event: E, listener: (...args: UnifiedEventMap[E]) => void
  ): this;

  // Optional capabilities (Group E)
  setModel?(model: string): Promise<void>;
  setPermissionMode?(mode: PermissionMode): Promise<void>;
  setMaxThinkingTokens?(tokens: number): Promise<void>;
  listSupportedModels?(timeout?: number): Promise<SupportedModelsResponse>;
}
```

### 5.4 Provider implementations

**`ClaudeClient`:**

| Aspect | Behavior |
| ------ | -------- |
| `capabilities` | All `true` |
| `getStatus()` | Returns `UnifiedStatus`; maps internal `'input_needed'` → `'running'` |
| `getDetailedStatus()` | Renamed from old `getStatus()`; returns 4-state Claude `SessionStatus` |
| Unified events emitted | `ready`, `text`, `text_done`, `reasoning`, `reasoning_done`, `tool_use_start`, `tool_result`, `usage_update`, `status_change`, `result`, `error`, `closed` |
| Old events dropped | `text_delta`, `thinking_delta`, `text_accumulated`, `thinking_accumulated`, `exit`, `tool_use` (legacy) |
| Claude-only events kept | `system`, `stream_event`, `control_request`, `control_cancel_request`, `control_response`, `mcp_message`, `hook_callback`, `task_message`, `user_message`, `message` |
| `ClaudeTurnSnapshot` | `extends TurnSnapshot`; `turnId` → `id`; gains `startedAt` / `completedAt` |
| Group E methods | All present (already exist in 0.6.0); signatures aligned to unified types — `setPermissionMode` accepts unified `PermissionMode`; `listSupportedModels` returns unified `SupportedModelsResponse`; existing Claude-specific types either renamed or made to extend the unified shape |

**`CopilotClient`:**

| Aspect | Behavior |
| ------ | -------- |
| `capabilities` | All `false` |
| `getStatus()` | Already 3-state — type alignment only |
| Unified events emitted | Same 12 unified events |
| Old events dropped | `output_delta`, `reasoning_delta` |
| `closed` event added | Fires on transport exit |
| `CopilotTurnSnapshot` | `extends TurnSnapshot`; gains `id` (`copilot-${randomUUID()}`), `status`, `toolUses[]`, `toolResults[]`, `reasoning?`, `startedAt`, `completedAt`, `error?` |
| `SendInput` handling | `string` unchanged; `{text}` unwraps; `{content:[...]}` flattens text blocks; throws `UnsupportedContentError` on any non-text block |
| Group E methods | None on the class — TypeScript optional `?` makes them legitimately absent |

### 5.5 Errors (`src/unified/errors.ts`)

```ts
export class UnsupportedContentError extends Error {
  readonly provider: 'claude' | 'copilot';
  readonly unsupportedBlock: ContentBlock;
  readonly inputIndex: number;

  constructor(provider: 'claude' | 'copilot', block: ContentBlock, index: number) {
    super(
      `Provider '${provider}' does not support content block of type ` +
      `'${block.type}' at index ${index}`
    );
    this.name = 'UnsupportedContentError';
    this.provider = provider;
    this.unsupportedBlock = block;
    this.inputIndex = index;
  }
}
```

Thrown synchronously at `send()` / `sendMessage()` / `queueMessage()`
entry. The implementation pre-scans the entire `content[]` and rejects
upfront — no partial transmission. Client stays healthy; caller can
retry with adjusted input.

`CapabilityNotSupportedError` was considered and dropped. TypeScript
optional methods + optional-chaining (`client.setModel?.(...)`) cover
the case naturally; inventing a runtime error class for a path that
TypeScript already prevents adds surface area without value.

## 6. Edge cases & lifecycle

### 6.1 Status mapping

Claude has 4 internal states (`idle`, `running`, `input_needed`,
`error`); the unified surface has 3. Mapping rule:

| Claude internal | Unified |
|---|---|
| `idle` | `idle` |
| `running` | `running` |
| `input_needed` | `running` |
| `error` | `error` |

Unified `status_change` event fires only on **unified** transitions.
Claude transitioning `running` ↔ `input_needed` is invisible at the
unified layer.

The 4-state status_change event is **dropped entirely** — Claude no
longer emits a separate event for the `running` ↔ `input_needed`
transition. Consumers needing detailed status have two options:

1. **Poll** via `claudeClient.getDetailedStatus()` (returns 4-state).
2. **Push** via existing Claude-only events — `control_request` fires
   when entering `input_needed` (because a permission, question, or
   hook callback created the wait); `control_response` fires when
   leaving it.

This keeps the `status_change` event name single-shape (3-state) and
type-safe; we don't have the same event name carrying two different
payload signatures.

Copilot is already 3-state; passthrough.

### 6.2 Event ordering (guaranteed)

```
ready
  status_change('running')         ← turn N starts
    text*                          ← zero or more
    reasoning*                     ← zero or more
    tool_use_start*                ← zero or more
    tool_result*                   ← zero or more
    text_done?                     ← if any text chunks
    reasoning_done?                ← if any reasoning chunks
    usage_update*                  ← can repeat during turn
  result(snapshot)                 ← turn N completes
  status_change('idle')
  ...                              ← turn N+1 if any
closed(exitCode)                   ← terminal; no events after
```

Specifically guaranteed:

- `ready` fires once before any other event.
- `text_done` / `reasoning_done` fire only if the corresponding
  delta chunks were emitted (no empty-string false-positives).
- `result` fires before `status_change('idle')` for the same turn.
- `closed` is the terminal event; nothing fires after it.
- `error` may fire at any point; not necessarily terminal (some
  transient transport errors are recoverable).

### 6.3 Snapshot lifecycle

- During a turn: `getCurrentTurn()` returns the live snapshot with
  `status: 'pending'`.
- On `result`: snapshot moves to history with `status: 'completed'`;
  `getCurrentTurn()` returns `null`.
- On error mid-turn: snapshot moves to history with `status: 'errored'`
  + populated `error` field.
- `getHistory()` returns chronological order (oldest first).
- `id` is stable from snapshot creation — safe as a React key,
  Map/Set key, etc.

### 6.4 Copilot id generation

`copilot-${randomUUID()}` at turn creation, using
`crypto.randomUUID()`. The prefix makes ids visually distinguishable
in logs. Node 22+ requirement guarantees `randomUUID` availability.

### 6.5 `close()` mid-turn

When `close()` is called while a turn is in flight:

1. Current turn moves to history with `status: 'errored'`,
   `error: { message: 'Session closed during turn', code: 'SESSION_CLOSED' }`
2. `error` event fires with that error.
3. Transport shuts down.
4. `closed(exitCode)` fires.

Documented as **graceful but not async-safe with in-flight turns**.
Consumers preferring a clean shutdown should `await client.interrupt()`
first.

### 6.6 Empty content arrays

`send({ content: [] })` throws `UnsupportedContentError` on both
providers (treated as a programmer error — no text to send is malformed
input).

### 6.7 Multiple listeners / concurrency

Standard Node `EventEmitter` semantics are preserved. Multiple listeners
fire synchronously in registration order. No backpressure on listener
execution. No re-entrancy protection (calling `client.send()`
synchronously from a listener is undefined behavior — already true
today; not in scope to fix).

### 6.8 PTY mode unaffected

The unified surface applies only to structured clients. `PtyClient`
remains a separate interface with byte-stream semantics. Consumers
using `createPtyClient()` see no change from this phase.

## 7. Testing strategy

Node native test runner — no new framework. Categories:

| # | Test file | Status | Coverage |
|---|---|---|---|
| 1 | `tests/unified-contract.test.mjs` | Modified | Required methods, fields, status enum, optional method presence vs `capabilities` |
| 2 | `tests/unified-events.test.mjs` | New | Both providers emit `text`, `reasoning`, `text_done`, `reasoning_done`, `closed`; no old names emitted on `AICliClient` shape |
| 3 | `tests/unified-snapshot.test.mjs` | New | Both `*TurnSnapshot` assignable to `TurnSnapshot`; required fields populated; chronological history; errored turn structure |
| 4 | `tests/unified-capabilities.test.mjs` | New | Claude all-true, Copilot all-false; optional method presence iff flag true |
| 5 | `tests/send-input.test.mjs` | New | Claude accepts all forms; Copilot flattens text blocks; Copilot throws synchronously on image with correct `inputIndex`; empty content throws on both |
| 6 | `tests/event-ordering.test.mjs` | New | `ready` first; `closed` last; intra-turn ordering; back-to-back turn serialization |
| 7 | `tests/claude-*.test.mjs` | Modified | Rename event listeners to unified vocab; replace `turnId` → `id` |
| 8 | `tests/copilot-*.test.mjs` | Modified | Rename event listeners; assert new snapshot fields |
| 9 | `tests/factory.test.mjs` / `tests/barrel-exports.test.mjs` | Modified | Capability assertions; unified types exported |
| 10 | Integration | Modified + new | Existing `integration:structured`, `integration:copilot`, `integration:structured-multipass` updated; new `integration:cross-provider` runs same script against both providers and asserts unified event sequence |

Test count progression:

| Phase | Tests |
|---|---|
| Pre-work | 128 |
| Phase A (foundation) | ~128 (types-only changes) |
| Phase B (Claude alignment) | ~138 |
| Phase C (Copilot alignment) | ~148 |
| Phase D (cross-cutting + new test files) | ~175–185 |

Target: **all green at every phase boundary.** TDD discipline (failing
test before implementation) for every new behavior.

## 8. Implementation phases

| Phase | Scope | Files | Tests |
|---|---|---|---|
| **A — Foundation** | New `src/unified/*` types, `src/ai-cli-client.ts` rewrite, `package.json` exports | ~5 new + 2 modified | Existing 128 still pass; types only (TS-checked) |
| **B — Claude alignment** | `ClaudeClient` adds capabilities, renames status method, swaps event vocab; `ClaudeTurnSnapshot` extends base | ~3 modified | +unified-contract for Claude, +unified-events Claude side, claude-* tests renamed |
| **C — Copilot alignment** | `CopilotClient` adds capabilities + SendInput pre-scan + unified events; `CopilotTurnSnapshot` extends base | ~3 modified | +unified-contract for Copilot, +unified-events Copilot side, +send-input, +unified-snapshot, +unified-capabilities |
| **D — Cross-cutting** | factory/barrel/event-ordering tests; examples; README; provider-capabilities | ~10 modified | +event-ordering, +integration:cross-provider |
| **E — Release** | 1.0.0 version bump; CHANGELOG migration table; npm pack verify | 2 modified | All green; `npm pack --dry-run` shows `unified/*` shipped |

The full implementation plan (per-task subagent prompts) is produced
by `superpowers:writing-plans` after this spec is approved.

## 9. Verification

End-to-end test plan, run after Phase E completes:

1. **Type-checks pass** — `npx tsc --noEmit` clean across `src/` and `tests/`
2. **Test suite green** — `npm test` reports all tests passing (target ~175–185)
3. **Integration smoke** — `npm run integration:structured`,
   `npm run integration:copilot`, and new
   `npm run integration:cross-provider` all succeed against real CLIs
4. **PTY regression** — `npm run integration:pty` still passes
5. **Pack inspection** — `npm pack --dry-run` shows `dist/unified/*` and
   updated `dist/ai-cli-client.*` files; `package.json` has `./unified` export
6. **Capability assertions at runtime** — In a Node REPL:
   `const c = await createAICliClient({provider:'claude',...}); assert(c.capabilities.setModel === true)`
   and same for Copilot returning `false`
7. **Event-vocab parity** — Run a small example sending one prompt to
   each provider; both emit the unified vocabulary (`text`, `text_done`,
   `result`, `closed`); diff the event sequences and confirm parity on
   shared events
8. **`UnsupportedContentError` round-trip** — Call
   `copilotClient.sendMessage({ content: [{ type: 'image', ... }] })`
   and assert synchronous throw with `inputIndex: 0`
9. **Migration sanity** — Apply the CHANGELOG migration table to a
   small consumer snippet; verify it compiles and runs
10. **Branch readiness** — `superpowers:finishing-a-development-branch`
    workflow at completion

## 10. Out of scope / future work

| Deferred item | Why deferred | Trigger to revisit |
|---|---|---|
| Group D — interactive approval unification | Requires Copilot SDK upgrade or significant abstraction; Claude has rich approval flow that Copilot SDK can't yet support | When `@github/copilot-sdk` exposes interactive approval, or a consumer needs cross-provider approval |
| Group F — low-level escape hatches (`sendControlRequest`, `sendMcpMessage`, `sendMcpControlResponse`) | Pure Claude wire-protocol primitives; nothing to unify against on Copilot | When a generic consumer demonstrates need; current pattern (narrow via `provider`) covers the gap |
| Generic-parameterized event maps | Phase 2 explicitly chose against this for ergonomics | If consumers report event-typing pain that the fixed `UnifiedEventMap` can't address |
| Type-level test framework | `tsc` already catches type regressions in CI | If type complexity grows enough that compile-time errors stop being self-explanatory |
| Property-based / mutation testing | Not warranted for current surface area | If state-machine bugs in turn lifecycle become a recurring issue |
| Third provider (Gemini, Codex, Aider) | Validates the abstraction further but is its own design exercise | After 1.0 ships and stabilizes; would re-test the capability-superset pattern |
| Higher-level orchestration (workflow runner, retry/backoff, multi-turn templates) | Best built on top of a stable unified base — which this phase produces | After 1.0 ships |
| PTY transport changes | Unaffected by structured-client refactor | Only if PTY-mode bugs surface |

## 11. Notes

- This is a **breaking-change release (1.0.0)**. The package is
  unpublished + untagged on npm so no migration burden falls on real
  consumers — this is the right time for a clean break.
- After this spec is approved, the brainstorming flow invokes
  `superpowers:writing-plans` to produce a phased implementation plan.
- Plan execution should follow `subagent-driven-development` (matching
  the pattern used for Phase 3 PTY transport).
- Branch already renamed to `baoduy/unified-1.0`.
