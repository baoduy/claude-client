# Copilot CLI Client + Claude Simplification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `CopilotClient` to `@baoduy2412/ai-cli-client` (wrapping `@github/copilot-sdk`), and simplify `ClaudeClient` by folding `StructuredClaudeClient` into it.

**Architecture:** Two single-layer per-provider clients (`ClaudeClient`, `CopilotClient`) with a shared `TurnHandleBase<T,U>` interface and provider-specific concrete `*TurnHandle` classes. Copilot work delegates to `@github/copilot-sdk` for JSON-RPC transport and credential handling. `tsconfig.json` `rootDir` shifts from `./src/claude` to `./src` to accommodate the new `src/copilot/` sibling and a top-level barrel.

**Tech Stack:** TypeScript 5.x, Node.js >=18, `node:test`, `@github/copilot-sdk` (public preview, pinned).

**Spec:** `docs/superpowers/specs/2026-04-28-copilot-cli-client-design.md`.

---

## Phase A — Claude simplification (in place; rootDir stays at `./src/claude`)

These tasks happen first because they don't depend on any layout change. Tests stay green throughout.

### Task A1: Extract Claude transport seam

**Files:**
- Create: `src/claude/transport.ts`
- Modify: `src/claude/client.ts` (replace inline `spawn()` blocks with calls into transport)
- Test: existing tests cover this — no new test file

This is a pure refactor. We move the `child_process.spawn` invocation in `ClaudeClient.start()` and `ClaudeClient.sendMessagePrintMode()` into a small `ClaudeTransport` helper. No behavior change. The seam exists so Phase 2's PTY transport can swap in.

- [ ] **Step 1: Create `src/claude/transport.ts` with a single class wrapping `child_process.spawn`**

```ts
import { spawn, ChildProcess } from 'child_process';

export interface SpawnOptions {
  bin: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export class ClaudeTransport {
  spawn(opts: SpawnOptions): ChildProcess {
    return spawn(opts.bin, opts.args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  }
}
```

- [ ] **Step 2: Replace the two inline `spawn(...)` calls in `src/claude/client.ts` with `this.transport.spawn(...)`**

Add `private readonly transport = new ClaudeTransport();` as a field on `ClaudeClient`. Replace each `spawn(spawnBin, spawnArgs, { cwd: ..., env: ..., stdio: ..., windowsHide: ... })` with:

```ts
this.process = this.transport.spawn({
  bin: spawnBin,
  args: spawnArgs,
  cwd: this.config.cwd,
  env: { /* same env object as before */ },
});
```

Add the import: `import { ClaudeTransport } from './transport.js';` at the top of `src/claude/client.ts`.

- [ ] **Step 3: Run typecheck and tests**

```bash
npm run typecheck
npm test
```

Expected: typecheck clean, all 61 existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/claude/transport.ts src/claude/client.ts
git commit -m "refactor: extract Claude transport seam for Phase 2 PTY swap"
```

---

### Task A2: Extract `ClaudeTurnHandle` and shared structured types into `src/claude/turn-handle.ts`

**Files:**
- Create: `src/claude/turn-handle.ts`
- Modify: `src/claude/structured.ts` (re-export from new location)
- Test: existing `test/structured-client.test.mjs` covers this

We move every type and class from `src/claude/structured.ts` that represents the *handle* and its data shapes (TurnHandle, TurnSnapshot, TurnUpdate, OpenRequest etc.) into a new `turn-handle.ts`. `StructuredClaudeClient` itself stays in `structured.ts` for now and re-imports from the new file. This is purely mechanical so the next task can fold methods.

- [ ] **Step 1: Read `src/claude/structured.ts` and identify what to extract**

Extract everything from the top of the file through (and including) the last interface/type before the `export class StructuredClaudeClient` declaration. That includes: `OutputKind`, `TurnStatus`, `ClaudeSendContentBlock`, `ClaudeSendInput`, `ClaudeSendOptions`, `TurnMessageState`, `ToolUseState`, `ToolResultState`, `QuestionOption`, `QuestionPrompt`, all `OpenRequest` variants, `TurnHistoryEntry`, `TurnResult`, `TurnSnapshot`, `TurnUpdate`, `QuestionAnswerValue`, `QuestionAnswerInput`, `ClaudeQuestionSessionSnapshot`, plus the `TurnHandle` class itself if it's defined there.

- [ ] **Step 2: Create `src/claude/turn-handle.ts` containing the extracted types and the `TurnHandle` class**

Move the code verbatim. Adjust internal cross-imports as needed (the `TurnHandle` class likely references several of these types — they all live together now, no internal cross-file imports needed).

Add no new logic. The file is a verbatim subset of `structured.ts`.

- [ ] **Step 3: In `src/claude/structured.ts`, replace the moved declarations with a re-export**

At the top of `structured.ts`, replace the moved blocks with:

```ts
export {
  // re-export every type/class that was moved
  TurnHandle,
  type OutputKind,
  type TurnStatus,
  // ... list all moved exports here
} from './turn-handle.js';
```

The exact list comes from Step 1. Do NOT use `export *` — be explicit so the public surface is reviewable.

- [ ] **Step 4: Run typecheck and tests**

```bash
npm run typecheck
npm test
```

Expected: clean. No public exports change because `structured.ts` re-exports.

- [ ] **Step 5: Commit**

```bash
git add src/claude/turn-handle.ts src/claude/structured.ts
git commit -m "refactor: move ClaudeTurnHandle types to dedicated file"
```

---

### Task A3: Fold `StructuredClaudeClient` methods onto `ClaudeClient`

**Files:**
- Modify: `src/claude/client.ts` (absorb methods)
- Modify: `src/claude/structured.ts` (shrinks to a re-export — see Task A4)
- Test: existing `test/structured-client.test.mjs` will be rewritten in Task A4

The methods to move (from spec §3.4): `send`, `getCurrentTurn`, `getHistory`, `getOpenRequests`, `getOpenRequest`, `approveRequest`, `denyRequest`, `answerQuestion`, `createQuestionSession`, `interruptTurn`. Plus their backing private state.

- [ ] **Step 1: Read `src/claude/structured.ts` end-to-end** to identify private fields (`_currentTurn`, `_history`, etc.) and helper methods that the public methods depend on.

- [ ] **Step 2: Add the same private fields to `ClaudeClient` in `src/claude/client.ts`**

Find the existing private-fields block (near the top of the class, around the `_sessionId`, `_messageQueue` etc. fields). Add fields used by structured methods, e.g.:

```ts
private _currentTurn: TurnHandle | null = null;
private _history: TurnHistoryEntry[] = [];
private _openRequests = new Map<string, OpenRequest>();
// ... etc — match exactly what StructuredClaudeClient uses
```

Add imports at the top of `client.ts`:

```ts
import { TurnHandle, type TurnHistoryEntry, type OpenRequest, /* ... */ } from './turn-handle.js';
```

- [ ] **Step 3: Copy each public structured method into `ClaudeClient`**

For each method listed in the task header, copy the method body from `StructuredClaudeClient` into `ClaudeClient`. Replace any `this.client.x` (where `client` was the wrapped `ClaudeClient` in `StructuredClaudeClient`) with `this.x` since the methods now live on `ClaudeClient` itself.

The method signatures are:

```ts
send(input: ClaudeSendInput, options?: ClaudeSendOptions): TurnHandle;
getCurrentTurn(): TurnHandle | null;
getHistory(): TurnHistoryEntry[];
getOpenRequests(): OpenRequest[];
getOpenRequest(id: string): OpenRequest | undefined;
approveRequest(id: string, decision?: { message?: string; updatedInput?: Record<string, any> }): Promise<void>;
denyRequest(id: string, reason?: string): Promise<void>;
answerQuestion(id: string, answers: QuestionAnswerInput[]): Promise<void>;
createQuestionSession(id: string): ClaudeQuestionSession;
interruptTurn(turnId?: string): Promise<void>;
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: clean. If errors come up about duplicate methods (because both classes now have them), that's correct intermediate state — Task A4 deletes them from `StructuredClaudeClient`.

- [ ] **Step 5: Run existing tests**

```bash
npm test
```

Expected: all tests pass. The structured tests still go through `StructuredClaudeClient`, which still works because it wraps `ClaudeClient`.

- [ ] **Step 6: Commit**

```bash
git add src/claude/client.ts
git commit -m "refactor: fold StructuredClaudeClient methods onto ClaudeClient"
```

---

### Task A4: Delete `structured.ts`, rewrite tests, update barrel

**Files:**
- Delete: `src/claude/structured.ts`
- Modify: `src/claude/index.ts` (remove the `StructuredClaudeClient` export)
- Modify: `test/structured-client.test.mjs` (rewrite imports against `ClaudeClient`)
- Modify: `src/claude/client.ts` (rewire `ClaudeClient.init()` to return `ClaudeClient` directly)

- [ ] **Step 1: Update `ClaudeClient.init()` in `src/claude/client.ts`**

Find the existing static `init` method:

```ts
static async init(config: ClaudeClientConfig): Promise<StructuredClaudeClient> {
  const module = await import('./structured.js');
  return module.StructuredClaudeClient.init(config);
}
```

Replace with:

```ts
static async init(config: ClaudeClientConfig): Promise<ClaudeClient> {
  const client = new ClaudeClient(config);
  await client.start();
  return client;
}
```

- [ ] **Step 2: Edit `src/claude/index.ts` to remove the structured exports**

Open `src/claude/index.ts`. Currently:

```ts
export * from './types.js';
export * from './client.js';
export * from './structured.js';
export * from './sessions.js';
export * from './mcp.js';
export * from './task-store.js';
export * from './task-queue.js';
```

Replace `export * from './structured.js';` with `export * from './turn-handle.js';` (so the public types previously surfaced via `structured.ts` are still exported from `turn-handle.ts`).

- [ ] **Step 3: Delete `src/claude/structured.ts`**

```bash
git rm src/claude/structured.ts
```

- [ ] **Step 4: Rewrite `test/structured-client.test.mjs`**

The current file imports `StructuredClaudeClient`. Replace every import like:

```js
import { ClaudeClient, StructuredClaudeClient } from '../dist/esm/index.js';
```

with:

```js
import { ClaudeClient } from '../dist/esm/index.js';
```

Replace every reference to `StructuredClaudeClient` with `ClaudeClient`. Replace every test that constructs `await StructuredClaudeClient.init(config)` with `await ClaudeClient.init(config)`.

Rename the test file to `test/turn-flow.test.mjs` to reflect that it now tests turn behavior on `ClaudeClient` rather than the deleted class:

```bash
git mv test/structured-client.test.mjs test/turn-flow.test.mjs
```

- [ ] **Step 5: Build and run tests**

```bash
npm run build
npm test
```

Expected: typecheck clean, all tests pass (including the renamed/rewritten turn-flow tests).

- [ ] **Step 6: Commit**

```bash
git add src/claude/index.ts src/claude/client.ts test/turn-flow.test.mjs
git rm src/claude/structured.ts
# (the rm above may already be staged — git status will tell you)
git commit -m "refactor: delete StructuredClaudeClient — methods now on ClaudeClient"
```

---

## Phase B — Build configuration flip

Two tasks. After this phase, `src/copilot/` can be added without further build-config work.

### Task B1: Move `rootDir` to `./src`, add top-level barrel and shared `TurnHandleBase`

**Files:**
- Modify: `tsconfig.json`
- Create: `src/turn-handle.ts` (shared base interface)
- Create: `src/index.ts` (top-level barrel)
- Modify: `test/*.test.mjs`, `scripts/integration-*.mjs` (path adjustments only if they import non-`index.js` files)

- [ ] **Step 1: Create `src/turn-handle.ts` — shared base interface**

```ts
/**
 * Provider-agnostic turn handle contract. Both ClaudeTurnHandle and
 * CopilotTurnHandle implement this. Provider-specific extensions
 * (e.g. open-request methods on Claude) live on the concrete classes.
 */
export interface TurnHandleBase<TSnapshot, TUpdate> {
  /** Async iterator yielding live updates as the turn progresses. */
  updates(): AsyncIterableIterator<TUpdate>;

  /** Latest snapshot of turn state. Cheap to call repeatedly. */
  current(): TSnapshot;

  /** Per-turn update history (already-emitted updates). */
  history(): TUpdate[];

  /** Resolves with the final snapshot when the turn completes. Rejects on turn error. */
  done: Promise<TSnapshot>;
}
```

- [ ] **Step 2: Create `src/index.ts` — top-level barrel**

```ts
export * from './claude/index.js';
export * from './turn-handle.js';
// './copilot/index.js' is added by Task C10 once the module exists.
```

- [ ] **Step 3: Update `tsconfig.json`**

Replace `"rootDir": "./src/claude"` with `"rootDir": "./src"` and `"include": ["src/claude/**/*"]` with `"include": ["src/**/*"]`. The full file becomes:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Run a clean build to check the new dist layout**

```bash
npm run build
ls -la dist/esm/ dist/esm/claude/ dist/types/ dist/types/claude/
```

Expected: `dist/esm/index.js` exists (top-level barrel), `dist/esm/claude/*.js` exists (Claude module), `dist/esm/turn-handle.js` exists. `dist/cjs` mirrors. `dist/types` mirrors.

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: all tests still pass. They import from `../dist/esm/index.js` which is the top-level barrel — that re-exports everything from `./claude/index.js`, so consumer-facing imports are unchanged.

- [ ] **Step 6: Commit**

```bash
git add tsconfig.json src/index.ts src/turn-handle.ts
git commit -m "build: move rootDir to ./src; add top-level barrel and shared TurnHandleBase"
```

---

### Task B2: Update `package.json` `exports` to reflect the new layout

**Files:**
- Modify: `package.json`

The current `exports` map points subpaths at `./dist/esm/<name>.js` directly. After Task B1's flip, each Claude submodule is now at `./dist/esm/claude/<name>.js`. Update the map.

- [ ] **Step 1: Edit `package.json` — replace the `exports` block**

Replace the entire `"exports": { ... }` block with:

```json
"exports": {
  ".": {
    "types": "./dist/types/index.d.ts",
    "import": "./dist/esm/index.js",
    "require": "./dist/cjs/index.js"
  },
  "./claude": {
    "types": "./dist/types/claude/index.d.ts",
    "import": "./dist/esm/claude/index.js",
    "require": "./dist/cjs/claude/index.js"
  },
  "./sessions": {
    "types": "./dist/types/claude/sessions.d.ts",
    "import": "./dist/esm/claude/sessions.js",
    "require": "./dist/cjs/claude/sessions.js"
  },
  "./mcp": {
    "types": "./dist/types/claude/mcp.d.ts",
    "import": "./dist/esm/claude/mcp.js",
    "require": "./dist/cjs/claude/mcp.js"
  },
  "./task-store": {
    "types": "./dist/types/claude/task-store.d.ts",
    "import": "./dist/esm/claude/task-store.js",
    "require": "./dist/cjs/claude/task-store.js"
  },
  "./task-queue": {
    "types": "./dist/types/claude/task-queue.d.ts",
    "import": "./dist/esm/claude/task-queue.js",
    "require": "./dist/cjs/claude/task-queue.js"
  }
}
```

(Phase 2's `./copilot` subpath is added in Task C10 once the module exists.)

- [ ] **Step 2: Update `main`, `module`, and `types` to match**

These keep their current values (`dist/cjs/index.js`, `dist/esm/index.js`, `dist/types/index.d.ts`) — but those files are now generated from `src/index.ts` (top-level barrel), not `src/claude/index.ts`. No edit needed to these three keys.

- [ ] **Step 3: Run a fresh `npm pack --dry-run` to verify the published file list**

```bash
npm pack --dry-run 2>&1 | head -50
```

Expected: every file under `dist/` is included. `README.md`, `CHANGELOG.md`, `LICENSE`, `examples/` per the existing `files` array. No surprises.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "build: update package.json exports for new dist layout"
```

---

## Phase C — Copilot client

### Task C1: Add `@github/copilot-sdk` dependency and create the discovery shim

**Files:**
- Modify: `package.json` (add dep)
- Create: `src/copilot/sdk.ts` (a thin re-export layer that fixes the SDK API surface our adapter depends on)

The `@github/copilot-sdk` types and event API are not fully documented; we read them from the installed package and build our adapter against a small, named surface. The shim isolates that surface so future SDK version bumps touch one file.

- [ ] **Step 1: Install the SDK**

```bash
npm install @github/copilot-sdk
```

Pin the resolved version: open `package.json`, find the new line, and change the caret prefix to an exact pin (e.g. `"@github/copilot-sdk": "0.4.2"` not `"^0.4.2"`). Public preview status means we bump deliberately.

- [ ] **Step 2: Inspect the installed SDK's public surface**

```bash
ls node_modules/@github/copilot-sdk/dist/
cat node_modules/@github/copilot-sdk/dist/index.d.ts | head -200
```

Read the actual `.d.ts` files. Note in a scratch comment: the exported class names, the constructor options, the session class, the event subscription mechanism (likely `.on(event, handler)` or async iterator), the cancellation API. **This concrete information drives the next step.**

- [ ] **Step 3: Create `src/copilot/sdk.ts` mirroring only the surface we use**

Based on the inspection, the shim looks like this skeleton — adjust the type imports and re-exports based on what the real SDK actually exports:

```ts
/**
 * Internal shim isolating the @github/copilot-sdk surface our adapter relies on.
 * If the SDK API shifts in a future release, only this file changes.
 */
import {
  CopilotClient as GhCopilotClient,
  // Add: Session type, event types, error types as found in step 2
} from '@github/copilot-sdk';

export type { GhCopilotClient };
export { GhCopilotClient };
// Re-export every type our adapter needs, using OUR names.
// Example (placeholder names; replace with what the SDK actually exports):
//   export type GhSession = import('@github/copilot-sdk').Session;
//   export type GhSessionEvent = import('@github/copilot-sdk').SessionEvent;
```

The shim is the ONLY place `@github/copilot-sdk` is imported in our codebase. All adapter code imports from `./sdk.js`.

- [ ] **Step 4: Verify the shim builds**

```bash
mkdir -p src/copilot
# (sdk.ts already saved in step 3)
npm run typecheck
```

Expected: typecheck clean. If the SDK's types are different from what step 2 suggested, adjust `sdk.ts` until it compiles.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/copilot/sdk.ts
git commit -m "feat(copilot): add @github/copilot-sdk dep and SDK shim"
```

---

### Task C2: Define `CopilotClientConfig` and event/snapshot types

**Files:**
- Create: `src/copilot/types.ts`

- [ ] **Step 1: Create `src/copilot/types.ts` with the full config and types**

```ts
/** Configuration for CopilotClient. Matches the spec §5 verbatim. */
export interface CopilotClientConfig {
  cwd: string;

  // Core (parity with ClaudeClientConfig field shape)
  model?: string;
  sessionId?: string;
  resumeSessionId?: string;
  sessionName?: string;

  // Mode (Copilot-native)
  mode?: 'interactive' | 'plan' | 'autopilot';
  maxAutopilotContinues?: number;

  // Permission DSL — passed through to SDK
  allowTools?: string[];
  denyTools?: string[];
  availableTools?: string[];
  excludedTools?: string[];

  // Blanket overrides — defaults all false
  allowAllTools?: boolean;
  allowAllPaths?: boolean;
  allowAllUrls?: boolean;
  noAskUser?: boolean;

  // Auth (BYOK)
  apiKey?: { provider: 'anthropic' | 'openai' | 'azure'; key: string };

  // Lifecycle / transport
  cliPath?: string;
  cliUrl?: string;

  // Streaming control
  streaming?: boolean;

  // Logging
  debug?: boolean;
  debugLogger?: (msg: string) => void;

  // Reserved for Phase 2; throws if used in Phase 1
  transport?: 'programmatic' | 'pty';
}

/** Cumulative snapshot of a Copilot turn. */
export interface CopilotTurnSnapshot {
  turnId: string;
  status: 'queued' | 'running' | 'completed' | 'error';
  text: string;
  reasoningText: string;
  toolCalls: CopilotToolCall[];
  usage: CopilotUsage | null;
  startedAt: number;
  endedAt: number | null;
  error: { name: string; message: string } | null;
}

/** Per-step update pushed onto the TurnHandle iterator. */
export type CopilotTurnUpdate =
  | { kind: 'output'; delta: string; snapshot: CopilotTurnSnapshot }
  | { kind: 'reasoning'; delta: string; snapshot: CopilotTurnSnapshot }
  | { kind: 'tool_use'; tool: CopilotToolCall; snapshot: CopilotTurnSnapshot }
  | { kind: 'tool_result'; toolUseId: string; content: string; isError: boolean; snapshot: CopilotTurnSnapshot }
  | { kind: 'usage'; usage: CopilotUsage; snapshot: CopilotTurnSnapshot }
  | { kind: 'result'; snapshot: CopilotTurnSnapshot }
  | { kind: 'error'; error: Error; snapshot: CopilotTurnSnapshot };

export interface CopilotToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
  result: { content: string; isError: boolean } | null;
}

export interface CopilotUsage {
  inputTokens: number;
  outputTokens: number;
}

export type CopilotStatus = 'idle' | 'running' | 'error';

export interface CopilotPendingAction {
  type: 'permission';
  toolName?: string;
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/copilot/types.ts
git commit -m "feat(copilot): define CopilotClientConfig and turn types"
```

---

### Task C3: Implement `CopilotError` class hierarchy

**Files:**
- Create: `src/copilot/errors.ts`
- Test: `test/copilot-errors.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/copilot-errors.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CopilotError,
  CopilotAuthError,
  CopilotLaunchError,
  CopilotFeatureUnsupportedError,
  CopilotTurnError,
  CopilotInterruptedError,
  CopilotPermissionDeniedError,
} from '../dist/esm/copilot/errors.js';

test('every Copilot error subclass extends CopilotError and Error, with correct .name', () => {
  const cases = [
    [CopilotAuthError, 'CopilotAuthError'],
    [CopilotLaunchError, 'CopilotLaunchError'],
    [CopilotFeatureUnsupportedError, 'CopilotFeatureUnsupportedError'],
    [CopilotTurnError, 'CopilotTurnError'],
    [CopilotInterruptedError, 'CopilotInterruptedError'],
    [CopilotPermissionDeniedError, 'CopilotPermissionDeniedError'],
  ];
  for (const [Cls, name] of cases) {
    const err = new Cls('msg');
    assert.equal(err.name, name);
    assert.equal(err.message, 'msg');
    assert.ok(err instanceof CopilotError, `${name} must extend CopilotError`);
    assert.ok(err instanceof Error, `${name} must extend Error`);
  }
});

test('CopilotFeatureUnsupportedError exposes the unsupported field name', () => {
  const err = new CopilotFeatureUnsupportedError('mode', 'Copilot SDK 0.4.x does not yet support --mode passthrough');
  assert.equal(err.feature, 'mode');
  assert.match(err.message, /mode/);
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm run build && node --test test/copilot-errors.test.mjs
```

Expected: FAIL with "Cannot find module '../dist/esm/copilot/errors.js'".

- [ ] **Step 3: Implement `src/copilot/errors.ts`**

```ts
export class CopilotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CopilotError';
  }
}

export class CopilotAuthError extends CopilotError {
  constructor(message: string) {
    super(message);
    this.name = 'CopilotAuthError';
  }
}

export class CopilotLaunchError extends CopilotError {
  constructor(message: string) {
    super(message);
    this.name = 'CopilotLaunchError';
  }
}

export class CopilotFeatureUnsupportedError extends CopilotError {
  readonly feature: string;
  constructor(feature: string, message?: string) {
    super(message ?? `Copilot SDK does not currently support the "${feature}" config field`);
    this.name = 'CopilotFeatureUnsupportedError';
    this.feature = feature;
  }
}

export class CopilotTurnError extends CopilotError {
  constructor(message: string) {
    super(message);
    this.name = 'CopilotTurnError';
  }
}

export class CopilotInterruptedError extends CopilotError {
  constructor(message: string = 'Turn interrupted') {
    super(message);
    this.name = 'CopilotInterruptedError';
  }
}

export class CopilotPermissionDeniedError extends CopilotError {
  constructor(message: string) {
    super(message);
    this.name = 'CopilotPermissionDeniedError';
  }
}
```

- [ ] **Step 4: Build and re-run the test**

```bash
npm run build && node --test test/copilot-errors.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/copilot/errors.ts test/copilot-errors.test.mjs
git commit -m "feat(copilot): error class hierarchy"
```

---

### Task C4: Implement `CopilotTurnHandle`

**Files:**
- Create: `src/copilot/turn-handle.ts`
- Test: `test/copilot-turn-handle.test.mjs`

`CopilotTurnHandle` implements `TurnHandleBase<CopilotTurnSnapshot, CopilotTurnUpdate>` from `src/turn-handle.ts`. It buffers updates so callers that subscribe late don't miss events; resolves `done` on the terminal `result` or `error` update.

- [ ] **Step 1: Write the failing test**

`test/copilot-turn-handle.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { CopilotTurnHandle } from '../dist/esm/copilot/turn-handle.js';

function seedSnapshot(turnId = 't1') {
  return {
    turnId, status: 'running', text: '', reasoningText: '',
    toolCalls: [], usage: null,
    startedAt: Date.now(), endedAt: null, error: null,
  };
}

test('CopilotTurnHandle delivers buffered updates to a late subscriber', async () => {
  const handle = new CopilotTurnHandle(seedSnapshot());
  handle.push({ kind: 'output', delta: 'hello ', snapshot: handle.current() });
  handle.push({ kind: 'output', delta: 'world',  snapshot: handle.current() });
  handle.complete({ ...handle.current(), status: 'completed', endedAt: Date.now() });

  const collected = [];
  for await (const u of handle.updates()) collected.push(u);
  const finalSnapshot = await handle.done;

  assert.equal(collected.length, 3);
  assert.equal(collected[0].kind, 'output');
  assert.equal(collected[2].kind, 'result');
  assert.equal(finalSnapshot.status, 'completed');
});

test('CopilotTurnHandle history() returns previously emitted updates', async () => {
  const handle = new CopilotTurnHandle(seedSnapshot());
  handle.push({ kind: 'output', delta: 'x', snapshot: handle.current() });
  assert.equal(handle.history().length, 1);
  assert.equal(handle.history()[0].kind, 'output');
});

test('CopilotTurnHandle done rejects when fail() is called', async () => {
  const handle = new CopilotTurnHandle(seedSnapshot());
  const failure = new Error('boom');
  handle.fail(failure);
  await assert.rejects(handle.done, /boom/);
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm run build && node --test test/copilot-turn-handle.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/copilot/turn-handle.ts`**

```ts
import type { TurnHandleBase } from '../turn-handle.js';
import type { CopilotTurnSnapshot, CopilotTurnUpdate } from './types.js';

/**
 * In-memory turn handle. Buffers updates so late subscribers see the full stream.
 * Internal. Adapter calls push()/complete()/fail(); consumers read updates()/done.
 */
export class CopilotTurnHandle implements TurnHandleBase<CopilotTurnSnapshot, CopilotTurnUpdate> {
  private _snapshot: CopilotTurnSnapshot;
  private _history: CopilotTurnUpdate[] = [];
  private _resolvers: Array<(value: IteratorResult<CopilotTurnUpdate>) => void> = [];
  private _terminated = false;
  private _doneResolve!: (s: CopilotTurnSnapshot) => void;
  private _doneReject!: (err: Error) => void;

  readonly done: Promise<CopilotTurnSnapshot>;

  constructor(initial: CopilotTurnSnapshot) {
    this._snapshot = initial;
    this.done = new Promise((res, rej) => {
      this._doneResolve = res;
      this._doneReject = rej;
    });
  }

  current(): CopilotTurnSnapshot {
    return this._snapshot;
  }

  history(): CopilotTurnUpdate[] {
    return this._history.slice();
  }

  /** Internal: adapter pushes a non-terminal update. */
  push(update: CopilotTurnUpdate): void {
    if (this._terminated) return;
    this._snapshot = update.snapshot;
    this._history.push(update);
    const r = this._resolvers.shift();
    if (r) r({ value: update, done: false });
  }

  /** Internal: adapter signals successful completion. */
  complete(finalSnapshot: CopilotTurnSnapshot): void {
    if (this._terminated) return;
    this._snapshot = finalSnapshot;
    const finalUpdate: CopilotTurnUpdate = { kind: 'result', snapshot: finalSnapshot };
    this._history.push(finalUpdate);
    const r = this._resolvers.shift();
    if (r) r({ value: finalUpdate, done: false });
    this._terminated = true;
    while (this._resolvers.length) this._resolvers.shift()!({ value: undefined as any, done: true });
    this._doneResolve(finalSnapshot);
  }

  /** Internal: adapter signals failure. */
  fail(error: Error): void {
    if (this._terminated) return;
    const errSnapshot: CopilotTurnSnapshot = {
      ...this._snapshot,
      status: 'error',
      endedAt: Date.now(),
      error: { name: error.name, message: error.message },
    };
    this._snapshot = errSnapshot;
    const errUpdate: CopilotTurnUpdate = { kind: 'error', error, snapshot: errSnapshot };
    this._history.push(errUpdate);
    const r = this._resolvers.shift();
    if (r) r({ value: errUpdate, done: false });
    this._terminated = true;
    while (this._resolvers.length) this._resolvers.shift()!({ value: undefined as any, done: true });
    this._doneReject(error);
  }

  updates(): AsyncIterableIterator<CopilotTurnUpdate> {
    let cursor = 0;
    const self = this;
    return {
      [Symbol.asyncIterator]() { return this; },
      async next(): Promise<IteratorResult<CopilotTurnUpdate>> {
        if (cursor < self._history.length) {
          return { value: self._history[cursor++], done: false };
        }
        if (self._terminated) return { value: undefined as any, done: true };
        return new Promise(resolve => {
          self._resolvers.push((res) => {
            if (!res.done) cursor = self._history.length;
            resolve(res);
          });
        });
      },
    };
  }
}
```

- [ ] **Step 4: Build and re-run the test**

```bash
npm run build && node --test test/copilot-turn-handle.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/copilot/turn-handle.ts test/copilot-turn-handle.test.mjs
git commit -m "feat(copilot): CopilotTurnHandle with buffered update iterator"
```

---

### Task C5: Implement `CopilotTransport` (SDK lifecycle + capability detection)

**Files:**
- Create: `src/copilot/transport.ts`
- Test: `test/copilot-transport.test.mjs`

`CopilotTransport` wraps `GhCopilotClient` lifecycle (`new`, `start`, `createSession` / `resumeSession`, `stop`) and exposes a capability-detection helper.

- [ ] **Step 1: Write a failing test using a mocked SDK**

`test/copilot-transport.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { CopilotTransport } from '../dist/esm/copilot/transport.js';
import { CopilotFeatureUnsupportedError } from '../dist/esm/copilot/errors.js';

// Minimal fake SDK conforming to our shim's expected surface
class FakeGhClient {
  constructor(opts) { this.opts = opts; this.stopped = false; }
  async createSession({ model, sessionId }) {
    return new FakeGhSession(model, sessionId ?? 'auto-id');
  }
  async resumeSession(id) { return new FakeGhSession('resumed', id); }
  async stop() { this.stopped = true; }
}
class FakeGhSession {
  constructor(model, sessionId) {
    this.model = model;
    this.sessionId = sessionId;
  }
  async sendAndWait({ prompt }) { return { data: { content: `echo: ${prompt}` } }; }
}

test('CopilotTransport.start creates a session with the configured model', async () => {
  const transport = new CopilotTransport({
    GhClientCtor: FakeGhClient,
    config: { cwd: process.cwd(), model: 'gpt-5' },
  });
  await transport.start();
  assert.equal(transport.sessionId, 'auto-id');
  assert.ok(transport.session);
  await transport.stop();
});

test('CopilotTransport.start with resumeSessionId calls resumeSession', async () => {
  const transport = new CopilotTransport({
    GhClientCtor: FakeGhClient,
    config: { cwd: process.cwd(), resumeSessionId: 'prev-1' },
  });
  await transport.start();
  assert.equal(transport.sessionId, 'prev-1');
  await transport.stop();
});

test('CopilotTransport.start throws CopilotFeatureUnsupportedError for transport=pty', async () => {
  const transport = new CopilotTransport({
    GhClientCtor: FakeGhClient,
    config: { cwd: process.cwd(), transport: 'pty' },
  });
  await assert.rejects(transport.start(), CopilotFeatureUnsupportedError);
});
```

- [ ] **Step 2: Run the test to confirm failure**

```bash
npm run build && node --test test/copilot-transport.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/copilot/transport.ts`**

```ts
import { randomUUID } from 'crypto';
import type { CopilotClientConfig } from './types.js';
import { CopilotFeatureUnsupportedError, CopilotAuthError, CopilotLaunchError } from './errors.js';
import { GhCopilotClient } from './sdk.js';

export interface CopilotTransportOptions {
  config: CopilotClientConfig;
  /** Injection point for tests; defaults to the real SDK class. */
  GhClientCtor?: typeof GhCopilotClient;
}

export class CopilotTransport {
  private readonly config: CopilotClientConfig;
  private readonly GhClientCtor: typeof GhCopilotClient;
  private gh: InstanceType<typeof GhCopilotClient> | null = null;
  session: any = null;     // SDK session type — concrete shape filled in once SDK API is confirmed (Task C1)
  sessionId: string | null = null;

  constructor(opts: CopilotTransportOptions) {
    this.config = opts.config;
    this.GhClientCtor = opts.GhClientCtor ?? GhCopilotClient;
  }

  async start(): Promise<void> {
    this.checkUnsupportedFields();

    try {
      this.gh = new this.GhClientCtor(this.buildSdkOptions());
    } catch (err: any) {
      throw new CopilotLaunchError(`Failed to instantiate Copilot SDK: ${err?.message ?? err}`);
    }

    try {
      if (this.config.resumeSessionId) {
        this.session = await (this.gh as any).resumeSession(this.config.resumeSessionId);
        this.sessionId = this.config.resumeSessionId;
      } else {
        const sessionId = this.config.sessionId ?? randomUUID();
        this.session = await (this.gh as any).createSession({
          model: this.config.model,
          sessionId,
          // SDK may also accept: name, allow/deny tools, etc. — wire from config
        });
        this.sessionId = sessionId;
      }
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (/auth|token|credential/i.test(msg)) throw new CopilotAuthError(msg);
      throw new CopilotLaunchError(msg);
    }
  }

  async stop(): Promise<void> {
    if (this.gh) {
      try { await (this.gh as any).stop(); } catch { /* swallow stop errors */ }
      this.gh = null;
      this.session = null;
    }
  }

  /** Throws if the caller asked for something the current SDK can't honor. */
  private checkUnsupportedFields(): void {
    const c = this.config;
    if (c.transport === 'pty') {
      throw new CopilotFeatureUnsupportedError('transport', 'PTY transport is reserved for Phase 2 and not yet implemented.');
    }
    // Capability detection for `mode`, `maxAutopilotContinues`, `availableTools`, `excludedTools`,
    // `cliUrl` is filled in by Task C5 follow-up once the real SDK API is known (Task C1 step 2).
    // For now: if the SDK class doesn't have a property/method that signals support, throw.
    // Example shape (uncomment + adapt once SDK is inspected):
    //
    // if (c.mode !== undefined && !('setMode' in this.GhClientCtor.prototype)) {
    //   throw new CopilotFeatureUnsupportedError('mode',
    //     'Copilot SDK does not yet expose mode passthrough; remove `mode` from config or upgrade.');
    // }
  }

  private buildSdkOptions(): Record<string, any> {
    const c = this.config;
    const opts: Record<string, any> = {};
    if (c.cliPath) opts.cliPath = c.cliPath;
    if (c.cliUrl)  opts.cliUrl  = c.cliUrl;
    if (c.apiKey)  opts.apiKey  = c.apiKey;

    // Permission DSL — names below are placeholders pending Task C1 inspection.
    // Replace with actual SDK option names from src/copilot/sdk.ts.
    if (c.allowAllTools) opts.allowAllTools = true;
    if (c.allowAllPaths) opts.allowAllPaths = true;
    if (c.allowAllUrls)  opts.allowAllUrls  = true;
    if (c.noAskUser)     opts.noAskUser     = true;
    if (c.allowTools)    opts.allowTools    = c.allowTools;
    if (c.denyTools)     opts.denyTools     = c.denyTools;
    if (c.availableTools) opts.availableTools = c.availableTools;
    if (c.excludedTools)  opts.excludedTools  = c.excludedTools;
    if (c.streaming !== undefined) opts.streaming = c.streaming;

    return opts;
  }
}
```

> **Implementation note for the engineer:** the capability-detection branches inside `checkUnsupportedFields` and the option key names inside `buildSdkOptions` are *the* place where Task C1's inspection results land. After Task C1 you have a clear picture of what the SDK actually accepts. Update this file to (a) throw on every `CopilotClientConfig` field the current SDK can't honor, and (b) pass the right keys into the SDK constructor / `createSession`. The unit test in step 1 covers the happy path; add a per-field "throws when SDK doesn't expose X" test for each capability gap you find.

- [ ] **Step 4: Build and re-run the test**

```bash
npm run build && node --test test/copilot-transport.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/copilot/transport.ts test/copilot-transport.test.mjs
git commit -m "feat(copilot): CopilotTransport — SDK lifecycle and capability detection"
```

---

### Task C6: Implement `CopilotClient` core (construction, `start`, `close`, status)

**Files:**
- Create: `src/copilot/client.ts`
- Test: `test/copilot-client.test.mjs`

This task lays down the class skeleton and lifecycle. `send()` and event mapping arrive in Task C7.

- [ ] **Step 1: Write the failing test**

`test/copilot-client.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../dist/esm/copilot/index.js';

class FakeGhClient {
  constructor(opts) { this.opts = opts; this.stopped = false; }
  async createSession({ model, sessionId }) {
    return new FakeGhSession(model, sessionId ?? 'auto-id');
  }
  async resumeSession(id) { return new FakeGhSession('resumed', id); }
  async stop() { this.stopped = true; }
}
class FakeGhSession {
  constructor(model, sessionId) { this.model = model; this.sessionId = sessionId; }
}

test('CopilotClient emits ready after start()', async () => {
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: FakeGhClient });
  let ready = false;
  client.on('ready', () => { ready = true; });
  await client.start();
  assert.equal(ready, true);
  assert.equal(client.getStatus(), 'idle');
  assert.ok(client.sessionId);
  await client.close();
});

test('CopilotClient.close transitions through stop and forgets session', async () => {
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: FakeGhClient });
  await client.start();
  await client.close();
  assert.equal(client.getStatus(), 'idle');
});
```

- [ ] **Step 2: Confirm test fails**

```bash
npm run build && node --test test/copilot-client.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/copilot/client.ts` (core only)**

```ts
import { EventEmitter } from 'events';
import { CopilotTransport } from './transport.js';
import { GhCopilotClient } from './sdk.js';
import type {
  CopilotClientConfig,
  CopilotStatus,
  CopilotPendingAction,
  CopilotTurnSnapshot,
} from './types.js';
import type { CopilotTurnHandle } from './turn-handle.js';

export interface CopilotClientInternals {
  /** Test injection point for the SDK constructor. */
  GhClientCtor?: typeof GhCopilotClient;
}

export declare interface CopilotClient {
  on(event: 'ready',           listener: () => void): this;
  on(event: 'output_delta',    listener: (delta: string) => void): this;
  on(event: 'reasoning_delta', listener: (delta: string) => void): this;
  on(event: 'tool_use_start',  listener: (tool: { id: string; name: string; input: Record<string, any> }) => void): this;
  on(event: 'tool_result',     listener: (res: { toolUseId: string; content: string; isError: boolean }) => void): this;
  on(event: 'usage_update',    listener: (u: { inputTokens: number; outputTokens: number }) => void): this;
  on(event: 'result',          listener: (snapshot: CopilotTurnSnapshot) => void): this;
  on(event: 'status_change',   listener: (status: CopilotStatus, action: CopilotPendingAction | null) => void): this;
  on(event: 'error',           listener: (err: Error) => void): this;
}

export class CopilotClient extends EventEmitter {
  private readonly config: CopilotClientConfig;
  private readonly transport: CopilotTransport;

  private _status: CopilotStatus = 'idle';
  private _currentTurn: CopilotTurnHandle | null = null;
  private _history: CopilotTurnSnapshot[] = [];
  private _messageQueue: string[] = [];

  constructor(config: CopilotClientConfig, internals?: CopilotClientInternals) {
    super();
    this.config = config;
    this.transport = new CopilotTransport({ config, GhClientCtor: internals?.GhClientCtor });
  }

  async start(): Promise<void> {
    await this.transport.start();
    this.setStatus('idle');
    this.emit('ready');
  }

  async close(): Promise<void> {
    await this.transport.stop();
    this._currentTurn = null;
  }

  get sessionId(): string | null {
    return this.transport.sessionId;
  }

  getStatus(): CopilotStatus {
    return this._status;
  }

  isProcessing(): boolean {
    return this._status === 'running';
  }

  getCurrentTurn(): CopilotTurnHandle | null {
    return this._currentTurn;
  }

  getHistory(): CopilotTurnSnapshot[] {
    return this._history.slice();
  }

  /** Internal: status transitions emit `status_change`. */
  private setStatus(status: CopilotStatus, action: CopilotPendingAction | null = null): void {
    if (this._status === status) return;
    this._status = status;
    this.emit('status_change', status, action);
  }

  // send / sendMessage / queueMessage / interrupt arrive in Task C7+.
}
```

- [ ] **Step 4: Build and re-run the test**

```bash
npm run build && node --test test/copilot-client.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Create `src/copilot/index.ts` so the test's import path works**

```ts
export * from './types.js';
export * from './errors.js';
export * from './turn-handle.js';
export * from './client.js';
// transport.ts and sdk.ts intentionally NOT exported — internal.
```

- [ ] **Step 6: Build, run all tests**

```bash
npm run build && npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/copilot/client.ts src/copilot/index.ts test/copilot-client.test.mjs
git commit -m "feat(copilot): CopilotClient core (start/close/status)"
```

---

### Task C7: Implement `send()`, event mapping, and `sendMessage()`

**Files:**
- Modify: `src/copilot/client.ts` (add `send`, `sendMessage`, internal SDK event subscription)
- Modify: `test/copilot-client.test.mjs` (add `send` tests)

`send()` returns a `CopilotTurnHandle` synchronously; subscribes to SDK events on a microtask; pushes typed updates onto the handle and emits the analogous client-level events.

- [ ] **Step 1: Add the failing tests to `test/copilot-client.test.mjs`**

Append to the existing test file:

```js
import { CopilotTurnHandle } from '../dist/esm/copilot/turn-handle.js';

class StreamingFakeGhSession {
  constructor() {
    this._listeners = {};
    this.sendCalls = [];
  }
  on(event, fn) { (this._listeners[event] ??= []).push(fn); }
  emit(event, payload) { (this._listeners[event] ?? []).forEach(fn => fn(payload)); }
  async sendAndWait({ prompt }) {
    this.sendCalls.push(prompt);
    // Simulate streaming events synchronously, then the final response
    queueMicrotask(() => {
      this.emit('output_delta', { delta: 'hello ' });
      this.emit('output_delta', { delta: 'world' });
      this.emit('usage_update', { inputTokens: 5, outputTokens: 2 });
      this.emit('result',       { content: 'hello world' });
    });
    return { data: { content: 'hello world' } };
  }
}
class StreamingFakeGhClient {
  async createSession() { this.session = new StreamingFakeGhSession(); return this.session; }
  async stop() {}
}

test('CopilotClient.send returns a TurnHandle whose updates() yields output_delta then result', async () => {
  const ghCtor = function () { return new StreamingFakeGhClient(); };
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ghCtor });
  await client.start();

  const turn = client.send('hi');
  assert.ok(turn instanceof CopilotTurnHandle);

  const updates = [];
  for await (const u of turn.updates()) updates.push(u);

  const kinds = updates.map(u => u.kind);
  assert.deepEqual(kinds, ['output', 'output', 'usage', 'result']);

  const final = await turn.done;
  assert.equal(final.text, 'hello world');
  assert.equal(final.status, 'completed');
  assert.equal(client.getStatus(), 'idle');
  assert.equal(client.getHistory().length, 1);
  await client.close();
});

test('CopilotClient emits client-level events that mirror SDK events', async () => {
  const ghCtor = function () { return new StreamingFakeGhClient(); };
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ghCtor });
  await client.start();

  const captured = [];
  client.on('output_delta', d => captured.push(['output_delta', d]));
  client.on('usage_update', u => captured.push(['usage_update', u]));
  client.on('result',       s => captured.push(['result', s.text]));

  const turn = client.send('hi');
  await turn.done;

  assert.equal(captured.filter(([n]) => n === 'output_delta').length, 2);
  assert.equal(captured.filter(([n]) => n === 'usage_update').length, 1);
  assert.equal(captured.filter(([n]) => n === 'result').length, 1);
  await client.close();
});
```

- [ ] **Step 2: Confirm tests fail**

```bash
npm run build && node --test test/copilot-client.test.mjs
```

Expected: FAIL — `send` is undefined.

- [ ] **Step 3: Add `send()` and event wiring to `src/copilot/client.ts`**

Add these imports at the top (or merge with existing):

```ts
import { randomUUID } from 'crypto';
import { CopilotTurnHandle } from './turn-handle.js';
import { CopilotTurnError, CopilotInterruptedError } from './errors.js';
import type { CopilotTurnSnapshot, CopilotTurnUpdate, CopilotToolCall, CopilotUsage } from './types.js';
```

Add the methods inside the `CopilotClient` class:

```ts
send(prompt: string): CopilotTurnHandle {
  if (this._currentTurn) {
    throw new Error('A turn is already in flight. Call interrupt() first or await turn.done.');
  }
  const turnId = randomUUID();
  const initial: CopilotTurnSnapshot = {
    turnId,
    status: 'running',
    text: '',
    reasoningText: '',
    toolCalls: [],
    usage: null,
    startedAt: Date.now(),
    endedAt: null,
    error: null,
  };
  const handle = new CopilotTurnHandle(initial);
  this._currentTurn = handle;
  this.setStatus('running');

  // Wire SDK events → handle updates + client events. Microtask so callers can subscribe first.
  queueMicrotask(() => this.runTurn(prompt, handle).catch(err => {
    // runTurn already calls handle.fail; this catch is a backstop.
    this.emit('error', err);
  }));

  return handle;
}

async sendMessage(text: string): Promise<void> {
  const turn = this.send(text);
  await turn.done;
}

queueMessage(text: string): void {
  if (this._status === 'running') {
    this._messageQueue.push(text);
  } else {
    this.sendMessage(text).catch(err => this.emit('error', err));
  }
}

private async runTurn(prompt: string, handle: CopilotTurnHandle): Promise<void> {
  const session = (this.transport as any).session;
  if (!session) {
    handle.fail(new CopilotTurnError('No active Copilot session — call start() first.'));
    this.setStatus('error');
    this._currentTurn = null;
    return;
  }

  // Subscribe to SDK events on the session.
  // NOTE: event names below are placeholders pending Task C1 inspection.
  // After C1, replace each `'output_delta'` etc. with the actual SDK event name and adjust payload shape.
  const onOutput = (payload: any) => {
    const delta = payload?.delta ?? '';
    if (!delta) return;
    const snapshot: CopilotTurnSnapshot = { ...handle.current(), text: handle.current().text + delta };
    handle.push({ kind: 'output', delta, snapshot });
    this.emit('output_delta', delta);
  };
  const onReasoning = (payload: any) => {
    const delta = payload?.delta ?? '';
    if (!delta) return;
    const snapshot: CopilotTurnSnapshot = { ...handle.current(), reasoningText: handle.current().reasoningText + delta };
    handle.push({ kind: 'reasoning', delta, snapshot });
    this.emit('reasoning_delta', delta);
  };
  const onToolUse = (payload: any) => {
    const tool: CopilotToolCall = { id: payload.id, name: payload.name, input: payload.input ?? {}, result: null };
    const snapshot: CopilotTurnSnapshot = { ...handle.current(), toolCalls: [...handle.current().toolCalls, tool] };
    handle.push({ kind: 'tool_use', tool, snapshot });
    this.emit('tool_use_start', { id: tool.id, name: tool.name, input: tool.input });
  };
  const onToolResult = (payload: any) => {
    const calls = handle.current().toolCalls.map(t =>
      t.id === payload.toolUseId ? { ...t, result: { content: payload.content ?? '', isError: payload.isError === true } } : t
    );
    const snapshot: CopilotTurnSnapshot = { ...handle.current(), toolCalls: calls };
    handle.push({
      kind: 'tool_result', toolUseId: payload.toolUseId,
      content: payload.content ?? '', isError: payload.isError === true,
      snapshot,
    });
    this.emit('tool_result', { toolUseId: payload.toolUseId, content: payload.content ?? '', isError: payload.isError === true });
  };
  const onUsage = (payload: any) => {
    const usage: CopilotUsage = { inputTokens: payload.inputTokens ?? 0, outputTokens: payload.outputTokens ?? 0 };
    const snapshot: CopilotTurnSnapshot = { ...handle.current(), usage };
    handle.push({ kind: 'usage', usage, snapshot });
    this.emit('usage_update', usage);
  };

  // Subscribe (the real SDK API for this is determined by Task C1).
  session.on?.('output_delta', onOutput);
  session.on?.('reasoning_delta', onReasoning);
  session.on?.('tool_use_start', onToolUse);
  session.on?.('tool_result', onToolResult);
  session.on?.('usage_update', onUsage);

  try {
    const response = await session.sendAndWait({ prompt });
    // If the SDK's final response is a string content, fold it in (in case streaming missed deltas).
    const finalText = handle.current().text || (response?.data?.content ?? '');
    const finalSnapshot: CopilotTurnSnapshot = {
      ...handle.current(),
      text: finalText,
      status: 'completed',
      endedAt: Date.now(),
    };
    handle.complete(finalSnapshot);
    this.emit('result', finalSnapshot);
    this._history.push(finalSnapshot);
  } catch (err: any) {
    const wrapped = err instanceof Error ? new CopilotTurnError(err.message) : new CopilotTurnError(String(err));
    handle.fail(wrapped);
    this.emit('error', wrapped);
    this._history.push(handle.current());
  } finally {
    this._currentTurn = null;
    this.setStatus(handle.current().status === 'error' ? 'error' : 'idle');
    this.processNextQueued();
  }
}

private processNextQueued(): void {
  if (this._status !== 'idle') return;
  const next = this._messageQueue.shift();
  if (next !== undefined) {
    void this.sendMessage(next).catch(err => this.emit('error', err));
  }
}
```

- [ ] **Step 4: Build and re-run tests**

```bash
npm run build && node --test test/copilot-client.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/copilot/client.ts test/copilot-client.test.mjs
git commit -m "feat(copilot): send(), event mapping, sendMessage, queueMessage"
```

---

### Task C8: Implement `interrupt()` and finalize error wiring

**Files:**
- Modify: `src/copilot/client.ts`
- Modify: `test/copilot-client.test.mjs` (add test)

- [ ] **Step 1: Add the failing test**

Append to `test/copilot-client.test.mjs`:

```js
import { CopilotInterruptedError } from '../dist/esm/copilot/index.js';

class HangingFakeGhSession {
  on() {}
  async sendAndWait() {
    return new Promise((resolve, reject) => { this._reject = reject; /* never resolves */ });
  }
  cancel() { this._reject?.(new Error('cancelled by client')); }
}
class HangingFakeGhClient {
  async createSession() { this.session = new HangingFakeGhSession(); return this.session; }
  async stop() {}
}

test('CopilotClient.interrupt rejects the in-flight turn with CopilotInterruptedError', async () => {
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: function () { return new HangingFakeGhClient(); } });
  await client.start();
  const turn = client.send('hang');
  // Give send() a tick to subscribe and start awaiting
  await new Promise(r => setTimeout(r, 5));
  await client.interrupt();
  await assert.rejects(turn.done, CopilotInterruptedError);
  assert.equal(client.getStatus(), 'error');
  await client.close();
});
```

- [ ] **Step 2: Confirm test fails**

```bash
npm run build && node --test test/copilot-client.test.mjs
```

Expected: FAIL — `interrupt` not defined.

- [ ] **Step 3: Add `interrupt()` to `src/copilot/client.ts`**

Inside the class:

```ts
async interrupt(): Promise<void> {
  const turn = this._currentTurn;
  if (!turn) return;
  // Try the SDK's cancellation primitive. Name pending Task C1 inspection.
  const session = (this.transport as any).session;
  try {
    if (typeof session?.cancel === 'function') await session.cancel();
    else if (typeof session?.stop === 'function') await session.stop();
  } catch { /* swallow — the rejection below covers it */ }
  turn.fail(new CopilotInterruptedError());
}
```

Add the import: `import { CopilotInterruptedError } from './errors.js';` (combine with existing import line).

- [ ] **Step 4: Build and re-run tests**

```bash
npm run build && node --test test/copilot-client.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/copilot/client.ts test/copilot-client.test.mjs
git commit -m "feat(copilot): interrupt() rejects in-flight turn"
```

---

### Task C9: Implement Copilot session browser (disk-backed reader)

**Files:**
- Create: `src/copilot/sessions.ts`
- Test: `test/copilot-sessions.test.mjs`

Mirror the `src/claude/sessions.ts` pattern, reading from `~/.copilot/session-state/{session-id}/` (per the SDK doc) and surfacing the same `SessionBrowserSummary` / `SessionBrowserRecord` shapes.

- [ ] **Step 1: Read `src/claude/sessions.ts`** to understand the existing `SessionBrowserSummary<TRaw>`, `SessionBrowserRecord<TRawSession, TRawMessage>` shapes (defined in `src/claude/types.ts`).

- [ ] **Step 2: Write the failing test**

`test/copilot-sessions.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listCopilotSessionSummaries, readCopilotSessionRecord } from '../dist/esm/copilot/sessions.js';

test('listCopilotSessionSummaries returns sessions from the configured copilot home', async () => {
  const home = await mkdtemp(join(tmpdir(), 'copilot-sessions-'));
  const stateDir = join(home, '.copilot', 'session-state', 'sess-1');
  await mkdir(stateDir, { recursive: true });
  await writeFile(join(stateDir, 'metadata.json'), JSON.stringify({
    sessionId: 'sess-1',
    title: 'Refactor pool',
    createdAt: '2026-04-28T00:00:00Z',
    messageCount: 4,
  }));

  const summaries = await listCopilotSessionSummaries({ homeDir: home });
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].sessionId, 'sess-1');
  assert.equal(summaries[0].title, 'Refactor pool');
  assert.equal(summaries[0].provider, 'copilot');
});

test('readCopilotSessionRecord returns metadata + raw messages for one session', async () => {
  const home = await mkdtemp(join(tmpdir(), 'copilot-sessions-'));
  const stateDir = join(home, '.copilot', 'session-state', 'sess-2');
  await mkdir(stateDir, { recursive: true });
  await writeFile(join(stateDir, 'metadata.json'), JSON.stringify({
    sessionId: 'sess-2', title: 'X', messageCount: 1,
  }));
  await writeFile(join(stateDir, 'messages.jsonl'),
    JSON.stringify({ role: 'user', content: 'hi' }) + '\n');

  const record = await readCopilotSessionRecord('sess-2', { homeDir: home });
  assert.equal(record.sessionId, 'sess-2');
  assert.equal(record.rawMessages.length, 1);
  assert.equal(record.rawMessages[0].role, 'user');
});
```

- [ ] **Step 3: Confirm test fails**

```bash
npm run build && node --test test/copilot-sessions.test.mjs
```

Expected: FAIL.

- [ ] **Step 4: Implement `src/copilot/sessions.ts`**

```ts
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { SessionBrowserSummary, SessionBrowserRecord } from '../claude/types.js';

export interface CopilotSessionLocatorOptions {
  /** Override $HOME (test injection point). */
  homeDir?: string;
  /** Override the absolute path to .copilot directory. */
  copilotDir?: string;
}

interface CopilotSessionMetadata {
  sessionId: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  messageCount?: number;
  projectPath?: string;
  gitBranch?: string;
}

function resolveStateDir(opts?: CopilotSessionLocatorOptions): string {
  if (opts?.copilotDir) return join(opts.copilotDir, 'session-state');
  const home = opts?.homeDir ?? homedir();
  return join(home, '.copilot', 'session-state');
}

export async function listCopilotSessionSummaries(
  opts?: CopilotSessionLocatorOptions
): Promise<SessionBrowserSummary<CopilotSessionMetadata>[]> {
  const stateDir = resolveStateDir(opts);
  let entries: string[] = [];
  try {
    entries = await readdir(stateDir);
  } catch (err: any) {
    if (err?.code === 'ENOENT') return [];
    throw err;
  }

  const summaries: SessionBrowserSummary<CopilotSessionMetadata>[] = [];
  for (const id of entries) {
    const dir = join(stateDir, id);
    const s = await stat(dir).catch(() => null);
    if (!s?.isDirectory()) continue;
    const metaPath = join(dir, 'metadata.json');
    let meta: CopilotSessionMetadata | null = null;
    try {
      const raw = await readFile(metaPath, 'utf8');
      meta = JSON.parse(raw);
    } catch { continue; }
    if (!meta) continue;
    summaries.push({
      provider: 'copilot',
      sessionId: meta.sessionId ?? id,
      title: meta.title ?? id,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      messageCount: meta.messageCount ?? 0,
      projectPath: meta.projectPath,
      gitBranch: meta.gitBranch,
      raw: meta,
    });
  }
  return summaries;
}

export async function readCopilotSessionRecord(
  sessionId: string,
  opts?: CopilotSessionLocatorOptions
): Promise<SessionBrowserRecord<CopilotSessionMetadata, unknown>> {
  const stateDir = resolveStateDir(opts);
  const dir = join(stateDir, sessionId);
  const metaRaw = await readFile(join(dir, 'metadata.json'), 'utf8');
  const meta: CopilotSessionMetadata = JSON.parse(metaRaw);

  let rawMessages: unknown[] = [];
  try {
    const text = await readFile(join(dir, 'messages.jsonl'), 'utf8');
    rawMessages = text.split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err;
  }

  return {
    provider: 'copilot',
    sessionId: meta.sessionId ?? sessionId,
    title: meta.title ?? sessionId,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    messageCount: meta.messageCount ?? rawMessages.length,
    projectPath: meta.projectPath,
    gitBranch: meta.gitBranch,
    raw: meta,
    rawMessages,
    messages: [], // Cross-provider transcript normalization is Phase 2.
  };
}
```

- [ ] **Step 5: Build and re-run tests**

```bash
npm run build && node --test test/copilot-sessions.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Export from the Copilot barrel**

Edit `src/copilot/index.ts`:

```ts
export * from './types.js';
export * from './errors.js';
export * from './turn-handle.js';
export * from './client.js';
export * from './sessions.js';
```

- [ ] **Step 7: Commit**

```bash
git add src/copilot/sessions.ts src/copilot/index.ts test/copilot-sessions.test.mjs
git commit -m "feat(copilot): disk-backed session browser"
```

---

### Task C10: Wire Copilot into top-level barrel and `package.json` exports

**Files:**
- Modify: `src/index.ts`
- Modify: `package.json`

- [ ] **Step 1: Update `src/index.ts`**

```ts
export * as claude from './claude/index.js';
export * as copilot from './copilot/index.js';
export * from './turn-handle.js';
// Re-export both clients at the top level for convenience:
export { ClaudeClient } from './claude/index.js';
export { CopilotClient } from './copilot/index.js';
```

(The `export * as claude` and `export * as copilot` namespace exports keep the full set of types/classes accessible from `import { claude, copilot } from '@baoduy2412/ai-cli-client'` while the bare `ClaudeClient` / `CopilotClient` re-exports give the most common path zero-overhead.)

- [ ] **Step 2: Update `package.json` `exports` to add `./copilot`**

Add inside the `exports` object (alongside the existing `./claude`):

```json
"./copilot": {
  "types": "./dist/types/copilot/index.d.ts",
  "import": "./dist/esm/copilot/index.js",
  "require": "./dist/cjs/copilot/index.js"
}
```

- [ ] **Step 3: Build, run all tests**

```bash
npm run build && npm test
```

Expected: full test suite passes.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts package.json
git commit -m "feat: expose Copilot at top-level barrel and ./copilot subpath"
```

---

## Phase D — Cross-cutting tests

### Task D1: Shared `TurnHandleBase` contract test

**Files:**
- Create: `test/turn-handle.test.mjs`

Test that both `ClaudeTurnHandle` and `CopilotTurnHandle` satisfy the `TurnHandleBase` shape: `updates()` is an async iterable, `current()` returns a snapshot, `done` is a Promise, `history()` returns an array.

- [ ] **Step 1: Write the test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { CopilotTurnHandle } from '../dist/esm/copilot/turn-handle.js';
// ClaudeTurnHandle is exported from claude/turn-handle.js (post-Task A2)
import { TurnHandle as ClaudeTurnHandle } from '../dist/esm/claude/turn-handle.js';

function copilotSeed() {
  return { turnId: 't', status: 'running', text: '', reasoningText: '', toolCalls: [], usage: null, startedAt: 0, endedAt: null, error: null };
}

test('CopilotTurnHandle satisfies TurnHandleBase contract', () => {
  const h = new CopilotTurnHandle(copilotSeed());
  assert.equal(typeof h.current, 'function');
  assert.equal(typeof h.history, 'function');
  assert.equal(typeof h.updates, 'function');
  assert.ok(h.done instanceof Promise);
  assert.equal(typeof h.updates()[Symbol.asyncIterator], 'function');
});

test('ClaudeTurnHandle satisfies TurnHandleBase contract', () => {
  // Construction params depend on the existing TurnHandle ctor — adjust if needed.
  // The point is that the four base methods/property are present.
  // (Use whatever public construction path makes sense; if TurnHandle is constructed
  //  internally only, skip this test and rely on Task A2 + Phase A tests.)
  // Minimal smoke: assert the prototype has the expected method names.
  assert.equal(typeof ClaudeTurnHandle.prototype.current, 'function');
  assert.equal(typeof ClaudeTurnHandle.prototype.history, 'function');
  assert.equal(typeof ClaudeTurnHandle.prototype.updates, 'function');
});
```

- [ ] **Step 2: Run the test**

```bash
npm run build && node --test test/turn-handle.test.mjs
```

Expected: PASS (after Phase A and Phase C).

- [ ] **Step 3: Commit**

```bash
git add test/turn-handle.test.mjs
git commit -m "test: TurnHandleBase contract over both providers"
```

---

### Task D2: Integration smoke script for Copilot

**Files:**
- Create: `scripts/integration-copilot-smoke.mjs`
- Modify: `package.json` (add `integration:copilot` script)

Mirrors the existing `scripts/integration-structured-smoke.mjs` shape: spawns a real session and prints captured output.

- [ ] **Step 1: Read `scripts/integration-structured-smoke.mjs`** to copy its structure (exit codes, output capture, env-var skipping).

- [ ] **Step 2: Create `scripts/integration-copilot-smoke.mjs`**

```js
#!/usr/bin/env node
/**
 * Smoke test against a real Copilot CLI. Skips silently if no credentials.
 *   COPILOT_GITHUB_TOKEN or GH_TOKEN must be set, OR the user has previously
 *   run `copilot login` and the credential is in the system keychain.
 *
 * Usage: node scripts/integration-copilot-smoke.mjs
 */
import { CopilotClient } from '../dist/esm/copilot/index.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT_DIR = 'test-output/copilot-smoke';
await mkdir(OUT_DIR, { recursive: true });

const hasToken = !!(process.env.COPILOT_GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
if (!hasToken) {
  console.log('SKIP: no Copilot credentials in env (set COPILOT_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN).');
  process.exit(0);
}

const client = new CopilotClient({ cwd: process.cwd() });
const captured = [];
client.on('output_delta', d => captured.push({ kind: 'output_delta', d }));
client.on('result',       s => captured.push({ kind: 'result', text: s.text }));
client.on('error',        e => captured.push({ kind: 'error', message: e.message }));

try {
  await client.start();
  console.log('Session:', client.sessionId);

  const turn = client.send('Reply with the single word: pong');
  for await (const u of turn.updates()) {
    if (u.kind === 'output') process.stdout.write(u.delta);
  }
  process.stdout.write('\n');

  const final = await turn.done;
  await writeFile(join(OUT_DIR, 'transcript.json'), JSON.stringify({ final, captured }, null, 2));
  console.log('Final text:', final.text.slice(0, 200));
} finally {
  await client.close();
}
```

Make the file executable:

```bash
chmod +x scripts/integration-copilot-smoke.mjs
```

- [ ] **Step 3: Add script to `package.json`**

Inside `"scripts"`, add (alphabetical position next to other `integration:*` scripts):

```json
"integration:copilot": "npm run build && node ./scripts/integration-copilot-smoke.mjs",
```

- [ ] **Step 4: Run it locally** (only if you have credentials)

```bash
npm run integration:copilot
```

Expected (with creds): a "pong" reply printed; `test-output/copilot-smoke/transcript.json` written.
Expected (without creds): script exits 0 with `SKIP:` message.

- [ ] **Step 5: Commit**

```bash
git add scripts/integration-copilot-smoke.mjs package.json
chmod +x scripts/integration-copilot-smoke.mjs   # ensure executable bit committed on Unix
git commit -m "test(copilot): integration smoke script"
```

---

## Phase E — Examples, README, CHANGELOG, package-name sweep

### Task E1: Update existing Claude examples for new package name

**Files:**
- Modify: `examples/basic.ts`, `examples/error-handling.ts`, `examples/events.ts`, `examples/print-mode.ts`, `examples/print-mode-session.ts`, `examples/structured-requests.ts`

- [ ] **Step 1: Find all old import strings**

```bash
grep -ln '@raylin01/claude-client' examples/
```

Expected: all six files.

- [ ] **Step 2: Replace `@raylin01/claude-client` with `@baoduy2412/ai-cli-client` in each**

For each file, replace exactly one line:

```ts
import { ClaudeClient } from '@raylin01/claude-client';
```

with:

```ts
import { ClaudeClient } from '@baoduy2412/ai-cli-client';
```

`examples/structured-requests.ts` may import `StructuredClaudeClient` — replace that with `ClaudeClient` (the structured class no longer exists; its methods are on `ClaudeClient`). Adjust the example body to call `await ClaudeClient.init({...})` directly.

- [ ] **Step 3: Verify each example typechecks**

```bash
for f in examples/*.ts; do npx tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 --strict false "$f" || echo "FAILED: $f"; done
```

Expected: each compiles. (A standalone `--noEmit` here is a quick check; the package's own `tsconfig.json` excludes `examples/`.)

- [ ] **Step 4: Commit**

```bash
git add examples/
git commit -m "docs(examples): rename to @baoduy2412/ai-cli-client + drop StructuredClaudeClient"
```

---

### Task E2: Add Copilot examples

**Files:**
- Create: `examples/copilot/basic.ts`
- Create: `examples/copilot/streaming.ts`
- Create: `examples/copilot/permissions.ts`
- Create: `examples/copilot/byok.ts`

- [ ] **Step 1: `examples/copilot/basic.ts`**

```ts
import { CopilotClient } from '@baoduy2412/ai-cli-client/copilot';

async function main() {
  const client = new CopilotClient({ cwd: process.cwd() });
  await client.start();
  console.log('Session:', client.sessionId);

  await client.sendMessage('Summarize this project in one sentence.');

  const [latest] = client.getHistory().slice(-1);
  console.log('Reply:', latest.text);

  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: `examples/copilot/streaming.ts`**

```ts
import { CopilotClient } from '@baoduy2412/ai-cli-client/copilot';

async function main() {
  const client = new CopilotClient({ cwd: process.cwd() });
  await client.start();

  const turn = client.send('List three Node.js best practices.');
  for await (const update of turn.updates()) {
    if (update.kind === 'output')   process.stdout.write(update.delta);
    if (update.kind === 'tool_use') console.log('\n[tool]', update.tool.name);
  }
  process.stdout.write('\n');

  await turn.done;
  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 3: `examples/copilot/permissions.ts`**

```ts
import { CopilotClient } from '@baoduy2412/ai-cli-client/copilot';

async function main() {
  const client = new CopilotClient({
    cwd: process.cwd(),
    // Fine-grained, per the GitHub best-practices guidance.
    allowTools: ['shell(git:*)', 'read'],
    denyTools: ['shell(git push)', 'shell(rm:*)'],
  });
  await client.start();

  await client.sendMessage('Show me the latest 5 git commits.');

  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 4: `examples/copilot/byok.ts`**

```ts
import { CopilotClient } from '@baoduy2412/ai-cli-client/copilot';

async function main() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) throw new Error('Set ANTHROPIC_API_KEY for this example.');

  const client = new CopilotClient({
    cwd: process.cwd(),
    apiKey: { provider: 'anthropic', key: anthropicKey },
    model: 'claude-sonnet-4.5',
  });
  await client.start();

  await client.sendMessage('Hello — confirm you are running Claude Sonnet 4.5.');

  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 5: Commit**

```bash
git add examples/copilot/
git commit -m "docs(examples): Copilot — basic, streaming, permissions, byok"
```

---

### Task E3: Rewrite README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the existing README** to identify the parts that survive (install, requirements, mode comparison, troubleshooting) versus the parts that must be rewritten (every code example, the structured-API section, the "Projects Using This Client" list).

- [ ] **Step 2: Replace the README with this structure**

Top-level sections (in order):

```
# @baoduy2412/ai-cli-client

Node.js client for controlling Claude Code and GitHub Copilot CLIs.

## Install
   (npm install ...)

## Requirements
   (Node 18+, claude or copilot CLI)

## Common API
   - Both clients expose: send(), sendMessage(), on(), TurnHandle shape
   - One paragraph each on TurnHandle and event names

## Claude
   - Quickstart code (rewritten against the merged ClaudeClient — no StructuredClaudeClient)
   - Stream mode + Print mode + structured methods (send, getOpenRequests, approveRequest, answerQuestion)
   - Link to docs/superpowers/specs/...

## Copilot
   - Quickstart code (basic example from examples/copilot/basic.ts)
   - Streaming example
   - Permission DSL summary (with the `Kind(arg)` patterns)
   - BYOK note
   - Public-preview disclaimer for @github/copilot-sdk

## Provider parity table
   (Trim the Section 11 table from the spec down to user-facing rows)

## Examples
   - List the new examples/copilot/ files

## Mode comparison
   (Keep the existing Stream Mode vs Print Mode table for Claude only)

## Troubleshooting
   (Keep + add a Copilot-specific row about credential errors)

## Versioning
   (Existing)

## License
   (Existing — note license changed from ISC to MIT in package.json; reconcile)
```

The full content for each section: paste/adapt the content from the spec at `docs/superpowers/specs/2026-04-28-copilot-cli-client-design.md` and the example files at `examples/copilot/`. The skill rule is "complete code in every step" — but README content is prose; the example-section snippets must literally match the example files.

- [ ] **Step 3: Verify all imports in the README's code blocks resolve to the published API**

Read the README aloud (mentally). Every `from '@baoduy2412/ai-cli-client'` must be an export that exists; every `from '@baoduy2412/ai-cli-client/copilot'` must work. There should be **zero** `@raylin01/claude-client` references and **zero** `StructuredClaudeClient` references.

```bash
grep -c '@raylin01/claude-client' README.md
grep -c 'StructuredClaudeClient' README.md
```

Both must print `0`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README — Copilot section, drop StructuredClaudeClient"
```

---

### Task E4: CHANGELOG entry

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Read `CHANGELOG.md` to see the existing format and bump version**

The current `package.json` reports `0.3.3`. This release adds a new module + breaks the `StructuredClaudeClient` export, which is a major change. Bump to `0.4.0`.

- [ ] **Step 2: Add a new entry at the top of `CHANGELOG.md`**

```markdown
## 0.4.0 — 2026-04-28

### Added
- `CopilotClient` (`@baoduy2412/ai-cli-client/copilot`) — wraps `@github/copilot-sdk` with a surface that mirrors `ClaudeClient`. Supports streaming events, multi-turn sessions (auto-managed or caller-supplied), permission DSL, BYOK, and disk-backed session browsing.
- Top-level barrel: `import { ClaudeClient, CopilotClient } from '@baoduy2412/ai-cli-client'` works directly.
- New `./copilot` subpath in `package.json` `exports`.
- New examples under `examples/copilot/`.

### Changed
- **Package renamed from `@raylin01/claude-client` to `@baoduy2412/ai-cli-client`.**
- Top-level dist layout reorganized: Claude module is now at `./dist/esm/claude/...` (was `./dist/esm/...`). Subpath imports keep working: `@baoduy2412/ai-cli-client/sessions`, `/mcp`, `/task-store`, `/task-queue` resolve to the same Claude submodules they always did.
- `ClaudeClient.init()` now returns `ClaudeClient` (was `StructuredClaudeClient`). Existing callers using `await ClaudeClient.init(config)` keep working — the methods previously on `StructuredClaudeClient` (`send`, `getHistory`, `getOpenRequests`, `approveRequest`, etc.) are now on `ClaudeClient` directly.

### Removed
- **`StructuredClaudeClient` class.** Its methods folded onto `ClaudeClient`. Replace `import { StructuredClaudeClient } from '@raylin01/claude-client'` with `import { ClaudeClient } from '@baoduy2412/ai-cli-client'` and use `ClaudeClient.init(config)` (signature unchanged).
- `src/claude/structured.ts` deleted.
```

- [ ] **Step 3: Bump `package.json` version**

Edit `"version": "0.3.3"` → `"version": "0.4.0"`.

- [ ] **Step 4: Final build + full test run**

```bash
npm run build && npm test
```

Expected: clean build, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md package.json
git commit -m "chore: release v0.4.0 — Copilot client + Claude simplification"
```

---

## Self-Review (run before claiming the plan complete)

A spec-coverage and consistency pass against `docs/superpowers/specs/2026-04-28-copilot-cli-client-design.md`.

| Spec section | Plan task(s) | Notes |
|---|---|---|
| §1 Goal | (whole plan) | |
| §2 Out of scope | implicitly enforced — no PTY / no unified abstraction tasks | |
| §3.1 File layout | A1, A2, B1, C1–C9 | |
| §3.2 Build configuration changes | B1, B2 | rootDir flip, exports rewrite |
| §3.3 Naming | C1 (shim aliases `GhCopilotClient`) | |
| §3.4 Two-layer collapse on Claude | A3, A4 | Methods folded; `structured.ts` deleted |
| §4.1 Construction & lifecycle | C5, C6 | `start`/`close`/`sessionId` |
| §4.2 Per-turn API | C7 | `send` returns `CopilotTurnHandle` |
| §4.3 Events | C7 | All event names |
| §4.4 Lifecycle / introspection methods | C6, C7, C8 | Includes `queueMessage` |
| §4.5 TurnHandle hierarchy | B1 (base), C4 (Copilot) | `ClaudeTurnHandle` extracted in A2 |
| §5 CopilotClientConfig | C2 | |
| §5.1 Capability detection | C5 | `CopilotFeatureUnsupportedError` for unsupported fields |
| §5.2 Mid-session model switching | (intentionally not implemented) | No `setModel` on `CopilotClient` |
| §6 Data flow for one turn | C7 | |
| §7 Error handling | C3, C5, C7, C8 | All six error subclasses |
| §8 Testing | A4 (rename test), C3, C4, C5, C6, C7, C8, C9, D1, D2 | |
| §9 Dependencies | C1 | `@github/copilot-sdk` pinned |
| §10 README + examples + housekeeping | E1, E2, E3, E4 | |
| §11 Known gaps / NOT in Phase 1 | (documented in README per E3) | |
| §12 Forward-compat hooks for Phase 2 | A1 (Claude transport seam), B1 (`TurnHandleBase`), C2 (`transport: 'pty'` field), C5 (capability check) | |

**Open implementation risk:** Tasks C5 and C7 contain SDK event-name and option-key placeholders that must be reconciled with the real `@github/copilot-sdk` surface during Task C1's discovery step. The plan acknowledges this inline. The **engineer should not skip Task C1** — read the installed SDK's `.d.ts` files, then update C5's `buildSdkOptions` and `checkUnsupportedFields`, plus C7's `runTurn` event subscriptions, to match what the SDK actually emits.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-28-copilot-cli-client.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using `executing-plans`, batched with checkpoints for review.

Which approach?
