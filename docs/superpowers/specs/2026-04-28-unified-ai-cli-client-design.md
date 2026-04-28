# Phase 2 — Unified `AICliClient` abstraction

**Date:** 2026-04-28
**Status:** Approved (brainstorming complete) — ready for implementation plan
**Predecessor:** `2026-04-28-copilot-cli-client-design.md` (Phase 1 — shipped as v0.4.0)
**Successor:** Phase 3 — PTY transport for Electron embedding (deferred)

---

## 1. Goal

Add a thin, provider-agnostic API on top of `ClaudeClient` and `CopilotClient` so that
consumers of `@baoduy2412/ai-cli-client` can write code against a single
`AICliClient` interface and pick the provider via a runtime config flag.

The driving use case is **library-side readiness** — there is no concrete
consumer pulling this forward. The design therefore favors the smallest
honest surface area: an interface that names only what both providers
support identically, plus a factory that picks the right concrete class.
Anything provider-specific stays on the concrete class and is documented
in a capability matrix.

## 2. Out of scope

Phase 2 explicitly does **not** include:

- **PTY transport** — deferred to Phase 3, when there is a concrete
  Electron consumer to validate the shape against. The forward-compat
  hooks (Claude transport seam from A1, `transport: 'pty'` config field
  stub from C2, capability detection from C5) remain in place.
- **Event normalization** — the providers emit different event names with
  different payloads. Phase 2 does not attempt to unify them; the
  interface declares `on/off` with a permissive signature and concrete
  classes keep their strongly-typed overloads.
- **`getHistory()` on the unified interface** — `ClaudeClient.getHistory()`
  returns `TurnSnapshot[]`, `CopilotClient.getHistory()` returns
  `CopilotTurnSnapshot[]`. Reconciling these requires either a shared
  minimal snapshot type or a generic `AICliClient<H>` interface; both
  are left for a Phase 2.x follow-up.
- **Moving Claude-specific methods** (`getOpenRequests`, `approveRequest`,
  `answerQuestion`) onto the interface. Copilot uses a declarative
  permission DSL; there is no LCD here.
- **Wrapper class.** No new `AICliClient` class — only an interface that
  the existing concrete classes implement. Avoids a duplicate public
  surface.

## 3. File layout

### Files added

```
src/
  ai-cli-client.ts        # AICliClient interface + shared helper types
  factory.ts              # createAICliClient + AICliClientConfig

docs/
  provider-capabilities.md # consumer-facing capability matrix
```

### Files modified

| File | Change |
| ---- | ------ |
| `src/index.ts` | Export `AICliClient`, `createAICliClient`, `AICliClientConfig` |
| `src/claude/client.ts` | Add `implements AICliClient`; add `readonly provider = 'claude'` field |
| `src/copilot/client.ts` | Add `implements AICliClient`; add `readonly provider = 'copilot'` field |
| `README.md` | New "Unified API" section near the top |
| `CHANGELOG.md` | New `0.5.0` entry |
| `package.json` | Bump version to `0.5.0` |

### Public surface after Phase 2

```ts
import {
  createAICliClient,
  type AICliClient,
  type AICliClientConfig,
} from '@baoduy2412/ai-cli-client';

const client = await createAICliClient({
  provider: 'claude',
  cwd: process.cwd(),
  model: 'claude-sonnet-4.5',
});
// client: AICliClient
await client.sendMessage('hi');
```

## 4. The `AICliClient` interface

Strict lowest-common-denominator. Only members both providers support
identically.

```ts
// src/ai-cli-client.ts
import type { TurnHandleBase, TurnInput } from './turn-handle.js';

export interface AICliClient {
  readonly provider: 'claude' | 'copilot';
  readonly sessionId: string | null;

  start(): Promise<void>;
  close(): Promise<void>;

  send(input: string | TurnInput): TurnHandleBase;
  sendMessage(text: string): Promise<void>;
  queueMessage(text: string): void;
  interrupt(): Promise<void>;

  // Loosely typed at the interface level. Concrete classes keep their
  // strongly-typed overloads; consumers wanting type-safe events use
  // the concrete class. See docs/provider-capabilities.md for per-provider
  // event names.
  on(event: string, listener: (...args: unknown[]) => void): this;
  off(event: string, listener: (...args: unknown[]) => void): this;
}
```

**Deliberately NOT in the interface:**

- `getHistory()` — return-type divergence (see §2). Tracked in the
  capability doc as a Phase 2.x follow-up.
- Strong event typing — left to concrete classes.
- Claude-only: `getOpenRequests`, `approveRequest`, `answerQuestion`.
- Copilot-only: any future Copilot-specific methods.

**The `provider` field is new.** Neither concrete class currently exposes
it. We add `readonly provider = 'claude' as const` and
`readonly provider = 'copilot' as const` to the respective classes. This
is the runtime discriminator that mirrors the config's `provider` field.

**Why loose-typed events:** The strongly-typed `on()` overloads on each
class still apply when consumers hold a concrete reference. The
interface's permissive signature is the floor, not the ceiling.
Normalizing event names across providers would lock in semantics before
a real consumer is available to validate them.

## 5. Factory

```ts
// src/factory.ts
import { ClaudeClient, type ClaudeClientConfig } from './claude/index.js';
import { CopilotClient, type CopilotClientConfig } from './copilot/index.js';
import type { AICliClient } from './ai-cli-client.js';

export type AICliClientConfig =
  | ({ provider: 'claude' } & ClaudeClientConfig)
  | ({ provider: 'copilot' } & CopilotClientConfig);

export async function createAICliClient(
  config: AICliClientConfig,
): Promise<AICliClient> {
  switch (config.provider) {
    case 'claude': {
      const { provider: _omit, ...claudeConfig } = config;
      return await ClaudeClient.init(claudeConfig);
    }
    case 'copilot': {
      const { provider: _omit, ...copilotConfig } = config;
      const client = new CopilotClient(copilotConfig);
      await client.start();
      return client;
    }
    default: {
      const _exhaustive: never = config;
      throw new Error(
        `Unknown provider: ${(_exhaustive as { provider: string }).provider}`,
      );
    }
  }
}
```

**Properties:**

- **Auto-start.** The factory always returns a started, ready-to-use
  client. Reconciles the lifecycle inconsistency between `ClaudeClient`
  (auto-starts via `init`) and `CopilotClient` (explicit `new` + `start`).
  **Trade-off:** consumers who attach event listeners *after*
  `await createAICliClient(...)` may miss events that fire during
  startup (e.g. Copilot's `ready`). Mitigation: provider-specific
  config fields like Claude's `hooks` already accept handlers up-front;
  consumers needing tight listener attachment for Copilot should
  construct `CopilotClient` directly via `new` + `start`. The README
  documents this.
- **Strips the discriminator.** Underlying constructors don't expect
  `provider`, so the factory destructures it out before delegating.
- **Exhaustive switch via `never`.** Adding a third provider later
  forces a TypeScript error here, which is exactly where it should fail.
- **Flat discriminated union for config.** TypeScript narrows the rest
  of the config based on `provider`, so consumers get full autocomplete
  on provider-specific fields without nesting.

## 6. Capability matrix doc

**Location:** `docs/provider-capabilities.md` — consumer-facing reference,
not under `docs/superpowers/` (which holds design history).

**Purpose:** Single source of truth for "what's the same vs what's
provider-specific." Future contributors check this doc before adding to
the interface.

**Structure (tables; full content lives in the doc, summarized here):**

1. **In the unified `AICliClient` interface** — table of LCD members
   with both columns ✅.
2. **Provider-specific (concrete class only)** — table including the
   Claude-only structured methods, the Copilot-only methods, and the
   `getHistory()` divergence row marked as a Phase 2.x follow-up.
3. **Event names** — table comparing each event between the two
   providers; explicit "not normalized" note.
4. **Configuration divergence** — table comparing config fields.
5. **Future work** — `getHistory()` normalization, event normalization
   (if/when a real consumer needs it), Phase 3 PTY transport.

**Maintenance rule (recorded in the doc itself):** every PR that adds
a method or event to either concrete class adds a row to this table.

## 7. Testing

### New: `test/factory.test.ts`

Covers:

1. **Factory dispatches correctly per provider.** `createAICliClient`
   with `provider: 'claude'` returns a `ClaudeClient`; `provider: 'copilot'`
   returns a `CopilotClient`. Verified via `instanceof` and the
   `provider` discriminator.
2. **Auto-start contract.** After the factory resolves, the returned
   client is in a started state (e.g., `sessionId` non-null or whatever
   the started state looks like for each provider). Mock the underlying
   providers' start paths.
3. **`provider` field matches config** for both branches.
4. **Unknown provider rejection.** Passing an invalid provider (cast
   through `as any`) throws a clear error rather than failing silently.

### New: type-level test

Either a `test/factory.types.test-d.ts` file or `// @ts-expect-error`
markers in `test/factory.test.ts` to confirm TS narrows the config:

- `{ provider: 'claude', allowTools: [] }` must fail to typecheck
  (`allowTools` is Copilot-only).
- `{ provider: 'copilot', permissionMode: 'auto' }` must fail to
  typecheck (`permissionMode` is Claude-only).

### Extend: `test/turn-handle-base.test.ts` (existing D1 contract test)

The D1 test currently runs the same contract over both `ClaudeClient`
and `CopilotClient` constructed directly. Add a third axis: the same
contract over clients constructed via `createAICliClient`. Confirms the
factory-produced client behaves identically.

### TypeScript-level guard

`class ClaudeClient ... implements AICliClient` and
`class CopilotClient ... implements AICliClient` are enforced by `tsc`.
If either class drifts (e.g., someone removes `interrupt()`), the build
fails. This is the strongest contract.

### No new integration test

The factory is a thin dispatch layer. The existing Copilot smoke (D2)
already exercises the underlying paths.

## 8. Release

- **Version bump:** `0.4.0` → `0.5.0` (additive new exports under SemVer
  minor; no breaking changes).
- **CHANGELOG entry under `0.5.0`:**
  - **Added** — `AICliClient` interface, `createAICliClient` factory,
    `AICliClientConfig` discriminated union; `provider` discriminator
    field on both concrete clients; capability matrix doc at
    `docs/provider-capabilities.md`.
  - **Changed** — none (purely additive).
  - **Notes** — `getHistory()` is intentionally not yet on the unified
    interface; see capability doc.
- **README:** new "Unified API" section near the top (after
  Install/Requirements, before the per-provider sections). Shows the
  factory call and notes the capability doc for divergence.
- **No `package.json` exports changes** — new exports go through the
  existing top-level barrel, following the precedent that
  `TurnHandleBase` is also at the top level.

## 9. Known gaps / future work (carried forward)

- **`getHistory()` normalization.** Add to the `AICliClient` interface
  once `TurnSnapshot` and `CopilotTurnSnapshot` are reconciled. Decision
  pending: shared minimal snapshot type vs generic `AICliClient<H>`.
  Tracked in the capability doc.
- **Event normalization.** Possibly add a thin "common events" layer in
  a future phase if a real consumer needs cross-provider event handling.
- **PTY transport (Phase 3).** Forward-compat hooks already in place.

## 10. Self-review (run before claiming Phase 2 complete)

- All implementation tasks have completed commits.
- `npm test` and `npm run build` both clean.
- Both classes typecheck against the interface.
- Capability doc is filled in completely — every row in §6 has both
  Claude and Copilot columns populated; no TBD markers remain.
- README's unified-API code block runs against the published API.
