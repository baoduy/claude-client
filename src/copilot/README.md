# `copilot` — GitHub Copilot CLI provider

## Purpose

Provider implementation for GitHub Copilot. Wraps `@github/copilot-sdk` to expose a `CopilotClient` that conforms to the unified `AICliClient` interface, plus Copilot-specific RPC namespace wrappers reachable as properties on the client. Internal pieces (transport, pending-queue, attachments, permission mapping) are not exported.

This module is paired with [`../claude/`](../claude/) — both implement `AICliClient`. Use `createAICliClient({ provider: 'copilot', ... })` for a unified construction path, or import `CopilotClient` directly when you need Copilot-only methods.

## Public exports

| Name | Source | Purpose |
| --- | --- | --- |
| `CopilotClient` | `client.ts` | Provider client. `extends EventEmitter implements AICliClient`. |
| `CopilotClientConfig` | `types.ts` | Constructor options. |
| `CopilotTurnSnapshot` | `types.ts` | Copilot's snapshot variant — extends the unified `TurnSnapshot`. |
| `CopilotTurnUpdate` | `types.ts` | Per-turn streaming update payload. |
| `CopilotToolCall` | `types.ts` | Tool-call shape inside a Copilot turn. |
| `CopilotUsage` | `types.ts` | Per-turn token usage. |
| `CopilotStatus` | `types.ts` | `'idle' \| 'running' \| 'error'`. |
| `CopilotPendingAction` | `types.ts` | Pending-action shape (interactive approval). |
| `CopilotTurnHandle` | `turn-handle.ts` | Concrete `TurnHandleBase` returned by `client.send(...)`. |
| `CopilotError` and subclasses (`CopilotAuthError`, `CopilotLaunchError`, `CopilotFeatureUnsupportedError`, `CopilotTurnError`, `CopilotInterruptedError`, `CopilotPermissionDeniedError`) | `errors.ts` | Error hierarchy for provider-specific failure modes. |
| `RequestNotHandled`, `SessionNotStartedError`, `CopilotRpcError`, `CopilotExperimentalUnavailableError` | `errors.ts` | Lower-level error types; the `Session*`/`Rpc` ones surface from the namespace wrappers. |
| Namespace classes | `namespaces/` (re-exported) | `CopilotPlanApi`, `CopilotSkillsApi`, …. See [`namespaces/README.md`](./namespaces/README.md). |
| Session helpers | `sessions.ts` | `CopilotSessionLocatorOptions`, `listCopilotSessionSummaries`, `readCopilotSessionRecord` — helpers for locating session state on disk. |

## Key interfaces

### `CopilotClient`

The provider client. Construct with `new CopilotClient(config)`, then `await client.start()` to launch the underlying Copilot CLI session. Auto-start is provided by the unified factory (`createAICliClient`), but the constructor + `start()` split lets you attach event listeners *before* startup events fire.

Implements all required `AICliClient` members (`send`, `sendMessage`, `queueMessage`, `interrupt`, `getStatus`, `isProcessing`, `getCurrentTurn`, `getHistory`, `getMessages`, typed `on`/`off`, plus the interactive-approval methods). Does **not** implement Group E setters (`setModel`, `setPermissionMode`, `setMaxThinkingTokens`, `listSupportedModels`) — `capabilities` reflects this.

Owns one instance of each namespace wrapper as a public field: `client.plan`, `client.skills`, `client.agent`, `client.history`, `client.usage`, `client.shell`, `client.workspaces`, `client.name`, `client.instructions`, `client.mcp`. See [`namespaces/README.md`](./namespaces/README.md).

### `CopilotTurnHandle`

Concrete `TurnHandleBase<CopilotTurnSnapshot, CopilotTurnUpdate>` returned by `client.send(...)`. Use `.updates()` for streaming, `.current()` for the latest snapshot, `.done` for the final snapshot, `.history()` for already-emitted updates.

### Error hierarchy

All Copilot-specific errors extend `CopilotError`. Notable subclasses:

- `CopilotAuthError` — credential / authentication failure.
- `CopilotLaunchError` — failed to launch the CLI session.
- `CopilotFeatureUnsupportedError` — the requested feature isn't supported on this provider.
- `CopilotTurnError` — turn errored mid-stream.
- `CopilotInterruptedError` — turn was interrupted by `interrupt()`.
- `CopilotPermissionDeniedError` — a permission request was denied.

`SessionNotStartedError` is thrown when calling a namespace method before `client.start()` resolves; `CopilotExperimentalUnavailableError` when an experimental RPC is missing on the running CLI version.

## Usage

```ts
import {
  CopilotClient,
  CopilotAuthError,
  CopilotExperimentalUnavailableError,
} from '@drunkcoding/ai-cli-clients';

const client = new CopilotClient({ cwd: process.cwd() });

client.on('text', (chunk) => process.stdout.write(chunk));
client.on('result', (snap) => console.log('done in', snap.usage));

try {
  await client.start();

  const handle = client.send('summarise the README');
  for await (const update of handle.updates()) {
    // streaming update — see CopilotTurnUpdate
  }
  const final = await handle.done;
  console.log(final.text);

  // Stable namespace — fine to call.
  await client.workspaces.readFile({ path: 'package.json' });

  // Experimental namespace — guard.
  try {
    await client.usage.get();
  } catch (err) {
    if (!(err instanceof CopilotExperimentalUnavailableError)) throw err;
  }
} catch (err) {
  if (err instanceof CopilotAuthError) {
    console.error('Run: copilot login');
  }
  throw err;
} finally {
  await client.close();
}
```

## Internal files

- `client.ts` — `CopilotClient` implementation; large file owning lifecycle, send/queue, interactive-approval, namespace wiring.
- `transport.ts` — JSON-RPC transport over the SDK session; not exported.
- `pending-queue.ts` — request/response correlation for in-flight RPC calls.
- `attachments.ts` — converts unified `ContentBlock`s to Copilot's attachment shape; rejects unsupported types via `UnsupportedContentError`.
- `permission-mapping.ts` — translates between unified `PermissionMode` and Copilot's native vocabulary.
- `sdk.ts` — typed re-exports from `@github/copilot-sdk` (internal).
- `turn-handle.ts` — `CopilotTurnHandle` implementation.
- `sessions.ts` — disk-locating helpers for Copilot session storage.
- `types.ts`, `errors.ts` — public types and error classes.
- `namespaces/` — RPC namespace wrappers; see [`namespaces/README.md`](./namespaces/README.md).
- `index.ts` — barrel.

## See also

- Root [`README.md`](../../README.md) — package overview, common API, event semantics.
- [`./namespaces/README.md`](./namespaces/README.md) — per-namespace wrappers.
- [`../claude/README.md`](../claude/README.md) — sibling provider; useful for capability comparison.
- [`../unified/README.md`](../unified/README.md) — shared types and event vocabulary.
- [`docs/superpowers/specs/2026-04-28-copilot-cli-client-design.md`](../../docs/superpowers/specs/2026-04-28-copilot-cli-client-design.md) — original design.
- [`docs/superpowers/specs/2026-04-29-copilot-claude-feature-gap-fill-design.md`](../../docs/superpowers/specs/2026-04-29-copilot-claude-feature-gap-fill-design.md) — gap-fill design.
