# Copilot ↔ Claude feature gap-fill — design spec

**Status:** Approved (brainstorming) — pending implementation plan
**Author:** Steven Hoang
**Date:** 2026-04-29
**Target package:** `@drunkcoding/ai-cli-clients` (currently 1.0.0)
**Target SDK:** `@github/copilot-sdk@0.3.0`
**Phasing:** 1.1.0 → 1.2.0 → 1.3.0 (three minor releases)

---

## 1. Goal

Close the asymmetry between `ClaudeClient` and `CopilotClient` by lifting Copilot's actual SDK capabilities onto the unified `AICliClient` interface, and exposing Copilot-only bonus surface on the concrete class.

After phase 1.3, the only remaining unfillable items are Claude wire-protocol primitives with no Copilot analog (`sendControlRequest`, `sendMcpMessage`, `sendMcpControlResponse`, `setMaxThinkingTokens`, `createQuestionSession`, `sendMessageWithContent`, `getCurrentTurnDetailed`).

Maximalist scope was chosen explicitly so that future SDK additions on either side can be filled symmetrically — we capture the concrete surface as faithfully as possible rather than trimming to the lowest common denominator.

## 2. Revalidation against `@github/copilot-sdk@0.3.0`

The brainstorming process verified every claim against the installed SDK's `dist/*.d.ts`. Highlights:

- The `session.rpc.*` namespace exposed by `createSessionRpc()` (`generated/rpc.d.ts:1805`) is the source of truth for all pull-style methods. Both push (registered handler) and pull (event + `handlePending*` RPC) models are supported by the SDK.
- `permission.requested` and `elicitation.requested` events both carry `requestId`, enabling event-driven request tracking on Copilot side.
- `SessionConfig.onPermissionRequest: PermissionHandler` is **required** at session creation. Our pull-mode emulation registers this handler internally and exposes a queue.
- `MessageOptions.attachments` supports `file`, `directory`, `selection`, `blob` (with `mimeType`) — broader than just images.
- `SessionConfig.hooks: SessionHooks` provides `onPreToolUse`, `onPostToolUse`, `onUserPromptSubmitted`, `onSessionStart`, `onSessionEnd`, `onErrorOccurred` at create-time.
- `SessionConfig.mcpServers: Record<string, MCPServerConfig>` accepts stdio + http/sse variants at create-time.
- `session.rpc.mcp.{list,enable,disable,reload}` and `session.rpc.mcp.oauth.login` provide runtime MCP control (marked `@experimental` upstream).
- `session.disconnect()` is the supported lifecycle exit; `session.destroy()` is a deprecated alias.

## 3. High-level architecture

### 3.1 Three phases, three minor releases

| Phase | Version | Theme | Breaking? |
|---|---|---|---|
| 1.1 | 1.1.0 | Configuration parity | No (additive) |
| 1.2 | 1.2.0 | Interactive approval parity | One — `PermissionMode` vocabulary rename, gated by deprecation alias kept until 2.0.0 |
| 1.3 | 1.3.0 | Copilot bonus RPC surface | No (additive, concrete-class only) |

### 3.2 Six-step structure for every gap-fill

1. **`src/copilot/sdk.ts` shim** gains a `export type` / `export {}` re-export — adapter code never imports `@github/copilot-sdk` directly.
2. **Capability flag** added to `AICliCapabilities` (gap-fills) or implicit via namespace existence (bonus surface).
3. **Concrete client method** implemented on `CopilotClient` (and `ClaudeClient` if missing).
4. **Unified interface entry** added to `AICliClient` as optional `?:` slot — gap-fills only.
5. **Capability matrix doc** (`docs/provider-capabilities.md`) — one row added/changed.
6. **Tests** — unit (mocked SDK) + cross-provider integration smoke.

### 3.3 Bonus-surface wrapper pattern (Phase 1.3)

Each Copilot bonus RPC namespace gets a typed wrapper class under `src/copilot/namespaces/`:

```ts
export class CopilotPlanApi {
  /** @internal */ constructor(private readonly _session: () => GhCopilotSession) {}
  read(): Promise<PlanReadResult>      { return this._session().rpc.plan.read(); }
  update(p: PlanUpdateRequest): Promise<void> { return this._session().rpc.plan.update(p); }
  delete(): Promise<void>              { return this._session().rpc.plan.delete(); }
}
```

Three structural choices:

- **Lazy session resolver** `() => GhCopilotSession` — wrappers are constructed before `start()`; calling a method before `start()` throws `SessionNotStartedError`.
- **Re-export types via `src/copilot/sdk.ts` shim** — never import directly from `@github/copilot-sdk` in namespace files.
- **One method per RPC, no consolidation** — keeps cognitive model identical to upstream SDK docs.

## 4. Phase 1.1 — Configuration parity (target: 1.1.0)

### 4.1 What lands

| Item | Surface | Implementation |
|---|---|---|
| `setModel` | `AICliClient.setModel?(model: string): Promise<void>` | Copilot: `session.setModel(model)`. Claude: already implemented. Capability flag flips on Copilot. |
| `listSupportedModels` | `AICliClient.listSupportedModels?(timeout?: number): Promise<SupportedModelsResponse>` | Copilot: wraps `client.listModels()` and adapts `ModelInfo[]`. Claude: already implemented. |
| `getMessages` | `AICliClient.getMessages?(): Promise<UnifiedMessage[]>` (new) | Copilot: wraps `session.getMessages()` and projects `SessionEvent[]` → `UnifiedMessage[]`. Claude: aliases `getHistoryDetailed()` and projects. |
| Rich `SendInput` (Copilot) | Existing `SendInput` expanded to accept four Copilot attachment kinds | Translate `SendInput` content blocks → `MessageOptions.attachments`. Capability `richContent: 'full'` for Copilot. |
| `hooks` config | `CopilotClientConfig.hooks?: SessionHooks` (provider-specific shape) | Pass straight through to `SessionConfig.hooks`. Capability `hooks: true` for Copilot. |
| `mcpServers` config | `CopilotClientConfig.mcpServers?: Record<string, MCPServerConfig>` | Pass straight through to `SessionConfig.mcpServers`. Capability `mcp: true` for Copilot. |
| `kill`/`disconnect` lifecycle | `AICliClient.close()` semantics harmonized | Copilot: `close()` = `session.abort()` (idempotent if no turn) → `session.disconnect()` → `client.stop()`. Both providers fire `closed` event. |

### 4.2 `UnifiedMessage` shape

```ts
export interface UnifiedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  text?: string;
  reasoning?: string;
  toolUse?: TurnToolUse;
  toolResult?: TurnToolResult;
  timestamp: number;                // epoch ms
  /** Provider-specific raw event for narrowing. */
  raw: { provider: 'claude'; event: ClaudeMessageEvent }
     | { provider: 'copilot'; event: SessionEvent };
}
```

Consumers needing full fidelity narrow on `raw.provider` and access `raw.event`.

### 4.3 Attachment translation table

| Our `SendInput` block | Copilot attachment |
|---|---|
| `{ type: 'image', source: { type: 'base64', data, media_type } }` | `{ type: 'blob', data, mimeType: media_type }` |
| `{ type: 'image', source: { type: 'path', path } }` | `{ type: 'file', path }` |
| `{ type: 'file_path', path }` (new) | `{ type: 'file', path }` |
| `{ type: 'directory_path', path }` (new) | `{ type: 'directory', path }` |
| `{ type: 'selection', filePath, range, displayName }` (new) | `{ type: 'selection', filePath, displayName, selection: range }` |

Passing `file_path`, `directory_path`, or `selection` to Claude throws `UnsupportedContentError` (mirror of today's behavior in reverse).

### 4.4 Capability widening

`richContent` widens from `boolean` → `'none' | 'partial' | 'full'`:

- Claude: `'partial'` (text + image only)
- Copilot: `'full'` (text + image + file + directory + selection + blob)

This is a TS breaking change for consumers using `=== true`. Truthy/falsy checks still work. Migration: `caps.richContent !== 'none'`.

### 4.5 Files touched (Phase 1.1)

- `src/ai-cli-client.ts` — 3 new optional methods
- `src/unified/types.ts` — `UnifiedMessage`, expanded `SendInput`, widened `richContent`
- `src/copilot/client.ts` — implement methods + lifecycle
- `src/copilot/sessions.ts` (or new `attachments.ts`) — translator
- `src/copilot/types.ts` — accept `hooks`, `mcpServers`
- `src/copilot/sdk.ts` — re-export `SessionHooks`, `MCPServerConfig`, related types
- `src/claude/client.ts` — `getMessages` projection
- `docs/provider-capabilities.md` — flips + new rows
- Tests as listed in Section 8

### 4.6 Out of scope for 1.1

- No interactive approval API changes
- No `permissionMode` vocabulary changes
- No bonus Copilot RPCs
- No new unified events
- `setMaxThinkingTokens` stays Claude-only

## 5. Phase 1.2 — Interactive approval parity (target: 1.2.0)

### 5.1 Unified surface additions

```ts
export interface AICliClient {
  // ... existing surface ...

  // Interactive approval (Group D — was deferred)
  getOpenRequests?(): PendingRequest[];
  approveRequest?(id: string, decision?: ApproveDecision): Promise<void>;
  denyRequest?(id: string, feedback?: string): Promise<void>;
  answerQuestion?(id: string, response: QuestionResponse): Promise<void>;
  getPendingAction?(): PendingAction | null;

  // Granular control
  interruptTurn?(turnId?: string): Promise<void>;
  getDetailedStatus?(): DetailedStatus;

  // Permission mode now portable
  setPermissionMode?(mode: PermissionMode): Promise<void>;
}
```

### 5.2 Unified vocabulary

```ts
export type PermissionMode =
  | 'prompt'       // Claude: default       | Copilot: interactive + setApproveAll(false)
  | 'auto-edit'    // Claude: acceptEdits   | Copilot: interactive + handler auto-approves PermissionRequest.kind === 'write'
  | 'auto-all'     // Claude: bypassPermissions | Copilot: interactive + setApproveAll(true)
  | 'plan'         // Claude: plan          | Copilot: mode.set('plan')
  | 'autopilot';   // Claude: throws UnsupportedModeError | Copilot: mode.set('autopilot')

// Per-provider capability:
capabilities.permissionModes: PermissionMode[];
//   Claude:  ['prompt', 'auto-edit', 'auto-all', 'plan']
//   Copilot: ['prompt', 'auto-edit', 'auto-all', 'plan', 'autopilot']
```

`setPermissionMode(mode)` rejects with `UnsupportedModeError` if `mode` is not in the provider's `permissionModes` array.

### 5.3 `PendingRequest` shape (discriminated)

```ts
export type PendingRequest =
  | PermissionPendingRequest
  | ElicitationPendingRequest
  | UserInputPendingRequest;

export interface PermissionPendingRequest {
  id: string;                              // requestId from SDK event
  kind: 'permission';
  permissionKind: 'shell' | 'write' | 'mcp' | 'read' | 'url' | 'custom-tool' | 'memory' | 'hook';
  message: string;
  toolCallId?: string;
  raw: { provider: 'claude'; payload: ClaudePermissionRequest }
     | { provider: 'copilot'; payload: PermissionRequest };
}

export interface ElicitationPendingRequest {
  id: string;
  kind: 'elicitation';
  message: string;
  schema?: ElicitationSchema;
  raw: { provider: 'claude'; payload: ClaudeElicitation }
     | { provider: 'copilot'; payload: ElicitationContext };
}

export interface UserInputPendingRequest {
  id: string;
  kind: 'question';
  question: string;
  choices?: string[];
  allowFreeform: boolean;
  raw: { provider: 'claude'; payload: ClaudeQuestion }
     | { provider: 'copilot'; payload: UserInputRequest };
}
```

```ts
export type ApproveDecision =
  | { scope: 'once' }
  | { scope: 'session' }
  | { scope: 'location'; locationKey: string };  // Copilot supports; Claude collapses to 'session'

export type QuestionResponse =
  | { kind: 'text'; answer: string }
  | { kind: 'choice'; value: string }
  | { kind: 'form'; values: Record<string, string | number | boolean | string[]> }
  | { kind: 'cancel' };
```

### 5.4 `PendingRequestQueue` — implementation pattern (Copilot side)

The SDK requires `SessionConfig.onPermissionRequest` to be set. We register internal handlers that hold a deferred resolver per request:

```ts
class PendingRequestQueue {
  private map = new Map<string, PendingEntry>();

  registerPermission(req: PermissionRequest, sessionId: string): Promise<PermissionRequestResult> {
    const id = generateId();
    return new Promise(resolve => {
      this.map.set(id, { kind: 'permission', resolve, request: req });
      this.client.emit('pending_request_added', { id, kind: 'permission' });
    });
  }
  // Same pattern for elicitation, userInput.
}

const session = await client.createSession({
  onPermissionRequest: (req, ctx) => queue.registerPermission(req, ctx.sessionId),
  onElicitationRequest: (ctx) => queue.registerElicitation(ctx),
  onUserInputRequest: (req, ctx) => queue.registerUserInput(req, ctx.sessionId),
  // ... user-provided config
});
```

When the consumer calls `approveRequest(id, { scope: 'session' })`:

1. Look up the entry in the queue.
2. Construct the matching `PermissionRequestResult` per Copilot's vocab (`{ kind: 'approve-for-session', approval: ... }`).
3. Call the deferred resolver → SDK callback returns → SDK proceeds.
4. Remove from queue, emit `pending_request_removed`, then `pending_request_resolved`.

### 5.5 Handler chaining for user-provided `onPermissionRequest`

Two modes:

- **No user handler** — queue handler installed; pull-style API works.
- **User-provided handler** — chained: user's handler runs first; if it throws our `RequestNotHandled` sentinel error, we fall through to the queue.

We add a runtime check at `start()` that warns if the registered handler returns `{kind:'no-result'}` (which throws on protocol v2 per the SDK).

### 5.6 `auto-edit` semantics on Copilot

Our internal permission handler auto-approves requests where `PermissionRequest.kind === 'write'` and prompts on others. This is opinionated. Documented in the matrix doc as a known asymmetry. Users wanting precise control bypass with their own permission handler.

### 5.7 `getDetailedStatus` shape

```ts
export interface DetailedStatus {
  status: UnifiedStatus;             // coarse 3-state
  phase: ClaudePhase | CopilotPhase | 'unknown';
  pendingRequestCount: number;
  permissionMode?: PermissionMode;
  raw: { provider: 'claude'; payload: ClaudeDetailedStatus }
     | { provider: 'copilot'; payload: { sessionMode?: SessionMode; lastEventType?: SessionEventType; lastEventTimestamp?: number } };
}
```

Copilot side synthesizes `phase` from a buffered most-recent session-lifecycle event.

### 5.8 `interruptTurn(turnId?)` semantics

- **Claude** — already has it; `turnId` respected (per-turn granularity).
- **Copilot** — `turnId` ignored (warns if `process.env.COPILOT_VERBOSE === '1'`); calls `session.abort()`.
- Capability `interruptTurnGranularity: 'per-turn' | 'session-only'` exposed for cross-provider code.

### 5.9 Three new unified events

Added to `UnifiedEventMap`:

```ts
'pending_request_added':    [{ id: string; kind: 'permission' | 'elicitation' | 'question' }];
'pending_request_removed':  [{ id: string }];
'pending_request_resolved': [{ id: string; outcome: 'approved' | 'denied' | 'answered' | 'cancelled' }];
```

### 5.10 `PermissionMode` migration

```ts
export type PermissionMode = 'prompt' | 'auto-edit' | 'auto-all' | 'plan' | 'autopilot';

/** @deprecated Use PermissionMode. Will be removed in 2.0.0. */
export type LegacyPermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

setPermissionMode?(mode: PermissionMode | LegacyPermissionMode): Promise<void>;
```

Runtime translation table inside `setPermissionMode`. CHANGELOG entry includes a one-line `sed` migration:

```
sed -i.bak "s/'default'/'prompt'/g; s/'acceptEdits'/'auto-edit'/g; s/'bypassPermissions'/'auto-all'/g" <files>
```

Alias removed in 2.0.0.

### 5.11 Files touched (Phase 1.2)

- `src/ai-cli-client.ts` — 7 new optional methods
- `src/unified/types.ts` — `PermissionMode` rename + alias, `PendingRequest`, `ApproveDecision`, `QuestionResponse`, `DetailedStatus`
- `src/unified/events.ts` — 3 new events
- `src/copilot/pending-queue.ts` — **new file**
- `src/copilot/permission-mapping.ts` — **new file**
- `src/copilot/client.ts` — wire queue, implement 7 methods
- `src/copilot/types.ts` — `RequestNotHandled` sentinel
- `src/claude/client.ts` — thin adapters over existing internals; map new vocab
- `docs/provider-capabilities.md` — large update
- `CHANGELOG.md` — breaking-change call-out + migration

## 6. Phase 1.3 — Copilot bonus RPC surface (target: 1.3.0)

### 6.1 Namespaces shipped

| Namespace | Stability | Methods |
|---|---|---|
| `client.plan` | stable | `read()` / `update(p)` / `delete()` |
| `client.skills` | `@experimental` | `list()` / `enable(p)` / `disable(p)` / `reload()` |
| `client.agent` | `@experimental` | `list()` / `getCurrent()` / `select(p)` / `deselect()` / `reload()` |
| `client.history` | `@experimental` | `compact()` / `truncate(p)` |
| `client.usage` | `@experimental` | `getMetrics()` |
| `client.shell` | stable | `exec(p)` / `kill(p)` |
| `client.workspaces` | stable | `getWorkspace()` / `listFiles()` / `readFile(p)` / `createFile(p)` |
| `client.name` | stable | `get()` / `set(p)` |
| `client.instructions` | stable | `getSources()` |
| `client.mcp` | `@experimental` | `list()` / `enable(p)` / `disable(p)` / `reload()` + `client.mcp.oauth.login(p)` |

**Total:** 10 namespaces, 31 methods.

### 6.2 Wrapper file pattern

One file per namespace under `src/copilot/namespaces/`. Lazy session resolver, error normalization via `CopilotRpcError`. JSDoc `@experimental` tag for experimental namespaces. README "Experimental APIs" section warns about upstream shape volatility.

### 6.3 Subpath export

```jsonc
"./copilot/namespaces": {
  "types": "./dist/types/copilot/namespaces/index.d.ts",
  "import": "./dist/esm/copilot/namespaces/index.js",
  "require": "./dist/cjs/copilot/namespaces/index.js"
}
```

`src/copilot/namespaces/index.ts` re-exports all 10 wrapper classes plus relevant SDK types. Useful for typing function signatures like `function loadPlan(api: CopilotPlanApi)`.

### 6.4 Error normalization

Each wrapper method runs through `normalizeError(rpcCall)`:

- Wraps unknown errors as `CopilotRpcError extends CopilotError`
- Adds `error.namespace` (e.g. `'plan'`) and `error.method` (e.g. `'read'`)
- Adds `error.experimental: true` if the namespace is experimental
- Catches "method not found" RPC errors from older CLI versions and re-throws as `CopilotExperimentalUnavailableError` with detected CLI version

### 6.5 Excluded SDK namespaces

We do **not** wrap:

- `auth.getStatus` — already exposed via `client.getAuthStatus()`
- `model.{getCurrent, switchTo}` — covered by Phase 1.1's unified `setModel`
- `mode.{get, set}` — covered by Phase 1.2's unified `setPermissionMode`
- `permissions.*` — covered by Phase 1.2's unified approve/deny
- `tools.handlePendingToolCall` / `commands.handlePendingCommand` / `ui.handlePendingElicitation` — covered by Phase 1.2's `PendingRequestQueue`
- `fleet`, `extensions`, `plugins` — niche, all `@experimental`, low real-world demand

### 6.6 Files touched (Phase 1.3)

- `src/copilot/namespaces/{plan,skills,agent,history,usage,shell,workspaces,name,instructions,mcp}.ts` — 10 new files
- `src/copilot/namespaces/index.ts` — barrel
- `src/copilot/errors.ts` — `SessionNotStartedError`, `CopilotRpcError`, `CopilotExperimentalUnavailableError`
- `src/copilot/client.ts` — 10 readonly fields + constructor wiring
- `src/copilot/sdk.ts` — re-export ~20 RPC request/result types
- `package.json` — new subpath export
- `docs/provider-capabilities.md` — new "Copilot bonus surface" sub-section
- `README.md` — new "Experimental APIs" section

## 7. Capability matrix evolution

### 7.1 `AICliCapabilities` after each phase

```ts
// 1.0.0 (today)
interface AICliCapabilities {
  setModel: boolean;
  setPermissionMode: boolean;
  setMaxThinkingTokens: boolean;
  listSupportedModels: boolean;
  richContent: boolean;
}

// 1.1.0
interface AICliCapabilities {
  setModel: boolean;
  setPermissionMode: boolean;
  setMaxThinkingTokens: boolean;
  listSupportedModels: boolean;
  richContent: 'none' | 'partial' | 'full';   // widened
  // new
  getMessages: boolean;
  hooks: boolean;
  mcp: boolean;
}

// 1.2.0
interface AICliCapabilities {
  // ... 1.1 fields ...
  permissionModes: PermissionMode[];          // new — exact list per provider
  interactiveApproval: boolean;
  interruptTurnGranularity: 'per-turn' | 'session-only';
  detailedStatus: boolean;
}

// 1.3.0 — no AICliCapabilities changes (bonus surface is concrete-class only)
```

### 7.2 Per-phase delta

```
Phase 1.1.0 — config parity:
  setModel               Copilot ❌ → ✅
  listSupportedModels    Copilot ❌ → ✅
  richContent            widened to 'none' | 'partial' | 'full'
  getMessages            new — both ✅
  hooks (config)         Copilot ❌ → ✅
  mcp (config)           Copilot ❌ → ✅
  attachments            new row — Claude (image only), Copilot (file/dir/sel/blob/image)

Phase 1.2.0 — interactive approval parity:
  setPermissionMode      Copilot ❌ → ✅
  permissionModes        new — Claude [4], Copilot [5]
  getOpenRequests        moved concrete → unified
  approveRequest         moved concrete → unified
  denyRequest            moved concrete → unified
  answerQuestion         moved concrete → unified
  getPendingAction       moved concrete → unified
  interruptTurn          moved concrete → unified (with granularity flag)
  getDetailedStatus      moved concrete → unified
  PermissionMode vocab   BREAKING rename (legacy alias kept for 1.2.x)
  3 new unified events   pending_request_added/removed/resolved

Phase 1.3.0 — Copilot bonus surface:
  10 new namespaces on CopilotClient
```

### 7.3 Maintenance rule update

Existing rule:
> Every PR that adds a method or event to either concrete client must add a row here.

Expanded in 1.1 with a second clause:
> Every PR that flips a capability flag must update the corresponding `permissionModes` array (if applicable), regenerate the capability snapshot test fixture, and add a CHANGELOG entry under the matching version heading.

### 7.4 CI guard

`test/unit/capability-matrix.test.mjs` parses the matrix doc and asserts every ✅/❌ matches the runtime `client.capabilities` snapshot for both providers. Fails CI when doc and code disagree.

## 8. Testing strategy

### 8.1 Test taxonomy

| Layer | Coverage | Runner | Network needed |
|---|---|---|---|
| Unit tests | Single-class behavior with mocked SDK / stub transport | `node --test` | No |
| Contract tests | `AICliClient` interface conformance, parameterized over both clients | `node --test` | No |
| Capability snapshot tests | Frozen JSON snapshots; matrix-doc parser test | `node --test` | No |
| Integration smoke | Real CLIs against actual servers | `npm run integration:*` | Yes (API keys) |

### 8.2 Per-phase test inventory

**Phase 1.1** — 9 unit + 2 contract + 1 integration:
- `test/copilot/{set-model,list-models,get-messages,attachments,hooks-config,mcp-config,lifecycle-close}.test.mjs`
- `test/claude/get-messages.test.mjs`
- `test/contract/{get-messages,set-model}.test.mjs`
- `scripts/integration-1.1-config-parity.mjs`

**Phase 1.2** — 7 unit + 1 contract + 1 integration + mock harness:
- `test/copilot/{pending-queue,approve-deny,elicitation-queue,user-input-queue,permission-mode-mapping,handler-chaining}.test.mjs`
- `test/claude/permission-mode-aliases.test.mjs`
- `test/contract/interactive-approval.test.mjs`
- `test/copilot/__fixtures__/event-replay.ts` — deterministic event-stream replay
- `scripts/integration-1.2-approval.mjs`

**Phase 1.3** — 10 unit + 1 integration:
- `test/copilot/namespaces/{plan,skills,agent,history,usage,shell,workspaces,name,instructions,mcp}.test.mjs`
- `scripts/integration-1.3-bonus-surface.mjs`

### 8.3 Mock harness extensions

Per-phase additions live in dedicated files for diff readability:

- `test/copilot/__fixtures__/mock-sdk-1.1.ts` — adds attachment translator inspector, hook invocation tracker
- `test/copilot/__fixtures__/mock-sdk-1.2.ts` — adds event injection helper, RPC method stubs for `permissions`/`ui`/`tools`/`commands`
- `test/copilot/__fixtures__/mock-sdk-1.3.ts` — adds RPC stubs for the 10 bonus namespaces

The base `mock-sdk.ts` re-exports the latest.

### 8.4 Coverage targets

- Unit + contract: ≥85% line coverage on touched files
- Capability matrix test: 100% — every flag round-trips
- Integration: every new method invoked at least once on each provider where it's expected to work

### 8.5 Integration gating

CI runs unit + contract + capability-matrix. Integration scripts are opt-in via env vars and run locally before each phase's release tag. Failures during release exercise are CHANGELOG-blocking.

## 9. Out of scope, deferred, and risks

### 9.1 Genuinely unfillable (stays Claude-only)

| Item | Why | Revisit trigger |
|---|---|---|
| `setMaxThinkingTokens` | Copilot has only coarse `reasoningEffort` | SDK ships explicit thinking budget |
| `createQuestionSession` | Copilot has no multi-turn question session | SDK adds multi-turn elicitation |
| `sendControlRequest` | Pure Claude wire-protocol primitive | Never |
| `sendMcpMessage` | Pure Claude wire-protocol primitive | Never |
| `sendMcpControlResponse` | Pure Claude wire-protocol primitive | Never |
| `sendMessageWithContent` | Superseded by unified `send(SendInput)` | n/a — keep deprecated alias on Claude |
| `getCurrentTurnDetailed` | Claude-shaped snapshot, no Copilot equivalent | Snapshot widening — separate spec |

### 9.2 Deferred (not in 1.1/1.2/1.3)

- `getCurrentTurnHandle` parity (Copilot has it; Claude doesn't) — separate "handle unification" spec
- Generic-parameterized `UnifiedEventMap` — explicit 1.0 rejection still holds
- Excluded Copilot namespaces: `fleet`, `extensions`, `plugins`
- Deeper `workspaces` write semantics beyond what SDK exposes
- Unified `getCurrentTurnDetailed`
- PTY transport changes
- Streaming attachments / partial uploads

### 9.3 Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Copilot SDK renames `@experimental` RPCs in 0.4 | High | Medium | Pin to `0.3.x` semver caret; SDK upgrade is its own PR |
| Protocol v2 `no-result` rejection breaks handler chaining | Medium | Medium | `RequestNotHandled` sentinel only valid fall-through; runtime check at `start()` |
| `auto-edit` permission handler is opinionated | Medium | Low | Document exact match list; users override with custom handler |
| `UnifiedMessage` projection loses Copilot detail | Medium | Low | `raw` field preserves full SessionEvent |
| Claude `PermissionMode` rename breaks consumers | High | Low | Deprecation alias across 1.2.x; CHANGELOG migration sed; alias removed only in 2.0 |
| `@experimental` SDK methods throw on older CLI | Low | Medium | Wrappers catch "method not found", re-throw `CopilotExperimentalUnavailableError` |
| Mock SDK drift from real SDK | Medium | Low | Per-phase mock files; capability-matrix CI test catches surface mismatches |
| Three sequential PRs is slow if a regression blocks all phases | Low | Medium | Each phase ships independently; phase boundaries are version tags |

### 9.4 Out-of-scope confirmations

- No code generation — wrappers are hand-written.
- No runtime polyfill — unfillable methods are `undefined`; consumers do `client.method?.()`.
- No new transports — PTY surface frozen.
- No new package deps beyond 1.0.
- No changes to existing `TurnSnapshot` shape.
- No changes to existing `UnifiedEventMap` events; 3 added in 1.2.
- No changes to factory `createAiCliClient` discriminator pattern.

## 10. Success criteria (per phase)

**1.1.0 ships when:**
- All 9 unit suites + 2 contract tests pass
- Capability matrix test passes
- `integration-1.1-config-parity.mjs` passes against real Copilot + real Claude
- `docs/provider-capabilities.md` reflects all 1.1 changes
- CHANGELOG `1.1.0` entry written

**1.2.0 ships when:**
- All 7 unit suites + 1 contract test pass
- Cross-provider interactive approval integration smoke passes
- `PermissionMode` legacy alias accepted at runtime; deprecation note in CHANGELOG
- `docs/provider-capabilities.md` reflects matrix flips and the 7 method moves to unified surface

**1.3.0 ships when:**
- All 10 unit suites pass
- Bonus surface integration smoke passes for stable namespaces
- README "Experimental APIs" section published
- `docs/provider-capabilities.md` "Copilot bonus namespaces" sub-section listed

## 11. Brainstorming decisions captured

The following decisions were locked in during brainstorming and should not be revisited at plan time without explicit user sign-off:

| # | Decision | Choice |
|---|---|---|
| Q1 | Scope | **A — Maximalist** (fill all 13 unified gaps + 10 Copilot bonus namespaces) |
| Q2 | Phasing | **B — Phased** (1.1 config → 1.2 approval → 1.3 bonus) |
| Q3 | `PermissionMode` vocabulary | **B — New unified vocab** `'prompt' \| 'auto-edit' \| 'auto-all' \| 'plan' \| 'autopilot'` |
| Q4 | Bonus RPC wrapper style | **B — Namespaced typed wrappers** (`client.plan.*`, `client.skills.*`, …) |

Section 1 followups confirmed:
- Three minor releases agreed
- Bonus surface as typed wrapper objects on `CopilotClient` (not `AICliClient`)
- Six-step structure consistent across all gap-fills

Section 2 followups confirmed:
- `UnifiedMessage` shape (id, role, text, reasoning, toolUse, toolResult, timestamp, raw)
- `richContent` capability widening from boolean to `'none' \| 'partial' \| 'full'`
- Provider-specific `hooks`/`mcpServers` config (not unified)

Section 3 followups confirmed:
- `PendingRequestQueue` design with internal handler + `RequestNotHandled` sentinel for chaining
- `PermissionMode` deprecation alias kept across 1.2.x, removed in 2.0
- New unified events `pending_request_added/removed/resolved` belong on `UnifiedEventMap`

Section 4 followups confirmed:
- 10-namespace scope agreed
- Lazy session resolver `() => GhCopilotSession` with `SessionNotStartedError` thrown if called before `start()`
- New subpath export `./copilot/namespaces`

Section 5 followups confirmed:
- `richContent` widens to `'none' \| 'partial' \| 'full'` (string-literal union, not boolean+array)
- Capability matrix CI test added
- Matrix doc reorganized once at start of 1.1, then amended per phase

Section 6 followups confirmed:
- `test/contract/` directory for parameterized cross-client suites
- Per-phase mock-SDK extension files (`mock-sdk-1.1.ts`, etc.)
- Coverage floor of 85% on touched files
