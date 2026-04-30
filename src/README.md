# `src` — Top-level package surface

## Purpose

The package's entry point. This module owns the unified provider-agnostic interface (`AICliClient`), the unified factory (`createAICliClient`), and the cross-provider `TurnHandleBase` contract. It also re-exports the public surface of every module beneath it so consumers can `import { ... } from '@baoduy2412/ai-cli-client'` rather than chasing subpaths.

For backward compatibility, all of `claude/`'s public surface is re-exported here, so existing `import { ClaudeClient } from '@baoduy2412/ai-cli-client'` calls keep working. PTY exports are also surfaced at the top level alongside the `./pty` subpath.

## Public exports

| Name | Source | Purpose |
| --- | --- | --- |
| `AICliClient` | `ai-cli-client.ts` | Unified, provider-agnostic client interface. Both `ClaudeClient` and `CopilotClient` implement it. |
| `createAICliClient(config)` | `factory.ts` | Discriminated-union factory that constructs and starts the right provider client. |
| `AICliClientConfig` | `factory.ts` | `{ provider: 'claude', ... } \| { provider: 'copilot', ... }`. |
| `ClaudeClient` | re-export of [`./claude/`](./claude/) | Claude provider client. |
| `CopilotClient` | re-export of [`./copilot/`](./copilot/) | Copilot provider client. |
| `TurnHandleBase` | `turn-handle.ts` | Cross-provider turn-handle interface — the lowest common denominator of `TurnHandle` (Claude) and `CopilotTurnHandle`. |
| Unified types | re-export of [`./unified/`](./unified/) | `UnifiedStatus`, `TurnSnapshot`, `TurnToolUse`, `TurnToolResult`, `SendInput`, `ContentBlock`, `ImageSource`, `AICliCapabilities`, `PermissionMode`, `LegacyPermissionMode`, `SupportedModelsResponse`, `UnifiedEventMap`, `UnifiedEventName`, `UnsupportedContentError`, `translateLegacyPermissionMode`. See [`./unified/README.md`](./unified/README.md). |
| PTY surface | re-export of [`./pty/`](./pty/) | `createPtyClient`, `PtyClient`, `PtyClientConfig`, `PtyCommonConfig`, `ClaudePtyConfig`, `CopilotPtyConfig`, plus the `Pty*Error` hierarchy (`PtyError`, `PtyDependencyMissingError`, `PtyBinaryNotFoundError`, `PtySpawnError`). See [`./pty/README.md`](./pty/README.md). |
| Namespace re-exports | `index.ts` | `import * as claude from '@baoduy2412/ai-cli-client/claude'` and `... copilot ...` work via the `./claude` and `./copilot` subpath exports. |

## Key interfaces

### `AICliClient`

The provider-agnostic interface. Required members are everything portable: `provider`, `sessionId`, `capabilities`, `start`, `close`, `send`, `sendMessage`, `queueMessage`, `interrupt`, `getStatus`, `isProcessing`, `getCurrentTurn`, `getHistory`, typed `on`/`off`. Optional members (Group E setters and the Phase 1.2 interactive-approval methods) are present only on providers that support them — check `client.capabilities`, or use `?.`-call.

For Claude- or Copilot-specific methods, narrow via `client.provider`:

```ts
if (client.provider === 'claude') {
  await client.setModel('claude-opus-4-7');
}
```

### `createAICliClient`

The unified factory. Takes a discriminated-union config; returns a *started* client. If you need to attach listeners before startup events fire, construct the concrete class directly instead.

### `TurnHandleBase<TSnapshot, TUpdate>`

The contract every turn handle implements. Two type parameters because Claude and Copilot return richer per-provider snapshot/update types from `client.send(...)`. Consumers wanting cross-provider snapshots should call `client.getCurrentTurn()` / `getHistory()` instead, both of which return the unified `TurnSnapshot`.

## Usage

```ts
import {
  createAICliClient,
  type AICliClientConfig,
} from '@baoduy2412/ai-cli-client';

const config: AICliClientConfig = { provider: 'claude', cwd: process.cwd() };
const client = await createAICliClient(config);

client.on('text', (chunk) => process.stdout.write(chunk));

const handle = client.send('hello');
const final = await handle.done;
console.log(final.text, '— tokens:', final.usage);

if (client.capabilities.setModel) {
  await client.setModel!('claude-opus-4-7');
}

await client.close();
```

For PTY mode (raw terminal embedding), use `createPtyClient` instead — see [`./pty/README.md`](./pty/README.md).

## Internal files

- `index.ts` — barrel; the source of truth for what the package re-exports.
- `factory.ts` — `createAICliClient` and `AICliClientConfig`.
- `ai-cli-client.ts` — the `AICliClient` interface.
- `turn-handle.ts` — `TurnHandleBase`.
- `claude/`, `copilot/`, `pty/`, `unified/` — module subdirectories. Each has its own README.

## See also

- Root [`README.md`](../README.md) — package-level docs (install, common API, full event semantics).
- [`./claude/README.md`](./claude/README.md), [`./copilot/README.md`](./copilot/README.md) — provider modules.
- [`./unified/README.md`](./unified/README.md) — shared types and events.
- [`./pty/README.md`](./pty/README.md) — PTY transport.
- [`docs/provider-capabilities.md`](../docs/provider-capabilities.md) — full divergence matrix.
- [`docs/superpowers/specs/`](../docs/superpowers/specs/) — design history (unified surface, PTY, gap-fill).
