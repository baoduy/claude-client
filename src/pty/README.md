# `pty` — Real-PTY transport for the provider CLIs

## Purpose

PTY-mode entry point. Spawns the provider's CLI binary (`claude` / `copilot`) in a real pseudo-terminal via `node-pty` and exposes raw bytes back to the host. Pure passthrough — this module does **not** render the terminal, parse output, or implement the structured RPC surface that `ClaudeClient` / `CopilotClient` provide. Consumers (typically Electron daemons) forward bytes to their own renderer (xterm.js or similar).

PTY mode and structured mode are distinct. If you want `send()`, `getHistory()`, `capabilities`, etc., use `createAICliClient()` instead. This module is for raw terminal embedding.

## Public exports

| Name | Purpose |
| --- | --- |
| `createPtyClient(config, internals?)` | Construct, validate, and start a PTY client. Returns a started `PtyClient`. |
| `PtyClient` | Runtime interface emitted by the factory: `start`, `write`, `resize`, `kill`, `close`, plus `data`/`exit`/`error` events. |
| `PtyClientConfig` | Discriminated-union config for the factory: `{ provider: 'claude', ... } \| { provider: 'copilot', ... }`. |
| `PtyCommonConfig` | Fields shared by both providers (`cwd`, `cols`, `rows`, `env`, `bin`, `extraArgs`). |
| `ClaudePtyConfig` | Claude-specific config: `model`, `permissionMode`. |
| `CopilotPtyConfig` | Copilot-specific config: `model`, `allowTools`, `denyTools`, `allowAll`, `allowAllPaths`, `allowAllUrls`, `noAskUser`, `addDir`. |
| `PtyError` | Base class for all PTY errors. |
| `PtyDependencyMissingError` | `node-pty` is not installed (optional peer dep missing). `code: 'PTY_DEP_MISSING'`. |
| `PtyBinaryNotFoundError` | Provider binary not found on PATH (or at `bin`). `code: 'PTY_BINARY_NOT_FOUND'`. |
| `PtySpawnError` | `node-pty.spawn()` threw. `code: 'PTY_SPAWN_FAILED'`. |

## Key interfaces

### `createPtyClient`

The single factory entry point. Loads `node-pty` lazily, validates the binary path, builds args from the discriminated config, spawns a PTY, and returns the started client. Throws one of the typed `Pty*Error` classes on each failure mode rather than a bare `Error`.

### `PtyClient`

Runtime interface returned by the factory. Methods: `start()` (idempotent — already called by the factory), `write(data)` (sync), `resize(cols, rows)` (sync), `kill(signal?)` (sync fire-and-forget), `close()` (graceful: SIGHUP + await `exit`). Properties: `provider`, `pid`, `cols`, `rows`. Events: `data`, `exit`, `error`.

### `PtyClientConfig`

Discriminated union — `provider` selects the per-provider variant. Common fields (`cwd`, `cols`, `rows`, `env`, `bin`, `extraArgs`) live on `PtyCommonConfig`; provider-specific flags map directly to CLI arguments. `extraArgs` is the escape hatch for unmapped flags.

### Error hierarchy

All PTY errors extend `PtyError`. Each subclass carries a stable string `code` so callers can match without `instanceof` chains in cross-realm scenarios.

## Usage

```ts
import { createPtyClient, PtyDependencyMissingError } from '@baoduy2412/ai-cli-client/pty';

try {
  const pty = await createPtyClient({
    provider: 'claude',
    cwd: process.cwd(),
    cols: 120,
    rows: 32,
    permissionMode: 'acceptEdits',
  });

  pty.on('data', (chunk) => process.stdout.write(chunk));
  pty.on('exit', (code) => console.log('claude exited with', code));

  process.stdin.on('data', (b) => pty.write(b));
  process.on('SIGWINCH', () => pty.resize(process.stdout.columns ?? 80, process.stdout.rows ?? 24));
} catch (err) {
  if (err instanceof PtyDependencyMissingError) {
    console.error('Run: npm install node-pty');
  }
  throw err;
}
```

## Internal files

- `client.ts` — `PtyClientImpl` wrapping a `node-pty` process; not exported.
- `factory.ts` — `createPtyClient` plus the `PtyFactoryInternals` test-injection seam.
- `claude-args.ts` — maps `ClaudePtyConfig` to `claude` CLI argv.
- `copilot-args.ts` — maps `CopilotPtyConfig` to `copilot` CLI argv.
- `types.ts` — public type declarations.
- `errors.ts` — error class hierarchy.
- `node-pty.d.ts` — minimal ambient typing for the optional peer dep.
- `index.ts` — barrel.

## See also

- Root [`README.md`](../../README.md) — package overview.
- [`docs/pty-transport.md`](../../docs/pty-transport.md) — usage guide.
- [`docs/superpowers/specs/2026-04-29-pty-transport-design.md`](../../docs/superpowers/specs/2026-04-29-pty-transport-design.md) — design rationale.
- [`../unified/README.md`](../unified/README.md) — *not* used by PTY mode, but useful context for what structured mode looks like.
