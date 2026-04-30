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
npm install @drunkcoding/ai-cli-clients node-pty
```

For Electron apps, rebuild `node-pty` against your Electron version:

```bash
npx @electron/rebuild
```

If `node-pty` is missing at runtime, `createPtyClient` throws
`PtyDependencyMissingError` with the install instructions.

## Quickstart

```ts
import { createPtyClient } from '@drunkcoding/ai-cli-clients';

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
