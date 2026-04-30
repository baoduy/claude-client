# Unified `AICliClient` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a thin, provider-agnostic API on top of `ClaudeClient` and `CopilotClient` so consumers can target one `AICliClient` interface and pick the provider via runtime config.

**Architecture:** A new `AICliClient` interface in `src/ai-cli-client.ts` declares only the lowest-common-denominator surface both providers support identically. Both concrete classes add `implements AICliClient` and a `readonly provider` discriminator. A new `createAICliClient(config)` factory in `src/factory.ts` dispatches on a `provider`-tagged discriminated union. Provider-divergent surface (events, `getHistory()`, Claude-only methods) stays on the concrete classes and is documented in `docs/provider-capabilities.md`.

**Tech Stack:** TypeScript 6.0, Node ≥22, `node:test` runner. Tests run against the built ESM output (`dist/esm/...`) using `.test.mjs` files. Source is in `src/`, dual ESM+CJS build via `tsconfig.build.esm.json` / `tsconfig.build.cjs.json`.

**Spec:** `docs/superpowers/specs/2026-04-28-unified-ai-cli-client-design.md`

---

## File Structure

### Files added

- `src/ai-cli-client.ts` — `AICliClient` interface
- `src/factory.ts` — `createAICliClient` and `AICliClientConfig`
- `test/factory.test.mjs` — factory unit tests
- `test/unified-contract.test.mjs` — extends the cross-provider contract test with the factory axis
- `docs/provider-capabilities.md` — consumer-facing capability matrix

### Files modified

- `src/index.ts` — export `AICliClient`, `createAICliClient`, `AICliClientConfig`
- `src/claude/client.ts` — add `, AICliClient` to `implements` clause; add `readonly provider = 'claude' as const`
- `src/copilot/client.ts` — add `implements AICliClient`; add `readonly provider = 'copilot' as const`
- `README.md` — new "Unified API" section
- `CHANGELOG.md` — new `0.5.0` entry
- `package.json` — version bump `0.4.0` → `0.5.0`

### Why these boundaries

- The interface and factory are at `src/` top level alongside `turn-handle.ts` because they are cross-provider concerns (no new directory tax).
- The capability doc lives at `docs/provider-capabilities.md` (consumer reference), not under `docs/superpowers/` (which is design history).
- Tests are split: `factory.test.mjs` covers the dispatch logic; `unified-contract.test.mjs` reuses the existing `turn-handle-contract` style to exercise the factory-produced clients.

---

## Phase A — Interface and provider discriminator

### Task A1: Create `AICliClient` interface file

**Files:**
- Create: `src/ai-cli-client.ts`

- [ ] **Step 1: Create `src/ai-cli-client.ts`**

```ts
import type { TurnHandleBase } from './turn-handle.js';

/**
 * Provider-agnostic client interface. Both ClaudeClient and CopilotClient
 * implement this surface. Members listed here are the lowest common
 * denominator both providers support identically.
 *
 * Provider-specific methods (Claude's structured permission API, etc.) live
 * on the concrete classes only — see docs/provider-capabilities.md.
 *
 * Events are intentionally loose-typed at the interface level; concrete
 * classes keep their strongly-typed `on()` overloads. Consumers wanting
 * type-safe events use the concrete class.
 */
export interface AICliClient {
  /** Runtime discriminator. Mirrors the `provider` field in AICliClientConfig. */
  readonly provider: 'claude' | 'copilot';

  /** Current session id, or null if not yet established. */
  readonly sessionId: string | null;

  start(): Promise<void>;
  close(): Promise<void>;

  send(input: string): TurnHandleBase<unknown, unknown>;
  sendMessage(text: string): Promise<void>;
  queueMessage(text: string): void;
  interrupt(): Promise<void>;

  on(event: string, listener: (...args: unknown[]) => void): this;
  off(event: string, listener: (...args: unknown[]) => void): this;
}
```

- [ ] **Step 2: Run typecheck to confirm the file is clean**

Run: `npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 3: Run build to confirm dist emits the new file**

Run: `npm run build`
Expected: exit 0. Verify `dist/esm/ai-cli-client.js` and `dist/types/ai-cli-client.d.ts` exist.

```bash
ls dist/esm/ai-cli-client.js dist/types/ai-cli-client.d.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/ai-cli-client.ts
git commit -m "feat: add AICliClient interface (LCD over Claude + Copilot)"
```

---

### Task A2: Add `provider` field and `implements AICliClient` to `ClaudeClient`

**Files:**
- Modify: `src/claude/client.ts:417` (class declaration), insert new field after line 417
- Test: `test/claude/provider-field.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `test/claude/provider-field.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeClient } from '../../dist/esm/claude/client.js';

test('ClaudeClient exposes provider = "claude"', () => {
  // We don't need a started client to read a class field; instantiate via init's
  // private path is overkill. Use Object.create on the prototype so we don't
  // spawn a CLI process.
  const proto = ClaudeClient.prototype;
  // The field is set in the class body, not the prototype, so we need a real
  // instance. Build a stub that bypasses init's process spawn.
  const instance = Object.create(proto);
  assert.equal(instance.provider, 'claude', 'class-level field readable on instance');
});
```

Note: class fields with initializers (`readonly provider = 'claude' as const`) are set on the *instance*, not the prototype. The `Object.create(proto)` trick reads the prototype, which won't have `provider`. We need a different test approach — test that `init` produces an instance with `provider === 'claude'`. But `init` spawns a subprocess.

Replace the test with one that constructs minimally:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeClient } from '../../dist/esm/claude/client.js';

test('ClaudeClient class declares provider = "claude" as a class field', () => {
  // Read the class definition's field by parsing the class source. This is
  // brittle but avoids spawning a CLI. In practice we rely on the
  // `implements AICliClient` typecheck (in src/ai-cli-client.ts) plus the
  // factory tests in test/factory.test.mjs to cover behavioral assertions.
  const src = ClaudeClient.toString();
  assert.match(src, /provider\s*=\s*['"]claude['"]/, 'class body declares provider field');
});
```

- [ ] **Step 2: Run the test — it should fail**

Run:
```bash
npm run build && node --test test/claude/provider-field.test.mjs
```
Expected: FAIL — `class body declares provider field` because the field doesn't exist yet.

- [ ] **Step 3: Read `src/claude/client.ts` line 417 to confirm the current implements clause**

The class currently declares:

```ts
export class ClaudeClient extends EventEmitter implements ITurnSession {
```

- [ ] **Step 4: Modify the implements clause and add the field**

In `src/claude/client.ts`, change line 417 from:

```ts
export class ClaudeClient extends EventEmitter implements ITurnSession {
```

to:

```ts
export class ClaudeClient extends EventEmitter implements ITurnSession, AICliClient {
    readonly provider = 'claude' as const;
```

Also add the import at the top of the file. Find the existing imports block (search for `import {` near the top of the file) and add:

```ts
import type { AICliClient } from '../ai-cli-client.js';
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`

Expected: exit 0. If TypeScript reports that `ClaudeClient` does not satisfy `AICliClient`, the cause is one of: (a) a method signature mismatch, (b) a missing method. Fix the cause — do not loosen the interface unless you have re-discussed the divergence with the spec author.

Common gotchas:
- `send()` on Claude takes `ClaudeSendInput` (a union including `string`). The interface signature `send(input: string): TurnHandleBase<unknown, unknown>` is satisfied because `string` is assignable to `ClaudeSendInput` (parameter contravariance) and `TurnHandle` is assignable to `TurnHandleBase<unknown, unknown>` (return covariance through the base interface).
- `on()` overloads on `ClaudeClient` should still satisfy the loose `(event: string, listener: ...) => this` because the strongly-typed overloads remain.

- [ ] **Step 6: Run build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 7: Run the test — it should pass**

Run: `node --test test/claude/provider-field.test.mjs`
Expected: PASS.

- [ ] **Step 8: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: all existing tests pass; new test passes.

- [ ] **Step 9: Commit**

```bash
git add src/claude/client.ts test/claude/provider-field.test.mjs
git commit -m "feat(claude): ClaudeClient implements AICliClient + provider field"
```

---

### Task A3: Add `provider` field and `implements AICliClient` to `CopilotClient`

**Files:**
- Modify: `src/copilot/client.ts:33` (class declaration)
- Test: `test/copilot/provider-field.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `test/copilot/provider-field.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/client.js';

test('CopilotClient class declares provider = "copilot" as a class field', () => {
  const src = CopilotClient.toString();
  assert.match(src, /provider\s*=\s*['"]copilot['"]/, 'class body declares provider field');
});
```

- [ ] **Step 2: Run the test — it should fail**

Run: `npm run build && node --test test/copilot/provider-field.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Read `src/copilot/client.ts` line 33 to confirm the current declaration**

```ts
export class CopilotClient extends EventEmitter {
```

- [ ] **Step 4: Modify the class declaration**

In `src/copilot/client.ts`, change line 33 from:

```ts
export class CopilotClient extends EventEmitter {
```

to:

```ts
export class CopilotClient extends EventEmitter implements AICliClient {
  readonly provider = 'copilot' as const;
```

Add the import at the top of the file (find the existing import block, add):

```ts
import type { AICliClient } from '../ai-cli-client.js';
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: exit 0.

If TypeScript reports a signature mismatch on `send()` (Claude takes a richer input than Copilot), it will surface here on Copilot too. The interface's `send(input: string)` should satisfy Copilot's `send(prompt: string)` cleanly because both accept `string`.

- [ ] **Step 6: Run build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 7: Run the test — it should pass**

Run: `node --test test/copilot/provider-field.test.mjs`
Expected: PASS.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/copilot/client.ts test/copilot/provider-field.test.mjs
git commit -m "feat(copilot): CopilotClient implements AICliClient + provider field"
```

---

## Phase B — Factory and barrel

### Task B1: Define `createAICliClient` factory + tests

**Files:**
- Create: `src/factory.ts`
- Create: `test/factory.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `test/factory.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAICliClient } from '../dist/esm/factory.js';
import { ClaudeClient } from '../dist/esm/claude/client.js';
import { CopilotClient } from '../dist/esm/copilot/client.js';

// We avoid spawning real CLI processes by stubbing the underlying providers.
// ClaudeClient.init spawns the Claude binary; CopilotClient.start opens an
// SDK transport. We mock those via prototype patching for these tests.

function withClaudeInitStub(fn) {
  const original = ClaudeClient.init;
  let stubInstance = null;
  ClaudeClient.init = async (config) => {
    stubInstance = Object.create(ClaudeClient.prototype);
    Object.assign(stubInstance, { _config: config, _started: true });
    return stubInstance;
  };
  try {
    return fn(() => stubInstance);
  } finally {
    ClaudeClient.init = original;
  }
}

function withCopilotStartStub(fn) {
  const originalStart = CopilotClient.prototype.start;
  CopilotClient.prototype.start = async function () {
    this._stubbedStarted = true;
  };
  try {
    return fn();
  } finally {
    CopilotClient.prototype.start = originalStart;
  }
}

test('createAICliClient dispatches to ClaudeClient for provider: "claude"', async () => {
  await withClaudeInitStub(async (getStub) => {
    const client = await createAICliClient({ provider: 'claude', cwd: '/tmp' });
    assert.ok(client instanceof ClaudeClient, 'returns a ClaudeClient instance');
    assert.equal(client.provider, 'claude');
    // The stub records the config without the discriminator
    const stub = getStub();
    assert.equal(stub._config.cwd, '/tmp');
    assert.equal(stub._config.provider, undefined, 'provider field is stripped');
  });
});

test('createAICliClient dispatches to CopilotClient for provider: "copilot"', async () => {
  await withCopilotStartStub(async () => {
    const client = await createAICliClient({ provider: 'copilot', cwd: '/tmp' });
    assert.ok(client instanceof CopilotClient, 'returns a CopilotClient instance');
    assert.equal(client.provider, 'copilot');
    assert.equal(client._stubbedStarted, true, 'auto-started');
  });
});

test('createAICliClient throws on unknown provider', async () => {
  await assert.rejects(
    // @ts-expect-error — intentional invalid provider
    createAICliClient({ provider: 'not-a-real-provider', cwd: '/tmp' }),
    /Unknown provider: not-a-real-provider/,
  );
});
```

- [ ] **Step 2: Run the test — it should fail (file does not exist yet)**

Run: `npm run build`
Expected: build succeeds (factory not imported anywhere yet, but the test file imports from a nonexistent path so the test will fail at import). Actually `npm run build` does not run tests, only compiles. Build should succeed because `src/factory.ts` doesn't exist yet and nothing imports it.

Run: `node --test test/factory.test.mjs`
Expected: FAIL with module-not-found for `../dist/esm/factory.js`.

- [ ] **Step 3: Create `src/factory.ts`**

```ts
import { ClaudeClient, type ClaudeClientConfig } from './claude/index.js';
import { CopilotClient, type CopilotClientConfig } from './copilot/index.js';
import type { AICliClient } from './ai-cli-client.js';

/**
 * Discriminated-union config for the unified factory. Pick a provider, then
 * fill in the rest of that provider's config inline. TypeScript narrows the
 * remaining fields automatically.
 */
export type AICliClientConfig =
  | ({ provider: 'claude' } & ClaudeClientConfig)
  | ({ provider: 'copilot' } & CopilotClientConfig);

/**
 * Construct and start a provider-specific client behind the unified
 * AICliClient interface. Auto-starts the underlying client; the returned
 * client is ready to use.
 *
 * @param config - Discriminated by `provider`. The remaining fields match the
 *                 chosen provider's native config.
 *
 * @example
 * const client = await createAICliClient({
 *   provider: 'claude',
 *   cwd: process.cwd(),
 * });
 * await client.sendMessage('hi');
 *
 * @remarks
 * The factory always returns a *started* client. Consumers who need to attach
 * event listeners *before* startup events fire (e.g. Copilot's `ready`) should
 * construct the concrete class directly.
 */
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

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: exit 0. The exhaustive `never` check validates that the union covers all cases.

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: exit 0. `dist/esm/factory.js` and `dist/types/factory.d.ts` exist.

- [ ] **Step 6: Run the test — it should pass**

Run: `node --test test/factory.test.mjs`
Expected: PASS for all three subtests.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/factory.ts test/factory.test.mjs
git commit -m "feat: add createAICliClient factory + AICliClientConfig"
```

---

### Task B2: Wire the new exports into the top-level barrel

**Files:**
- Modify: `src/index.ts`
- Test: `test/barrel-exports.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `test/barrel-exports.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

test('top-level barrel exports createAICliClient and AICliClientConfig type', async () => {
  const mod = await import('../dist/esm/index.js');
  assert.equal(typeof mod.createAICliClient, 'function');
  // AICliClient and AICliClientConfig are TS types — not visible at runtime,
  // so we only check the runtime export.
});

test('top-level barrel still exports ClaudeClient and CopilotClient', async () => {
  const mod = await import('../dist/esm/index.js');
  assert.equal(typeof mod.ClaudeClient, 'function');
  assert.equal(typeof mod.CopilotClient, 'function');
});
```

- [ ] **Step 2: Run the test — it should fail**

Run: `npm run build && node --test test/barrel-exports.test.mjs`
Expected: FAIL — `createAICliClient` is undefined.

- [ ] **Step 3: Read `src/index.ts` to confirm current state**

Current content:

```ts
// Namespace exports for convenient subpath access
export * as claude from './claude/index.js';
export * as copilot from './copilot/index.js';

// Re-export claude utilities at top level for backward compatibility
export * from './claude/index.js';

// Re-export turn-handle (shared between Claude and Copilot)
export * from './turn-handle.js';

// Re-export both clients at the top level for convenience:
export { ClaudeClient } from './claude/index.js';
export { CopilotClient } from './copilot/index.js';
```

- [ ] **Step 4: Add the new exports**

Replace `src/index.ts` with:

```ts
// Namespace exports for convenient subpath access
export * as claude from './claude/index.js';
export * as copilot from './copilot/index.js';

// Re-export claude utilities at top level for backward compatibility
export * from './claude/index.js';

// Re-export turn-handle (shared between Claude and Copilot)
export * from './turn-handle.js';

// Re-export both clients at the top level for convenience:
export { ClaudeClient } from './claude/index.js';
export { CopilotClient } from './copilot/index.js';

// Unified provider-agnostic API (Phase 2)
export type { AICliClient } from './ai-cli-client.js';
export { createAICliClient, type AICliClientConfig } from './factory.js';
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Run build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 7: Run the test — it should pass**

Run: `node --test test/barrel-exports.test.mjs`
Expected: PASS.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/index.ts test/barrel-exports.test.mjs
git commit -m "feat: export AICliClient + factory from top-level barrel"
```

---

## Phase C — Cross-cutting validation

### Task C1: Cross-provider unified contract test (factory axis)

**Files:**
- Create: `test/unified-contract.test.mjs`

This test reuses the `turn-handle-contract` style but exercises clients constructed via `createAICliClient`. Confirms the factory-produced client behaves identically to a direct-constructed one with respect to the `AICliClient` surface.

- [ ] **Step 1: Write the test**

Create `test/unified-contract.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAICliClient } from '../dist/esm/index.js';
import { ClaudeClient } from '../dist/esm/claude/client.js';
import { CopilotClient } from '../dist/esm/copilot/client.js';

// Stub helpers (mirrors test/factory.test.mjs to avoid spawning real CLIs).
function withClaudeInitStub(fn) {
  const original = ClaudeClient.init;
  ClaudeClient.init = async (config) => {
    const inst = Object.create(ClaudeClient.prototype);
    Object.assign(inst, { _config: config });
    return inst;
  };
  try {
    return fn();
  } finally {
    ClaudeClient.init = original;
  }
}

function withCopilotStartStub(fn) {
  const originalStart = CopilotClient.prototype.start;
  CopilotClient.prototype.start = async function () {
    this._stubbedStarted = true;
  };
  try {
    return fn();
  } finally {
    CopilotClient.prototype.start = originalStart;
  }
}

const expectedMembers = [
  'provider',
  'sessionId',
  'start',
  'close',
  'send',
  'sendMessage',
  'queueMessage',
  'interrupt',
  'on',
  'off',
];

test('factory-produced Claude client exposes the AICliClient surface', async () => {
  await withClaudeInitStub(async () => {
    const client = await createAICliClient({ provider: 'claude', cwd: '/tmp' });
    for (const member of expectedMembers) {
      assert.ok(member in client, `missing AICliClient member: ${member}`);
    }
    assert.equal(client.provider, 'claude');
  });
});

test('factory-produced Copilot client exposes the AICliClient surface', async () => {
  await withCopilotStartStub(async () => {
    const client = await createAICliClient({ provider: 'copilot', cwd: '/tmp' });
    for (const member of expectedMembers) {
      assert.ok(member in client, `missing AICliClient member: ${member}`);
    }
    assert.equal(client.provider, 'copilot');
  });
});

test('factory client and direct-constructed Claude client share the same surface', async () => {
  await withClaudeInitStub(async () => {
    const factoryClient = await createAICliClient({ provider: 'claude', cwd: '/tmp' });
    const directClient = await ClaudeClient.init({ cwd: '/tmp' });
    for (const member of expectedMembers) {
      assert.equal(member in factoryClient, member in directClient,
        `surface mismatch for member: ${member}`);
    }
  });
});

test('factory client and direct-constructed Copilot client share the same surface', async () => {
  await withCopilotStartStub(async () => {
    const factoryClient = await createAICliClient({ provider: 'copilot', cwd: '/tmp' });
    const directClient = new CopilotClient({ cwd: '/tmp' });
    await directClient.start();
    for (const member of expectedMembers) {
      assert.equal(member in factoryClient, member in directClient,
        `surface mismatch for member: ${member}`);
    }
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npm run build && node --test test/unified-contract.test.mjs`
Expected: PASS for all four subtests.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add test/unified-contract.test.mjs
git commit -m "test: cross-provider AICliClient surface contract via factory"
```

---

### Task C2: Write the provider-capabilities matrix doc

**Files:**
- Create: `docs/provider-capabilities.md`

- [ ] **Step 1: Identify Claude-emitted event names**

Read `src/claude/client.ts` and list every distinct argument to `this.emit(...)`. Keep the list — it goes in the doc's event-names table. Use:

```bash
grep -E "this\.emit\(" src/claude/client.ts | sed -E "s/.*this\.emit\('?([a-zA-Z_-]+)'?.*/\1/" | sort -u
```

Expected output: a list of event names Claude emits (turn_start, turn_end, output_delta, permission_request, etc.). Record this list — it populates the table below.

- [ ] **Step 2: Create `docs/provider-capabilities.md`**

```markdown
# Provider capabilities

This document tracks the differences between the Claude and Copilot providers
exposed by `@drunkcoding/ai-cli-clients`. The `AICliClient` interface (the
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
| `close`        |   ✅   |   ✅    |                                                |
| `send`         |   ✅   |   ✅    | returns `TurnHandleBase<unknown, unknown>`     |
| `sendMessage`  |   ✅   |   ✅    |                                                |
| `queueMessage` |   ✅   |   ✅    |                                                |
| `interrupt`    |   ✅   |   ✅    |                                                |
| `on` / `off`   |   ✅   |   ✅    | loosely typed in the interface; concrete classes preserve strong types |

## Provider-specific (concrete class only)

| Member               | Claude | Copilot | Notes                                          |
| -------------------- | :----: | :-----: | ---------------------------------------------- |
| `getOpenRequests`    |   ✅   |   ❌    | Copilot uses declarative `allowTools`/`denyTools`; no interactive permission flow |
| `approveRequest`     |   ✅   |   ❌    | same                                           |
| `answerQuestion`     |   ✅   |   ❌    | Claude-specific interactive question flow      |
| `getHistory`         |   ✅ `TurnSnapshot[]`   |   ✅ `CopilotTurnSnapshot[]`    | **Divergent return type — Phase 2.x follow-up to add to the unified interface once shapes are reconciled.** |
| `getStatus`          |   —    |   ✅    | Copilot exposes a status enum (`idle`/`running`/...) |
| `isProcessing`       |   —    |   ✅    | convenience boolean over `getStatus()`        |
| `getCurrentTurn`     |   —    |   ✅    | returns the in-flight `CopilotTurnHandle`     |

## Event names

Events are not normalized by the unified interface. Strongly-typed event
overloads live on each concrete class. Use the concrete class when you need
type-safe `on()`.

| Event name       | Claude | Copilot | Payload (concrete class type)                  |
| ---------------- | :----: | :-----: | ---------------------------------------------- |
| `error`          |   ✅   |   ✅    | `Error`                                        |
| `ready`          |   —    |   ✅    | `void`                                         |
| `output_delta`   |   —    |   ✅    | `(delta: string)`                              |
| `reasoning_delta`|   —    |   ✅    | `(delta: string)`                              |
| `tool_use_start` |   —    |   ✅    | `(tool: { id: string; name: string; input: unknown })` |
| `tool_result`    |   —    |   ✅    | `(res: { toolUseId: string; content: string; isError: boolean })` |
| `usage_update`   |   —    |   ✅    | `(usage: { inputTokens: number; outputTokens: number })` |
| `result`         |   —    |   ✅    | `(snapshot: CopilotTurnSnapshot)`              |
| `status_change`  |   —    |   ✅    | `(status: CopilotStatus, action: CopilotPendingAction \| null)` |
| (Claude events)  |   ✅   |   —     | List populated from `grep "this\.emit(" src/claude/client.ts` — see below |

### Claude event names (filled in during Task C2 step 1)

> The implementer of Task C2 step 1 pastes the deduplicated list of event
> names from `grep "this.emit(" src/claude/client.ts` here. Each event name
> gets its payload type from the matching `EventEmitter`/`on()` overload
> declaration (search for `on(event: '<name>'` near the top of the class
> file).

## Configuration divergence

| Field               | Claude | Copilot | Notes                                          |
| ------------------- | :----: | :-----: | ---------------------------------------------- |
| `cwd`               |   ✅   |   ✅    | shared semantics                               |
| `model`             |   ✅   |   ✅    | shared semantics; valid values differ          |
| `allowTools`/`denyTools` |   ❌   |   ✅    | Copilot declarative permission DSL            |
| `permissionMode`    |   ✅   |   ❌    | Claude interactive permissions                 |
| `apiKey`            |   ❌   |   ✅    | Copilot BYOK                                   |
| `hooks`             |   ✅   |   ❌    | Claude hook callbacks                          |
| `mcp`               |   ✅   |   ❌    | Claude MCP server config                       |
| `printMode`         |   ✅   |   ❌    | Claude one-shot mode                           |
| `sessionId`         |   ✅   |   ❌    | Claude session resume                          |

## Future work

- **`getHistory()` normalization.** Add to the `AICliClient` interface once
  `TurnSnapshot` and `CopilotTurnSnapshot` are reconciled. Decision pending:
  shared minimal snapshot type vs generic `AICliClient<H>`.
- **Event normalization.** Possibly add a thin "common events" layer in a
  future phase if a real consumer needs cross-provider event handling.
- **PTY transport (Phase 3).** Forward-compat hooks already in place; will
  add an opt-in `transport: 'pty'` mode for Electron/xterm.js embedding.
```

- [ ] **Step 3: Fill in the Claude event names from step 1**

Replace the placeholder block ("filled in during Task C2 step 1") with the
deduplicated event list from `grep "this.emit(" src/claude/client.ts`.

For each event, also fill in the payload type by reading the `on(event: '<name>', listener: ...)` overloads at the top of `src/claude/client.ts`.

If `src/claude/client.ts` does not declare `on()` overloads at the top of the class (the way `src/copilot/client.ts:22-30` does), inspect the call site of each `this.emit('<name>', ...)` to derive the payload type and document it inline.

- [ ] **Step 4: Verify the doc has no remaining placeholder text**

Run:

```bash
grep -E '(TBD|TODO|filled in during|placeholder|XXX)' docs/provider-capabilities.md
```

Expected: no output. (If anything matches, fill it in.)

- [ ] **Step 5: Commit**

```bash
git add docs/provider-capabilities.md
git commit -m "docs: provider capabilities matrix (LCD vs provider-specific)"
```

---

## Phase D — Release prep

### Task D1: README — Unified API section

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the current README to find the right insertion point**

```bash
grep -n "^## " README.md
```

The Unified API section goes after Install/Requirements but before the per-provider Claude and Copilot sections.

- [ ] **Step 2: Insert the new section**

Add this section at the appropriate position (after Install/Requirements, before the Claude section):

```markdown
## Unified API

If you want provider-agnostic code, target the `AICliClient` interface and
construct clients via the `createAICliClient` factory.

```ts
import {
  createAICliClient,
  type AICliClient,
  type AICliClientConfig,
} from '@drunkcoding/ai-cli-clients';

const config: AICliClientConfig = {
  provider: 'claude', // or 'copilot'
  cwd: process.cwd(),
};

const client: AICliClient = await createAICliClient(config);

await client.sendMessage('Hello.');
await client.close();
```

The `AICliClient` interface only declares the surface both providers support
identically. Provider-specific methods (Claude's `approveRequest`,
`answerQuestion`, etc.) are on the concrete classes — see
[`docs/provider-capabilities.md`](./docs/provider-capabilities.md) for the
full divergence matrix.

**Auto-start trade-off.** `createAICliClient(config)` returns a *started*
client. If you need to attach event listeners *before* startup events fire
(e.g. Copilot's `ready` event), construct the concrete class directly:

```ts
import { CopilotClient } from '@drunkcoding/ai-cli-clients';
const client = new CopilotClient({ cwd: process.cwd() });
client.on('ready', () => console.log('ready'));
await client.start();
```
```

- [ ] **Step 3: Verify the README mentions the new file**

```bash
grep -c 'docs/provider-capabilities.md' README.md
```

Expected: at least 1.

- [ ] **Step 4: Verify the README's example imports use the published surface**

```bash
grep -E "from '@drunkcoding/ai-cli-clients" README.md
```

Every match must reference an export that exists. The new section uses only
`createAICliClient`, `AICliClient`, `AICliClientConfig`, `CopilotClient` —
all four are exported from the top-level barrel after Task B2.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(readme): add Unified API section"
```

---

### Task D2: CHANGELOG entry + version bump + final verification

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`

- [ ] **Step 1: Read `CHANGELOG.md` to confirm the existing format**

```bash
head -40 CHANGELOG.md
```

Note the heading style and whether the latest entry is `## 0.4.0`.

- [ ] **Step 2: Add a new entry at the top of `CHANGELOG.md`**

Insert this entry above the `## 0.4.0` entry (or at the top, after the document title if there is one):

```markdown
## 0.5.0 — 2026-04-28

### Added
- `AICliClient` interface — provider-agnostic, lowest-common-denominator
  surface that both `ClaudeClient` and `CopilotClient` implement.
- `createAICliClient(config)` factory — discriminated-union dispatch on
  `config.provider`. Auto-starts the client.
- `AICliClientConfig` discriminated-union type. Provider-specific fields
  narrow automatically based on the `provider` discriminator.
- `readonly provider` field on both `ClaudeClient` and `CopilotClient`
  for runtime discrimination.
- `docs/provider-capabilities.md` — capability matrix tracking what's on
  the unified interface vs what's provider-specific.
- README "Unified API" section.

### Changed
- None (purely additive).

### Notes
- `getHistory()` is intentionally not yet on the unified interface —
  `TurnSnapshot[]` (Claude) and `CopilotTurnSnapshot[]` (Copilot) need
  to be reconciled first. Tracked in `docs/provider-capabilities.md`
  as a Phase 2.x follow-up.
- Strongly-typed events are not normalized in Phase 2. Use the concrete
  class when you need type-safe `on()`.
- PTY transport for Electron embedding remains Phase 3.
```

- [ ] **Step 3: Bump `package.json` version**

In `package.json`, change `"version": "0.4.0"` to `"version": "0.5.0"`.

- [ ] **Step 4: Final verification — clean build + full test suite + typecheck**

Run:

```bash
npm run clean && npm run build && npm run typecheck && npm test
```

Expected: all four steps exit 0. Specifically:
- `clean` removes `dist/`
- `build` rebuilds `dist/esm/`, `dist/cjs/`, `dist/types/` from scratch
- `typecheck` reports no errors
- `test` runs all `.test.mjs` files including the new `factory.test.mjs`, `unified-contract.test.mjs`, `barrel-exports.test.mjs`, `claude/provider-field.test.mjs`, `copilot/provider-field.test.mjs`. All pass.

- [ ] **Step 5: Verify `dist/` ships the new files**

```bash
ls dist/esm/ai-cli-client.js dist/esm/factory.js dist/types/ai-cli-client.d.ts dist/types/factory.d.ts
```

Expected: all four exist.

- [ ] **Step 6: Verify the `npm pack --dry-run` tarball includes the new doc**

```bash
npm pack --dry-run 2>&1 | grep -E '(provider-capabilities|ai-cli-client|factory)'
```

Expected: `dist/esm/ai-cli-client.js`, `dist/esm/factory.js`, `dist/types/ai-cli-client.d.ts`, `dist/types/factory.d.ts` appear. The `docs/provider-capabilities.md` is NOT in the tarball because `package.json` `files` does not include `docs/` — that's intentional; the doc lives in the repo, not in the published package.

- [ ] **Step 7: Commit**

```bash
git add CHANGELOG.md package.json
git commit -m "chore: release v0.5.0 — unified AICliClient interface + factory"
```

---

## Self-Review (run before claiming the plan complete)

A spec-coverage and consistency pass against
`docs/superpowers/specs/2026-04-28-unified-ai-cli-client-design.md`.

| Spec section                              | Plan task(s) | Notes                                          |
| ----------------------------------------- | ------------ | ---------------------------------------------- |
| §1 Goal                                   | (whole plan) |                                                |
| §2 Out of scope                           | implicitly enforced — no PTY task, no event-normalization task, no `getHistory()` interface task |  |
| §3 File layout — files added              | A1, B1, C1, C2 | `src/ai-cli-client.ts`, `src/factory.ts`, `test/factory.test.mjs`, `test/unified-contract.test.mjs`, `docs/provider-capabilities.md` |
| §3 File layout — files modified           | A2, A3, B2, D1, D2 | `src/claude/client.ts`, `src/copilot/client.ts`, `src/index.ts`, `README.md`, `CHANGELOG.md`, `package.json` |
| §4 The `AICliClient` interface            | A1 (definition), A2/A3 (`implements`) | LCD surface; loose-typed events; `provider` field |
| §5 Factory                                | B1           | Auto-start; strips `provider`; exhaustive `never` |
| §6 Capability matrix doc                  | C2           | All five tables filled in                      |
| §7 Testing — `test/factory.test.ts`       | B1           | Dispatch, instanceof, provider field, unknown-provider rejection |
| §7 Testing — type-level narrowing         | B1 (factory body uses narrowing; `tsc` validates) | No separate type-test file; narrowing is exercised by the factory's discriminated-union switch |
| §7 Testing — extend D1 contract test      | C1           | `unified-contract.test.mjs` exercises factory-produced clients across the AICliClient surface |
| §7 Testing — TS-level guard               | A2, A3       | `class ClaudeClient ... implements AICliClient` and same for Copilot |
| §8 Release                                | D1, D2       | README, CHANGELOG, version bump                |
| §9 Known gaps / future work               | C2 (capability doc carries forward) | `getHistory()`, event normalization, PTY |

**Open implementation risk:**
- The `provider` field test in A2/A3 uses `class.toString()` to read source. This is brittle if the build minifies or transforms class bodies. Current build (`tsc` → ESM) emits readable class source, so the test works. If a future build step strips comments or inlines fields differently, the test may need to switch to instantiating a real client (and will need a way to bypass CLI process spawn).
- Task C2 step 1 depends on `grep "this.emit(" src/claude/client.ts` returning a complete list. If Claude emits events from helper methods or imported modules, that grep misses them. Engineer should also `grep -rE "this\.emit\(" src/claude/` to catch helpers, and de-duplicate.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-28-unified-ai-cli-client.md`. Two execution options:

**1. Subagent-Driven (recommended)** — A fresh subagent per task, reviewed between tasks. Best for fast iteration with discipline.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batched with checkpoints for review.
