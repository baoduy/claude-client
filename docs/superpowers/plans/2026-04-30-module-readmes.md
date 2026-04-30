# Module READMEs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `README.md` to each module folder under `src/` so future readers can orient themselves without grepping the whole tree.

**Architecture:** Six new Markdown files, one per module folder. Each follows a fixed six-section template (Purpose / Public exports / Key interfaces / Usage / Internal files / See also). Orientation-style — names + short prose, no full method signatures (those live in TSDoc). Public-exports table is anchored to each module's `index.ts` barrel.

**Tech Stack:** Markdown only. No code or test changes.

---

## Conventions used by every task

- **Style:** match `README.md` at the repo root — prose-first, sentence-case headings, short TS code blocks, no emoji, no marketing fluff.
- **Cross-references:** relative paths (`../unified/`) so they work on GitHub when viewed in-place.
- **No full method signatures.** TSDoc owns those. List method *names* and a one-line description; for the primary entry point of a module, you may include the call shape (e.g. `client.send(input)`) but never the full TS signature.
- **Public-exports table** is drawn from the module's `index.ts` barrel — every name listed in the table must be one that the barrel re-exports.
- **Examples are real.** Realistic imports and method calls; doesn't have to be a runnable file but every imported name must exist.
- **Each task ends with a self-check** (sections present, no full signatures, links resolve) and a commit.

## File structure

| File | Lines (approx) | Source of truth (barrel) |
| --- | --- | --- |
| `src/unified/README.md` | 60–90 | `src/unified/index.ts` |
| `src/pty/README.md` | 80–120 | `src/pty/index.ts` |
| `src/copilot/namespaces/README.md` | 100–140 | `src/copilot/namespaces/index.ts` |
| `src/copilot/README.md` | 120–180 | `src/copilot/index.ts` |
| `src/claude/README.md` | 150–200 | `src/claude/index.ts` |
| `src/README.md` | 100–140 | `src/index.ts` |

Order: smallest → largest, so the template settles on small modules first and later READMEs can link to earlier ones without forward references.

---

## Task 1: `src/unified/README.md`

**Files:**
- Create: `src/unified/README.md`

- [ ] **Step 1: Read the source files**

Run:
- `cat src/unified/index.ts`
- `cat src/unified/types.ts`
- `cat src/unified/errors.ts`
- `cat src/unified/events.ts`

You should see the barrel re-exporting types from `types.ts`, `events.ts`, `errors.ts`. There is no class in this module — it is pure types + one helper function + two error classes.

- [ ] **Step 2: Write the README**

Write `src/unified/README.md` with these six sections, in this order:

````markdown
# `unified` — Provider-agnostic types and errors

## Purpose

The shared vocabulary that `claude` and `copilot` agree on. Defines the unified turn/snapshot/event/permission shapes consumed by `AICliClient`, plus the cross-provider error types. No runtime classes, no I/O — pure type definitions, one error pair, and one permission-mode translation helper.

This module is imported by `src/ai-cli-client.ts`, both provider modules, and re-exported from `src/index.ts`. Consumers usually import from the package root, not from here directly.

## Public exports

| Name | Purpose |
| --- | --- |
| `UnifiedStatus` | `'idle' \| 'running' \| 'error'`. |
| `TurnSnapshot` | Cross-provider turn state. The unified read-model returned by `getCurrentTurn()` / `getHistory()`. |
| `TurnToolUse` | Snapshot shape for one tool invocation. |
| `TurnToolResult` | Snapshot shape for one tool result. |
| `SendInput` | Accepted shapes for `client.send(...)`: `string`, `{ text }`, or `{ content: ContentBlock[] }`. |
| `ContentBlock` | Discriminated union of supported rich-content blocks (text, image, file path, directory path, selection). |
| `ImageSource` | `base64` or `url` source for `image` blocks. |
| `AICliCapabilities` | Runtime feature-detection map exposed at `client.capabilities`. |
| `PermissionMode` | Unified permission vocabulary (`prompt`, `auto-edit`, `auto-all`, `plan`, `autopilot`). |
| `LegacyPermissionMode` | Deprecated pre-1.0 vocabulary; kept for backward-compat callers. |
| `translateLegacyPermissionMode` | Map a legacy mode value to the current vocabulary. |
| `SupportedModelsResponse` | Shape returned by `listSupportedModels()`. |
| `UnifiedMessage`, `UnifiedMessageRaw` | Provider-tagged historical message shape used by `getMessages()`. |
| `UnifiedEventMap`, `UnifiedEventName` | Strongly-typed event vocabulary shared by both clients. |
| `PendingRequest` and friends (`PermissionPendingRequest`, `ElicitationPendingRequest`, `UserInputPendingRequest`) | Phase 1.2 interactive-approval request shapes. |
| `ApproveDecision`, `QuestionResponse`, `DetailedStatus`, `PendingAction` | Companions to interactive approval. |
| `UnsupportedContentError` | Thrown when a `send()` call passes a content block the provider can't render. |
| `UnsupportedModeError` | Thrown when `setPermissionMode()` receives a mode the provider doesn't support. |

## Key interfaces

### `TurnSnapshot`

Cross-provider snapshot of a single turn. Both `getCurrentTurn()` and `getHistory()` return this shape regardless of provider.

Fields of interest: `id`, `status` (`'pending' | 'completed' | 'errored'`), `text`, optional `reasoning`, `toolUses`, `toolResults`, optional `usage`, optional `error`, `startedAt`, optional `completedAt`. See `types.ts` for the full TSDoc.

### `AICliCapabilities`

Runtime feature-detection map. Keys mirror optional methods on `AICliClient` — if a key is `true` (or the string-typed flags are non-`'none'`), the corresponding method is present.

Notable flags: `richContent`, `setModel`, `setPermissionMode`, `setMaxThinkingTokens`, `listSupportedModels`, `getMessages`, `hooks`, `mcp`, `permissionModes`, `interactiveApproval`, `interruptTurnGranularity`, `detailedStatus`.

### `UnifiedEventMap`

Type-level map from event name to listener arg tuple. Drives the typed `on(event, listener)` overloads on both clients. Event names: `ready`, `text`, `text_done`, `reasoning`, `reasoning_done`, `tool_use_start`, `tool_result`, `usage_update`, `status_change`, `result`, `error`, `closed`, plus the Phase 1.2 `pending_request_*` triplet.

### `UnsupportedContentError` / `UnsupportedModeError`

Thrown when callers ask a provider to do something it doesn't support. `UnsupportedContentError` carries `provider`, `unsupportedBlock`, `inputIndex`. `UnsupportedModeError` carries `provider` and `mode`.

## Usage

```ts
import {
  type TurnSnapshot,
  type AICliCapabilities,
  UnsupportedContentError,
} from '@baoduy2412/ai-cli-client';

function summarise(snapshot: TurnSnapshot): string {
  const tools = snapshot.toolUses.map((t) => t.name).join(', ');
  return `${snapshot.status}: ${snapshot.text.slice(0, 60)} (tools: ${tools || 'none'})`;
}

function canSendImages(caps: AICliCapabilities): boolean {
  return caps.richContent !== 'none';
}
```

## Internal files

- `types.ts` — all type/interface declarations and the `translateLegacyPermissionMode` helper.
- `events.ts` — `UnifiedEventMap` declaration.
- `errors.ts` — `UnsupportedContentError`, `UnsupportedModeError`.
- `index.ts` — barrel.

## See also

- Root [`README.md`](../../README.md) — package overview and full event semantics.
- [`../ai-cli-client.ts`](../ai-cli-client.ts) — the `AICliClient` interface that consumes these types.
- [`docs/provider-capabilities.md`](../../docs/provider-capabilities.md) — full divergence matrix between providers.
````

- [ ] **Step 3: Self-check**

Verify:
- All six sections present in order.
- No full TS method signatures (e.g. `(input: SendInput): TurnHandleBase<...>`) in the body.
- Every name in the "Public exports" table appears somewhere in `src/unified/index.ts` (or in the barrel chain it re-exports from).
- Cross-reference paths resolve from `src/unified/`.

- [ ] **Step 4: Commit**

```bash
rtk git add src/unified/README.md
rtk git commit -m "$(cat <<'EOF'
docs(unified): add module README

Orientation-style README for the shared types/errors module.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `src/pty/README.md`

**Files:**
- Create: `src/pty/README.md`

- [ ] **Step 1: Read the source files**

Run:
- `cat src/pty/index.ts`
- `cat src/pty/types.ts`
- `cat src/pty/errors.ts`
- `cat src/pty/factory.ts` (just the `createPtyClient` JSDoc and signature)

The factory entry point is `createPtyClient(config)`; the spec for this module is `docs/superpowers/specs/2026-04-29-pty-transport-design.md`.

- [ ] **Step 2: Write the README**

Write `src/pty/README.md`:

````markdown
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
````

- [ ] **Step 3: Self-check**

Verify:
- All six sections present.
- No full TS signatures (`(...): Promise<PtyClient>` etc.) in the body — names + descriptions only.
- "Public exports" table matches `src/pty/index.ts` line-by-line.
- Spec link path is correct: `../../docs/superpowers/specs/2026-04-29-pty-transport-design.md`.

- [ ] **Step 4: Commit**

```bash
rtk git add src/pty/README.md
rtk git commit -m "$(cat <<'EOF'
docs(pty): add module README

Orientation-style README for the PTY transport module.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `src/copilot/namespaces/README.md`

**Files:**
- Create: `src/copilot/namespaces/README.md`

- [ ] **Step 1: Read the source files**

Run:
- `cat src/copilot/namespaces/index.ts`
- For each `*.ts` (not `_resolver.ts`, not `index.ts`): read just the file's leading TSDoc block — that's the description you need.

The barrel exports ten namespace classes. They are NOT constructed by users; they are accessed through `CopilotClient` properties (`client.plan`, `client.skills`, etc.).

- [ ] **Step 2: Write the README**

Write `src/copilot/namespaces/README.md`:

````markdown
# `copilot/namespaces` — RPC-namespace wrappers for Copilot

## Purpose

Thin object-oriented wrappers over the namespaced RPC surface exposed by `@github/copilot-sdk` (`session.rpc.<namespace>.<method>`). Each class is owned by a parent `CopilotClient` and accessed as a property on it (`client.plan.list()`, `client.workspaces.readFile()`, …). Users never construct these classes directly.

Each wrapper:

- Defers session lookup until call time via `_resolver.ts` — methods throw `SessionNotStartedError` if invoked before the parent client has started.
- Normalises errors to `CopilotRpcError` (with namespace/method context).
- For `@experimental` namespaces, surfaces "method not found" failures as `CopilotExperimentalUnavailableError` so callers can detect older CLI versions that lack the method.

## Public exports

| Name | Underlying RPC namespace | Stability | Purpose |
| --- | --- | --- | --- |
| `CopilotPlanApi` | `plan` | stable | Persistent plan-mode state for the session. |
| `CopilotSkillsApi` | `skills` | experimental | Skills management (custom skill registration). |
| `CopilotAgentApi` | `agent` | experimental | Custom-agent management. |
| `CopilotHistoryApi` | `history` | experimental | History compaction / truncation. |
| `CopilotUsageApi` | `usage` | experimental | Token usage metrics. |
| `CopilotShellApi` | `shell` | stable | Shell command execution within the session. |
| `CopilotWorkspacesApi` | `workspaces` | stable | Workspace inspection and file I/O. |
| `CopilotNameApi` | `name` | stable | Get/set human-readable session name. |
| `CopilotInstructionsApi` | `instructions` | stable | Read instruction sources loaded by the session. |
| `CopilotMcpApi` | `mcp` | experimental | MCP server config (list / enable / disable / reload) plus nested `oauth.login`. |

## Key interfaces

### Shape of every wrapper

Each class follows the same pattern:

- A private `_resolveX` getter per method (built by `makeSessionResolver`).
- One public method per upstream RPC method, with the same name where possible.
- Each method calls `callRpc(namespace, method, experimental, () => session.rpc.<ns>.<method>(...))`.

Read the individual files for the exact method names — they map 1:1 to the upstream Copilot SDK and are TSDoc-documented inline.

### `CopilotMcpApi` — note the nested `oauth`

Unlike the others, `CopilotMcpApi` exposes a nested `CopilotMcpOauthApi` at `client.mcp.oauth`. So MCP server *management* lives on `client.mcp.{list, enable, disable, reload}` and OAuth flows live on `client.mcp.oauth.login(...)`.

This is also the only namespace that has a Claude analogue, but in a different shape — see [`../../claude/README.md`](../../claude/README.md) for details on Claude's in-process MCP-handler model.

## Usage

These classes are accessed through the parent client; you never `new` them directly:

```ts
import { CopilotClient } from '@baoduy2412/ai-cli-client';

const client = new CopilotClient({ cwd: process.cwd() });
await client.start();

// Stable namespaces — call freely.
const plan = await client.plan.list();
await client.workspaces.readFile({ path: 'package.json' });

// Experimental namespaces — handle the unavailable case.
import { CopilotExperimentalUnavailableError } from '@baoduy2412/ai-cli-client';
try {
  const usage = await client.usage.get();
  console.log(usage);
} catch (err) {
  if (err instanceof CopilotExperimentalUnavailableError) {
    console.warn('Update copilot CLI to enable usage metrics.');
  } else {
    throw err;
  }
}

// MCP — nested oauth sub-API.
const servers = await client.mcp.list();
await client.mcp.oauth.login({ name: 'my-server' });
```

## Internal files

- `_resolver.ts` — `makeSessionResolver`, `callRpc`, `SessionGetter`. Shared by every wrapper; not exported.
- One file per namespace: `plan.ts`, `skills.ts`, `agent.ts`, `history.ts`, `usage.ts`, `shell.ts`, `workspaces.ts`, `name.ts`, `instructions.ts`, `mcp.ts`. Each contains exactly one exported class (plus `mcp.ts` which has two — the main `CopilotMcpApi` and the nested `CopilotMcpOauthApi`).
- `index.ts` — barrel.

## See also

- [`../README.md`](../README.md) — `CopilotClient` and how it wires these wrappers as properties.
- [`@github/copilot-sdk`](https://www.npmjs.com/package/@github/copilot-sdk) — the upstream SDK whose RPC namespaces these wrap.
- [`docs/superpowers/specs/2026-04-29-copilot-claude-feature-gap-fill-design.md`](../../../docs/superpowers/specs/2026-04-29-copilot-claude-feature-gap-fill-design.md) — design notes covering several namespaces.
````

- [ ] **Step 3: Self-check**

Verify:
- All ten namespace classes from `src/copilot/namespaces/index.ts` appear in the table.
- `oauth` sub-API for MCP is mentioned.
- Path to the spec from `src/copilot/namespaces/` is `../../../docs/superpowers/specs/...` (three `..`).
- No method-level signatures.

- [ ] **Step 4: Commit**

```bash
rtk git add src/copilot/namespaces/README.md
rtk git commit -m "$(cat <<'EOF'
docs(copilot/namespaces): add module README

Orientation-style README covering the ten RPC-namespace wrappers and
their access pattern through CopilotClient.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `src/copilot/README.md`

**Files:**
- Create: `src/copilot/README.md`

- [ ] **Step 1: Read the source files**

Run:
- `cat src/copilot/index.ts`
- Read the leading TSDoc of `src/copilot/client.ts` (just the `CopilotClient` class header — the file is large, do **not** read the whole thing).
- `cat src/copilot/types.ts`
- `cat src/copilot/errors.ts`
- `head -60 src/copilot/sessions.ts` (for `CopilotSessionLocatorOptions` and the session helpers)
- `cat src/copilot/turn-handle.ts`

`CopilotClient extends EventEmitter implements AICliClient`. It owns one of each namespace wrapper as a public field (`client.plan`, `client.skills`, …).

- [ ] **Step 2: Write the README**

Write `src/copilot/README.md`:

````markdown
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
| Session helpers | `sessions.ts` | `CopilotSessionLocatorOptions` and related helpers for locating session state on disk. |

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
} from '@baoduy2412/ai-cli-client';

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
````

- [ ] **Step 3: Self-check**

Verify:
- All six sections present.
- No full TS method signatures.
- Public-exports table covers everything in `src/copilot/index.ts` (re-exports of `types`, `errors`, `client`, `turn-handle`, `sessions`, plus the namespace re-exports).
- Internal files list reflects `ls src/copilot/` minus the items already in the public-exports table.
- All `../`/`../../` paths point at real files.

- [ ] **Step 4: Commit**

```bash
rtk git add src/copilot/README.md
rtk git commit -m "$(cat <<'EOF'
docs(copilot): add module README

Orientation-style README for the Copilot provider module.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `src/claude/README.md`

**Files:**
- Create: `src/claude/README.md`

- [ ] **Step 1: Read the source files**

`src/claude/client.ts` is 90KB — do **not** read it whole. Instead:

- `cat src/claude/index.ts`
- Use `grep -n '^export ' src/claude/client.ts` to confirm `ClaudeClient` and a few exported types are present (already verified during plan-writing — see plan context).
- `cat src/claude/mcp.ts`
- `cat src/claude/turn-handle.ts | head -100` (just the `TurnHandle` class header and surrounding interfaces).
- `cat src/claude/task-store.ts`, `cat src/claude/task-queue.ts`, `cat src/claude/question-session.ts`.
- `cat src/claude/types.ts | head -100` (config + key event types).
- `head -60 src/claude/sessions.ts` (it's larger; barrel-exported helpers + `SessionWatcher`).

- [ ] **Step 2: Write the README**

Write `src/claude/README.md`:

````markdown
# `claude` — Claude Code CLI provider

## Purpose

Provider implementation for Anthropic's Claude Code CLI. Spawns `claude` as a subprocess, drives it over its stdio control protocol, and exposes a `ClaudeClient` that implements the unified `AICliClient` interface plus several Claude-specific extensions (in-process MCP handlers, tool-approval interaction, hook callbacks, on-disk session inspection).

This is the older and more featureful of the two providers; the unified surface was designed to fit both, but Claude exposes capabilities Copilot does not (model setting, permission-mode setting, max-thinking-tokens, model listing, in-process MCP server hosting, hooks, fine-grained interrupt). Capability flags on `client.capabilities` reflect this.

For backward compatibility, `src/index.ts` re-exports this module's public surface at the package root, so `import { ClaudeClient } from '@baoduy2412/ai-cli-client'` works.

## Public exports

| Name | Source | Purpose |
| --- | --- | --- |
| `ClaudeClient` | `client.ts` | Provider client. `extends EventEmitter implements ITurnSession, AICliClient`. |
| `ClaudeClientConfig` | `client.ts` | Constructor options. |
| `ClaudePermissionMode` | `client.ts` | Native Claude permission vocabulary (`default`, `acceptEdits`, `auto`, `plan`, `dontAsk`, `bypassPermissions`). |
| `ToolUseStartEvent`, `ToolResultEvent` | `client.ts` | Claude-typed event payloads (the unified events use the unified shapes). |
| `SessionStatus` | `client.ts` | `'running' \| 'input_needed' \| 'idle' \| 'error'`. |
| `PendingAction` | `client.ts` | Provider-native pending-action shape. |
| `attachMcpHandlers` | `mcp.ts` | Register in-process MCP server handlers against a client. Returns a cleanup function. |
| `McpHandler`, `McpHandlers` | `mcp.ts` | Handler signatures. |
| `TurnHandle` | `turn-handle.ts` | Concrete `TurnHandleBase` returned by `client.send(...)`. |
| `TurnSnapshot`, `TurnUpdate`, `TurnHistoryEntry`, `TurnResult` | `turn-handle.ts` | Provider-native turn shapes (the unified `TurnSnapshot` lives in [`../unified/`](../unified/)). |
| `ClaudeSendOptions`, `TurnMessageState`, `ToolUseState`, `ToolResultState` | `turn-handle.ts` | Send-time options and turn-state component types. |
| `QuestionPrompt`, `QuestionOption`, `ToolApprovalRequest`, `QuestionRequest`, `HookRequest`, `McpRequest` | `turn-handle.ts` | Open-request shapes (Claude-native). |
| `ITurnSession`, `cloneSnapshot`, `cloneOpenRequest`, `cloneQuestionPrompt`, `buildQuestionPrompts`, `getQuestionLookupKeys`, `resolveQuestionPrompt`, `nowIso` | `turn-handle.ts` | Internal-use helpers leaked through the barrel for consumers extending the session model. |
| `ClaudeQuestionSession`, `QuestionAnswerSubmitter` | `question-session.ts` | Standalone question-flow primitive used by the client. |
| `TaskStore` | `task-store.ts` | Event-emitting registry of in-flight tasks. |
| `TaskMessageQueue` | `task-queue.ts` | FIFO queue for task messages awaiting delivery. |
| Session-on-disk helpers (`escapeProjectPath`, `unescapeProjectPath`, `getProjectStoragePath`, `listProjects`, `getSessionDetails`, `getMessagesSince`, `normalizeClaudeSessionMessages`) | `sessions.ts` | Read and parse Claude's per-project session storage on disk. |
| `SessionWatcher` | `sessions.ts` | `EventEmitter` that watches a project's session directory for new messages. |
| Other types from `types.ts` | `types.ts` | Wire-protocol message shapes (`SystemMessage`, `StreamEventMessage`, `ControlRequest`/`ControlResponse*`, `McpMessageEvent`, `HookCallbackEvent`, `TaskMessageEvent`, etc.). |

## Key interfaces

### `ClaudeClient`

The provider client. Construct with `new ClaudeClient(config)` then `await client.start()`, **or** use the static `ClaudeClient.init(config)` which constructs and starts in one call. The unified factory (`createAICliClient`) uses `init`. Implements every `AICliClient` member, including all four optional setters.

Beyond the unified surface, `ClaudeClient` exposes provider-specific methods (sending raw MCP messages, replying to control requests, approving/denying tool calls with scope) — see `client.ts` TSDoc for the full list. Use `client.provider === 'claude'` to narrow types.

### `attachMcpHandlers`

In-process MCP server hosting. Register handlers keyed by server name; the helper subscribes to the client's `mcp_message` event, dispatches each incoming JSON-RPC request to the right handler, and writes a JSON-RPC response back. Returns a cleanup function that detaches the listener.

This is Claude's MCP integration model: your Node process *is* the MCP server, no external binary needed. (Copilot's `mcp` namespace, by contrast, only manages external MCP servers — see [`../copilot/namespaces/README.md`](../copilot/namespaces/README.md).)

### `TurnHandle`

Concrete `TurnHandleBase` for Claude. Streams `TurnUpdate`s, exposes the rich `TurnSnapshot` (with open-request lists, hooks, MCP requests). Many consumers prefer the unified snapshot via `client.getCurrentTurn()`/`getHistory()`, but the per-turn handle gives access to live updates and Claude-specific request types.

### Session-on-disk helpers (`sessions.ts`)

Standalone utilities for inspecting the JSONL session files Claude writes per-project. Useful for replaying or auditing past sessions without driving the CLI. `SessionWatcher` is an event emitter that tails the active project's directory.

### `TaskStore`, `TaskMessageQueue`, `ClaudeQuestionSession`

Smaller pieces used internally by `ClaudeClient` and exposed for consumers building richer UIs around the wire protocol. Not required for ordinary use of `client.send(...)`.

## Usage

```ts
import {
  ClaudeClient,
  attachMcpHandlers,
  type McpHandlers,
} from '@baoduy2412/ai-cli-client';

const client = await ClaudeClient.init({ cwd: process.cwd() });

// Optional: host an in-process MCP server.
const handlers: McpHandlers = {
  echo: async (msg) => ({ jsonrpc: '2.0', id: msg.id, result: msg.params }),
};
const detach = attachMcpHandlers(client, handlers);

client.on('text', (c) => process.stdout.write(c));

const handle = client.send('hello');
const final = await handle.done;
console.log(final.text);

// Claude-only setters.
await client.setModel?.('claude-opus-4-7');
await client.setPermissionMode?.('plan');

detach();
await client.close();
```

## Internal files

- `client.ts` — `ClaudeClient` implementation; large file owning lifecycle, control-protocol dispatch, MCP/hooks bridging, and most of the public surface.
- `transport.ts` — child-process spawn + framed stdio transport (small wrapper).
- `turn-handle.ts` — turn-state model, `TurnHandle`, and the helpers re-exported from the barrel.
- `mcp.ts` — `attachMcpHandlers` helper.
- `question-session.ts` — `ClaudeQuestionSession` primitive.
- `task-store.ts`, `task-queue.ts` — task subsystem.
- `sessions.ts` — on-disk session inspection.
- `types.ts` — wire-protocol type declarations.
- `index.ts` — barrel.

## See also

- Root [`README.md`](../../README.md) — package overview, common API, full event table.
- [`../copilot/README.md`](../copilot/README.md) — sibling provider.
- [`../unified/README.md`](../unified/README.md) — shared types and event vocabulary.
- [`../copilot/namespaces/README.md`](../copilot/namespaces/README.md) — Copilot's `mcp` namespace, for context on the asymmetry described under `attachMcpHandlers`.
- [`docs/provider-capabilities.md`](../../docs/provider-capabilities.md) — divergence matrix.
````

- [ ] **Step 3: Self-check**

Verify:
- All six sections present.
- No full TS method signatures of `ClaudeClient` methods.
- The Public exports table reflects the chain of `export *` re-exports from `src/claude/index.ts`. (You don't need to enumerate *every* type exported from `types.ts`; the "Other types from `types.ts`" row covers them.)
- All cross-reference paths resolve.

- [ ] **Step 4: Commit**

```bash
rtk git add src/claude/README.md
rtk git commit -m "$(cat <<'EOF'
docs(claude): add module README

Orientation-style README for the Claude provider module, including
the in-process MCP-handler integration and on-disk session helpers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `src/README.md`

**Files:**
- Create: `src/README.md`

- [ ] **Step 1: Read the source files**

Run:
- `cat src/index.ts`
- `cat src/factory.ts`
- `cat src/ai-cli-client.ts`
- `cat src/turn-handle.ts`

This is the top-level barrel. It re-exports everything from `claude` (for backward compatibility), exposes both clients by name, owns the unified `AICliClient` interface and `createAICliClient` factory, and re-exports selected types from `unified` and the `pty` surface.

- [ ] **Step 2: Write the README**

Write `src/README.md`:

````markdown
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
| `TurnHandleBase` | `turn-handle.ts` | Cross-provider turn-handle interface — the lowest common denominator of `ClaudeTurnHandle` and `CopilotTurnHandle`. |
| Unified types | re-export of [`./unified/`](./unified/) | `TurnSnapshot`, `SendInput`, `ContentBlock`, `AICliCapabilities`, `PermissionMode`, `LegacyPermissionMode`, `SupportedModelsResponse`, `UnifiedEventMap`, `UnifiedEventName`, `UnsupportedContentError`, `translateLegacyPermissionMode`, plus the Phase 1.2 pending-request shapes. See [`./unified/README.md`](./unified/README.md). |
| PTY surface | re-export of [`./pty/`](./pty/) | `createPtyClient`, `PtyClient`, `PtyClientConfig`, `PtyCommonConfig`, `ClaudePtyConfig`, `CopilotPtyConfig`, plus the `Pty*Error` hierarchy. See [`./pty/README.md`](./pty/README.md). |
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
````

- [ ] **Step 3: Self-check**

Verify:
- All six sections present.
- No full TS method signatures of `AICliClient` methods.
- Every section that refers to a sub-module README links to it (`./claude/README.md`, etc.) and the link path resolves from `src/`.
- No mention of types that aren't re-exported by `src/index.ts`.

- [ ] **Step 4: Commit**

```bash
rtk git add src/README.md
rtk git commit -m "$(cat <<'EOF'
docs(src): add top-level src README

Orientation-style README for the package's entry barrel; links to
each per-module README beneath it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Final verification

**Files:** None modified.

- [ ] **Step 1: Confirm all six READMEs exist**

Run: `ls src/README.md src/claude/README.md src/copilot/README.md src/copilot/namespaces/README.md src/pty/README.md src/unified/README.md`
Expected: each file listed without error.

- [ ] **Step 2: Confirm sections present in each**

For each README, run:
```bash
grep -E '^## (Purpose|Public exports|Key interfaces|Usage|Internal files|See also)' <path>
```
Expected: six matches per file (one per heading), in order.

If a heading is missing or out of order, fix it in the offending file and add a follow-up commit.

- [ ] **Step 3: Confirm no full method signatures slipped in**

Run:
```bash
grep -nE '\): (Promise|TurnHandleBase|void|this|UnifiedStatus)' src/**/README.md src/README.md
```
Expected: no matches in module READMEs (a few may match in the *root* `README.md`, which is unchanged — but `src/README.md` is the one we wrote and should be clean).

If matches appear in any of the six new READMEs, edit them to remove the signature in favour of a name + description.

- [ ] **Step 4: Confirm cross-reference links resolve**

For each `[text](relative-path)` link in the new READMEs, check the path resolves:
```bash
for f in src/README.md src/claude/README.md src/copilot/README.md src/copilot/namespaces/README.md src/pty/README.md src/unified/README.md; do
  echo "=== $f ==="
  grep -oE '\]\([^)]+\)' "$f" | sed -E 's/\]\(([^)]+)\)/\1/'
done
```
Then for each path, check it resolves relative to its source file. (URLs starting with `http` are fine to skip.) Any miss → edit the file and add a follow-up commit.

- [ ] **Step 5: Final scope check**

Run: `rtk git log --oneline -8`
Expected: six commits, one per README, plus any follow-up fix commits from Steps 2–4.

If everything looks clean, no further action is needed. The plan does not require pushing or tagging — that's a separate decision for the user.

---

## Self-Review

**Spec coverage:**
- ✅ Six READMEs at the listed paths — Tasks 1–6.
- ✅ Six-section template — every task's Step 2 prescribes the same six sections.
- ✅ Orientation-style (option A) — none of the README contents in the plan show full TS method signatures; signatures are only present in the concrete `client.send(input)` style, never as full type signatures.
- ✅ Public-exports anchored to barrel — every Public exports table is drawn from the corresponding `index.ts`.
- ✅ Cross-references use relative paths — verified inline.
- ✅ Single commit per file with `docs(<module>): add module README` — see Step 4 in each task.
- ✅ Final verification — Task 7.

**Placeholder scan:** No "TBD"/"TODO"/"fill in"/"similar to Task N" patterns. Each task includes the full content the engineer is expected to write.

**Type consistency:** No new types or methods are introduced; all references match existing source (verified during plan-writing by reading `src/*/index.ts` and the relevant types/errors files).

**Acceptance criteria coverage:**
- All six README files exist → Task 7 Step 1.
- Each contains the six sections → Task 7 Step 2.
- Public-exports tables match barrels → embedded in each task's README content; would have failed self-check at Step 3 of each task otherwise.
- No full type signatures → Task 7 Step 3.
- Cross-references resolve → Task 7 Step 4.
- Files committed in single commits per file → Step 4 of each task.

Plan is ready to execute.
