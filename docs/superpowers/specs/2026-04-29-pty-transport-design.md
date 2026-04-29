# Phase 3 — PTY transport for daemon-layer embedding

**Date:** 2026-04-29
**Status:** Approved (brainstorming complete) — ready for implementation plan
**Predecessors:**
- `2026-04-28-copilot-cli-client-design.md` (Phase 1 — shipped as v0.4.0)
- `2026-04-28-unified-ai-cli-client-design.md` (Phase 2 — shipped as v0.5.0)

**Successor:** None planned. Future work captured in §11.

---

## 1. Goal

Add a PTY transport so that a Node.js process (typically an Electron main
process acting as a **daemon layer**) can spawn the underlying CLI
(`claude`, `copilot`) in a real OS-level pseudo-terminal, forward raw
bytes to a renderer, and forward keystrokes/resize events back. The
library does **not** render. The consumer does — typically with
`xterm.js` in an Electron `<webview>`, or with a custom TUI renderer.

The driving use case: an Electron app that wants to embed the
interactive Claude or Copilot CLI experience inside its own window
without writing PTY plumbing itself, and without giving up the structured
clients (`ClaudeClient`, `CopilotClient`) it already uses for app-side
logic.

## 2. Out of scope

- **UI rendering.** No xterm.js, no ANSI parsing, no terminal emulation.
  Bytes in, bytes out.
- **Mixing PTY transport with the structured surface.** PTY mode is a
  separate `PtyClient` interface. It does **not** implement
  `AICliClient`. The structured surface (`ClaudeClient`, `CopilotClient`)
  remains untouched and continues to use `child_process.spawn` /
  `@github/copilot-sdk`.
- **Session management.** The CLI manages its own sessions via slash
  commands inside the interactive UI. Consumers needing session resume
  pass `extraArgs: ['--resume', '<id>']` (Claude) or use slash commands.
- **Mapping every provider config field to a CLI flag.** We map the
  obviously-useful flags. Anything else goes through `extraArgs`.
- **Bundling node-pty.** It's an optional peer dep. See §7.
- **Windows ConPTY tuning.** node-pty handles ConPTY internally; we
  rely on its defaults. If a Windows-specific issue surfaces, address
  it in a follow-up.

## 3. File layout

### Files added

```
src/
  pty/
    index.ts          # public barrel: PtyClient, createPtyClient, types, errors
    types.ts          # PtyClient interface, PtyClientConfig union, sub-configs
    client.ts         # concrete PtyClientImpl (provider-agnostic; wraps node-pty)
    factory.ts        # createPtyClient + lazy node-pty loader
    claude-args.ts    # ClaudePtyConfig → string[] flag mapping
    copilot-args.ts   # CopilotPtyConfig → string[] flag mapping
    errors.ts         # PtyDependencyMissingError, PtyBinaryNotFoundError, PtySpawnError

docs/
  pty-transport.md    # consumer-facing guide; embedding patterns; install instructions

examples/
  pty/
    basic-claude.ts   # spawn claude in a PTY, pipe to stdout, forward stdin
    basic-copilot.ts  # same for copilot
    electron-main.ts  # sketch of the Electron main-process integration
```

### Files modified

| File | Change |
| ---- | ------ |
| `src/index.ts` | Re-export `PtyClient`, `createPtyClient`, `PtyClientConfig`, all PTY error types from `./pty/index.js` |
| `src/copilot/transport.ts` | Update the unsupported-`transport: 'pty'` error message to point at `createPtyClient` |
| `package.json` | Add `peerDependencies.node-pty: ">=1.0.0"` + `peerDependenciesMeta.node-pty.optional: true`. Add `./pty` subpath to `exports`. Bump version to `0.6.0`. |
| `README.md` | New "PTY transport" section near the bottom (after "Mode Comparison"); link to `docs/pty-transport.md` |
| `CHANGELOG.md` | New `0.6.0` entry |
| `docs/provider-capabilities.md` | New row noting PTY transport is supported for both providers; document divergence in mapped flags |

### Public surface after Phase 3

```ts
import { createPtyClient, type PtyClient } from '@baoduy2412/ai-cli-client';
// also available at: '@baoduy2412/ai-cli-client/pty'

const pty: PtyClient = await createPtyClient({
  provider: 'claude',
  cwd: process.cwd(),
  cols: 120,
  rows: 30,
});

pty.on('data', (bytes: Buffer) => mainWindow.webContents.send('pty-data', bytes));
pty.on('exit', (code, signal) => mainWindow.webContents.send('pty-exit', { code, signal }));

ipcMain.on('pty-input',  (_, bytes: Buffer)        => pty.write(bytes));
ipcMain.on('pty-resize', (_, cols: number, rows: number) => pty.resize(cols, rows));
```

## 4. The `PtyClient` interface and config

### `PtyClient` interface

```ts
// src/pty/types.ts
export interface PtyClient {
  readonly provider: 'claude' | 'copilot';
  readonly pid: number | null;
  readonly cols: number;
  readonly rows: number;

  start(): Promise<void>;                       // idempotent; factory already calls it
  write(data: string | Buffer): void;           // sync passthrough to node-pty
  resize(cols: number, rows: number): void;     // sync; updates .cols/.rows
  kill(signal?: NodeJS.Signals): void;          // sync; default 'SIGHUP'
  close(): Promise<void>;                       // graceful: SIGHUP + await 'exit'

  on(event: 'data',  listener: (data: Buffer) => void): this;
  on(event: 'exit',  listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  off(event: string, listener: (...args: unknown[]) => void): this;
}
```

### Config (discriminated union)

```ts
// src/pty/types.ts
export type PtyClientConfig =
  | ({ provider: 'claude' }  & ClaudePtyConfig)
  | ({ provider: 'copilot' } & CopilotPtyConfig);

interface PtyCommonConfig {
  cwd?: string;                            // default: process.cwd()
  cols?: number;                           // default: 80
  rows?: number;                           // default: 24
  env?: Record<string, string>;            // merged onto process.env
  bin?: string;                            // override binary; default: provider's name on PATH
  extraArgs?: string[];                    // appended after mapped flags
}

export interface ClaudePtyConfig extends PtyCommonConfig {
  model?: string;                          // → --model <value>
  permissionMode?:                          // → --permission-mode <value>
    | 'default' | 'acceptEdits' | 'auto'
    | 'plan'    | 'dontAsk'     | 'bypassPermissions';
}

export interface CopilotPtyConfig extends PtyCommonConfig {
  model?: string;                          // → --model <value>
  allowTools?: string[];                   // → repeated --allow-tool <pattern>
  denyTools?: string[];                    // → repeated --deny-tool <pattern>
  allowAll?: boolean;                      // → --allow-all (alias of --yolo)
  allowAllPaths?: boolean;                 // → --allow-all-paths
  allowAllUrls?: boolean;                  // → --allow-all-urls
  noAskUser?: boolean;                     // → --no-ask-user
  addDir?: string[];                       // → repeated --add-dir <path>
}
```

**Decisions baked into the API:**

- **Auto-start in factory.** `createPtyClient(...)` returns a started client.
  Matches `createAICliClient` lifecycle. Trade-off: data emitted before
  the consumer attaches a `data` listener can be lost. Mitigation: node-pty
  buffers internally for one tick, and the typical consumer attaches
  listeners synchronously after `await createPtyClient(...)` resolves.
- **Buffer, not string, for `data`.** UTF-8 multi-byte sequences can
  split across reads. Decoding is the consumer's choice (xterm.js
  expects strings; most renderers want raw bytes).
- **Sync `write` and `resize`.** node-pty exposes these as sync; we mirror.
- **Both `kill()` and `close()`.** `kill()` matches existing
  `ClaudeClient.kill()` semantics (synchronous fire-and-forget signal).
  `close()` matches `AICliClient.close()` semantics (awaitable graceful
  shutdown). `close()` sends `SIGHUP` and awaits the `exit` event.
- **No `sessionId`.** Passthrough mode does not manage sessions.
- **`bin` override.** Useful for tests and non-standard installs.

## 5. Factory

```ts
// src/pty/factory.ts (sketch)
import type { PtyClient, PtyClientConfig } from './types.js';
import { PtyClientImpl } from './client.js';
import { PtyDependencyMissingError } from './errors.js';
import { buildClaudeArgs }  from './claude-args.js';
import { buildCopilotArgs } from './copilot-args.js';

let nodePty: typeof import('node-pty') | null = null;
async function loadNodePty() {
  if (nodePty) return nodePty;
  try {
    nodePty = await import('node-pty');
    return nodePty;
  } catch (err) {
    throw new PtyDependencyMissingError(
      'PTY mode requires node-pty. Install it as a peer dep: `npm install node-pty`. ' +
      'For Electron apps, rebuild against your Electron version: `npx @electron/rebuild`.',
      { cause: err as Error },
    );
  }
}

export async function createPtyClient(config: PtyClientConfig): Promise<PtyClient> {
  const pty = await loadNodePty();

  const { args, defaultBin } = buildArgs(config);
  const bin = config.bin ?? defaultBin;

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

  await client.start();
  return client;
}

function buildArgs(config: PtyClientConfig): { args: string[]; defaultBin: string } {
  switch (config.provider) {
    case 'claude':
      return { args: buildClaudeArgs(config),  defaultBin: 'claude'  };
    case 'copilot':
      return { args: buildCopilotArgs(config), defaultBin: 'copilot' };
    default: {
      const _exhaustive: never = config;
      throw new Error(`Unknown PTY provider: ${(_exhaustive as { provider: string }).provider}`);
    }
  }
}
```

**Properties:**

- **Lazy node-pty load.** Only imported when `createPtyClient` is
  called. Non-PTY consumers pay zero install/runtime cost.
- **Exhaustive switch via `never`.** Adding a third provider forces a
  TypeScript error here.
- **Separate arg-builder modules.** `claude-args.ts` and
  `copilot-args.ts` are pure functions; trivially unit-testable.

## 6. Provider arg mapping

### Claude

```ts
// src/pty/claude-args.ts
export function buildClaudeArgs(c: ClaudePtyConfig): string[] {
  const args: string[] = [];
  if (c.model)          args.push('--model',           c.model);
  if (c.permissionMode) args.push('--permission-mode', c.permissionMode);
  if (c.extraArgs)      args.push(...c.extraArgs);
  return args;
}
```

We do **not** pass `--output-format stream-json` or `--print` — PTY mode
is the interactive UI.

### Copilot

```ts
// src/pty/copilot-args.ts
export function buildCopilotArgs(c: CopilotPtyConfig): string[] {
  const args: string[] = [];
  if (c.model)         args.push('--model', c.model);
  if (c.allowAll)      args.push('--allow-all');
  if (c.allowAllPaths) args.push('--allow-all-paths');
  if (c.allowAllUrls)  args.push('--allow-all-urls');
  if (c.noAskUser)     args.push('--no-ask-user');
  for (const t of c.allowTools ?? []) args.push('--allow-tool', t);
  for (const t of c.denyTools  ?? []) args.push('--deny-tool',  t);
  for (const d of c.addDir     ?? []) args.push('--add-dir',    d);
  if (c.extraArgs)     args.push(...c.extraArgs);
  return args;
}
```

We do **not** pass `-p` — PTY mode is the interactive UI, not one-shot.

**Source of truth for flags:** `copilot help` and `claude --help`. The
mapped fields above are the obviously-useful subset. New flags reach
consumers via `extraArgs` until we explicitly map them.

## 7. node-pty dependency model

**Optional peer dependency.** Reasons recapped:

- Three of our four consumer profiles (Claude-only structured, Copilot-only
  structured, AICliClient) don't need node-pty. Forcing the native
  compile on them is wasteful and breaks installs in restricted
  environments (Lambda, Alpine without build-essential, CI runners
  without the Visual Studio Build Tools on Windows).
- Electron consumers manage their own native deps via
  `@electron/rebuild`. Pinning node-pty in their `package.json`
  aligns with how they handle `keytar`, `better-sqlite3`, etc.
  Hard-pinning it here would create version-mismatch crashes.
- Lazy `await import('node-pty')` inside the factory means tree-shakers
  and non-PTY consumers never load it.

**`package.json` changes:**

```json
{
  "peerDependencies": {
    "node-pty": ">=1.0.0"
  },
  "peerDependenciesMeta": {
    "node-pty": { "optional": true }
  }
}
```

**Failure mode:** If node-pty is not installed, `createPtyClient(...)`
rejects with `PtyDependencyMissingError` containing the install
instruction. The error fires before any binary lookup, so the consumer
never sees a confusing downstream error.

## 8. Error types

```ts
// src/pty/errors.ts

/** node-pty is not installed (optional peer dep missing). */
export class PtyDependencyMissingError extends Error { /* code: 'PTY_DEP_MISSING' */ }

/** The provider's binary (`claude` / `copilot`) was not found on PATH. */
export class PtyBinaryNotFoundError    extends Error { /* code: 'PTY_BINARY_NOT_FOUND' */ }

/** node-pty.spawn() threw — most often a permissions / platform issue. */
export class PtySpawnError             extends Error { /* code: 'PTY_SPAWN_FAILED' */ }
```

All three carry an `Error.cause` chain when the underlying cause is
catchable. `code` is a string literal property for runtime branching.

`PtyBinaryNotFoundError` is thrown from `start()` when the binary
resolution fails (PATH lookup miss, or `bin` points at a nonexistent
path). We do an explicit `fs.access` check before `pty.spawn` to give
this a clean error rather than node-pty's generic spawn failure.

## 9. Testing

### Unit — `test/pty/factory.test.mjs`

Mock `node-pty` (inject through a test-only constructor option on
`PtyClientImpl`, or mock the dynamic import via a module-level factory
override). Cover:

1. **Factory dispatches correctly per provider.** `createPtyClient` with
   `provider: 'claude'` invokes `pty.spawn('claude', ...)`;
   `provider: 'copilot'` invokes `pty.spawn('copilot', ...)`.
2. **Auto-start.** `pty.spawn` called exactly once before resolution.
3. **Defaults.** Missing `cwd`/`cols`/`rows` fall back to
   `process.cwd()` / 80 / 24.
4. **Env merge.** `config.env` is merged on top of `process.env`.
5. **`bin` override.** `config.bin: '/custom/claude'` is passed to
   `pty.spawn` instead of `'claude'`.
6. **`PtyDependencyMissingError`** when the lazy import throws (mock
   the loader to reject).
7. **`PtyBinaryNotFoundError`** when the binary lookup fails (mock
   `fs.access` to reject).

### Unit — `test/pty/claude-args.test.mjs` and `test/pty/copilot-args.test.mjs`

Pure-function tests. For each mapped field, assert the produced `string[]`
contains the right flag in the right order. Empty config → empty array.
`extraArgs` always appended last.

### Unit — `test/pty/client.test.mjs`

Exercise `PtyClientImpl` against a mocked `pty.spawn` return value
(an `EventEmitter`-like with `write`, `resize`, `kill`, `onData`,
`onExit`):

1. `data` event re-emits as Buffer.
2. `write` forwards to the inner pty.
3. `resize` updates `client.cols` / `client.rows` and forwards.
4. `kill(signal)` forwards.
5. `close()` sends `SIGHUP`, awaits `exit`, resolves.
6. `error` fires if the inner pty errors before exit.

### Type-level

`test/pty/types.test-d.ts` (or `// @ts-expect-error` in the unit file):

- `{ provider: 'claude', allowTools: [] }` must fail to typecheck.
- `{ provider: 'copilot', permissionMode: 'auto' }` must fail to
  typecheck.

### Integration — `scripts/integration-pty.mjs`

Gated like the existing Copilot integration smoke. Skips unless both
`claude` and `copilot` binaries are on PATH. Spawns each in a PTY,
writes a no-op input, asserts at least one `data` event arrives, sends
`SIGHUP`, asserts `exit` fires. Wires `npm run integration:pty`.

This is the only test that requires real node-pty and real binaries.
Everything else is mocked.

### CI

Add a `node-pty` install step to the existing test workflow only for
the integration job. Unit tests run without node-pty installed, which
also implicitly proves the optional-peer-dep path (the `PtyDependencyMissingError`
fires from a real failed import in the factory test).

## 10. Release

- **Version bump:** `0.5.0` → `0.6.0`. Additive (new exports, new
  optional peer dep). No breaking changes to existing surface.
- **CHANGELOG entry under `0.6.0`:**
  - **Added** — `PtyClient` interface, `createPtyClient` factory,
    `PtyClientConfig` discriminated union, error types
    (`PtyDependencyMissingError`, `PtyBinaryNotFoundError`,
    `PtySpawnError`), `./pty` subpath export, three example scripts
    under `examples/pty/`, consumer guide at `docs/pty-transport.md`.
  - **Changed** — `package.json` `peerDependencies` adds optional
    `node-pty`; `exports` map adds `./pty`. `provider-capabilities.md`
    gains a PTY-transport row.
  - **Notes** — node-pty is an optional peer dep; install with
    `npm install node-pty`. For Electron apps, rebuild with
    `npx @electron/rebuild`.
- **README:** new "PTY transport" section near the bottom (after
  "Mode Comparison"). Short — links out to `docs/pty-transport.md`
  for the embedding guide.
- **`docs/pty-transport.md`** covers: install instructions, Electron
  rebuild flow, the three example scripts, the IPC pattern for
  forwarding bytes between main and renderer, and a troubleshooting
  table (binary not found, native rebuild failures, blank
  renderer / nothing received).

## 11. Future work (carried forward)

- **Copilot via SDK PTY.** If `@github/copilot-sdk` ever exposes a PTY
  hook, we can switch the Copilot path back to going through the SDK
  for consistency with the structured client. Until then, direct binary
  spawn is the only option.
- **More mapped flags.** As consumers ask for them. Anything not yet
  mapped is reachable via `extraArgs`.
- **Windows ConPTY tuning.** Address only if a real consumer reports a
  Windows-specific issue.
- **Bidirectional structured + PTY.** Speculative. Would require parsing
  ANSI-stripped stream-json from a tee'd PTY output. No concrete
  consumer.

## 12. Self-review (run before claiming Phase 3 complete)

- All implementation tasks have completed commits.
- `npm test` (unit, no node-pty installed) passes — proves the
  optional-peer-dep path.
- `npm run integration:pty` passes locally with `claude` and `copilot`
  on PATH.
- `npm run build` clean.
- Both `provider: 'claude'` and `provider: 'copilot'` paths tested in
  the factory unit suite.
- `extraArgs` round-trips through both arg builders.
- Type-level: cross-provider config fields fail to typecheck.
- README has the PTY section and the doc link works.
- `docs/pty-transport.md` is complete; no TBD markers.
- `docs/provider-capabilities.md` has the new PTY row.
- `CHANGELOG.md` `0.6.0` entry is accurate and complete.
- Version bumped in `package.json` and the CHANGELOG matches.
