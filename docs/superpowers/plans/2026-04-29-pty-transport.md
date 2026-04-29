# Phase 3 — PTY Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `PtyClient` + `createPtyClient` factory so consumers (typically Electron daemons) can spawn `claude` / `copilot` in a real OS-level PTY and forward raw bytes to a renderer of their choice.

**Architecture:** Pure passthrough — `PtyClient` is a separate surface from `AICliClient`. New `src/pty/` module with provider-agnostic client wrapping node-pty, plus per-provider arg-mapper modules. node-pty is an optional peer dependency, lazy-loaded. Factory mirrors `createAICliClient`: discriminated-union config, exhaustive switch, auto-start.

**Tech Stack:** TypeScript 6.0, Node `>=22`, dual ESM/CJS build via `tsc`, tests via `node:test` (`.mjs`), node-pty (optional peer).

**Reference spec:** [`docs/superpowers/specs/2026-04-29-pty-transport-design.md`](../specs/2026-04-29-pty-transport-design.md)

---

## File Structure

### Created

| File | Responsibility |
|---|---|
| `src/pty/types.ts` | `PtyClient` interface, `PtyClientConfig` discriminated union, `PtyCommonConfig` / `ClaudePtyConfig` / `CopilotPtyConfig` |
| `src/pty/errors.ts` | `PtyError` base + `PtyDependencyMissingError`, `PtyBinaryNotFoundError`, `PtySpawnError` |
| `src/pty/claude-args.ts` | Pure `buildClaudeArgs(c: ClaudePtyConfig): string[]` |
| `src/pty/copilot-args.ts` | Pure `buildCopilotArgs(c: CopilotPtyConfig): string[]` |
| `src/pty/client.ts` | `PtyClientImpl` — wraps node-pty.IPty, EventEmitter-style |
| `src/pty/factory.ts` | `createPtyClient(config, internals?)` + lazy node-pty loader |
| `src/pty/index.ts` | Barrel: re-exports types, errors, factory |
| `test/pty/claude-args.test.mjs` | Unit tests for arg mapping |
| `test/pty/copilot-args.test.mjs` | Unit tests for arg mapping |
| `test/pty/client.test.mjs` | Unit tests with mocked node-pty IPty |
| `test/pty/factory.test.mjs` | Unit tests with mocked loader |
| `examples/pty/basic-claude.ts` | Spawn claude in a PTY, pipe to stdout, forward stdin |
| `examples/pty/basic-copilot.ts` | Same for copilot |
| `examples/pty/electron-main.ts` | Sketch of the Electron main-process integration (IPC pattern) |
| `scripts/integration-pty.mjs` | Real-binary smoke (skips if `claude`/`copilot` missing or `node-pty` not installed) |
| `docs/pty-transport.md` | Consumer guide: install, Electron rebuild flow, IPC pattern, troubleshooting |

### Modified

| File | Change |
|---|---|
| `src/index.ts` | Re-export PTY surface |
| `src/copilot/transport.ts:65-70` | Update unsupported-`pty` message to point at `createPtyClient` |
| `package.json` | Bump version → `0.6.0`, add `peerDependencies` + `peerDependenciesMeta`, add `./pty` to `exports`, add `integration:pty` script |
| `README.md` | New "PTY transport" section near the bottom |
| `CHANGELOG.md` | New `0.6.0` entry |
| `docs/provider-capabilities.md` | New PTY-transport row |

---

## Task Order Rationale

A1–A2 are pure scaffolding (types + errors). A3–A4 are pure-function arg builders (TDD-friendly, no node-pty). A5 is the client class with mocked IPty (TDD with stub injection). A6 is the factory. A7 is the local barrel. B-tasks wire the new module into the rest of the package. C-tasks add the optional-peer-dep behavior + cross-cutting tests. D-tasks add docs + examples. E adds integration smoke. F runs the self-review checklist before release.

Each task ends in a commit. Build/typecheck happens at every commit.

---

## Phase A — Module scaffolding

### Task A1: Create the types file

**Files:**
- Create: `src/pty/types.ts`

- [ ] **Step 1: Write the file**

```ts
// src/pty/types.ts

/**
 * Provider-agnostic PTY client. Pure passthrough — the underlying CLI
 * runs in a real pseudo-terminal; this client exposes raw bytes,
 * write, resize, kill, exit. The library does NOT render. Consumers
 * (typically Electron daemons) forward bytes to their own renderer.
 *
 * Not related to AICliClient — that's the structured surface for
 * non-TTY consumers. PTY mode and structured mode are distinct.
 */
export interface PtyClient {
  /** Runtime discriminator. Mirrors PtyClientConfig.provider. */
  readonly provider: 'claude' | 'copilot';
  /** OS process id once started. Null before start, after exit. */
  readonly pid: number | null;
  /** Current PTY columns. Updated by resize(). */
  readonly cols: number;
  /** Current PTY rows. Updated by resize(). */
  readonly rows: number;

  /** Idempotent. Factory already calls this; safe to call again. */
  start(): Promise<void>;
  /** Sync passthrough to node-pty. */
  write(data: string | Buffer): void;
  /** Sync. Updates cols/rows and forwards to the inner PTY. */
  resize(cols: number, rows: number): void;
  /** Sync fire-and-forget signal. Default 'SIGHUP'. */
  kill(signal?: NodeJS.Signals): void;
  /** Graceful: SIGHUP + await 'exit'. */
  close(): Promise<void>;

  on(event: 'data',  listener: (data: Buffer) => void): this;
  on(event: 'exit',  listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  off(event: string, listener: (...args: unknown[]) => void): this;
}

export interface PtyCommonConfig {
  /** Working directory of the spawned process. Default: process.cwd(). */
  cwd?: string;
  /** Initial PTY columns. Default: 80. */
  cols?: number;
  /** Initial PTY rows. Default: 24. */
  rows?: number;
  /** Merged onto process.env. */
  env?: Record<string, string>;
  /** Override the binary path. Default: provider's name on PATH. */
  bin?: string;
  /** Appended after mapped flags. Escape hatch for unmapped flags. */
  extraArgs?: string[];
}

export interface ClaudePtyConfig extends PtyCommonConfig {
  /** → --model <value>. Omitted if absent (CLI default applies). */
  model?: string;
  /** → --permission-mode <value>. */
  permissionMode?:
    | 'default' | 'acceptEdits' | 'auto'
    | 'plan'    | 'dontAsk'     | 'bypassPermissions';
}

export interface CopilotPtyConfig extends PtyCommonConfig {
  /** → --model <value>. */
  model?: string;
  /** → repeated --allow-tool <pattern>. */
  allowTools?: string[];
  /** → repeated --deny-tool <pattern>. */
  denyTools?: string[];
  /** → --allow-all (alias of --yolo). */
  allowAll?: boolean;
  /** → --allow-all-paths. */
  allowAllPaths?: boolean;
  /** → --allow-all-urls. */
  allowAllUrls?: boolean;
  /** → --no-ask-user. */
  noAskUser?: boolean;
  /** → repeated --add-dir <path>. */
  addDir?: string[];
}

export type PtyClientConfig =
  | ({ provider: 'claude' }  & ClaudePtyConfig)
  | ({ provider: 'copilot' } & CopilotPtyConfig);
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
rtk git add src/pty/types.ts
rtk git commit -m "feat(pty): add PtyClient interface and config union"
```

---

### Task A2: Create the errors file

**Files:**
- Create: `src/pty/errors.ts`

- [ ] **Step 1: Write the file**

```ts
// src/pty/errors.ts

export class PtyError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions);
    this.name = 'PtyError';
  }
}

/** node-pty is not installed (optional peer dep missing). */
export class PtyDependencyMissingError extends PtyError {
  readonly code = 'PTY_DEP_MISSING' as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PtyDependencyMissingError';
  }
}

/** Provider binary (`claude` / `copilot`) was not found on PATH. */
export class PtyBinaryNotFoundError extends PtyError {
  readonly code = 'PTY_BINARY_NOT_FOUND' as const;
  readonly bin: string;
  constructor(bin: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PtyBinaryNotFoundError';
    this.bin = bin;
  }
}

/** node-pty.spawn() threw — usually permissions or platform issues. */
export class PtySpawnError extends PtyError {
  readonly code = 'PTY_SPAWN_FAILED' as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PtySpawnError';
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add src/pty/errors.ts
rtk git commit -m "feat(pty): add PtyDependencyMissingError, PtyBinaryNotFoundError, PtySpawnError"
```

---

### Task A3: TDD `buildClaudeArgs`

**Files:**
- Create: `test/pty/claude-args.test.mjs`
- Create: `src/pty/claude-args.ts`

- [ ] **Step 1: Write the failing test**

```js
// test/pty/claude-args.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClaudeArgs } from '../../dist/esm/pty/claude-args.js';

test('buildClaudeArgs returns empty array for empty config', () => {
  assert.deepEqual(buildClaudeArgs({}), []);
});

test('buildClaudeArgs maps model to --model', () => {
  assert.deepEqual(
    buildClaudeArgs({ model: 'claude-sonnet-4.5' }),
    ['--model', 'claude-sonnet-4.5'],
  );
});

test('buildClaudeArgs maps permissionMode to --permission-mode', () => {
  assert.deepEqual(
    buildClaudeArgs({ permissionMode: 'auto' }),
    ['--permission-mode', 'auto'],
  );
});

test('buildClaudeArgs maps both model and permissionMode in stable order', () => {
  assert.deepEqual(
    buildClaudeArgs({ model: 'm', permissionMode: 'plan' }),
    ['--model', 'm', '--permission-mode', 'plan'],
  );
});

test('buildClaudeArgs appends extraArgs last', () => {
  assert.deepEqual(
    buildClaudeArgs({ model: 'm', extraArgs: ['--resume', 'abc'] }),
    ['--model', 'm', '--resume', 'abc'],
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test test/pty/claude-args.test.mjs`
Expected: FAIL — module `../../dist/esm/pty/claude-args.js` not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/pty/claude-args.ts
import type { ClaudePtyConfig } from './types.js';

/**
 * Map ClaudePtyConfig to Claude CLI flags. Pure function. Order is stable
 * (--model, --permission-mode, then extraArgs) so tests can do deepEqual.
 */
export function buildClaudeArgs(config: ClaudePtyConfig): string[] {
  const args: string[] = [];
  if (config.model)          args.push('--model',           config.model);
  if (config.permissionMode) args.push('--permission-mode', config.permissionMode);
  if (config.extraArgs)      args.push(...config.extraArgs);
  return args;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test test/pty/claude-args.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
rtk git add src/pty/claude-args.ts test/pty/claude-args.test.mjs
rtk git commit -m "feat(pty): buildClaudeArgs maps ClaudePtyConfig to CLI flags"
```

---

### Task A4: TDD `buildCopilotArgs`

**Files:**
- Create: `test/pty/copilot-args.test.mjs`
- Create: `src/pty/copilot-args.ts`

- [ ] **Step 1: Write the failing test**

```js
// test/pty/copilot-args.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCopilotArgs } from '../../dist/esm/pty/copilot-args.js';

test('buildCopilotArgs returns empty array for empty config', () => {
  assert.deepEqual(buildCopilotArgs({}), []);
});

test('buildCopilotArgs maps model to --model', () => {
  assert.deepEqual(buildCopilotArgs({ model: 'gpt-5.3' }), ['--model', 'gpt-5.3']);
});

test('buildCopilotArgs maps boolean flags', () => {
  assert.deepEqual(
    buildCopilotArgs({ allowAll: true, allowAllPaths: true, allowAllUrls: true, noAskUser: true }),
    ['--allow-all', '--allow-all-paths', '--allow-all-urls', '--no-ask-user'],
  );
});

test('buildCopilotArgs repeats --allow-tool for each entry', () => {
  assert.deepEqual(
    buildCopilotArgs({ allowTools: ['shell(git:*)', 'write(src/*)'] }),
    ['--allow-tool', 'shell(git:*)', '--allow-tool', 'write(src/*)'],
  );
});

test('buildCopilotArgs repeats --deny-tool for each entry', () => {
  assert.deepEqual(
    buildCopilotArgs({ denyTools: ['shell(git push)'] }),
    ['--deny-tool', 'shell(git push)'],
  );
});

test('buildCopilotArgs repeats --add-dir for each entry', () => {
  assert.deepEqual(
    buildCopilotArgs({ addDir: ['/a', '/b'] }),
    ['--add-dir', '/a', '--add-dir', '/b'],
  );
});

test('buildCopilotArgs appends extraArgs last', () => {
  assert.deepEqual(
    buildCopilotArgs({ model: 'm', extraArgs: ['--share'] }),
    ['--model', 'm', '--share'],
  );
});

test('buildCopilotArgs combines all categories in stable order', () => {
  assert.deepEqual(
    buildCopilotArgs({
      model: 'm',
      allowAll: true,
      allowTools: ['t1'],
      denyTools: ['t2'],
      addDir: ['/d'],
      extraArgs: ['--x'],
    }),
    ['--model', 'm', '--allow-all', '--allow-tool', 't1', '--deny-tool', 't2', '--add-dir', '/d', '--x'],
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test test/pty/copilot-args.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/pty/copilot-args.ts
import type { CopilotPtyConfig } from './types.js';

/**
 * Map CopilotPtyConfig to Copilot CLI flags. Pure function.
 * Order: --model, boolean flags, repeated allow/deny/add-dir, extraArgs.
 */
export function buildCopilotArgs(config: CopilotPtyConfig): string[] {
  const args: string[] = [];
  if (config.model)         args.push('--model', config.model);
  if (config.allowAll)      args.push('--allow-all');
  if (config.allowAllPaths) args.push('--allow-all-paths');
  if (config.allowAllUrls)  args.push('--allow-all-urls');
  if (config.noAskUser)     args.push('--no-ask-user');
  for (const t of config.allowTools ?? []) args.push('--allow-tool', t);
  for (const t of config.denyTools  ?? []) args.push('--deny-tool',  t);
  for (const d of config.addDir     ?? []) args.push('--add-dir',    d);
  if (config.extraArgs)     args.push(...config.extraArgs);
  return args;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test test/pty/copilot-args.test.mjs`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
rtk git add src/pty/copilot-args.ts test/pty/copilot-args.test.mjs
rtk git commit -m "feat(pty): buildCopilotArgs maps CopilotPtyConfig to CLI flags"
```

---

### Task A5: TDD `PtyClientImpl`

The client wraps `node-pty.IPty`. We mock the pty module via constructor injection. The mock IPty is a simple EventEmitter-like stub.

**Files:**
- Create: `test/pty/client.test.mjs`
- Create: `src/pty/client.ts`

- [ ] **Step 1: Write the failing test**

```js
// test/pty/client.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PtyClientImpl } from '../../dist/esm/pty/client.js';

/** Mock IPty: emits 'data' and 'exit' via internal EventEmitter; records writes. */
function makeMockPty({ pid = 1234 } = {}) {
  const emitter = new EventEmitter();
  const writes = [];
  const resizes = [];
  const kills = [];
  const ipty = {
    pid,
    cols: 80,
    rows: 24,
    write: (data) => { writes.push(data); },
    resize: (cols, rows) => { resizes.push([cols, rows]); ipty.cols = cols; ipty.rows = rows; },
    kill: (sig) => { kills.push(sig); },
    onData:    (cb) => emitter.on('data', cb),
    onExit:    (cb) => emitter.on('exit', cb),
  };
  return { ipty, emitter, writes, resizes, kills };
}

/** Mock pty module: spawn returns the configured IPty mock. */
function makeMockPtyModule(ipty) {
  return {
    spawn: (_bin, _args, _opts) => ipty,
  };
}

test('PtyClientImpl exposes provider, pid, cols, rows after start', async () => {
  const { ipty } = makeMockPty({ pid: 9999 });
  const pty = makeMockPtyModule(ipty);
  const client = new PtyClientImpl({
    provider: 'claude', pty, bin: 'claude', args: [],
    cwd: '/tmp', cols: 100, rows: 30, env: {},
  });
  await client.start();
  assert.equal(client.provider, 'claude');
  assert.equal(client.pid, 9999);
  assert.equal(client.cols, 100);
  assert.equal(client.rows, 30);
});

test('PtyClientImpl re-emits data as Buffer', async () => {
  const { ipty, emitter } = makeMockPty();
  const client = new PtyClientImpl({
    provider: 'claude', pty: makeMockPtyModule(ipty), bin: 'claude', args: [],
    cwd: '/tmp', cols: 80, rows: 24, env: {},
  });
  await client.start();
  const seen = [];
  client.on('data', b => seen.push(b));
  emitter.emit('data', 'hello');
  assert.equal(seen.length, 1);
  assert.ok(Buffer.isBuffer(seen[0]), 'data is Buffer');
  assert.equal(seen[0].toString('utf8'), 'hello');
});

test('PtyClientImpl write forwards to inner pty', async () => {
  const { ipty, writes } = makeMockPty();
  const client = new PtyClientImpl({
    provider: 'claude', pty: makeMockPtyModule(ipty), bin: 'claude', args: [],
    cwd: '/tmp', cols: 80, rows: 24, env: {},
  });
  await client.start();
  client.write('abc');
  client.write(Buffer.from('def'));
  assert.deepEqual(writes.map(String), ['abc', 'def']);
});

test('PtyClientImpl resize updates cols/rows and forwards', async () => {
  const { ipty, resizes } = makeMockPty();
  const client = new PtyClientImpl({
    provider: 'claude', pty: makeMockPtyModule(ipty), bin: 'claude', args: [],
    cwd: '/tmp', cols: 80, rows: 24, env: {},
  });
  await client.start();
  client.resize(120, 40);
  assert.equal(client.cols, 120);
  assert.equal(client.rows, 40);
  assert.deepEqual(resizes, [[120, 40]]);
});

test('PtyClientImpl kill forwards default SIGHUP and explicit signal', async () => {
  const { ipty, kills } = makeMockPty();
  const client = new PtyClientImpl({
    provider: 'claude', pty: makeMockPtyModule(ipty), bin: 'claude', args: [],
    cwd: '/tmp', cols: 80, rows: 24, env: {},
  });
  await client.start();
  client.kill();
  client.kill('SIGTERM');
  assert.deepEqual(kills, ['SIGHUP', 'SIGTERM']);
});

test('PtyClientImpl close sends SIGHUP and resolves on exit', async () => {
  const { ipty, emitter, kills } = makeMockPty();
  const client = new PtyClientImpl({
    provider: 'claude', pty: makeMockPtyModule(ipty), bin: 'claude', args: [],
    cwd: '/tmp', cols: 80, rows: 24, env: {},
  });
  await client.start();
  const closed = client.close();
  // simulate the underlying process exiting
  setImmediate(() => emitter.emit('exit', { exitCode: 0, signal: undefined }));
  await closed;
  assert.deepEqual(kills, ['SIGHUP']);
});

test('PtyClientImpl exit event reports code and signal', async () => {
  const { ipty, emitter } = makeMockPty();
  const client = new PtyClientImpl({
    provider: 'claude', pty: makeMockPtyModule(ipty), bin: 'claude', args: [],
    cwd: '/tmp', cols: 80, rows: 24, env: {},
  });
  await client.start();
  let exitCalls = [];
  client.on('exit', (code, signal) => exitCalls.push({ code, signal }));
  emitter.emit('exit', { exitCode: 137, signal: 'SIGKILL' });
  assert.deepEqual(exitCalls, [{ code: 137, signal: 'SIGKILL' }]);
});

test('PtyClientImpl pid is null after exit', async () => {
  const { ipty, emitter } = makeMockPty();
  const client = new PtyClientImpl({
    provider: 'claude', pty: makeMockPtyModule(ipty), bin: 'claude', args: [],
    cwd: '/tmp', cols: 80, rows: 24, env: {},
  });
  await client.start();
  emitter.emit('exit', { exitCode: 0, signal: undefined });
  assert.equal(client.pid, null);
});

test('PtyClientImpl start is idempotent', async () => {
  const { ipty } = makeMockPty();
  const pty = makeMockPtyModule(ipty);
  let spawnCount = 0;
  const wrappedPty = { spawn: (...a) => { spawnCount++; return pty.spawn(...a); } };
  const client = new PtyClientImpl({
    provider: 'claude', pty: wrappedPty, bin: 'claude', args: [],
    cwd: '/tmp', cols: 80, rows: 24, env: {},
  });
  await client.start();
  await client.start();
  assert.equal(spawnCount, 1, 'spawn called only once');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test test/pty/client.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/pty/client.ts
import { EventEmitter } from 'node:events';
import type { PtyClient } from './types.js';

/**
 * Minimal subset of node-pty's IPty surface we depend on. Lets us
 * inject mocks in tests without depending on node-pty types here.
 */
interface PtyHandle {
  pid: number;
  cols: number;
  rows: number;
  write(data: string | Buffer): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(cb: (data: string) => void): void;
  onExit(cb: (e: { exitCode: number; signal?: number | string }) => void): void;
}

interface PtyModuleLike {
  spawn(
    bin: string,
    args: string[],
    opts: { cwd: string; cols: number; rows: number; env: NodeJS.ProcessEnv; name?: string },
  ): PtyHandle;
}

export interface PtyClientImplOptions {
  provider: 'claude' | 'copilot';
  pty: PtyModuleLike;
  bin: string;
  args: string[];
  cwd: string;
  cols: number;
  rows: number;
  env: NodeJS.ProcessEnv;
}

/**
 * Provider-agnostic PTY client wrapping a node-pty IPty handle.
 * Constructed by the factory; not exported as a public class.
 */
export class PtyClientImpl extends EventEmitter implements PtyClient {
  readonly provider: 'claude' | 'copilot';
  private _pid: number | null = null;
  private _cols: number;
  private _rows: number;
  private readonly opts: PtyClientImplOptions;
  private handle: PtyHandle | null = null;

  constructor(opts: PtyClientImplOptions) {
    super();
    this.opts = opts;
    this.provider = opts.provider;
    this._cols = opts.cols;
    this._rows = opts.rows;
  }

  get pid(): number | null { return this._pid; }
  get cols(): number { return this._cols; }
  get rows(): number { return this._rows; }

  async start(): Promise<void> {
    if (this.handle) return;
    const handle = this.opts.pty.spawn(this.opts.bin, this.opts.args, {
      cwd: this.opts.cwd,
      cols: this.opts.cols,
      rows: this.opts.rows,
      env: this.opts.env,
      name: 'xterm-256color',
    });
    this.handle = handle;
    this._pid = handle.pid;
    handle.onData((data) => {
      this.emit('data', Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'));
    });
    handle.onExit(({ exitCode, signal }) => {
      this._pid = null;
      const sig = typeof signal === 'string' ? (signal as NodeJS.Signals) : null;
      const code = typeof exitCode === 'number' ? exitCode : null;
      this.emit('exit', code, sig);
    });
  }

  write(data: string | Buffer): void {
    this.handle?.write(data);
  }

  resize(cols: number, rows: number): void {
    this._cols = cols;
    this._rows = rows;
    this.handle?.resize(cols, rows);
  }

  kill(signal: NodeJS.Signals = 'SIGHUP'): void {
    this.handle?.kill(signal);
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.handle || this._pid === null) { resolve(); return; }
      this.once('exit', () => resolve());
      this.handle.kill('SIGHUP');
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test test/pty/client.test.mjs`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
rtk git add src/pty/client.ts test/pty/client.test.mjs
rtk git commit -m "feat(pty): PtyClientImpl wraps node-pty IPty with EventEmitter surface"
```

---

### Task A6: TDD `createPtyClient` factory

**Files:**
- Create: `test/pty/factory.test.mjs`
- Create: `src/pty/factory.ts`

- [ ] **Step 1: Write the failing test**

```js
// test/pty/factory.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createPtyClient } from '../../dist/esm/pty/factory.js';
import { PtyDependencyMissingError, PtyBinaryNotFoundError } from '../../dist/esm/pty/errors.js';

function makeMockPtyModule({ onSpawn } = {}) {
  return {
    spawn: (bin, args, opts) => {
      onSpawn?.({ bin, args, opts });
      const emitter = new EventEmitter();
      return {
        pid: 1, cols: opts.cols, rows: opts.rows,
        write: () => {}, resize: () => {}, kill: () => {},
        onData: (cb) => emitter.on('data', cb),
        onExit: (cb) => emitter.on('exit', cb),
        _emitter: emitter,
      };
    },
  };
}

test('createPtyClient dispatches to claude with mapped args', async () => {
  let captured = null;
  const pty = makeMockPtyModule({ onSpawn: (info) => { captured = info; } });
  const client = await createPtyClient(
    { provider: 'claude', cwd: '/work', model: 'm', cols: 100, rows: 30 },
    { loadPty: async () => pty, exists: async () => true },
  );
  assert.equal(client.provider, 'claude');
  assert.equal(captured.bin, 'claude');
  assert.deepEqual(captured.args, ['--model', 'm']);
  assert.equal(captured.opts.cwd, '/work');
  assert.equal(captured.opts.cols, 100);
  assert.equal(captured.opts.rows, 30);
});

test('createPtyClient dispatches to copilot with mapped args', async () => {
  let captured = null;
  const pty = makeMockPtyModule({ onSpawn: (info) => { captured = info; } });
  const client = await createPtyClient(
    { provider: 'copilot', cwd: '/work', model: 'gpt-5.3', allowAll: true },
    { loadPty: async () => pty, exists: async () => true },
  );
  assert.equal(client.provider, 'copilot');
  assert.equal(captured.bin, 'copilot');
  assert.deepEqual(captured.args, ['--model', 'gpt-5.3', '--allow-all']);
});

test('createPtyClient defaults to cwd=process.cwd, cols=80, rows=24', async () => {
  let captured = null;
  const pty = makeMockPtyModule({ onSpawn: (info) => { captured = info; } });
  await createPtyClient(
    { provider: 'claude' },
    { loadPty: async () => pty, exists: async () => true },
  );
  assert.equal(captured.opts.cwd, process.cwd());
  assert.equal(captured.opts.cols, 80);
  assert.equal(captured.opts.rows, 24);
});

test('createPtyClient merges env on top of process.env', async () => {
  let captured = null;
  const pty = makeMockPtyModule({ onSpawn: (info) => { captured = info; } });
  await createPtyClient(
    { provider: 'claude', env: { MY_VAR: 'x' } },
    { loadPty: async () => pty, exists: async () => true },
  );
  assert.equal(captured.opts.env.MY_VAR, 'x');
  assert.equal(captured.opts.env.PATH, process.env.PATH, 'process.env carried through');
});

test('createPtyClient honors bin override', async () => {
  let captured = null;
  const pty = makeMockPtyModule({ onSpawn: (info) => { captured = info; } });
  await createPtyClient(
    { provider: 'claude', bin: '/usr/local/bin/claude' },
    { loadPty: async () => pty, exists: async () => true },
  );
  assert.equal(captured.bin, '/usr/local/bin/claude');
});

test('createPtyClient throws PtyDependencyMissingError when loadPty rejects', async () => {
  await assert.rejects(
    createPtyClient(
      { provider: 'claude' },
      { loadPty: async () => { throw new Error('Cannot find module \'node-pty\''); }, exists: async () => true },
    ),
    (err) => err instanceof PtyDependencyMissingError && /node-pty/.test(err.message),
  );
});

test('createPtyClient throws PtyBinaryNotFoundError when binary missing', async () => {
  const pty = makeMockPtyModule();
  await assert.rejects(
    createPtyClient(
      { provider: 'claude', bin: '/no/such/claude' },
      { loadPty: async () => pty, exists: async () => false },
    ),
    (err) => err instanceof PtyBinaryNotFoundError && err.bin === '/no/such/claude',
  );
});

test('createPtyClient throws on unknown provider', async () => {
  const pty = makeMockPtyModule();
  await assert.rejects(
    createPtyClient(
      { provider: 'not-a-provider', cwd: '/tmp' },
      { loadPty: async () => pty, exists: async () => true },
    ),
    /Unknown PTY provider: not-a-provider/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test test/pty/factory.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/pty/factory.ts
import { access } from 'node:fs/promises';
import type { PtyClient, PtyClientConfig } from './types.js';
import { PtyClientImpl } from './client.js';
import {
  PtyDependencyMissingError,
  PtyBinaryNotFoundError,
  PtySpawnError,
} from './errors.js';
import { buildClaudeArgs }  from './claude-args.js';
import { buildCopilotArgs } from './copilot-args.js';

/** node-pty module shape (subset). Loaded lazily. */
type PtyModule = { spawn: (bin: string, args: string[], opts: any) => any };

/** Test-injection seam. Not part of the public API. */
export interface PtyFactoryInternals {
  loadPty?: () => Promise<PtyModule>;
  exists?: (path: string) => Promise<boolean>;
}

let cachedPtyModule: PtyModule | null = null;

async function defaultLoadPty(): Promise<PtyModule> {
  if (cachedPtyModule) return cachedPtyModule;
  try {
    const mod = await import('node-pty');
    cachedPtyModule = mod as PtyModule;
    return cachedPtyModule;
  } catch (err) {
    throw new PtyDependencyMissingError(
      'PTY mode requires node-pty. Install it as a peer dependency: ' +
      '`npm install node-pty`. For Electron apps, rebuild against your ' +
      'Electron version: `npx @electron/rebuild`.',
      { cause: err },
    );
  }
}

async function defaultExists(path: string): Promise<boolean> {
  // Absolute path — direct check.
  if (path.includes('/') || path.includes('\\')) {
    try { await access(path); return true; } catch { return false; }
  }
  // PATH lookup — let the OS resolve at spawn time. Treat as existing.
  return true;
}

/**
 * Construct and start a PTY-mode client for the chosen provider.
 * Spawns the provider's binary in a real pseudo-terminal via node-pty
 * and returns a started client emitting raw bytes.
 *
 * @param config - Discriminated by `provider`.
 * @param internals - Test-only injection. Do not pass in production code.
 *
 * @example
 * const pty = await createPtyClient({ provider: 'claude', cwd: process.cwd() });
 * pty.on('data', (b) => process.stdout.write(b));
 *
 * @throws {PtyDependencyMissingError} if node-pty is not installed.
 * @throws {PtyBinaryNotFoundError} if the provider's binary cannot be located.
 * @throws {PtySpawnError} if node-pty.spawn() fails.
 */
export async function createPtyClient(
  config: PtyClientConfig,
  internals: PtyFactoryInternals = {},
): Promise<PtyClient> {
  const loadPty = internals.loadPty ?? defaultLoadPty;
  const exists  = internals.exists  ?? defaultExists;

  let pty: PtyModule;
  try {
    pty = await loadPty();
  } catch (err) {
    if (err instanceof PtyDependencyMissingError) throw err;
    throw new PtyDependencyMissingError(
      'PTY mode requires node-pty. Install it as a peer dependency: ' +
      '`npm install node-pty`.',
      { cause: err },
    );
  }

  const { args, defaultBin } = buildArgs(config);
  const bin = config.bin ?? defaultBin;

  if (!(await exists(bin))) {
    throw new PtyBinaryNotFoundError(
      bin,
      `PTY binary not found: ${bin}. Ensure it is installed and on PATH, ` +
      'or pass `bin` in the config.',
    );
  }

  const client = new PtyClientImpl({
    provider: config.provider,
    pty,
    bin,
    args,
    cwd: config.cwd ?? process.cwd(),
    cols: config.cols ?? 80,
    rows: config.rows ?? 24,
    env: { ...process.env, ...config.env },
  });

  try {
    await client.start();
  } catch (err) {
    throw new PtySpawnError(
      `Failed to spawn PTY for ${config.provider}: ${(err as Error)?.message ?? err}`,
      { cause: err },
    );
  }
  return client;
}

function buildArgs(config: PtyClientConfig): { args: string[]; defaultBin: string } {
  switch (config.provider) {
    case 'claude': {
      const { provider: _p, bin: _b, ...rest } = config;
      void _p; void _b;
      return { args: buildClaudeArgs(rest), defaultBin: 'claude' };
    }
    case 'copilot': {
      const { provider: _p, bin: _b, ...rest } = config;
      void _p; void _b;
      return { args: buildCopilotArgs(rest), defaultBin: 'copilot' };
    }
    default: {
      const _exhaustive: never = config;
      throw new Error(
        `Unknown PTY provider: ${(_exhaustive as { provider: string }).provider}`,
      );
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test test/pty/factory.test.mjs`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
rtk git add src/pty/factory.ts test/pty/factory.test.mjs
rtk git commit -m "feat(pty): createPtyClient factory with lazy node-pty loader"
```

---

### Task A7: PTY barrel

**Files:**
- Create: `src/pty/index.ts`

- [ ] **Step 1: Write the file**

```ts
// src/pty/index.ts
export type {
  PtyClient,
  PtyClientConfig,
  PtyCommonConfig,
  ClaudePtyConfig,
  CopilotPtyConfig,
} from './types.js';
export {
  PtyError,
  PtyDependencyMissingError,
  PtyBinaryNotFoundError,
  PtySpawnError,
} from './errors.js';
export { createPtyClient } from './factory.js';
// client.ts and *-args.ts intentionally NOT exported — internal.
```

- [ ] **Step 2: Verify typecheck and build**

Run: `npm run build`
Expected: PASS, `dist/esm/pty/index.js` and `dist/types/pty/index.d.ts` exist.

- [ ] **Step 3: Commit**

```bash
rtk git add src/pty/index.ts
rtk git commit -m "feat(pty): module barrel exporting public PTY surface"
```

---

## Phase B — Wire-up to package surface

### Task B1: Top-level barrel re-exports

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Read current `src/index.ts`**

```bash
rtk read src/index.ts
```

- [ ] **Step 2: Append PTY exports**

Edit `src/index.ts` — at the end of the file, add:

```ts

// PTY transport (Phase 3)
export type {
  PtyClient,
  PtyClientConfig,
  PtyCommonConfig,
  ClaudePtyConfig,
  CopilotPtyConfig,
} from './pty/index.js';
export {
  PtyError,
  PtyDependencyMissingError,
  PtyBinaryNotFoundError,
  PtySpawnError,
  createPtyClient,
} from './pty/index.js';
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Quick smoke test for the top-level export**

Append to `test/barrel-exports.test.mjs`:

```js

test('top-level barrel exports createPtyClient', async () => {
  const mod = await import('../dist/esm/index.js');
  assert.equal(typeof mod.createPtyClient, 'function');
  assert.equal(typeof mod.PtyDependencyMissingError, 'function');
});
```

Run: `node --test test/barrel-exports.test.mjs`
Expected: PASS (3 tests, including the new one).

- [ ] **Step 5: Commit**

```bash
rtk git add src/index.ts test/barrel-exports.test.mjs
rtk git commit -m "feat(pty): re-export PTY surface from top-level barrel"
```

---

### Task B2: package.json — version, exports map, peer dep, integration script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Read current `package.json`**

```bash
rtk read package.json
```

- [ ] **Step 2: Edit `package.json`**

Apply these edits:

1. Bump `"version"`: `"0.5.0"` → `"0.6.0"`.
2. In `"exports"`, add a new entry alongside `"./copilot"`:

```json
,
"./pty": {
  "types": "./dist/types/pty/index.d.ts",
  "import": "./dist/esm/pty/index.js",
  "require": "./dist/cjs/pty/index.js"
}
```

3. After `"dependencies"`, add:

```json
,
"peerDependencies": {
  "node-pty": ">=1.0.0"
},
"peerDependenciesMeta": {
  "node-pty": { "optional": true }
}
```

4. In `"scripts"`, after `"integration:structured-multipass"`, add:

```json
,
"integration:pty": "npm run build && node ./scripts/integration-pty.mjs"
```

- [ ] **Step 3: Verify the file is valid JSON**

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).version)"`
Expected: `0.6.0`

- [ ] **Step 4: Verify `npm pack --dry-run` reports new exports**

Run: `npm pack --dry-run 2>&1 | rtk grep -E 'dist/(esm|cjs|types)/pty/index'`
Expected: lines for the three pty/index files.

- [ ] **Step 5: Commit**

```bash
rtk git add package.json
rtk git commit -m "chore(pty): bump 0.6.0, add ./pty subpath, optional node-pty peer dep"
```

---

### Task B3: Update Copilot transport's unsupported-PTY message

**Files:**
- Modify: `src/copilot/transport.ts:65-70`

- [ ] **Step 1: Read the section**

```bash
rtk read src/copilot/transport.ts
```

- [ ] **Step 2: Replace the message**

In `src/copilot/transport.ts`, find:

```ts
if (c.transport === 'pty') {
  throw new CopilotFeatureUnsupportedError(
    'transport',
    'PTY transport is reserved for Phase 2 and not yet implemented.',
  );
}
```

Replace with:

```ts
if (c.transport === 'pty') {
  throw new CopilotFeatureUnsupportedError(
    'transport',
    "CopilotClient does not support transport: 'pty'. " +
    "Use createPtyClient({ provider: 'copilot', ... }) from '@baoduy2412/ai-cli-client' instead.",
  );
}
```

- [ ] **Step 3: Build and run all tests**

Run: `npm test`
Expected: PASS (all existing tests + new PTY tests).

- [ ] **Step 4: Commit**

```bash
rtk git add src/copilot/transport.ts
rtk git commit -m "chore(copilot): point transport: 'pty' error at createPtyClient"
```

---

## Phase C — Type-level + integration tests

### Task C1: Type-level discriminated-union test

**Files:**
- Create: `test/pty/types.test-d.mts`

- [ ] **Step 1: Write the file**

```ts
// test/pty/types.test-d.mts
// Type-level test. This file should produce no compile errors when
// the discriminated union is correct, and produce errors at the marked
// lines when the union narrows incorrectly. Run via:
//   npx tsc --noEmit test/pty/types.test-d.mts --module nodenext --moduleResolution nodenext --target es2022 --strict --skipLibCheck

import type { PtyClientConfig } from '../../dist/types/pty/index.d.ts';

// OK: claude config with claude-only field
const okClaude: PtyClientConfig = { provider: 'claude', model: 'm', permissionMode: 'auto' };
void okClaude;

// OK: copilot config with copilot-only fields
const okCopilot: PtyClientConfig = { provider: 'copilot', model: 'm', allowAll: true, allowTools: ['t'] };
void okCopilot;

// @ts-expect-error allowTools is copilot-only
const bad1: PtyClientConfig = { provider: 'claude', allowTools: [] };
void bad1;

// @ts-expect-error permissionMode is claude-only
const bad2: PtyClientConfig = { provider: 'copilot', permissionMode: 'auto' };
void bad2;
```

- [ ] **Step 2: Run the type check**

Run:
```bash
npx tsc --noEmit test/pty/types.test-d.mts --module nodenext --moduleResolution nodenext --target es2022 --strict --skipLibCheck
```

Expected: PASS (no errors). Both `// @ts-expect-error` lines must be flagged by the union itself.

- [ ] **Step 3: Negative-control verification**

Temporarily remove the `// @ts-expect-error` comment above `bad1` and re-run. Expected: typecheck FAILS at that line. Restore the comment afterward.

- [ ] **Step 4: Commit**

```bash
rtk git add test/pty/types.test-d.mts
rtk git commit -m "test(pty): type-level discriminated-union check"
```

---

### Task C2: Integration smoke script

This runs against real `claude` and `copilot` binaries and the real `node-pty`. It skips silently when any prerequisite is missing, matching the existing `integration-copilot-smoke.mjs` pattern.

**Files:**
- Create: `scripts/integration-pty.mjs`

- [ ] **Step 1: Write the file**

```js
#!/usr/bin/env node
// scripts/integration-pty.mjs
//
// Integration smoke for the PTY transport. Skips silently when:
//   - node-pty is not installed (peer dep)
//   - the target binary is not on PATH
//   - the binary requires auth and credentials are absent (we still try once
//     and tolerate non-zero exit as long as some output came through)
//
// Usage:
//   npm run integration:pty
//   PTY_PROVIDER=claude npm run integration:pty   # only run claude
//   PTY_PROVIDER=copilot npm run integration:pty  # only run copilot

import { createPtyClient, PtyDependencyMissingError, PtyBinaryNotFoundError }
  from '../dist/esm/pty/index.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT_DIR = 'test-output/pty-smoke';
await mkdir(OUT_DIR, { recursive: true });

const which = process.env.PTY_PROVIDER;
const providers = which ? [which] : ['claude', 'copilot'];

let anyRan = false;

for (const provider of providers) {
  process.stdout.write(`\n--- ${provider} ---\n`);
  let client;
  try {
    client = await createPtyClient({ provider, cwd: process.cwd(), cols: 100, rows: 30 });
  } catch (err) {
    if (err instanceof PtyDependencyMissingError) {
      console.log(`SKIP (${provider}): node-pty not installed.`);
      continue;
    }
    if (err instanceof PtyBinaryNotFoundError) {
      console.log(`SKIP (${provider}): binary "${err.bin}" not found on PATH.`);
      continue;
    }
    throw err;
  }
  anyRan = true;
  let bytes = 0;
  client.on('data', (b) => { bytes += b.length; });

  // Wait briefly for any startup output, then close gracefully.
  await new Promise((r) => setTimeout(r, 1500));
  await client.close();

  await writeFile(
    join(OUT_DIR, `${provider}.json`),
    JSON.stringify({ provider, bytes, pid: client.pid }, null, 2),
  );
  console.log(`${provider}: received ${bytes} bytes; exit OK.`);
  if (bytes === 0) {
    console.warn(`WARN (${provider}): no output captured. Binary may have exited immediately.`);
  }
}

if (!anyRan) {
  console.log('\nSKIP: no PTY providers were runnable in this environment.');
  process.exit(0);
}
console.log('\nDone.');
```

- [ ] **Step 2: Make executable and run**

Run:
```bash
chmod +x scripts/integration-pty.mjs
npm run integration:pty
```

Expected: either prints SKIP for both providers (if node-pty isn't installed locally), or prints byte counts for whichever providers are available. Any uncaught error is a real failure.

- [ ] **Step 3: Commit**

```bash
rtk git add scripts/integration-pty.mjs
rtk git commit -m "test(pty): real-binary smoke for both providers; skips when prereqs missing"
```

---

## Phase D — Examples + docs

### Task D1: Claude PTY example

**Files:**
- Create: `examples/pty/basic-claude.ts`

- [ ] **Step 1: Write the file**

```ts
// examples/pty/basic-claude.ts
//
// Spawn `claude` in a real PTY, pipe its output to stdout, and forward
// stdin keystrokes (and SIGWINCH resize events) back into the PTY.
// Run with:
//   npm run build && node --import tsx examples/pty/basic-claude.ts
//
// You can ^C to kill, or type /exit inside the Claude UI.

import { createPtyClient } from '@baoduy2412/ai-cli-client';

async function main() {
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows    || 24;

  const pty = await createPtyClient({
    provider: 'claude',
    cwd: process.cwd(),
    cols,
    rows,
  });

  pty.on('data',  (bytes: Buffer) => process.stdout.write(bytes));
  pty.on('exit',  (code) => { process.exit(code ?? 0); });
  pty.on('error', (err)  => { console.error('PTY error:', err); process.exit(1); });

  // Forward stdin to the PTY in raw mode.
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on('data', (chunk: Buffer) => pty.write(chunk));

  // Forward terminal resize.
  process.stdout.on('resize', () => {
    pty.resize(process.stdout.columns ?? cols, process.stdout.rows ?? rows);
  });
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Commit**

```bash
rtk git add examples/pty/basic-claude.ts
rtk git commit -m "docs(examples): pty/basic-claude — spawn claude in a PTY"
```

---

### Task D2: Copilot PTY example

**Files:**
- Create: `examples/pty/basic-copilot.ts`

- [ ] **Step 1: Write the file**

```ts
// examples/pty/basic-copilot.ts
//
// Spawn `copilot` in a real PTY. Otherwise identical to basic-claude.ts.
// Run with:
//   npm run build && node --import tsx examples/pty/basic-copilot.ts

import { createPtyClient } from '@baoduy2412/ai-cli-client';

async function main() {
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows    || 24;

  const pty = await createPtyClient({
    provider: 'copilot',
    cwd: process.cwd(),
    cols,
    rows,
  });

  pty.on('data',  (bytes: Buffer) => process.stdout.write(bytes));
  pty.on('exit',  (code) => { process.exit(code ?? 0); });
  pty.on('error', (err)  => { console.error('PTY error:', err); process.exit(1); });

  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on('data', (chunk: Buffer) => pty.write(chunk));

  process.stdout.on('resize', () => {
    pty.resize(process.stdout.columns ?? cols, process.stdout.rows ?? rows);
  });
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Commit**

```bash
rtk git add examples/pty/basic-copilot.ts
rtk git commit -m "docs(examples): pty/basic-copilot — spawn copilot in a PTY"
```

---

### Task D3: Electron main-process integration sketch

**Files:**
- Create: `examples/pty/electron-main.ts`

- [ ] **Step 1: Write the file**

```ts
// examples/pty/electron-main.ts
//
// Sketch of the Electron main-process integration. Demonstrates the IPC
// pattern for forwarding bytes between the PTY and the renderer process.
// Renderer rendering (xterm.js or custom TUI) is intentionally out of scope.
//
// Wiring:
//   - main process owns the PtyClient (this file)
//   - IPC channel "pty:data"   — main → renderer (Buffer)
//   - IPC channel "pty:exit"   — main → renderer ({code, signal})
//   - IPC channel "pty:input"  — renderer → main (Buffer of keystrokes)
//   - IPC channel "pty:resize" — renderer → main ({cols, rows})

import { app, BrowserWindow, ipcMain } from 'electron';
import { createPtyClient, type PtyClient } from '@baoduy2412/ai-cli-client';

let pty: PtyClient | null = null;

async function createPty(window: BrowserWindow) {
  pty = await createPtyClient({
    provider: 'claude',           // or 'copilot'
    cwd: app.getPath('userData'),
    cols: 120,
    rows: 30,
  });

  pty.on('data', (bytes) => window.webContents.send('pty:data', bytes));
  pty.on('exit', (code, signal) => window.webContents.send('pty:exit', { code, signal }));

  ipcMain.on('pty:input',  (_, chunk: Buffer)              => pty?.write(chunk));
  ipcMain.on('pty:resize', (_, cols: number, rows: number) => pty?.resize(cols, rows));
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 800 });
  await win.loadFile('renderer.html');
  await createPty(win);
});

app.on('window-all-closed', async () => {
  await pty?.close();
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 2: Commit**

```bash
rtk git add examples/pty/electron-main.ts
rtk git commit -m "docs(examples): pty/electron-main — main-process IPC pattern sketch"
```

---

### Task D4: Consumer-facing PTY guide

**Files:**
- Create: `docs/pty-transport.md`

- [ ] **Step 1: Write the file**

```markdown
# PTY transport

The PTY transport spawns the underlying CLI (`claude`, `copilot`) in a real
OS-level pseudo-terminal and exposes raw bytes. This is for **daemon-layer**
embedding — typically an Electron main process forwarding bytes to a
renderer that handles UI (xterm.js, custom TUI, anything).

> **It is not** related to `AICliClient` / `ClaudeClient` / `CopilotClient`.
> Those structured surfaces remain available for non-TTY consumers.

## Install

PTY mode requires `node-pty`, which is an **optional peer dependency**
(it's a native module — most consumers don't need it):

```bash
npm install @baoduy2412/ai-cli-client node-pty
```

For Electron apps, rebuild `node-pty` against your Electron version:

```bash
npx @electron/rebuild
```

If `node-pty` is missing at runtime, `createPtyClient` throws
`PtyDependencyMissingError` with the install instructions.

## Quickstart

```ts
import { createPtyClient } from '@baoduy2412/ai-cli-client';

const pty = await createPtyClient({
  provider: 'claude',         // or 'copilot'
  cwd: process.cwd(),
  cols: 120,
  rows: 30,
});

pty.on('data', (bytes) => process.stdout.write(bytes));
pty.on('exit', (code) => process.exit(code ?? 0));

if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.on('data', (chunk) => pty.write(chunk));
process.stdout.on('resize', () => {
  pty.resize(process.stdout.columns ?? 80, process.stdout.rows ?? 24);
});
```

## Electron pattern

The main process owns the `PtyClient`. The renderer renders. They
communicate via IPC.

| Channel | Direction | Payload |
|---|---|---|
| `pty:data`   | main → renderer | `Buffer` |
| `pty:exit`   | main → renderer | `{ code, signal }` |
| `pty:input`  | renderer → main | `Buffer` (keystrokes) |
| `pty:resize` | renderer → main | `(cols, rows)` |

A complete sketch lives at [`examples/pty/electron-main.ts`](../examples/pty/electron-main.ts).

## Configuration

```ts
type PtyClientConfig =
  | ({ provider: 'claude' }  & ClaudePtyConfig)
  | ({ provider: 'copilot' } & CopilotPtyConfig);
```

### Common fields (both providers)

| Field | Default | Notes |
|---|---|---|
| `cwd` | `process.cwd()` | Working directory of the spawned binary. |
| `cols` | `80` | Initial PTY width. |
| `rows` | `24` | Initial PTY height. |
| `env` | — | Merged onto `process.env`. |
| `bin` | provider name on PATH | Override binary path; useful for non-standard installs. |
| `extraArgs` | — | Appended after mapped flags. Escape hatch for unmapped flags. |

### Claude-specific

| Field | CLI flag |
|---|---|
| `model` | `--model <value>` |
| `permissionMode` | `--permission-mode <value>` |

### Copilot-specific

| Field | CLI flag |
|---|---|
| `model` | `--model <value>` |
| `allowAll` | `--allow-all` (alias of `--yolo`) |
| `allowAllPaths` | `--allow-all-paths` |
| `allowAllUrls` | `--allow-all-urls` |
| `noAskUser` | `--no-ask-user` |
| `allowTools` | repeated `--allow-tool <pattern>` |
| `denyTools` | repeated `--deny-tool <pattern>` |
| `addDir` | repeated `--add-dir <path>` |

The canonical list of flags is `claude --help` / `copilot help`. Anything
not listed above is reachable via `extraArgs`.

## Errors

| Error | Code | Cause |
|---|---|---|
| `PtyDependencyMissingError` | `PTY_DEP_MISSING` | `node-pty` not installed. |
| `PtyBinaryNotFoundError` | `PTY_BINARY_NOT_FOUND` | `bin` (or `claude`/`copilot` on PATH) does not exist. |
| `PtySpawnError` | `PTY_SPAWN_FAILED` | `node-pty.spawn()` threw — usually permissions or platform issues. |

## Troubleshooting

- **`node-pty` install fails on Linux:** install the build toolchain
  (`apt-get install build-essential python3` or equivalent).
- **Electron renderer is blank / receives no data:** make sure you
  forward bytes from the main process to the renderer via IPC, and
  that the renderer attaches its `xterm.write` callback before any
  data arrives. The factory auto-starts the client; attach IPC
  listeners synchronously after `await createPtyClient(...)`.
- **`PtyBinaryNotFoundError` even though the binary is on my PATH:**
  Electron `process.env.PATH` differs from the user's shell PATH.
  Pass an absolute `bin` or merge the shell PATH into `env` explicitly.
- **Output is garbled / no colors:** the consumer must render ANSI
  escape codes. Pipe to xterm.js, a TUI library, or strip with
  `strip-ansi` if logging.

## Limitations

- `node-pty` does not expose the same surface for SDK-managed CLIs.
  Copilot PTY mode bypasses `@github/copilot-sdk` and spawns the
  `copilot` binary directly. BYOK and SDK-only features are not
  available in PTY mode — use `CopilotClient` for those.
- Sessions are managed by the CLI itself (slash commands inside the
  interactive UI). For programmatic session resumption, pass
  `extraArgs: ['--resume', '<id>']` (Claude) or use the Copilot UI's
  `/resume` command.
```

- [ ] **Step 2: Commit**

```bash
rtk git add docs/pty-transport.md
rtk git commit -m "docs(pty): consumer guide — install, Electron, config, errors, troubleshooting"
```

---

### Task D5: README PTY section

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the current README**

```bash
rtk read README.md
```

- [ ] **Step 2: Insert the new section**

Add this section just before the existing `## Versioning` heading:

```markdown
## PTY Transport

For daemon-layer use cases (typically an Electron main process), spawn
the underlying CLI in a real OS-level pseudo-terminal and forward raw
bytes to a renderer of your choice. The library does not render — that's
the consumer's job (xterm.js, custom TUI, anything).

```ts
import { createPtyClient } from '@baoduy2412/ai-cli-client';

const pty = await createPtyClient({
  provider: 'claude',         // or 'copilot'
  cwd: process.cwd(),
  cols: 120, rows: 30,
});

pty.on('data', bytes => process.stdout.write(bytes));
process.stdin.on('data', chunk => pty.write(chunk));
process.stdout.on('resize', () => pty.resize(process.stdout.columns!, process.stdout.rows!));
```

PTY mode requires `node-pty` as an **optional peer dependency**:

```bash
npm install node-pty
```

For Electron, rebuild against your Electron version:
`npx @electron/rebuild`.

See [`docs/pty-transport.md`](./docs/pty-transport.md) for the full
guide, the [Electron IPC pattern](./examples/pty/electron-main.ts), and
configuration / troubleshooting tables.
```

- [ ] **Step 3: Commit**

```bash
rtk git add README.md
rtk git commit -m "docs(readme): add PTY Transport section"
```

---

### Task D6: provider-capabilities.md PTY row

**Files:**
- Modify: `docs/provider-capabilities.md`

- [ ] **Step 1: Read the current file**

```bash
rtk read docs/provider-capabilities.md
```

- [ ] **Step 2: Append a new section before "Future work"**

Insert this section just before the existing `## Future work` heading:

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
rtk git add docs/provider-capabilities.md
rtk git commit -m "docs(capabilities): document PTY transport row"
```

---

### Task D7: CHANGELOG 0.6.0 entry

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Read the current CHANGELOG**

```bash
rtk read CHANGELOG.md
```

- [ ] **Step 2: Insert the new entry at the top**

Insert this entry above the existing `## 0.5.0 — 2026-04-29` heading:

```markdown
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
- New `./pty` subpath: `import { createPtyClient } from '@baoduy2412/ai-cli-client/pty'`.
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

```

- [ ] **Step 3: Commit**

```bash
rtk git add CHANGELOG.md
rtk git commit -m "docs(changelog): 0.6.0 — PTY transport"
```

---

## Phase E — Pre-release validation

### Task E1: Full build + test sweep

- [ ] **Step 1: Clean build**

Run: `npm run build`
Expected: PASS, dist/ regenerated.

- [ ] **Step 2: Full unit test suite (no node-pty installed)**

Run: `npm test`
Expected: PASS. Crucially, the factory unit tests pass even without `node-pty` installed because we use the `internals.loadPty` injection seam.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Type-level test**

Run:
```bash
npx tsc --noEmit test/pty/types.test-d.mts --module nodenext --moduleResolution nodenext --target es2022 --strict --skipLibCheck
```
Expected: PASS.

- [ ] **Step 5: Optional integration smoke (only if node-pty + binaries available)**

Run: `npm install node-pty --no-save && npm run integration:pty`
Expected: PASS or SKIP (skip is acceptable when prereqs missing).

- [ ] **Step 6: `npm pack --dry-run` final inspection**

Run: `npm pack --dry-run 2>&1 | rtk grep -E 'pty/'`
Expected: lines for `dist/esm/pty/index.js`, `dist/cjs/pty/index.js`, `dist/types/pty/index.d.ts`, plus the example files under `examples/pty/`.

---

### Task E2: Self-review against the spec

- [ ] **Step 1: Re-read the spec self-review checklist**

Run: `rtk read docs/superpowers/specs/2026-04-29-pty-transport-design.md` and find §12.

- [ ] **Step 2: Walk each bullet**

Confirm each item below — fix any gap before declaring done:

- [ ] All implementation tasks have completed commits.
- [ ] `npm test` (unit, no node-pty installed) passes.
- [ ] `npm run integration:pty` either passes or skips cleanly.
- [ ] `npm run build` clean.
- [ ] Both `provider: 'claude'` and `provider: 'copilot'` paths covered in `test/pty/factory.test.mjs`.
- [ ] `extraArgs` exercised in both `claude-args.test.mjs` and `copilot-args.test.mjs`.
- [ ] Cross-provider config fields fail to typecheck (see `types.test-d.mts`).
- [ ] README has the PTY section; doc link works.
- [ ] `docs/pty-transport.md` complete; no TBD markers.
- [ ] `docs/provider-capabilities.md` has the new PTY row.
- [ ] `CHANGELOG.md` `0.6.0` entry accurate.
- [ ] `package.json` version matches CHANGELOG.

- [ ] **Step 3: Final tagging push prep**

Once all boxes are checked, the branch is ready to be pushed and tagged. **Do not push or tag here** — release is a separate user-driven step.

---

## Self-Review (writing-plans)

**Spec coverage:**

| Spec section | Plan task(s) |
|---|---|
| §3 file layout — `src/pty/types.ts`, `errors.ts`, `claude-args.ts`, `copilot-args.ts`, `client.ts`, `factory.ts`, `index.ts` | A1, A2, A3, A4, A5, A6, A7 |
| §3 file layout — `docs/pty-transport.md`, `examples/pty/*` | D4, D1, D2, D3 |
| §3 file layout — modifications to `src/index.ts`, `src/copilot/transport.ts`, `package.json`, `README.md`, `CHANGELOG.md`, `docs/provider-capabilities.md` | B1, B3, B2, D5, D7, D6 |
| §4 PtyClient + config | A1 |
| §5 factory with lazy loader | A6 |
| §6 arg mapping (Claude + Copilot) | A3, A4 |
| §7 node-pty optional peer dep | B2 |
| §8 error types | A2 |
| §9 testing — unit, type-level, integration | A3/A4/A5/A6/C1, C2 |
| §10 release — version, exports, CHANGELOG | B2, D7 |
| §12 self-review checklist | E2 |

No spec gaps.

**Placeholder scan:** none. All steps include concrete code, exact commands, and expected outputs.

**Type consistency check:**
- `PtyClient` properties used identically across A1, A5, A6, D4 (provider, pid, cols, rows, start/write/resize/kill/close, on/off).
- Config type names (`PtyClientConfig`, `ClaudePtyConfig`, `CopilotPtyConfig`, `PtyCommonConfig`) consistent across A1, A6, A7, B1, C1, D4.
- Function names (`buildClaudeArgs`, `buildCopilotArgs`, `createPtyClient`) consistent.
- Error class names + `code` literals (`PTY_DEP_MISSING`, `PTY_BINARY_NOT_FOUND`, `PTY_SPAWN_FAILED`) consistent across A2, A6, C2, D4.

No drift.
