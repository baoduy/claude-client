# Copilot ↔ Claude feature gap-fill — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift Copilot's actual `@github/copilot-sdk@0.3.0` capabilities onto the unified `AICliClient`, expose Copilot-only bonus surface on the concrete class, and harmonize the two providers along the dimensions identified in the design spec.

**Spec:** [`docs/superpowers/specs/2026-04-29-copilot-claude-feature-gap-fill-design.md`](../specs/2026-04-29-copilot-claude-feature-gap-fill-design.md)

**Architecture:** Three sequential phases, each shipping as a minor release on `baoduy/copilot-claude-sdk-gaps`. Phase 1.1 adds configuration parity (additive). Phase 1.2 adds interactive-approval parity built on a `PendingRequestQueue` that drives Copilot's `permission.requested`/`elicitation.requested` events into a Claude-style pull API; this phase contains the only breaking change (`PermissionMode` vocabulary rename, gated by a deprecation alias). Phase 1.3 ships 10 namespace wrappers for Copilot's bonus `session.rpc.*` surface.

**Tech Stack:** TypeScript, Node `>=22`, `node --test`, `@github/copilot-sdk@0.3.0`, ESM + CJS dual build via `tsc`.

---

## Conventions used throughout the plan

- **TDD cycle for each task:** failing test → run (verify FAIL) → implementation → run (verify PASS) → commit.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`). All commits use the user's existing co-author trailer pattern.
- **Path convention:** Source under `src/`, tests under `test/` mirroring source path. Integration scripts under `scripts/integration-*.mjs`.
- **Build verification:** Many tests need `npm run build` first because tests import from `dist/` per existing test setup. Run `npm run typecheck` before committing if a step touched only `.ts` files.
- **Capability matrix updates:** Defer doc updates to the end of each phase (one consolidated commit per phase). Final phase Z runs a regeneration pass to reconcile.
- **Branch:** All work lands on `baoduy/copilot-claude-sdk-gaps`.

---

## Phase 1.1 — Configuration parity (target: `1.1.0`)

### Task A1: Widen `richContent` capability and add `getMessages`/`hooks`/`mcp` flags

**Files:**
- Modify: `src/unified/types.ts`
- Test: `test/unified/capabilities.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/unified/capabilities.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AICliCapabilities } from '../../dist/esm/unified/index.js';

test('AICliCapabilities widens richContent and adds getMessages/hooks/mcp', () => {
  const caps: AICliCapabilities = {
    richContent: 'partial',
    setModel: true,
    setPermissionMode: true,
    setMaxThinkingTokens: false,
    listSupportedModels: true,
    getMessages: true,
    hooks: true,
    mcp: true,
  };
  assert.equal(caps.richContent, 'partial');
  // boolean truthiness check still works for migration
  assert.ok(caps.richContent);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test test/unified/capabilities.test.mjs`
Expected: FAIL — `richContent` typed as boolean, missing fields.

- [ ] **Step 3: Update `src/unified/types.ts`**

```ts
export interface AICliCapabilities {
  readonly richContent: 'none' | 'partial' | 'full';
  readonly setModel: boolean;
  readonly setPermissionMode: boolean;
  readonly setMaxThinkingTokens: boolean;
  readonly listSupportedModels: boolean;
  readonly getMessages: boolean;
  readonly hooks: boolean;
  readonly mcp: boolean;
}
```

- [ ] **Step 4: Run typecheck — fix the call sites that break**

Run: `npm run typecheck`
Expected: errors in `src/claude/client.ts` and `src/copilot/client.ts` where `capabilities` is initialized. Update both to use the new shape:

```ts
// src/copilot/client.ts (constructor area)
readonly capabilities: AICliCapabilities = {
  richContent: 'none',
  setModel: false,
  setPermissionMode: false,
  setMaxThinkingTokens: false,
  listSupportedModels: false,
  getMessages: false,
  hooks: false,
  mcp: false,
};

// src/claude/client.ts — find existing capabilities init and update to:
readonly capabilities: AICliCapabilities = {
  richContent: 'partial',
  setModel: true,
  setPermissionMode: true,
  setMaxThinkingTokens: true,
  listSupportedModels: true,
  getMessages: false,    // wired in Task A8
  hooks: true,
  mcp: true,
};
```

- [ ] **Step 5: Run test and typecheck**

Run: `npm run typecheck && npm run build && node --test test/unified/capabilities.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/unified/types.ts src/claude/client.ts src/copilot/client.ts test/unified/capabilities.test.mjs
rtk git commit -m "feat(unified)!: widen richContent and add getMessages/hooks/mcp capability flags"
```

---

### Task A2: Expand `SendInput` content blocks (file_path, directory_path, selection)

**Files:**
- Modify: `src/unified/types.ts`
- Test: `test/unified/send-input.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/unified/send-input.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ContentBlock, SendInput } from '../../dist/esm/unified/index.js';

test('ContentBlock includes file_path/directory_path/selection variants', () => {
  const blocks: ContentBlock[] = [
    { type: 'text', text: 'hi' },
    { type: 'image', source: { type: 'base64', mediaType: 'image/png', data: 'XX' } },
    { type: 'file_path', path: '/abs/path/file.txt' },
    { type: 'directory_path', path: '/abs/dir' },
    {
      type: 'selection',
      filePath: '/abs/path/file.ts',
      displayName: 'file.ts:1-3',
      range: { start: { line: 1, character: 0 }, end: { line: 3, character: 0 } },
    },
  ];
  const input: SendInput = { content: blocks };
  assert.equal(input.content.length, 5);
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npm run build`
Expected: FAIL on type errors.

- [ ] **Step 3: Update `src/unified/types.ts`**

```ts
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: ImageSource }
  | { type: 'file_path'; path: string; displayName?: string }
  | { type: 'directory_path'; path: string; displayName?: string }
  | {
      type: 'selection';
      filePath: string;
      displayName: string;
      range?: { start: { line: number; character: number }; end: { line: number; character: number } };
      text?: string;
    };
```

- [ ] **Step 4: Verify PASS**

Run: `npm run build && node --test test/unified/send-input.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/unified/types.ts test/unified/send-input.test.mjs
rtk git commit -m "feat(unified): expand ContentBlock with file_path/directory_path/selection variants"
```

---

### Task A3: Copilot attachment translator

**Files:**
- Create: `src/copilot/attachments.ts`
- Test: `test/copilot/attachments.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/copilot/attachments.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendInputToCopilotMessage } from '../../dist/esm/copilot/attachments.js';
import { UnsupportedContentError } from '../../dist/esm/unified/index.js';

test('plain string maps to prompt only', () => {
  const out = sendInputToCopilotMessage('hello');
  assert.deepEqual(out, { prompt: 'hello' });
});

test('text-only content concatenates prompt with no attachments', () => {
  const out = sendInputToCopilotMessage({
    content: [
      { type: 'text', text: 'hi ' },
      { type: 'text', text: 'there' },
    ],
  });
  assert.deepEqual(out, { prompt: 'hi there' });
});

test('image base64 → blob attachment', () => {
  const out = sendInputToCopilotMessage({
    content: [
      { type: 'text', text: 'describe' },
      { type: 'image', source: { type: 'base64', mediaType: 'image/png', data: 'AAA' } },
    ],
  });
  assert.deepEqual(out.attachments, [{ type: 'blob', data: 'AAA', mimeType: 'image/png' }]);
  assert.equal(out.prompt, 'describe');
});

test('file_path → file attachment', () => {
  const out = sendInputToCopilotMessage({
    content: [{ type: 'text', text: 'read' }, { type: 'file_path', path: '/x/y.txt' }],
  });
  assert.deepEqual(out.attachments, [{ type: 'file', path: '/x/y.txt' }]);
});

test('directory_path → directory attachment', () => {
  const out = sendInputToCopilotMessage({
    content: [{ type: 'directory_path', path: '/x' }],
  });
  assert.deepEqual(out.attachments, [{ type: 'directory', path: '/x' }]);
});

test('selection → selection attachment with mapped range', () => {
  const out = sendInputToCopilotMessage({
    content: [{
      type: 'selection',
      filePath: '/x/y.ts',
      displayName: 'y.ts:1-3',
      range: { start: { line: 1, character: 0 }, end: { line: 3, character: 0 } },
    }],
  });
  assert.deepEqual(out.attachments, [{
    type: 'selection',
    filePath: '/x/y.ts',
    displayName: 'y.ts:1-3',
    selection: { start: { line: 1, character: 0 }, end: { line: 3, character: 0 } },
  }]);
});

test('image url throws UnsupportedContentError (Copilot has no URL attachment)', () => {
  assert.throws(
    () => sendInputToCopilotMessage({
      content: [{ type: 'image', source: { type: 'url', url: 'https://x' } }],
    }),
    (err) => err instanceof UnsupportedContentError,
  );
});

test('empty content array throws UnsupportedContentError', () => {
  assert.throws(
    () => sendInputToCopilotMessage({ content: [] }),
    (err) => err instanceof UnsupportedContentError,
  );
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npm run build`
Expected: FAIL — `attachments.ts` does not exist.

- [ ] **Step 3: Implement `src/copilot/attachments.ts`**

```ts
import type { SendInput, ContentBlock } from '../unified/index.js';
import { UnsupportedContentError } from '../unified/index.js';

export type CopilotAttachment =
  | { type: 'file'; path: string; displayName?: string }
  | { type: 'directory'; path: string; displayName?: string }
  | {
      type: 'selection';
      filePath: string;
      displayName: string;
      selection?: { start: { line: number; character: number }; end: { line: number; character: number } };
      text?: string;
    }
  | { type: 'blob'; data: string; mimeType: string; displayName?: string };

export interface CopilotMessage {
  prompt: string;
  attachments?: CopilotAttachment[];
}

/**
 * Translate a unified SendInput to Copilot's MessageOptions shape.
 *
 * - Text blocks concatenate into `prompt`.
 * - Image/base64 → blob attachment.
 * - Image/url → throws UnsupportedContentError (Copilot has no URL attachment).
 * - file_path / directory_path / selection → matching Copilot attachment kind.
 * - Empty content array throws UnsupportedContentError.
 */
export function sendInputToCopilotMessage(input: SendInput): CopilotMessage {
  if (typeof input === 'string') return { prompt: input };
  if ('text' in input) return { prompt: input.text };

  if (input.content.length === 0) {
    throw new UnsupportedContentError(
      'copilot',
      { type: 'text', text: '' } as ContentBlock,
      0,
    );
  }

  let prompt = '';
  const attachments: CopilotAttachment[] = [];

  for (let i = 0; i < input.content.length; i++) {
    const block = input.content[i];
    switch (block.type) {
      case 'text':
        prompt += block.text;
        break;
      case 'image': {
        if (block.source.type === 'base64') {
          attachments.push({ type: 'blob', data: block.source.data, mimeType: block.source.mediaType });
        } else {
          throw new UnsupportedContentError('copilot', block, i);
        }
        break;
      }
      case 'file_path':
        attachments.push({
          type: 'file',
          path: block.path,
          ...(block.displayName !== undefined && { displayName: block.displayName }),
        });
        break;
      case 'directory_path':
        attachments.push({
          type: 'directory',
          path: block.path,
          ...(block.displayName !== undefined && { displayName: block.displayName }),
        });
        break;
      case 'selection':
        attachments.push({
          type: 'selection',
          filePath: block.filePath,
          displayName: block.displayName,
          ...(block.range !== undefined && { selection: block.range }),
          ...(block.text !== undefined && { text: block.text }),
        });
        break;
      default: {
        const _: never = block;
        throw new UnsupportedContentError('copilot', block as ContentBlock, i);
      }
    }
  }

  if (attachments.length === 0) return { prompt };
  return { prompt, attachments };
}
```

- [ ] **Step 4: Verify PASS**

Run: `npm run build && node --test test/copilot/attachments.test.mjs`
Expected: 8 PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/copilot/attachments.ts test/copilot/attachments.test.mjs
rtk git commit -m "feat(copilot): SendInput → Copilot attachments translator"
```

---

### Task A4: Wire attachments into `CopilotClient.send()` and flip `richContent` to `'full'`

**Files:**
- Modify: `src/copilot/client.ts`
- Modify: `src/copilot/sessions.ts` (or wherever `sendAndWait` is invoked)
- Test: `test/copilot/send-with-attachments.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/copilot/send-with-attachments.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';
import { makeMockGhClient } from './__fixtures__/mock-sdk.mjs';

test('send() with image base64 dispatches blob attachment to SDK', async () => {
  const captured = [];
  const ctor = makeMockGhClient({
    captureSend: (msg) => { captured.push(msg); },
  });
  const client = new CopilotClient({ provider: 'copilot', cwd: process.cwd() }, { GhClientCtor: ctor });
  await client.start();

  const turn = client.send({
    content: [
      { type: 'text', text: 'describe' },
      { type: 'image', source: { type: 'base64', mediaType: 'image/png', data: 'AAA' } },
    ],
  });
  await turn.done.catch(() => {});  // ignore turn outcome — we only assert dispatch shape
  await client.close();

  assert.equal(captured.length, 1);
  assert.equal(captured[0].prompt, 'describe');
  assert.deepEqual(captured[0].attachments, [{ type: 'blob', data: 'AAA', mimeType: 'image/png' }]);
});

test('client.capabilities.richContent === "full"', () => {
  const client = new CopilotClient({ provider: 'copilot', cwd: process.cwd() });
  assert.equal(client.capabilities.richContent, 'full');
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npm run build && node --test test/copilot/send-with-attachments.test.mjs`
Expected: FAIL — current code throws `UnsupportedContentError`, capability is `'none'`.

- [ ] **Step 3: Update `src/copilot/client.ts`**

Replace the `_flattenSendInput` method's role: keep it for `interrupt` and other places where only the prompt string is needed, but introduce `_buildCopilotMessage` and use it in `send`.

```ts
// at top of file
import { sendInputToCopilotMessage, type CopilotMessage } from './attachments.js';

// constructor capabilities init
readonly capabilities: AICliCapabilities = {
  richContent: 'full',
  setModel: false,            // flipped in Task A5
  setPermissionMode: false,   // flipped in Phase 1.2
  setMaxThinkingTokens: false,
  listSupportedModels: false, // flipped in Task A6
  getMessages: false,         // flipped in Task A9
  hooks: false,               // flipped in Task A11
  mcp: false,                 // flipped in Task A12
};

// replace _flattenSendInput body to delegate to attachments translator for the prompt-only path
private _buildCopilotMessage(input: SendInput): CopilotMessage {
  return sendInputToCopilotMessage(input);
}

// in send():
send(input: SendInput): CopilotTurnHandle {
  const message = this._buildCopilotMessage(input);  // throws UnsupportedContentError on bad input
  if (this._currentTurn) {
    throw new Error('A turn is already in flight. Call interrupt() first or await turn.done.');
  }
  // ... id/initial/handle setup unchanged
  queueMicrotask(() => this.runTurn(message, handle).catch(err => {
    this.emit('error', err);
  }));
  return handle;
}

// runTurn signature changes from (prompt: string, handle) to (message: CopilotMessage, handle)
private async runTurn(message: CopilotMessage, handle: CopilotTurnHandle): Promise<void> {
  // ...
  const response = await session.sendAndWait(message);   // pass message as MessageOptions
  // ...
}

// queueMessage:
queueMessage(input: SendInput): void {
  const message = this._buildCopilotMessage(input);  // pre-scan
  if (this._status === 'running') {
    this._messageQueue.push(message);   // queue is now CopilotMessage[]
  } else {
    this.send(input);  // not async-await; send() pre-scans again — accept double-validation
  }
}

// _messageQueue field type:
private _messageQueue: CopilotMessage[] = [];
```

Update `processNextQueued` to dispatch `CopilotMessage` correctly — it likely needs a private `_dispatchMessage(msg: CopilotMessage)` helper that mirrors the body of `send` minus the input flatten step.

- [ ] **Step 4: Verify PASS**

Run: `npm run build && node --test test/copilot/send-with-attachments.test.mjs`
Expected: PASS.

- [ ] **Step 5: Run full Copilot suite to catch regressions**

Run: `node --test test/copilot/*.test.mjs`
Expected: all tests pass; if pre-existing tests assumed `prompt: string` was passed to `sendAndWait`, update the mock to accept the message object shape.

- [ ] **Step 6: Commit**

```bash
rtk git add src/copilot/client.ts test/copilot/send-with-attachments.test.mjs
rtk git commit -m "feat(copilot)!: rich SendInput attachments and richContent: 'full'"
```

---

### Task A5: Copilot `setModel`

**Files:**
- Modify: `src/ai-cli-client.ts`
- Modify: `src/copilot/client.ts`
- Test: `test/copilot/set-model.test.mjs`

- [ ] **Step 1: Confirm the unified interface already declares `setModel?` (it does — Section §1 of `src/ai-cli-client.ts`). No change needed there.**

- [ ] **Step 2: Write the failing test**

```js
// test/copilot/set-model.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';
import { makeMockGhClient } from './__fixtures__/mock-sdk.mjs';

test('setModel calls session.setModel(model)', async () => {
  const calls = [];
  const ctor = makeMockGhClient({
    onSessionSetModel: (model) => { calls.push(model); },
  });
  const client = new CopilotClient({ provider: 'copilot' }, { GhClientCtor: ctor });
  await client.start();
  await client.setModel('claude-sonnet-4.6');
  assert.deepEqual(calls, ['claude-sonnet-4.6']);
  assert.equal(client.capabilities.setModel, true);
  await client.close();
});

test('setModel throws if session not started', async () => {
  const client = new CopilotClient({ provider: 'copilot' });
  await assert.rejects(() => client.setModel('x'), /not started/i);
});
```

- [ ] **Step 3: Verify FAIL**

Run: `npm run build && node --test test/copilot/set-model.test.mjs`
Expected: FAIL — method missing, capability is `false`.

- [ ] **Step 4: Implement on `CopilotClient`**

```ts
// in CopilotClient — flip capability
readonly capabilities: AICliCapabilities = { ...prev, setModel: true };

async setModel(model: string): Promise<void> {
  const session = (this.transport as any).session;
  if (!session) throw new Error('Copilot session not started — call start() first.');
  await session.setModel(model);
}
```

Update the mock fixture so `mockSession.setModel = (model) => onSessionSetModel?.(model)`.

- [ ] **Step 5: Verify PASS**

Run: `npm run build && node --test test/copilot/set-model.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/copilot/client.ts test/copilot/set-model.test.mjs test/copilot/__fixtures__/mock-sdk.mjs
rtk git commit -m "feat(copilot): setModel via session.setModel"
```

---

### Task A6: Copilot `listSupportedModels`

**Files:**
- Modify: `src/copilot/client.ts`
- Test: `test/copilot/list-models.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/copilot/list-models.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';
import { makeMockGhClient } from './__fixtures__/mock-sdk.mjs';

test('listSupportedModels wraps client.listModels and projects to unified shape', async () => {
  const ctor = makeMockGhClient({
    onListModels: () => [
      { id: 'gpt-4.1', name: 'GPT-4.1' },
      { id: 'claude-sonnet-4.6' },
    ],
  });
  const client = new CopilotClient({ provider: 'copilot' }, { GhClientCtor: ctor });
  await client.start();
  const resp = await client.listSupportedModels();
  assert.deepEqual(resp.models, [
    { id: 'gpt-4.1', displayName: 'GPT-4.1' },
    { id: 'claude-sonnet-4.6', displayName: undefined },
  ]);
  assert.equal(client.capabilities.listSupportedModels, true);
  await client.close();
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npm run build && node --test test/copilot/list-models.test.mjs`
Expected: FAIL — method missing.

- [ ] **Step 3: Implement**

```ts
// CopilotClient
readonly capabilities: AICliCapabilities = { ...prev, listSupportedModels: true };

async listSupportedModels(_timeout?: number): Promise<SupportedModelsResponse> {
  const ghClient = (this.transport as any).client;
  if (!ghClient) throw new Error('Copilot client not started — call start() first.');
  const models: Array<{ id?: string; modelId?: string; name?: string; displayName?: string }> =
    await ghClient.listModels();
  return {
    models: models.map(m => ({
      id: m.id ?? m.modelId ?? '',
      displayName: m.displayName ?? m.name,
    })),
  };
}
```

Add `import type { SupportedModelsResponse } from '../unified/index.js';`. Update `CopilotTransport` to expose `client` if not already (private field accessor or `getClient()` method).

- [ ] **Step 4: Verify PASS**

Run: `npm run build && node --test test/copilot/list-models.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/copilot/client.ts src/copilot/transport.ts test/copilot/list-models.test.mjs test/copilot/__fixtures__/mock-sdk.mjs
rtk git commit -m "feat(copilot): listSupportedModels via client.listModels"
```

---

### Task A7: Add `UnifiedMessage` type and `getMessages` to `AICliClient`

**Files:**
- Modify: `src/unified/types.ts`
- Modify: `src/ai-cli-client.ts`
- Test: `test/unified/messages-type.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/unified/messages-type.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { UnifiedMessage } from '../../dist/esm/unified/index.js';

test('UnifiedMessage discriminates raw.provider', () => {
  const msg: UnifiedMessage = {
    id: 'm1', role: 'assistant', text: 'hi', timestamp: Date.now(),
    raw: { provider: 'copilot', event: { type: 'assistant.message', data: { content: 'hi' } } as any },
  };
  if (msg.raw.provider === 'copilot') {
    assert.ok(msg.raw.event);
  }
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npm run build`
Expected: FAIL — `UnifiedMessage` not exported.

- [ ] **Step 3: Add to `src/unified/types.ts`**

```ts
import type { TurnToolUse, TurnToolResult } from './types.js';  // self-ref ok at TS level

export interface UnifiedMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system' | 'tool';
  readonly text?: string;
  readonly reasoning?: string;
  readonly toolUse?: TurnToolUse;
  readonly toolResult?: TurnToolResult;
  readonly timestamp: number;   // epoch ms
  readonly raw: UnifiedMessageRaw;
}

export type UnifiedMessageRaw =
  | { provider: 'claude'; event: unknown }
  | { provider: 'copilot'; event: unknown };
```

(Use `unknown` for `event` payloads to avoid leaking SDK types into the unified module. Each client casts internally when projecting.)

Re-export from `src/unified/index.ts`.

- [ ] **Step 4: Add `getMessages?` to `src/ai-cli-client.ts`**

```ts
// in AICliClient interface, near the other introspection methods
getMessages?(): Promise<UnifiedMessage[]>;
```

Add the import.

- [ ] **Step 5: Verify PASS**

Run: `npm run build && node --test test/unified/messages-type.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/unified/types.ts src/unified/index.ts src/ai-cli-client.ts test/unified/messages-type.test.mjs
rtk git commit -m "feat(unified): UnifiedMessage type and getMessages? on AICliClient"
```

---

### Task A8: Claude `getMessages` projection

**Files:**
- Modify: `src/claude/client.ts`
- Test: `test/claude/get-messages.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/claude/get-messages.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeClient } from '../../dist/esm/claude/index.js';

test('Claude getMessages projects history into UnifiedMessage[]', async () => {
  const client = new ClaudeClient(/* test config — see test/claude existing helpers */);
  // ... seed history via existing test helpers ...
  const msgs = await client.getMessages();
  assert.ok(Array.isArray(msgs));
  for (const m of msgs) {
    assert.ok(['user','assistant','system','tool'].includes(m.role));
    assert.equal(m.raw.provider, 'claude');
  }
  assert.equal(client.capabilities.getMessages, true);
});
```

(Use existing `test/claude/__fixtures__/` patterns to seed a deterministic history. If no such helper exists, mock the transport to emit a fixed sequence.)

- [ ] **Step 2: Verify FAIL**

Run: `npm run build && node --test test/claude/get-messages.test.mjs`
Expected: FAIL — method missing or capability false.

- [ ] **Step 3: Implement**

```ts
// src/claude/client.ts — flip capability and add method
readonly capabilities: AICliCapabilities = { ...prev, getMessages: true };

async getMessages(): Promise<UnifiedMessage[]> {
  const detailed = this.getHistoryDetailed();   // existing Claude method, returns ClaudeTurnSnapshot[]
  const out: UnifiedMessage[] = [];
  for (const turn of detailed) {
    // Project assistant text + reasoning per turn
    if (turn.text) {
      out.push({
        id: `${turn.id}#assistant`,
        role: 'assistant',
        text: turn.text,
        ...(turn.reasoning && { reasoning: turn.reasoning }),
        timestamp: turn.startedAt,
        raw: { provider: 'claude', event: turn },
      });
    }
    // Project tool uses + results
    for (const t of turn.toolUses) {
      out.push({
        id: t.id,
        role: 'tool',
        toolUse: t,
        timestamp: turn.startedAt,
        raw: { provider: 'claude', event: turn },
      });
    }
    for (const r of turn.toolResults) {
      out.push({
        id: `${r.toolUseId}#result`,
        role: 'tool',
        toolResult: r,
        timestamp: turn.completedAt ?? turn.startedAt,
        raw: { provider: 'claude', event: turn },
      });
    }
  }
  return out;
}
```

Add the `UnifiedMessage` import.

- [ ] **Step 4: Verify PASS**

Run: `npm run build && node --test test/claude/get-messages.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/claude/client.ts test/claude/get-messages.test.mjs
rtk git commit -m "feat(claude): getMessages projection over getHistoryDetailed"
```

---

### Task A9: Copilot `getMessages` projection

**Files:**
- Modify: `src/copilot/client.ts`
- Test: `test/copilot/get-messages.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/copilot/get-messages.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';
import { makeMockGhClient } from './__fixtures__/mock-sdk.mjs';

test('Copilot getMessages projects session.getMessages into UnifiedMessage[]', async () => {
  const ctor = makeMockGhClient({
    sessionMessages: [
      { type: 'user.message', id: 'u1', timestamp: '2026-04-29T00:00:00Z', data: { content: 'hi' } },
      { type: 'assistant.message', id: 'a1', timestamp: '2026-04-29T00:00:01Z', data: { content: 'hello back' } },
      { type: 'tool.execution_complete', id: 't1', timestamp: '2026-04-29T00:00:02Z',
        data: { toolUseId: 'call-1', output: 'ok', isError: false } },
    ],
  });
  const client = new CopilotClient({ provider: 'copilot' }, { GhClientCtor: ctor });
  await client.start();
  const msgs = await client.getMessages();
  assert.equal(msgs.length, 3);
  assert.equal(msgs[0].role, 'user');
  assert.equal(msgs[0].text, 'hi');
  assert.equal(msgs[1].role, 'assistant');
  assert.equal(msgs[1].text, 'hello back');
  assert.equal(msgs[2].role, 'tool');
  assert.deepEqual(msgs[2].toolResult, { toolUseId: 'call-1', content: 'ok', isError: false });
  for (const m of msgs) assert.equal(m.raw.provider, 'copilot');
  assert.equal(client.capabilities.getMessages, true);
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npm run build && node --test test/copilot/get-messages.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// CopilotClient
readonly capabilities: AICliCapabilities = { ...prev, getMessages: true };

async getMessages(): Promise<UnifiedMessage[]> {
  const session = (this.transport as any).session;
  if (!session) throw new Error('Copilot session not started — call start() first.');
  const events: any[] = await session.getMessages();
  const out: UnifiedMessage[] = [];
  for (const ev of events) {
    const ts = ev.timestamp ? Date.parse(ev.timestamp) : Date.now();
    switch (ev.type) {
      case 'user.message':
        out.push({
          id: ev.id, role: 'user',
          text: ev.data?.content ?? '',
          timestamp: ts,
          raw: { provider: 'copilot', event: ev },
        });
        break;
      case 'assistant.message':
        out.push({
          id: ev.id, role: 'assistant',
          text: ev.data?.content ?? '',
          ...(ev.data?.reasoning && { reasoning: ev.data.reasoning }),
          timestamp: ts,
          raw: { provider: 'copilot', event: ev },
        });
        break;
      case 'tool.execution_start':
        out.push({
          id: ev.id, role: 'tool',
          toolUse: { id: ev.data?.toolUseId ?? ev.id, name: ev.data?.toolName ?? '', input: ev.data?.arguments ?? {} },
          timestamp: ts,
          raw: { provider: 'copilot', event: ev },
        });
        break;
      case 'tool.execution_complete':
        out.push({
          id: ev.id, role: 'tool',
          toolResult: {
            toolUseId: ev.data?.toolUseId ?? ev.id,
            content: ev.data?.output ?? ev.data?.content ?? '',
            isError: ev.data?.isError === true || ev.data?.success === false,
          },
          timestamp: ts,
          raw: { provider: 'copilot', event: ev },
        });
        break;
      // skip lifecycle/streaming-delta events — they don't represent messages
      default: break;
    }
  }
  return out;
}
```

Add `UnifiedMessage` import.

- [ ] **Step 4: Verify PASS**

Run: `npm run build && node --test test/copilot/get-messages.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/copilot/client.ts test/copilot/get-messages.test.mjs
rtk git commit -m "feat(copilot): getMessages projection over session.getMessages"
```

---

### Task A10: Copilot lifecycle harmonization (`close()` = abort + disconnect + stop)

**Files:**
- Modify: `src/copilot/client.ts`
- Modify: `src/copilot/transport.ts`
- Test: `test/copilot/lifecycle-close.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/copilot/lifecycle-close.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';
import { makeMockGhClient } from './__fixtures__/mock-sdk.mjs';

test('close() calls session.abort, session.disconnect, then client.stop in order', async () => {
  const order = [];
  const ctor = makeMockGhClient({
    onSessionAbort: () => order.push('abort'),
    onSessionDisconnect: () => order.push('disconnect'),
    onClientStop: () => order.push('stop'),
  });
  const client = new CopilotClient({ provider: 'copilot' }, { GhClientCtor: ctor });
  await client.start();
  await client.close();
  assert.deepEqual(order, ['abort', 'disconnect', 'stop']);
});

test('close() emits closed event with null exit code', async (t) => {
  const ctor = makeMockGhClient();
  const client = new CopilotClient({ provider: 'copilot' }, { GhClientCtor: ctor });
  await client.start();
  const spy = t.mock.fn();
  client.on('closed', spy);
  await client.close();
  assert.equal(spy.mock.callCount(), 1);
  assert.deepEqual(spy.mock.calls[0].arguments, [null]);
});

test('close() is idempotent — calling twice does not double-emit', async () => {
  const ctor = makeMockGhClient();
  const client = new CopilotClient({ provider: 'copilot' }, { GhClientCtor: ctor });
  await client.start();
  let count = 0;
  client.on('closed', () => count++);
  await client.close();
  await client.close();
  assert.equal(count, 1);
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npm run build && node --test test/copilot/lifecycle-close.test.mjs`
Expected: FAIL — order not enforced or double-emit.

- [ ] **Step 3: Implement**

In `CopilotTransport`, expose `getSession()` and `getClient()` if not already, and add `stopSession()`:

```ts
// src/copilot/transport.ts
async stopSession(): Promise<void> {
  if (this.session) {
    try { await this.session.abort?.(); } catch { /* swallow */ }
    try { await this.session.disconnect?.(); } catch { /* swallow */ }
    this.session = null;
  }
}
```

In `CopilotClient.close()`:

```ts
private _closed = false;

async close(): Promise<void> {
  if (this._closed) return;
  this._closed = true;
  await this.transport.stopSession();
  await this.transport.stop();
  this._currentTurn = null;
  this.emit('closed', null);
}
```

- [ ] **Step 4: Verify PASS**

Run: `npm run build && node --test test/copilot/lifecycle-close.test.mjs`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/copilot/client.ts src/copilot/transport.ts test/copilot/lifecycle-close.test.mjs
rtk git commit -m "feat(copilot): close() = abort + disconnect + stop, idempotent"
```

---

### Task A11: Copilot `hooks` config plumbing

**Files:**
- Modify: `src/copilot/types.ts`
- Modify: `src/copilot/sessions.ts` (or wherever `createSession` is invoked)
- Modify: `src/copilot/sdk.ts` (re-export `SessionHooks`)
- Modify: `src/copilot/client.ts` (flip capability)
- Test: `test/copilot/hooks-config.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/copilot/hooks-config.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';
import { makeMockGhClient } from './__fixtures__/mock-sdk.mjs';

test('hooks config is forwarded to createSession', async () => {
  let captured = null;
  const ctor = makeMockGhClient({ onCreateSession: (cfg) => { captured = cfg; } });
  const onPreToolUse = async () => undefined;
  const client = new CopilotClient(
    { provider: 'copilot', hooks: { onPreToolUse } },
    { GhClientCtor: ctor },
  );
  await client.start();
  assert.equal(captured.hooks.onPreToolUse, onPreToolUse);
  assert.equal(client.capabilities.hooks, true);
  await client.close();
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npm run build && node --test test/copilot/hooks-config.test.mjs`
Expected: FAIL — config rejects `hooks` field.

- [ ] **Step 3: Implement**

```ts
// src/copilot/sdk.ts — add to type re-exports
export type { SessionHooks } from '@github/copilot-sdk';

// src/copilot/types.ts — extend CopilotClientConfig
import type { SessionHooks } from './sdk.js';

export interface CopilotClientConfig {
  // ... existing fields ...
  hooks?: SessionHooks;
}

// src/copilot/sessions.ts (or wherever createSession is built) — pass hooks through
const session = await ghClient.createSession({
  // ... existing fields ...
  ...(config.hooks && { hooks: config.hooks }),
});

// src/copilot/client.ts — flip capability
readonly capabilities: AICliCapabilities = { ...prev, hooks: true };
```

- [ ] **Step 4: Verify PASS**

Run: `npm run build && node --test test/copilot/hooks-config.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/copilot/sdk.ts src/copilot/types.ts src/copilot/sessions.ts src/copilot/client.ts test/copilot/hooks-config.test.mjs
rtk git commit -m "feat(copilot): forward SessionHooks config to createSession"
```

---

### Task A12: Copilot `mcpServers` config plumbing

**Files:**
- Modify: `src/copilot/types.ts`
- Modify: `src/copilot/sessions.ts`
- Modify: `src/copilot/sdk.ts` (re-export `MCPServerConfig`)
- Modify: `src/copilot/client.ts` (flip capability)
- Test: `test/copilot/mcp-config.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/copilot/mcp-config.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';
import { makeMockGhClient } from './__fixtures__/mock-sdk.mjs';

test('mcpServers config is forwarded to createSession', async () => {
  let captured = null;
  const ctor = makeMockGhClient({ onCreateSession: (cfg) => { captured = cfg; } });
  const client = new CopilotClient(
    {
      provider: 'copilot',
      mcpServers: {
        local: { command: 'node', args: ['./mcp.js'], tools: ['*'] },
        remote: { type: 'http', url: 'https://x', tools: ['query'] },
      },
    },
    { GhClientCtor: ctor },
  );
  await client.start();
  assert.deepEqual(Object.keys(captured.mcpServers), ['local', 'remote']);
  assert.equal(client.capabilities.mcp, true);
  await client.close();
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npm run build && node --test test/copilot/mcp-config.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement (mirrors Task A11 pattern)**

```ts
// src/copilot/sdk.ts
export type { MCPServerConfig, MCPStdioServerConfig, MCPHTTPServerConfig } from '@github/copilot-sdk';

// src/copilot/types.ts
import type { MCPServerConfig } from './sdk.js';
export interface CopilotClientConfig {
  // ...
  mcpServers?: Record<string, MCPServerConfig>;
}

// src/copilot/sessions.ts — pass through
...(config.mcpServers && { mcpServers: config.mcpServers }),

// src/copilot/client.ts
readonly capabilities: AICliCapabilities = { ...prev, mcp: true };
```

- [ ] **Step 4: Verify PASS**

Run: `npm run build && node --test test/copilot/mcp-config.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/copilot/sdk.ts src/copilot/types.ts src/copilot/sessions.ts src/copilot/client.ts test/copilot/mcp-config.test.mjs
rtk git commit -m "feat(copilot): forward mcpServers config to createSession"
```

---

### Task A13: Phase 1.1 capability matrix update + CHANGELOG

**Files:**
- Modify: `docs/provider-capabilities.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json` (bump version)

- [ ] **Step 1: Update `docs/provider-capabilities.md` Section "Optional capabilities"**

Replace the `richContent` row and add new rows:

```md
| `setModel`              |   ✅   |   ✅    | `setModel`            |
| `setPermissionMode`     |   ✅   |   ❌    | `setPermissionMode`   |
| `setMaxThinkingTokens`  |   ✅   |   ❌    | `setMaxThinkingTokens`|
| `listSupportedModels`   |   ✅   |   ✅    | `listSupportedModels` |
| `getMessages`           |   ✅   |   ✅    | `getMessages`         |
| Rich `SendInput`        | partial | full   | `richContent` — `'none' \| 'partial' \| 'full'`. Claude accepts text + image; Copilot accepts text + image + file_path + directory_path + selection (mapped to SDK attachments). |
```

Update Section "Configuration divergence":

```md
| `hooks`                     |   ✅   |   ✅    | provider-specific shape; Claude hook map vs Copilot SessionHooks |
| `mcp` / `mcpServers`        |   ✅   |   ✅    | provider-specific shape |
```

- [ ] **Step 2: Add CHANGELOG entry**

```md
## 1.1.0 — 2026-04-29

### Added
- `AICliClient.getMessages()`: unified message history projection on both providers, returning `UnifiedMessage[]`. Capability flag `getMessages: true`.
- `CopilotClient.setModel(model)`: maps to `session.setModel`. Capability flag `setModel: true` for Copilot.
- `CopilotClient.listSupportedModels()`: maps to `client.listModels()`, projected to `SupportedModelsResponse`. Capability flag `listSupportedModels: true` for Copilot.
- `CopilotClientConfig.hooks?: SessionHooks`: full Copilot hook lifecycle (`onPreToolUse`, `onPostToolUse`, `onUserPromptSubmitted`, `onSessionStart`, `onSessionEnd`, `onErrorOccurred`). Capability flag `hooks: true` for Copilot.
- `CopilotClientConfig.mcpServers?: Record<string, MCPServerConfig>`: stdio + http/sse MCP servers at session creation. Capability flag `mcp: true` for Copilot.
- `SendInput` content blocks: `file_path`, `directory_path`, `selection` (Copilot only — Claude throws `UnsupportedContentError`).
- `CopilotClient` accepts image content blocks (base64); URL image source remains unsupported.

### Changed
- **Breaking (TS):** `AICliCapabilities.richContent` widened from `boolean` → `'none' | 'partial' | 'full'`. Truthy/falsy runtime checks remain semantically correct (`'none'` is falsy, `'partial' | 'full'` are truthy). Migration: replace `caps.richContent === true` with `caps.richContent !== 'none'`.
- `CopilotClient.close()`: harmonized to `session.abort()` → `session.disconnect()` → `client.stop()`, idempotent. Both providers now emit `closed` event with `null` exit code on graceful close.
```

- [ ] **Step 3: Bump version**

Edit `package.json`: `"version": "1.1.0"`.

- [ ] **Step 4: Run full test suite + integration smoke locally**

Run: `npm test`
Run: `node --test test/copilot/*.test.mjs test/claude/*.test.mjs test/unified/*.test.mjs`
Expected: ALL PASS.

- [ ] **Step 5: Commit and tag**

```bash
rtk git add docs/provider-capabilities.md CHANGELOG.md package.json
rtk git commit -m "chore(release): 1.1.0 — configuration parity"
rtk git tag -a v1.1.0 -m "v1.1.0 — Copilot config parity (hooks, mcp, attachments, setModel, listSupportedModels, getMessages)"
```

---

## Phase 1.2 — Interactive approval parity (target: `1.2.0`)

### Task B1: New unified `PermissionMode` vocabulary + legacy alias

**Files:**
- Modify: `src/unified/types.ts`
- Test: `test/unified/permission-mode.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/unified/permission-mode.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateLegacyPermissionMode } from '../../dist/esm/unified/index.js';
import type { PermissionMode, LegacyPermissionMode } from '../../dist/esm/unified/index.js';

test('translateLegacyPermissionMode maps the four legacy values', () => {
  const _: PermissionMode = 'autopilot';   // type-level: new value compiles
  const cases: Array<[LegacyPermissionMode, PermissionMode]> = [
    ['default', 'prompt'],
    ['acceptEdits', 'auto-edit'],
    ['bypassPermissions', 'auto-all'],
    ['plan', 'plan'],
  ];
  for (const [legacy, modern] of cases) {
    assert.equal(translateLegacyPermissionMode(legacy), modern);
  }
});

test('translateLegacyPermissionMode passes through new vocab unchanged', () => {
  assert.equal(translateLegacyPermissionMode('prompt'), 'prompt');
  assert.equal(translateLegacyPermissionMode('autopilot'), 'autopilot');
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npm run build`
Expected: FAIL — type and helper missing.

- [ ] **Step 3: Update `src/unified/types.ts`**

```ts
export type PermissionMode =
  | 'prompt'
  | 'auto-edit'
  | 'auto-all'
  | 'plan'
  | 'autopilot';

/** @deprecated Use PermissionMode. Will be removed in 2.0.0. */
export type LegacyPermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

export function translateLegacyPermissionMode(mode: PermissionMode | LegacyPermissionMode): PermissionMode {
  switch (mode) {
    case 'default': return 'prompt';
    case 'acceptEdits': return 'auto-edit';
    case 'bypassPermissions': return 'auto-all';
    // remaining values are already in the new vocab
    default: return mode;
  }
}
```

Re-export from `src/unified/index.ts`. Update `AICliCapabilities` to add `permissionModes`:

```ts
export interface AICliCapabilities {
  // ... 1.1 fields ...
  readonly permissionModes: readonly PermissionMode[];
  readonly interactiveApproval: boolean;
  readonly interruptTurnGranularity: 'per-turn' | 'session-only';
  readonly detailedStatus: boolean;
}
```

Add the new fields to both `ClaudeClient` and `CopilotClient` capability inits — Claude: `['prompt','auto-edit','auto-all','plan']`, `interactiveApproval: true`, `interruptTurnGranularity: 'per-turn'`, `detailedStatus: true`. Copilot (will be flipped in later tasks): `[]`, `false`, `'session-only'`, `false`.

Update existing Claude `setPermissionMode` callsites that take legacy strings to translate via `translateLegacyPermissionMode` first. (Find with `rtk grep -n "setPermissionMode"`.)

- [ ] **Step 4: Verify PASS**

Run: `npm run build && node --test test/unified/permission-mode.test.mjs`
Expected: PASS.

- [ ] **Step 5: Run full claude suite — fix anything broken by capability shape change**

Run: `node --test test/claude/*.test.mjs`
Expected: PASS (capability snapshot tests will need updating to include new fields).

- [ ] **Step 6: Commit**

```bash
rtk git add src/unified/types.ts src/unified/index.ts src/claude/client.ts src/copilot/client.ts test/unified/permission-mode.test.mjs test/claude/
rtk git commit -m "feat(unified)!: PermissionMode vocab rename + LegacyPermissionMode alias"
```

---

### Task B2: Three new events on `UnifiedEventMap`

**Files:**
- Modify: `src/unified/events.ts`
- Test: `test/unified/pending-events.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/unified/pending-events.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { UnifiedEventMap } from '../../dist/esm/unified/index.js';

test('UnifiedEventMap includes pending_request_added/removed/resolved', () => {
  const sample: Pick<UnifiedEventMap, 'pending_request_added' | 'pending_request_removed' | 'pending_request_resolved'> = {
    pending_request_added: [{ id: 'r1', kind: 'permission' }],
    pending_request_removed: [{ id: 'r1' }],
    pending_request_resolved: [{ id: 'r1', outcome: 'approved' }],
  };
  assert.ok(sample);
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npm run build`
Expected: FAIL.

- [ ] **Step 3: Update `src/unified/events.ts`**

```ts
export interface UnifiedEventMap {
  // ... existing 12 events ...
  pending_request_added: [event: { id: string; kind: 'permission' | 'elicitation' | 'question' }];
  pending_request_removed: [event: { id: string }];
  pending_request_resolved: [event: { id: string; outcome: 'approved' | 'denied' | 'answered' | 'cancelled' }];
}
```

- [ ] **Step 4: Verify PASS**

Run: `npm run build && node --test test/unified/pending-events.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/unified/events.ts test/unified/pending-events.test.mjs
rtk git commit -m "feat(unified): pending_request_added/removed/resolved events"
```

---

### Task B3: Pending-request types + ApproveDecision + QuestionResponse + DetailedStatus

**Files:**
- Modify: `src/unified/types.ts`
- Test: `test/unified/pending-types.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/unified/pending-types.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  PendingRequest, PermissionPendingRequest, ElicitationPendingRequest, UserInputPendingRequest,
  ApproveDecision, QuestionResponse, DetailedStatus, PendingAction,
} from '../../dist/esm/unified/index.js';

test('PendingRequest is a discriminated union', () => {
  const a: PermissionPendingRequest = {
    id: 'r1', kind: 'permission', permissionKind: 'write', message: 'allow write?',
    raw: { provider: 'copilot', payload: {} as any },
  };
  const b: ElicitationPendingRequest = {
    id: 'r2', kind: 'elicitation', message: 'need info',
    raw: { provider: 'copilot', payload: {} as any },
  };
  const c: UserInputPendingRequest = {
    id: 'r3', kind: 'question', question: 'pick one', allowFreeform: true,
    raw: { provider: 'copilot', payload: {} as any },
  };
  const all: PendingRequest[] = [a, b, c];
  assert.equal(all.length, 3);
});

test('ApproveDecision and QuestionResponse compile in their variant shapes', () => {
  const d: ApproveDecision = { scope: 'session' };
  const q: QuestionResponse = { kind: 'choice', value: 'yes' };
  assert.equal(d.scope, 'session');
  assert.equal(q.kind, 'choice');
});

test('DetailedStatus and PendingAction compile', () => {
  const s: DetailedStatus = {
    status: 'idle', phase: 'idle', pendingRequestCount: 0,
    raw: { provider: 'copilot', payload: {} },
  };
  const a: PendingAction = { id: 'r1', kind: 'permission' };
  assert.equal(s.pendingRequestCount, 0);
  assert.equal(a.id, 'r1');
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npm run build`
Expected: FAIL.

- [ ] **Step 3: Update `src/unified/types.ts`**

```ts
// Pending request shapes
export type PendingRequest =
  | PermissionPendingRequest
  | ElicitationPendingRequest
  | UserInputPendingRequest;

export interface PermissionPendingRequest {
  readonly id: string;
  readonly kind: 'permission';
  readonly permissionKind:
    | 'shell' | 'write' | 'mcp' | 'read' | 'url' | 'custom-tool' | 'memory' | 'hook';
  readonly message: string;
  readonly toolCallId?: string;
  readonly raw: { provider: 'claude'; payload: unknown } | { provider: 'copilot'; payload: unknown };
}

export interface ElicitationPendingRequest {
  readonly id: string;
  readonly kind: 'elicitation';
  readonly message: string;
  readonly schema?: unknown;
  readonly raw: { provider: 'claude'; payload: unknown } | { provider: 'copilot'; payload: unknown };
}

export interface UserInputPendingRequest {
  readonly id: string;
  readonly kind: 'question';
  readonly question: string;
  readonly choices?: readonly string[];
  readonly allowFreeform: boolean;
  readonly raw: { provider: 'claude'; payload: unknown } | { provider: 'copilot'; payload: unknown };
}

// Approve / question response shapes
export type ApproveDecision =
  | { scope: 'once' }
  | { scope: 'session' }
  | { scope: 'location'; locationKey: string };

export type QuestionResponse =
  | { kind: 'text'; answer: string }
  | { kind: 'choice'; value: string }
  | { kind: 'form'; values: Record<string, string | number | boolean | string[]> }
  | { kind: 'cancel' };

// Detailed status
export interface DetailedStatus {
  readonly status: UnifiedStatus;
  readonly phase: string;
  readonly pendingRequestCount: number;
  readonly permissionMode?: PermissionMode;
  readonly raw: { provider: 'claude'; payload: unknown } | { provider: 'copilot'; payload: unknown };
}

// PendingAction (the most-recent unhandled request, for getPendingAction)
export interface PendingAction {
  readonly id: string;
  readonly kind: 'permission' | 'elicitation' | 'question';
}
```

Re-export everything from `src/unified/index.ts`.

- [ ] **Step 4: Verify PASS**

Run: `npm run build && node --test test/unified/pending-types.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/unified/types.ts src/unified/index.ts test/unified/pending-types.test.mjs
rtk git commit -m "feat(unified): PendingRequest, ApproveDecision, QuestionResponse, DetailedStatus types"
```

---

### Task B4: `RequestNotHandled` sentinel error + sdk re-exports

**Files:**
- Modify: `src/copilot/errors.ts`
- Modify: `src/copilot/sdk.ts` (re-export `PermissionRequest`, `PermissionRequestResult`, `ElicitationContext`, `UserInputRequest`)
- Test: `test/copilot/errors.test.mjs` (extend existing test if any)

- [ ] **Step 1: Write the failing test**

```js
// test/copilot/errors.test.mjs (append)
import { RequestNotHandled } from '../../dist/esm/copilot/index.js';

test('RequestNotHandled is a sentinel that handlers throw to fall through', () => {
  const e = new RequestNotHandled();
  assert.ok(e instanceof Error);
  assert.equal(e.name, 'RequestNotHandled');
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npm run build`
Expected: FAIL.

- [ ] **Step 3: Add to `src/copilot/errors.ts`**

```ts
export class RequestNotHandled extends Error {
  override readonly name = 'RequestNotHandled';
  constructor() { super('Request not handled by user-provided handler — falling through to queue.'); }
}
```

Re-export from `src/copilot/index.ts`. Add to `src/copilot/sdk.ts`:

```ts
export type {
  PermissionRequest,
  PermissionRequestResult,
  PermissionDecisionRequest,
  ElicitationContext,
  ElicitationResult,
  UserInputRequest,
  UserInputResponse,
  PermissionsSetApproveAllRequest,
  ModeSetRequest,
  SessionMode,
} from '@github/copilot-sdk';
```

- [ ] **Step 4: Verify PASS**

Run: `npm run build && node --test test/copilot/errors.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/copilot/errors.ts src/copilot/index.ts src/copilot/sdk.ts test/copilot/errors.test.mjs
rtk git commit -m "feat(copilot): RequestNotHandled sentinel + SDK type re-exports for approval flow"
```

---

### Task B5: `PendingRequestQueue` core implementation

**Files:**
- Create: `src/copilot/pending-queue.ts`
- Test: `test/copilot/pending-queue.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/copilot/pending-queue.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PendingRequestQueue } from '../../dist/esm/copilot/pending-queue.js';

test('registerPermission returns a pending Promise; resolveApprove resolves it with approve-once', async () => {
  const events = [];
  const queue = new PendingRequestQueue({ emit: (name, payload) => events.push({ name, payload }) });
  const promise = queue.registerPermission({ kind: 'write', toolCallId: 'tc-1' }, 'sess-1');
  // Look up the id we just emitted
  const added = events.find(e => e.name === 'pending_request_added');
  assert.ok(added);
  const id = added.payload.id;
  // Now resolve
  await queue.resolveApprove(id, { scope: 'once' });
  const result = await promise;
  assert.equal(result.kind, 'approve-once');
  // Should also have emitted removed and resolved
  assert.ok(events.find(e => e.name === 'pending_request_removed' && e.payload.id === id));
  assert.ok(events.find(e => e.name === 'pending_request_resolved' && e.payload.id === id && e.payload.outcome === 'approved'));
});

test('resolveDeny resolves with reject + feedback', async () => {
  const queue = new PendingRequestQueue({ emit: () => {} });
  const promise = queue.registerPermission({ kind: 'shell' }, 'sess-1');
  const id = queue.list()[0].id;
  await queue.resolveDeny(id, 'no thanks');
  const result = await promise;
  assert.equal(result.kind, 'reject');
  assert.equal(result.feedback, 'no thanks');
});

test('list returns snapshot of all open requests', () => {
  const queue = new PendingRequestQueue({ emit: () => {} });
  queue.registerPermission({ kind: 'write' }, 'sess');
  queue.registerElicitation({ sessionId: 'sess', message: 'name?', requestedSchema: undefined });
  const items = queue.list();
  assert.equal(items.length, 2);
  assert.equal(items[0].kind, 'permission');
  assert.equal(items[1].kind, 'elicitation');
});

test('getMostRecent returns last-added entry as PendingAction', () => {
  const queue = new PendingRequestQueue({ emit: () => {} });
  queue.registerPermission({ kind: 'write' }, 'sess');
  queue.registerElicitation({ sessionId: 'sess', message: 'name?', requestedSchema: undefined });
  const action = queue.getMostRecent();
  assert.equal(action?.kind, 'elicitation');
});

test('approve-for-session decision shape', async () => {
  const queue = new PendingRequestQueue({ emit: () => {} });
  const p = queue.registerPermission({ kind: 'shell' }, 'sess');
  const id = queue.list()[0].id;
  await queue.resolveApprove(id, { scope: 'session' });
  const result = await p;
  assert.equal(result.kind, 'approve-for-session');
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npm run build`
Expected: FAIL.

- [ ] **Step 3: Implement `src/copilot/pending-queue.ts`**

```ts
import { randomUUID } from 'crypto';
import type {
  PermissionRequest, PermissionRequestResult, ElicitationContext, ElicitationResult,
  UserInputRequest, UserInputResponse,
} from './sdk.js';
import type {
  PendingRequest, PermissionPendingRequest, ElicitationPendingRequest, UserInputPendingRequest,
  ApproveDecision, QuestionResponse, PendingAction,
} from '../unified/index.js';

interface PermissionEntry {
  id: string;
  kind: 'permission';
  request: PermissionRequest;
  resolve: (r: PermissionRequestResult) => void;
  insertedAt: number;
}
interface ElicitationEntry {
  id: string;
  kind: 'elicitation';
  context: ElicitationContext;
  resolve: (r: ElicitationResult) => void;
  insertedAt: number;
}
interface UserInputEntry {
  id: string;
  kind: 'question';
  request: UserInputRequest;
  resolve: (r: UserInputResponse) => void;
  insertedAt: number;
}

type Entry = PermissionEntry | ElicitationEntry | UserInputEntry;

interface QueueDeps {
  emit: (event: 'pending_request_added' | 'pending_request_removed' | 'pending_request_resolved', payload: any) => void;
}

export class PendingRequestQueue {
  private map = new Map<string, Entry>();
  private deps: QueueDeps;

  constructor(deps: QueueDeps) { this.deps = deps; }

  registerPermission(request: PermissionRequest, _sessionId: string): Promise<PermissionRequestResult> {
    return new Promise(resolve => {
      const id = `perm-${randomUUID()}`;
      this.map.set(id, { id, kind: 'permission', request, resolve, insertedAt: Date.now() });
      this.deps.emit('pending_request_added', { id, kind: 'permission' });
    });
  }

  registerElicitation(context: ElicitationContext): Promise<ElicitationResult> {
    return new Promise(resolve => {
      const id = `elic-${randomUUID()}`;
      this.map.set(id, { id, kind: 'elicitation', context, resolve, insertedAt: Date.now() });
      this.deps.emit('pending_request_added', { id, kind: 'elicitation' });
    });
  }

  registerUserInput(request: UserInputRequest, _sessionId: string): Promise<UserInputResponse> {
    return new Promise(resolve => {
      const id = `qst-${randomUUID()}`;
      this.map.set(id, { id, kind: 'question', request, resolve, insertedAt: Date.now() });
      this.deps.emit('pending_request_added', { id, kind: 'question' });
    });
  }

  list(): PendingRequest[] {
    const out: PendingRequest[] = [];
    for (const entry of this.map.values()) {
      out.push(toPendingRequest(entry));
    }
    return out.sort((a, b) => {
      const ai = (this.map.get(a.id) as Entry).insertedAt;
      const bi = (this.map.get(b.id) as Entry).insertedAt;
      return ai - bi;
    });
  }

  getMostRecent(): PendingAction | null {
    let latest: Entry | null = null;
    for (const e of this.map.values()) {
      if (!latest || e.insertedAt > latest.insertedAt) latest = e;
    }
    if (!latest) return null;
    return { id: latest.id, kind: latest.kind };
  }

  size(): number { return this.map.size; }

  async resolveApprove(id: string, decision: ApproveDecision = { scope: 'once' }): Promise<void> {
    const entry = this.map.get(id);
    if (!entry || entry.kind !== 'permission') throw new Error(`No pending permission request with id=${id}`);
    const result: PermissionRequestResult = decisionToResult(decision);
    entry.resolve(result);
    this.map.delete(id);
    this.deps.emit('pending_request_removed', { id });
    this.deps.emit('pending_request_resolved', { id, outcome: 'approved' });
  }

  async resolveDeny(id: string, feedback?: string): Promise<void> {
    const entry = this.map.get(id);
    if (!entry || entry.kind !== 'permission') throw new Error(`No pending permission request with id=${id}`);
    const result: PermissionRequestResult = feedback !== undefined
      ? { kind: 'reject', feedback }
      : { kind: 'reject' };
    entry.resolve(result);
    this.map.delete(id);
    this.deps.emit('pending_request_removed', { id });
    this.deps.emit('pending_request_resolved', { id, outcome: 'denied' });
  }

  async resolveQuestion(id: string, response: QuestionResponse): Promise<void> {
    const entry = this.map.get(id);
    if (!entry) throw new Error(`No pending request with id=${id}`);
    if (entry.kind === 'elicitation') {
      const result: ElicitationResult = questionToElicitationResult(response);
      entry.resolve(result);
    } else if (entry.kind === 'question') {
      const result: UserInputResponse = questionToUserInputResponse(response);
      entry.resolve(result);
    } else {
      throw new Error(`Pending request id=${id} is a ${entry.kind} — call approveRequest/denyRequest instead`);
    }
    this.map.delete(id);
    this.deps.emit('pending_request_removed', { id });
    this.deps.emit('pending_request_resolved', { id, outcome: response.kind === 'cancel' ? 'cancelled' : 'answered' });
  }
}

function toPendingRequest(entry: Entry): PendingRequest {
  switch (entry.kind) {
    case 'permission':
      return {
        id: entry.id, kind: 'permission',
        permissionKind: entry.request.kind,
        message: `${entry.request.kind} permission requested`,
        ...(entry.request.toolCallId !== undefined && { toolCallId: entry.request.toolCallId }),
        raw: { provider: 'copilot', payload: entry.request },
      };
    case 'elicitation':
      return {
        id: entry.id, kind: 'elicitation',
        message: entry.context.message,
        ...(entry.context.requestedSchema !== undefined && { schema: entry.context.requestedSchema }),
        raw: { provider: 'copilot', payload: entry.context },
      };
    case 'question':
      return {
        id: entry.id, kind: 'question',
        question: entry.request.question,
        ...(entry.request.choices !== undefined && { choices: entry.request.choices }),
        allowFreeform: entry.request.allowFreeform ?? true,
        raw: { provider: 'copilot', payload: entry.request },
      };
  }
}

function decisionToResult(decision: ApproveDecision): PermissionRequestResult {
  switch (decision.scope) {
    case 'once': return { kind: 'approve-once' } as any;
    case 'session': return { kind: 'approve-for-session' } as any;
    case 'location': return { kind: 'approve-for-location', locationKey: decision.locationKey } as any;
  }
}

function questionToElicitationResult(r: QuestionResponse): ElicitationResult {
  if (r.kind === 'cancel') return { action: 'cancel' };
  if (r.kind === 'form') return { action: 'accept', content: r.values };
  if (r.kind === 'choice') return { action: 'accept', content: { value: r.value } };
  return { action: 'accept', content: { answer: r.answer } };
}

function questionToUserInputResponse(r: QuestionResponse): UserInputResponse {
  if (r.kind === 'cancel') return { answer: '', wasFreeform: false };
  if (r.kind === 'choice') return { answer: r.value, wasFreeform: false };
  if (r.kind === 'text') return { answer: r.answer, wasFreeform: true };
  // form responses for ask_user are flattened to JSON string per protocol
  return { answer: JSON.stringify(r.values), wasFreeform: true };
}
```

- [ ] **Step 4: Verify PASS**

Run: `npm run build && node --test test/copilot/pending-queue.test.mjs`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/copilot/pending-queue.ts test/copilot/pending-queue.test.mjs
rtk git commit -m "feat(copilot): PendingRequestQueue — core data structure for pull-style approval"
```

---

### Task B6: Wire `PendingRequestQueue` into Copilot session creation

**Files:**
- Modify: `src/copilot/sessions.ts` (or wherever `createSession` is built)
- Modify: `src/copilot/client.ts`
- Test: `test/copilot/queue-wiring.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/copilot/queue-wiring.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';
import { makeMockGhClient } from './__fixtures__/mock-sdk.mjs';

test('Copilot installs internal onPermissionRequest if user did not provide one', async () => {
  let captured = null;
  const ctor = makeMockGhClient({ onCreateSession: (cfg) => { captured = cfg; } });
  const client = new CopilotClient({ provider: 'copilot' }, { GhClientCtor: ctor });
  await client.start();
  assert.equal(typeof captured.onPermissionRequest, 'function');
  await client.close();
});

test('Copilot getOpenRequests returns the queue snapshot', async () => {
  const ctor = makeMockGhClient();
  const client = new CopilotClient({ provider: 'copilot' }, { GhClientCtor: ctor });
  await client.start();
  // Simulate the SDK invoking our handler
  const cfg = ctor.lastCreateSessionConfig;
  cfg.onPermissionRequest({ kind: 'write' }, { sessionId: 's1' });
  const opens = client.getOpenRequests();
  assert.equal(opens.length, 1);
  assert.equal(opens[0].kind, 'permission');
  await client.close();
});

test('User-provided onPermissionRequest is called first; RequestNotHandled falls through to queue', async () => {
  const ctor = makeMockGhClient();
  const userHandler = async (req) => {
    if (req.kind === 'read') return { kind: 'approve-once' };
    const { RequestNotHandled } = await import('../../dist/esm/copilot/index.js');
    throw new RequestNotHandled();
  };
  const client = new CopilotClient(
    { provider: 'copilot', hooks: { /* ... */ }, onPermissionRequest: userHandler },
    { GhClientCtor: ctor },
  );
  await client.start();
  const installed = ctor.lastCreateSessionConfig.onPermissionRequest;
  // 'read' goes to user, returns immediately
  const r1 = await installed({ kind: 'read' }, { sessionId: 's1' });
  assert.equal(r1.kind, 'approve-once');
  // 'write' falls through
  const p = installed({ kind: 'write' }, { sessionId: 's1' });
  await new Promise(resolve => setTimeout(resolve, 0));   // allow microtask
  assert.equal(client.getOpenRequests().length, 1);
  // Resolve via approve
  const id = client.getOpenRequests()[0].id;
  await client.approveRequest(id);
  await p;
  assert.equal(client.getOpenRequests().length, 0);
  await client.close();
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npm run build && node --test test/copilot/queue-wiring.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Add `onPermissionRequest`/`onElicitationRequest`/`onUserInputRequest` to `CopilotClientConfig` and wire**

```ts
// src/copilot/types.ts — add to CopilotClientConfig
import type { PermissionHandler, ElicitationHandler, UserInputHandler } from './sdk.js';

export interface CopilotClientConfig {
  // ... existing fields ...
  onPermissionRequest?: PermissionHandler;
  onElicitationRequest?: ElicitationHandler;
  onUserInputRequest?: UserInputHandler;
}

// src/copilot/sessions.ts — chain user handler with queue
import { PendingRequestQueue } from './pending-queue.js';
import { RequestNotHandled } from './errors.js';

export function buildSessionConfig(config: CopilotClientConfig, queue: PendingRequestQueue): SessionConfig {
  const userPerm = config.onPermissionRequest;
  const userElic = config.onElicitationRequest;
  const userInput = config.onUserInputRequest;

  return {
    // ... existing fields ...
    onPermissionRequest: async (req, ctx) => {
      if (userPerm) {
        try { return await userPerm(req, ctx); }
        catch (e) {
          if (!(e instanceof RequestNotHandled)) throw e;
          // fall through to queue
        }
      }
      return queue.registerPermission(req, ctx.sessionId);
    },
    onElicitationRequest: async (ctx) => {
      if (userElic) {
        try { return await userElic(ctx); }
        catch (e) { if (!(e instanceof RequestNotHandled)) throw e; }
      }
      return queue.registerElicitation(ctx);
    },
    onUserInputRequest: async (req, ctx) => {
      if (userInput) {
        try { return await userInput(req, ctx); }
        catch (e) { if (!(e instanceof RequestNotHandled)) throw e; }
      }
      return queue.registerUserInput(req, ctx.sessionId);
    },
    ...(config.hooks && { hooks: config.hooks }),
    ...(config.mcpServers && { mcpServers: config.mcpServers }),
  };
}

// src/copilot/client.ts — instantiate queue and create session
class CopilotClient extends EventEmitter implements AICliClient {
  private readonly queue: PendingRequestQueue;
  // ...

  constructor(config: CopilotClientConfig, internals?: CopilotClientInternals) {
    super();
    this.config = config;
    this.queue = new PendingRequestQueue({
      emit: (name, payload) => this.emit(name as any, payload),
    });
    this.transport = new CopilotTransport({
      config, queue: this.queue, GhClientCtor: internals?.GhClientCtor,
    });
  }

  getOpenRequests(): PendingRequest[] { return this.queue.list(); }
  async approveRequest(id: string, decision?: ApproveDecision): Promise<void> {
    return this.queue.resolveApprove(id, decision);
  }
  async denyRequest(id: string, feedback?: string): Promise<void> {
    return this.queue.resolveDeny(id, feedback);
  }
  async answerQuestion(id: string, response: QuestionResponse): Promise<void> {
    return this.queue.resolveQuestion(id, response);
  }
  getPendingAction(): PendingAction | null { return this.queue.getMostRecent(); }
}
```

Update `CopilotTransport` to consume the queue and call `buildSessionConfig` when invoking `client.createSession`. Flip `interactiveApproval: true` capability.

- [ ] **Step 4: Verify PASS**

Run: `npm run build && node --test test/copilot/queue-wiring.test.mjs`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/copilot/types.ts src/copilot/sessions.ts src/copilot/client.ts src/copilot/transport.ts test/copilot/queue-wiring.test.mjs test/copilot/__fixtures__/mock-sdk.mjs
rtk git commit -m "feat(copilot): wire PendingRequestQueue + getOpenRequests/approveRequest/denyRequest/answerQuestion/getPendingAction"
```

---

### Task B7: Copilot `setPermissionMode` + `getDetailedStatus`

**Files:**
- Modify: `src/copilot/client.ts`
- Create: `src/copilot/permission-mapping.ts` (helper)
- Test: `test/copilot/permission-mode-mapping.test.mjs`
- Test: `test/copilot/detailed-status.test.mjs`

- [ ] **Step 1: Write the failing test (mode mapping)**

```js
// test/copilot/permission-mode-mapping.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';
import { makeMockGhClient } from './__fixtures__/mock-sdk.mjs';

test('setPermissionMode("prompt") sets mode interactive + setApproveAll(false)', async () => {
  const calls = [];
  const ctor = makeMockGhClient({
    onRpcCall: (path, params) => { calls.push({ path, params }); },
  });
  const client = new CopilotClient({ provider: 'copilot' }, { GhClientCtor: ctor });
  await client.start();
  await client.setPermissionMode('prompt');
  assert.deepEqual(calls, [
    { path: 'mode.set', params: { mode: 'interactive' } },
    { path: 'permissions.setApproveAll', params: { enabled: false } },
  ]);
});

test('setPermissionMode("auto-all") sets interactive + setApproveAll(true)', async () => {
  const calls = [];
  const ctor = makeMockGhClient({ onRpcCall: (p, x) => calls.push({ p, x }) });
  const c = new CopilotClient({ provider: 'copilot' }, { GhClientCtor: ctor });
  await c.start();
  await c.setPermissionMode('auto-all');
  assert.equal(calls.find(c => c.p === 'permissions.setApproveAll').x.enabled, true);
});

test('setPermissionMode("plan") sets mode plan', async () => {
  const calls = [];
  const ctor = makeMockGhClient({ onRpcCall: (p, x) => calls.push({ p, x }) });
  const c = new CopilotClient({ provider: 'copilot' }, { GhClientCtor: ctor });
  await c.start();
  await c.setPermissionMode('plan');
  assert.ok(calls.find(call => call.p === 'mode.set' && call.x.mode === 'plan'));
});

test('setPermissionMode("autopilot") sets mode autopilot', async () => {
  const calls = [];
  const ctor = makeMockGhClient({ onRpcCall: (p, x) => calls.push({ p, x }) });
  const c = new CopilotClient({ provider: 'copilot' }, { GhClientCtor: ctor });
  await c.start();
  await c.setPermissionMode('autopilot');
  assert.ok(calls.find(call => call.p === 'mode.set' && call.x.mode === 'autopilot'));
});

test('setPermissionMode accepts legacy vocabulary', async () => {
  const calls = [];
  const ctor = makeMockGhClient({ onRpcCall: (p, x) => calls.push({ p, x }) });
  const c = new CopilotClient({ provider: 'copilot' }, { GhClientCtor: ctor });
  await c.start();
  await c.setPermissionMode('bypassPermissions');
  // Should map to auto-all → interactive + approveAll(true)
  assert.ok(calls.find(call => call.p === 'permissions.setApproveAll' && call.x.enabled === true));
});

test('capability permissionModes lists 5 modes', () => {
  const c = new CopilotClient({ provider: 'copilot' });
  assert.deepEqual([...c.capabilities.permissionModes], ['prompt', 'auto-edit', 'auto-all', 'plan', 'autopilot']);
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npm run build && node --test test/copilot/permission-mode-mapping.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement `src/copilot/permission-mapping.ts`**

```ts
import type { PermissionMode } from '../unified/index.js';
import { translateLegacyPermissionMode } from '../unified/index.js';
import type { LegacyPermissionMode } from '../unified/index.js';

interface ModeOps {
  modeSet?: 'interactive' | 'plan' | 'autopilot';
  approveAll?: boolean;
}

export function permissionModeToOps(mode: PermissionMode | LegacyPermissionMode): ModeOps {
  const normalized = translateLegacyPermissionMode(mode);
  switch (normalized) {
    case 'prompt':    return { modeSet: 'interactive', approveAll: false };
    case 'auto-edit': return { modeSet: 'interactive', approveAll: false /* handler-level auto-approve handled separately */ };
    case 'auto-all':  return { modeSet: 'interactive', approveAll: true };
    case 'plan':      return { modeSet: 'plan',        approveAll: false };
    case 'autopilot': return { modeSet: 'autopilot',   approveAll: false };
  }
}
```

- [ ] **Step 4: Implement `setPermissionMode` on `CopilotClient`**

```ts
import { permissionModeToOps } from './permission-mapping.js';

readonly capabilities: AICliCapabilities = {
  ...prev,
  setPermissionMode: true,
  permissionModes: ['prompt', 'auto-edit', 'auto-all', 'plan', 'autopilot'],
  interactiveApproval: true,
  interruptTurnGranularity: 'session-only',
  detailedStatus: true,
};

private _currentPermissionMode: PermissionMode = 'prompt';

async setPermissionMode(mode: PermissionMode | LegacyPermissionMode): Promise<void> {
  const session = (this.transport as any).session;
  if (!session) throw new Error('Copilot session not started — call start() first.');
  const ops = permissionModeToOps(mode);
  if (ops.modeSet) await session.rpc.mode.set({ mode: ops.modeSet });
  if (ops.approveAll !== undefined) await session.rpc.permissions.setApproveAll({ enabled: ops.approveAll });
  this._currentPermissionMode = translateLegacyPermissionMode(mode);

  // For 'auto-edit' we install a queue side-effect that auto-approves write kinds.
  // (Implemented via queue option toggle — see Task B5 extension below.)
  this.queue.setAutoEdit(this._currentPermissionMode === 'auto-edit');
}
```

Add `setAutoEdit(b: boolean)` to `PendingRequestQueue` — when enabled, `registerPermission` auto-resolves entries where `request.kind === 'write'` with `{ kind: 'approve-once' }` immediately, emits the same lifecycle events.

- [ ] **Step 5: Verify PASS (mode mapping)**

Run: `npm run build && node --test test/copilot/permission-mode-mapping.test.mjs`
Expected: 6 PASS.

- [ ] **Step 6: Write the failing test (detailed status)**

```js
// test/copilot/detailed-status.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';
import { makeMockGhClient } from './__fixtures__/mock-sdk.mjs';

test('getDetailedStatus reports phase and pending count', async () => {
  const ctor = makeMockGhClient();
  const c = new CopilotClient({ provider: 'copilot' }, { GhClientCtor: ctor });
  await c.start();
  const s = c.getDetailedStatus();
  assert.equal(s.status, 'idle');
  assert.equal(s.pendingRequestCount, 0);
  assert.equal(s.permissionMode, 'prompt');
  assert.equal(s.raw.provider, 'copilot');
});
```

- [ ] **Step 7: Implement**

```ts
getDetailedStatus(): DetailedStatus {
  return {
    status: this._status === 'error' ? 'error' : this._status === 'running' ? 'running' : 'idle',
    phase: this._lastEventType ?? 'unknown',
    pendingRequestCount: this.queue.size(),
    permissionMode: this._currentPermissionMode,
    raw: { provider: 'copilot', payload: { sessionMode: this._lastSessionMode, lastEventType: this._lastEventType, lastEventTimestamp: this._lastEventTimestamp } },
  };
}
```

Add private fields `_lastEventType`, `_lastSessionMode`, `_lastEventTimestamp` and update them in `handleSdkEvent`.

- [ ] **Step 8: Verify PASS**

Run: `npm run build && node --test test/copilot/detailed-status.test.mjs`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
rtk git add src/copilot/permission-mapping.ts src/copilot/client.ts src/copilot/pending-queue.ts test/copilot/permission-mode-mapping.test.mjs test/copilot/detailed-status.test.mjs
rtk git commit -m "feat(copilot): setPermissionMode + getDetailedStatus + auto-edit queue toggle"
```

---

### Task B8: Copilot `interruptTurn`

**Files:**
- Modify: `src/copilot/client.ts`
- Test: `test/copilot/interrupt-turn.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/copilot/interrupt-turn.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';
import { makeMockGhClient } from './__fixtures__/mock-sdk.mjs';

test('interruptTurn() calls session.abort, ignores turnId', async () => {
  let aborted = 0;
  const ctor = makeMockGhClient({ onSessionAbort: () => aborted++ });
  const client = new CopilotClient({ provider: 'copilot' }, { GhClientCtor: ctor });
  await client.start();
  await client.interruptTurn();
  await client.interruptTurn('turn-xyz');   // ignored
  assert.equal(aborted, 2);
  assert.equal(client.capabilities.interruptTurnGranularity, 'session-only');
});
```

- [ ] **Step 2: Verify FAIL** — `npm run build && node --test test/copilot/interrupt-turn.test.mjs`

- [ ] **Step 3: Implement**

```ts
async interruptTurn(_turnId?: string): Promise<void> {
  if (_turnId !== undefined && process.env.COPILOT_VERBOSE === '1') {
    console.warn(`[copilot] interruptTurn turnId=${_turnId} ignored — session-only granularity`);
  }
  const session = (this.transport as any).session;
  if (!session) return;
  await session.abort?.();
}
```

- [ ] **Step 4: Verify PASS** — same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/copilot/client.ts test/copilot/interrupt-turn.test.mjs
rtk git commit -m "feat(copilot): interruptTurn(turnId?) — session-only granularity"
```

---

### Task B9: Add Phase 1.2 methods to `AICliClient` interface

**Files:**
- Modify: `src/ai-cli-client.ts`

- [ ] **Step 1: Add interface entries**

```ts
import type {
  PendingRequest, ApproveDecision, QuestionResponse, PendingAction, DetailedStatus,
  PermissionMode, LegacyPermissionMode,
} from './unified/index.js';

export interface AICliClient {
  // ... existing surface ...

  getOpenRequests?(): PendingRequest[];
  approveRequest?(id: string, decision?: ApproveDecision): Promise<void>;
  denyRequest?(id: string, feedback?: string): Promise<void>;
  answerQuestion?(id: string, response: QuestionResponse): Promise<void>;
  getPendingAction?(): PendingAction | null;
  interruptTurn?(turnId?: string): Promise<void>;
  getDetailedStatus?(): DetailedStatus;
  setPermissionMode?(mode: PermissionMode | LegacyPermissionMode): Promise<void>;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — both clients now satisfy the unified interface for these methods.

- [ ] **Step 3: Commit**

```bash
rtk git add src/ai-cli-client.ts
rtk git commit -m "feat(unified): lift interactive approval methods + setPermissionMode onto AICliClient"
```

---

### Task B10: Claude side — accept legacy permission mode + thin adapters for queue API

**Files:**
- Modify: `src/claude/client.ts`
- Test: `test/claude/permission-mode-aliases.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/claude/permission-mode-aliases.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeClient } from '../../dist/esm/claude/index.js';

test('Claude setPermissionMode accepts new and legacy vocabulary equally', async () => {
  // Use existing test harness for ClaudeClient
  const c = new ClaudeClient(/* test config */);
  // Both calls should not throw
  await c.setPermissionMode('prompt');
  await c.setPermissionMode('default');
  await c.setPermissionMode('auto-edit');
  await c.setPermissionMode('acceptEdits');
  await c.setPermissionMode('auto-all');
  await c.setPermissionMode('bypassPermissions');
  await c.setPermissionMode('plan');
  // 'autopilot' should reject — Claude doesn't support it
  await assert.rejects(() => c.setPermissionMode('autopilot'), /unsupported|not in permissionModes/i);
});
```

- [ ] **Step 2: Verify FAIL** — likely missing translation.

- [ ] **Step 3: Update Claude `setPermissionMode`**

```ts
import { translateLegacyPermissionMode } from '../unified/index.js';
import type { PermissionMode, LegacyPermissionMode } from '../unified/index.js';

async setPermissionMode(mode: PermissionMode | LegacyPermissionMode): Promise<void> {
  const normalized = translateLegacyPermissionMode(mode);
  if (!this.capabilities.permissionModes.includes(normalized)) {
    const { UnsupportedModeError } = await import('../unified/errors.js');
    throw new UnsupportedModeError(this.provider, normalized);
  }
  // Map back to Claude's internal vocabulary
  const claudeMode = unifiedToClaude(normalized);
  // ... existing implementation that takes Claude's internal vocab ...
}

function unifiedToClaude(mode: PermissionMode): string {
  switch (mode) {
    case 'prompt': return 'default';
    case 'auto-edit': return 'acceptEdits';
    case 'auto-all': return 'bypassPermissions';
    case 'plan': return 'plan';
    case 'autopilot': throw new Error('autopilot is not a Claude permission mode');
  }
}
```

Add `UnsupportedModeError` to `src/unified/errors.ts`:

```ts
export class UnsupportedModeError extends Error {
  override readonly name = 'UnsupportedModeError';
  constructor(public readonly provider: string, public readonly mode: string) {
    super(`Provider '${provider}' does not support permission mode '${mode}'.`);
  }
}
```

For `getOpenRequests`/`approveRequest`/`denyRequest`/`answerQuestion`/`getPendingAction` on `ClaudeClient` — these already exist (they were Claude-only in 1.0). Confirm signatures match the unified interface; adjust return shapes only if needed. If Claude's existing types differ, write thin adapter methods that map Claude's existing `PendingAction`/`OpenRequest` shapes to the unified `PendingRequest`/`PendingAction`/`ApproveDecision` shapes.

- [ ] **Step 4: Verify PASS**

Run: `npm run build && node --test test/claude/permission-mode-aliases.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/claude/client.ts src/unified/errors.ts test/claude/permission-mode-aliases.test.mjs
rtk git commit -m "feat(claude): accept legacy + new PermissionMode vocab; thin adapters for unified approval API"
```

---

### Task B11: Cross-provider contract test for interactive approval

**Files:**
- Create: `test/contract/interactive-approval.test.mjs`

- [ ] **Step 1: Write contract test**

```js
// test/contract/interactive-approval.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeClient } from '../../dist/esm/claude/index.js';
import { CopilotClient } from '../../dist/esm/copilot/index.js';
import { makeMockGhClient } from '../copilot/__fixtures__/mock-sdk.mjs';
// Use whatever Claude mock harness exists; for this contract we only assert API shape.

const envs = [
  { name: 'copilot', build: () => {
      const ctor = makeMockGhClient();
      const c = new CopilotClient({ provider: 'copilot' }, { GhClientCtor: ctor });
      return { client: c, ctor };
  } },
  { name: 'claude', build: () => {
      const c = new ClaudeClient(/* mock config */);
      return { client: c };
  } },
];

for (const env of envs) {
  test(`[${env.name}] AICliClient.getOpenRequests returns array`, async () => {
    const { client } = env.build();
    await client.start();
    const opens = client.getOpenRequests();
    assert.ok(Array.isArray(opens));
    await client.close();
  });

  test(`[${env.name}] capability permissionModes is non-empty array`, async () => {
    const { client } = env.build();
    assert.ok(Array.isArray(client.capabilities.permissionModes));
    assert.ok(client.capabilities.permissionModes.length > 0);
  });
}
```

- [ ] **Step 2: Verify PASS** (or FAIL → fix)

Run: `npm run build && node --test test/contract/interactive-approval.test.mjs`
Expected: 4 PASS (2 per env).

- [ ] **Step 3: Commit**

```bash
rtk git add test/contract/interactive-approval.test.mjs
rtk git commit -m "test(contract): cross-provider interactive approval API parity"
```

---

### Task B12: Phase 1.2 capability matrix update + CHANGELOG + version bump

**Files:**
- Modify: `docs/provider-capabilities.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`

- [ ] **Step 1: Update matrix doc**

Move 7 methods from "Provider-specific" to "Optional capabilities (Group E)" — `getOpenRequests`, `approveRequest`, `denyRequest`, `answerQuestion`, `getPendingAction`, `interruptTurn` (with granularity note), `getDetailedStatus`. Add `setPermissionMode` row showing Copilot ✅. Add a new "Permission mode vocabulary" sub-section listing both vocabularies and the deprecation notice. Add 3 new events to "Unified vocabulary" event table.

- [ ] **Step 2: CHANGELOG entry**

```md
## 1.2.0 — 2026-04-29

### Added
- `AICliClient.getOpenRequests/approveRequest/denyRequest/answerQuestion/getPendingAction`: pull-style interactive approval on both providers. Capability flag `interactiveApproval: true`.
- `AICliClient.interruptTurn(turnId?)`: granular interrupt. Claude: per-turn; Copilot: session-only. Capability flag `interruptTurnGranularity`.
- `AICliClient.getDetailedStatus()`: provider-aware detailed status.
- `AICliClient.setPermissionMode(mode)`: now portable. Copilot capability flag `setPermissionMode: true`.
- New events `pending_request_added/removed/resolved` on `UnifiedEventMap`.
- `RequestNotHandled` sentinel error: throw from a user-provided handler to fall through to the queue.
- `CopilotClient` config now accepts `onPermissionRequest`/`onElicitationRequest`/`onUserInputRequest` callbacks chained with internal queue.

### Changed (BREAKING — string-literal rename, gated by deprecation alias)
- `PermissionMode` vocabulary renamed:
  - `'default'` → `'prompt'`
  - `'acceptEdits'` → `'auto-edit'`
  - `'bypassPermissions'` → `'auto-all'`
  - `'plan'` (unchanged)
  - `'autopilot'` (new — Copilot only)
- The legacy four values remain accepted at runtime via `LegacyPermissionMode` alias and `translateLegacyPermissionMode()` helper. Both will be removed in 2.0.0.
- Migration sed:
  ```
  sed -i.bak "s/'default'/'prompt'/g; s/'acceptEdits'/'auto-edit'/g; s/'bypassPermissions'/'auto-all'/g" <files>
  ```
- `AICliCapabilities` now includes `permissionModes`, `interactiveApproval`, `interruptTurnGranularity`, `detailedStatus`.
```

- [ ] **Step 3: Bump version**

`package.json`: `"version": "1.2.0"`.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: ALL PASS.

- [ ] **Step 5: Commit and tag**

```bash
rtk git add docs/provider-capabilities.md CHANGELOG.md package.json
rtk git commit -m "chore(release): 1.2.0 — interactive approval parity"
rtk git tag -a v1.2.0 -m "v1.2.0 — Copilot interactive approval parity"
```

---

## Phase 1.3 — Copilot bonus RPC surface (target: `1.3.0`)

### Task C1: Error scaffolding for namespace wrappers

**Files:**
- Modify: `src/copilot/errors.ts`
- Test: `test/copilot/namespace-errors.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/copilot/namespace-errors.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SessionNotStartedError, CopilotRpcError, CopilotExperimentalUnavailableError,
} from '../../dist/esm/copilot/index.js';

test('SessionNotStartedError carries expected name and message', () => {
  const e = new SessionNotStartedError('plan.read');
  assert.equal(e.name, 'SessionNotStartedError');
  assert.match(e.message, /plan\.read/);
});

test('CopilotRpcError carries namespace and method', () => {
  const cause = new Error('boom');
  const e = new CopilotRpcError('plan', 'read', cause);
  assert.equal(e.namespace, 'plan');
  assert.equal(e.method, 'read');
  assert.equal(e.cause, cause);
  assert.equal(e.experimental, false);
});

test('CopilotExperimentalUnavailableError carries cliVersion', () => {
  const e = new CopilotExperimentalUnavailableError('mcp', 'list', '0.2.10');
  assert.equal(e.cliVersion, '0.2.10');
  assert.equal(e.experimental, true);
});
```

- [ ] **Step 2: Verify FAIL** — `npm run build`.

- [ ] **Step 3: Add to `src/copilot/errors.ts`**

```ts
export class SessionNotStartedError extends Error {
  override readonly name = 'SessionNotStartedError';
  constructor(public readonly callsite: string) {
    super(`Cannot call ${callsite}: session not started — call start() first.`);
  }
}

export class CopilotRpcError extends Error {
  override readonly name = 'CopilotRpcError';
  readonly experimental = false;
  constructor(
    public readonly namespace: string,
    public readonly method: string,
    public override readonly cause?: unknown,
  ) {
    super(`Copilot RPC failed: ${namespace}.${method}`);
  }
}

export class CopilotExperimentalUnavailableError extends Error {
  override readonly name = 'CopilotExperimentalUnavailableError';
  readonly experimental = true;
  constructor(
    public readonly namespace: string,
    public readonly method: string,
    public readonly cliVersion?: string,
  ) {
    super(`Copilot experimental RPC ${namespace}.${method} is unavailable on CLI version ${cliVersion ?? 'unknown'}.`);
  }
}
```

Re-export from `src/copilot/index.ts`.

- [ ] **Step 4: Verify PASS** — same command. Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/copilot/errors.ts src/copilot/index.ts test/copilot/namespace-errors.test.mjs
rtk git commit -m "feat(copilot): namespace error scaffolding (SessionNotStartedError, CopilotRpcError, CopilotExperimentalUnavailableError)"
```

---

### Task C2: Lazy session resolver helper

**Files:**
- Create: `src/copilot/namespaces/_resolver.ts`
- Test: `test/copilot/namespaces/_resolver.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/copilot/namespaces/_resolver.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSessionResolver, callRpc } from '../../../dist/esm/copilot/namespaces/_resolver.js';
import { SessionNotStartedError } from '../../../dist/esm/copilot/index.js';

test('makeSessionResolver throws SessionNotStartedError if session is null', () => {
  const resolve = makeSessionResolver(() => null, 'plan.read');
  assert.throws(() => resolve(), (e) => e instanceof SessionNotStartedError);
});

test('callRpc wraps thrown errors as CopilotRpcError', async () => {
  const fakeFn = () => { throw new Error('boom'); };
  await assert.rejects(
    () => callRpc('plan', 'read', false, fakeFn),
    (e) => e.name === 'CopilotRpcError' && e.namespace === 'plan',
  );
});

test('callRpc returns value on success', async () => {
  const result = await callRpc('plan', 'read', false, async () => ({ ok: 1 }));
  assert.deepEqual(result, { ok: 1 });
});

test('callRpc with experimental=true wraps method-not-found as ExperimentalUnavailable', async () => {
  const err = new Error('Method not found');
  err.code = -32601;
  await assert.rejects(
    () => callRpc('mcp', 'list', true, async () => { throw err; }),
    (e) => e.name === 'CopilotExperimentalUnavailableError',
  );
});
```

- [ ] **Step 2: Verify FAIL**.

- [ ] **Step 3: Implement `src/copilot/namespaces/_resolver.ts`**

```ts
import type { GhCopilotSession } from '../sdk.js';
import { SessionNotStartedError, CopilotRpcError, CopilotExperimentalUnavailableError } from '../errors.js';

export type SessionGetter = () => GhCopilotSession | null;

export function makeSessionResolver(getter: SessionGetter, callsite: string): () => GhCopilotSession {
  return () => {
    const s = getter();
    if (!s) throw new SessionNotStartedError(callsite);
    return s;
  };
}

export async function callRpc<T>(
  namespace: string,
  method: string,
  experimental: boolean,
  fn: () => Promise<T> | T,
): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (experimental && (err?.code === -32601 || /method not found/i.test(err?.message ?? ''))) {
      throw new CopilotExperimentalUnavailableError(namespace, method);
    }
    throw new CopilotRpcError(namespace, method, err);
  }
}
```

- [ ] **Step 4: Verify PASS**. Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/copilot/namespaces/_resolver.ts test/copilot/namespaces/_resolver.test.mjs
rtk git commit -m "feat(copilot): lazy session resolver + RPC error normalization"
```

---

### Task C3: Canonical wrapper template (`plan` namespace)

**Files:**
- Create: `src/copilot/namespaces/plan.ts`
- Test: `test/copilot/namespaces/plan.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/copilot/namespaces/plan.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotPlanApi } from '../../../dist/esm/copilot/namespaces/plan.js';

test('plan.read calls session.rpc.plan.read', async () => {
  let called = false;
  const fakeSession = { rpc: { plan: { read: async () => { called = true; return { content: 'plan' }; } } } };
  const api = new CopilotPlanApi(() => fakeSession);
  const r = await api.read();
  assert.equal(called, true);
  assert.deepEqual(r, { content: 'plan' });
});

test('plan.read throws SessionNotStartedError if session null', async () => {
  const api = new CopilotPlanApi(() => null);
  await assert.rejects(() => api.read(), (e) => e.name === 'SessionNotStartedError');
});

test('plan.read wraps RPC errors as CopilotRpcError', async () => {
  const fakeSession = { rpc: { plan: { read: async () => { throw new Error('boom'); } } } };
  const api = new CopilotPlanApi(() => fakeSession);
  await assert.rejects(() => api.read(), (e) => e.name === 'CopilotRpcError' && e.namespace === 'plan');
});

test('plan.update and plan.delete dispatch correctly', async () => {
  const calls = [];
  const fakeSession = {
    rpc: {
      plan: {
        update: async (p) => { calls.push(['update', p]); },
        delete: async () => { calls.push(['delete']); },
      },
    },
  };
  const api = new CopilotPlanApi(() => fakeSession);
  await api.update({ content: 'new' });
  await api.delete();
  assert.deepEqual(calls, [['update', { content: 'new' }], ['delete']]);
});
```

- [ ] **Step 2: Verify FAIL**.

- [ ] **Step 3: Implement `src/copilot/namespaces/plan.ts`**

```ts
import type { GhCopilotSession, PlanReadResult, PlanUpdateRequest } from '../sdk.js';
import { makeSessionResolver, callRpc, type SessionGetter } from './_resolver.js';

export class CopilotPlanApi {
  private readonly _resolveRead: () => GhCopilotSession;
  private readonly _resolveUpdate: () => GhCopilotSession;
  private readonly _resolveDelete: () => GhCopilotSession;

  constructor(getter: SessionGetter) {
    this._resolveRead = makeSessionResolver(getter, 'plan.read');
    this._resolveUpdate = makeSessionResolver(getter, 'plan.update');
    this._resolveDelete = makeSessionResolver(getter, 'plan.delete');
  }

  read(): Promise<PlanReadResult> {
    return callRpc('plan', 'read', false, () => this._resolveRead().rpc.plan.read());
  }
  update(params: PlanUpdateRequest): Promise<void> {
    return callRpc('plan', 'update', false, () => this._resolveUpdate().rpc.plan.update(params));
  }
  delete(): Promise<void> {
    return callRpc('plan', 'delete', false, () => this._resolveDelete().rpc.plan.delete());
  }
}
```

Add to `src/copilot/sdk.ts`:

```ts
export type { PlanReadResult, PlanUpdateRequest } from '@github/copilot-sdk/dist/generated/rpc.js';
```

(If that subpath isn't published, re-export from `@github/copilot-sdk` directly. Verify with `grep -r "PlanReadResult" node_modules/@github/copilot-sdk/dist/`.)

- [ ] **Step 4: Verify PASS** — `npm run build && node --test test/copilot/namespaces/plan.test.mjs`. Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/copilot/namespaces/plan.ts src/copilot/sdk.ts test/copilot/namespaces/plan.test.mjs
rtk git commit -m "feat(copilot): plan namespace wrapper"
```

---

### Tasks C4 – C12: Remaining 9 namespace wrappers

**Per-namespace template:** Each task follows the exact pattern of Task C3 — failing test, wrapper file, sdk re-export, verify, commit. The differences are namespace name, methods, and the `experimental` flag in `callRpc`.

| Task | Namespace | Methods | `experimental` | SDK types |
|---|---|---|---|---|
| **C4** | `skills` | `list()`, `enable(p)`, `disable(p)`, `reload()` | `true` | `SkillList`, `SkillsEnableRequest`, `SkillsDisableRequest` |
| **C5** | `agent` | `list()`, `getCurrent()`, `select(p)`, `deselect()`, `reload()` | `true` | `AgentList`, `AgentGetCurrentResult`, `AgentSelectRequest`, `AgentSelectResult`, `AgentReloadResult` |
| **C6** | `history` | `compact()`, `truncate(p)` | `true` | `HistoryCompactResult`, `HistoryTruncateRequest`, `HistoryTruncateResult` |
| **C7** | `usage` | `getMetrics()` | `true` | `UsageGetMetricsResult` |
| **C8** | `shell` | `exec(p)`, `kill(p)` | `false` | `ShellExecRequest`, `ShellExecResult`, `ShellKillRequest`, `ShellKillResult` |
| **C9** | `workspaces` | `getWorkspace()`, `listFiles()`, `readFile(p)`, `createFile(p)` | `false` | `WorkspacesGetWorkspaceResult`, `WorkspacesListFilesResult`, `WorkspacesReadFileRequest`, `WorkspacesReadFileResult`, `WorkspacesCreateFileRequest` |
| **C10** | `name` | `get()`, `set(p)` | `false` | `NameGetResult`, `NameSetRequest` |
| **C11** | `instructions` | `getSources()` | `false` | `InstructionsGetSourcesResult` |
| **C12** | `mcp` | `list()`, `enable(p)`, `disable(p)`, `reload()`, `oauth.login(p)` | `true` | `McpServerList`, `McpEnableRequest`, `McpDisableRequest`, `McpOauthLoginRequest`, `McpOauthLoginResult` |

For each (one task each):

- [ ] **Step 1:** Write the failing test (mirror Task C3 — at minimum: `<method>` calls `session.rpc.<ns>.<method>`, throws `SessionNotStartedError` when session null, wraps errors as `CopilotRpcError`, and (for experimental namespaces) wraps method-not-found as `CopilotExperimentalUnavailableError`).
- [ ] **Step 2:** Verify FAIL.
- [ ] **Step 3:** Implement `src/copilot/namespaces/<ns>.ts` mirroring Task C3's pattern. For `mcp.oauth.login`, expose a nested `oauth` object: `class CopilotMcpApi { readonly oauth = new CopilotMcpOauthApi(this._getter); … }` with its own `login` method.
- [ ] **Step 4:** Re-export SDK types in `src/copilot/sdk.ts`.
- [ ] **Step 5:** Verify PASS.
- [ ] **Step 6:** Commit `feat(copilot): <ns> namespace wrapper`.

**Reference implementation for nested oauth (C12):**

```ts
// src/copilot/namespaces/mcp.ts
import type {
  GhCopilotSession, McpServerList, McpEnableRequest, McpDisableRequest,
  McpOauthLoginRequest, McpOauthLoginResult,
} from '../sdk.js';
import { makeSessionResolver, callRpc, type SessionGetter } from './_resolver.js';

class CopilotMcpOauthApi {
  private readonly _resolve: () => GhCopilotSession;
  constructor(getter: SessionGetter) {
    this._resolve = makeSessionResolver(getter, 'mcp.oauth.login');
  }
  login(p: McpOauthLoginRequest): Promise<McpOauthLoginResult> {
    return callRpc('mcp.oauth', 'login', true, () => this._resolve().rpc.mcp.oauth.login(p));
  }
}

export class CopilotMcpApi {
  readonly oauth: CopilotMcpOauthApi;
  private readonly _resolveList: () => GhCopilotSession;
  private readonly _resolveEnable: () => GhCopilotSession;
  private readonly _resolveDisable: () => GhCopilotSession;
  private readonly _resolveReload: () => GhCopilotSession;

  constructor(getter: SessionGetter) {
    this.oauth = new CopilotMcpOauthApi(getter);
    this._resolveList = makeSessionResolver(getter, 'mcp.list');
    this._resolveEnable = makeSessionResolver(getter, 'mcp.enable');
    this._resolveDisable = makeSessionResolver(getter, 'mcp.disable');
    this._resolveReload = makeSessionResolver(getter, 'mcp.reload');
  }
  list(): Promise<McpServerList> {
    return callRpc('mcp', 'list', true, () => this._resolveList().rpc.mcp.list());
  }
  enable(p: McpEnableRequest): Promise<void> {
    return callRpc('mcp', 'enable', true, () => this._resolveEnable().rpc.mcp.enable(p));
  }
  disable(p: McpDisableRequest): Promise<void> {
    return callRpc('mcp', 'disable', true, () => this._resolveDisable().rpc.mcp.disable(p));
  }
  reload(): Promise<void> {
    return callRpc('mcp', 'reload', true, () => this._resolveReload().rpc.mcp.reload());
  }
}
```

---

### Task C13: Wire 10 namespace fields onto `CopilotClient`

**Files:**
- Modify: `src/copilot/client.ts`
- Create: `src/copilot/namespaces/index.ts`
- Test: `test/copilot/namespaces/wired.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/copilot/namespaces/wired.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../../dist/esm/copilot/index.js';
import { makeMockGhClient } from '../__fixtures__/mock-sdk.mjs';

test('CopilotClient exposes all 10 bonus namespaces', () => {
  const c = new CopilotClient({ provider: 'copilot' });
  for (const ns of ['plan','skills','agent','history','usage','shell','workspaces','name','instructions','mcp']) {
    assert.ok(c[ns], `missing namespace: ${ns}`);
  }
  assert.ok(c.mcp.oauth, 'missing mcp.oauth nested namespace');
});

test('namespace methods throw SessionNotStartedError before start()', async () => {
  const c = new CopilotClient({ provider: 'copilot' });
  await assert.rejects(() => c.plan.read(), (e) => e.name === 'SessionNotStartedError');
  await assert.rejects(() => c.shell.exec({ command: 'ls' }), (e) => e.name === 'SessionNotStartedError');
});
```

- [ ] **Step 2: Verify FAIL**.

- [ ] **Step 3: Implement**

```ts
// src/copilot/namespaces/index.ts
export { CopilotPlanApi } from './plan.js';
export { CopilotSkillsApi } from './skills.js';
export { CopilotAgentApi } from './agent.js';
export { CopilotHistoryApi } from './history.js';
export { CopilotUsageApi } from './usage.js';
export { CopilotShellApi } from './shell.js';
export { CopilotWorkspacesApi } from './workspaces.js';
export { CopilotNameApi } from './name.js';
export { CopilotInstructionsApi } from './instructions.js';
export { CopilotMcpApi } from './mcp.js';

// src/copilot/client.ts — add fields
import {
  CopilotPlanApi, CopilotSkillsApi, CopilotAgentApi, CopilotHistoryApi, CopilotUsageApi,
  CopilotShellApi, CopilotWorkspacesApi, CopilotNameApi, CopilotInstructionsApi, CopilotMcpApi,
} from './namespaces/index.js';

class CopilotClient extends EventEmitter implements AICliClient {
  // ... existing fields ...
  readonly plan: CopilotPlanApi;
  readonly skills: CopilotSkillsApi;
  readonly agent: CopilotAgentApi;
  readonly history: CopilotHistoryApi;
  readonly usage: CopilotUsageApi;
  readonly shell: CopilotShellApi;
  readonly workspaces: CopilotWorkspacesApi;
  readonly name: CopilotNameApi;
  readonly instructions: CopilotInstructionsApi;
  readonly mcp: CopilotMcpApi;

  constructor(config: CopilotClientConfig, internals?: CopilotClientInternals) {
    super();
    // ... existing setup ...
    const sessionGetter = () => (this.transport as any).session ?? null;
    this.plan = new CopilotPlanApi(sessionGetter);
    this.skills = new CopilotSkillsApi(sessionGetter);
    this.agent = new CopilotAgentApi(sessionGetter);
    this.history = new CopilotHistoryApi(sessionGetter);
    this.usage = new CopilotUsageApi(sessionGetter);
    this.shell = new CopilotShellApi(sessionGetter);
    this.workspaces = new CopilotWorkspacesApi(sessionGetter);
    this.name = new CopilotNameApi(sessionGetter);
    this.instructions = new CopilotInstructionsApi(sessionGetter);
    this.mcp = new CopilotMcpApi(sessionGetter);
  }
}
```

- [ ] **Step 4: Verify PASS**. Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/copilot/namespaces/index.ts src/copilot/client.ts test/copilot/namespaces/wired.test.mjs
rtk git commit -m "feat(copilot): wire all 10 bonus RPC namespaces onto CopilotClient"
```

---

### Task C14: Subpath export

**Files:**
- Modify: `package.json`
- Test: `test/copilot/namespaces/exports.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/copilot/namespaces/exports.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('subpath export ./copilot/namespaces resolves and re-exports all 10 wrapper classes', async () => {
  const mod = await import('@drunkcoding/ai-cli-clients/copilot/namespaces');
  for (const k of [
    'CopilotPlanApi','CopilotSkillsApi','CopilotAgentApi','CopilotHistoryApi','CopilotUsageApi',
    'CopilotShellApi','CopilotWorkspacesApi','CopilotNameApi','CopilotInstructionsApi','CopilotMcpApi',
  ]) {
    assert.equal(typeof mod[k], 'function', `missing export: ${k}`);
  }
});
```

(This requires the package to be installed locally for the import to resolve. If `@drunkcoding/ai-cli-clients` isn't aliased, use a relative import path equivalent: `'../../../dist/esm/copilot/namespaces/index.js'`.)

- [ ] **Step 2: Verify FAIL**.

- [ ] **Step 3: Update `package.json` exports map**

```jsonc
"./copilot/namespaces": {
  "types": "./dist/types/copilot/namespaces/index.d.ts",
  "import": "./dist/esm/copilot/namespaces/index.js",
  "require": "./dist/cjs/copilot/namespaces/index.js"
}
```

Run `npm pack --dry-run` to confirm the export resolves.

- [ ] **Step 4: Verify PASS**.

- [ ] **Step 5: Commit**

```bash
rtk git add package.json test/copilot/namespaces/exports.test.mjs
rtk git commit -m "feat(copilot): ./copilot/namespaces subpath export"
```

---

### Task C15: Capability matrix CI test

**Files:**
- Create: `test/unit/capability-matrix.test.mjs`

- [ ] **Step 1: Write the test**

```js
// test/unit/capability-matrix.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ClaudeClient } from '../../dist/esm/claude/index.js';
import { CopilotClient } from '../../dist/esm/copilot/index.js';
import { makeMockGhClient } from '../copilot/__fixtures__/mock-sdk.mjs';

const matrixDoc = readFileSync('docs/provider-capabilities.md', 'utf8');

function parseCapabilityFlags(doc) {
  // Extract a map of <flag-name> → { claude: bool, copilot: bool } from the
  // "Optional capabilities" section. This is a simple table parser; adjust if
  // the doc structure changes.
  const out = {};
  const section = doc.split('### Optional capabilities')[1]?.split('## Provider-specific')[0] ?? '';
  for (const line of section.split('\n')) {
    const m = line.match(/^\|\s*`?(\w+)`?\s*\|\s*([✅❌])\s*\|\s*([✅❌])\s*\|/);
    if (m) {
      out[m[1]] = { claude: m[2] === '✅', copilot: m[3] === '✅' };
    }
  }
  return out;
}

test('matrix doc capability flags match runtime capabilities (claude)', () => {
  const flags = parseCapabilityFlags(matrixDoc);
  const c = new ClaudeClient(/* mock config */);
  for (const [flag, { claude }] of Object.entries(flags)) {
    if (typeof c.capabilities[flag] === 'boolean') {
      assert.equal(c.capabilities[flag], claude, `claude.${flag}`);
    }
    // Skip non-boolean flags (e.g. richContent, permissionModes)
  }
});

test('matrix doc capability flags match runtime capabilities (copilot)', () => {
  const flags = parseCapabilityFlags(matrixDoc);
  const ctor = makeMockGhClient();
  const c = new CopilotClient({ provider: 'copilot' }, { GhClientCtor: ctor });
  for (const [flag, { copilot }] of Object.entries(flags)) {
    if (typeof c.capabilities[flag] === 'boolean') {
      assert.equal(c.capabilities[flag], copilot, `copilot.${flag}`);
    }
  }
});
```

- [ ] **Step 2: Run — adjust parser if needed.**

Run: `node --test test/unit/capability-matrix.test.mjs`
Expected: PASS (assuming matrix doc is in sync; if not, this surfaces the inconsistency).

- [ ] **Step 3: Commit**

```bash
rtk git add test/unit/capability-matrix.test.mjs
rtk git commit -m "test(unit): capability matrix doc matches runtime capabilities"
```

---

### Task C16: Phase 1.3 capability matrix update + CHANGELOG + version bump

**Files:**
- Modify: `docs/provider-capabilities.md`
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `package.json`

- [ ] **Step 1: Update `docs/provider-capabilities.md`**

Add a new section **"Copilot bonus namespaces"** under "Provider-specific":

```md
## Copilot bonus namespaces

Reach via `client.<namespace>.<method>` on a `CopilotClient` instance.
All map to upstream `session.rpc.<namespace>.*` in `@github/copilot-sdk@0.3.0`.
Methods marked **(@experimental)** wrap upstream methods marked `@experimental`
and may change shape in minor SDK releases.

| Namespace | Methods | Stability |
|---|---|---|
| `plan` | `read`, `update`, `delete` | stable |
| `skills` | `list`, `enable`, `disable`, `reload` | @experimental |
| `agent` | `list`, `getCurrent`, `select`, `deselect`, `reload` | @experimental |
| `history` | `compact`, `truncate` | @experimental |
| `usage` | `getMetrics` | @experimental |
| `shell` | `exec`, `kill` | stable |
| `workspaces` | `getWorkspace`, `listFiles`, `readFile`, `createFile` | stable |
| `name` | `get`, `set` | stable |
| `instructions` | `getSources` | stable |
| `mcp` | `list`, `enable`, `disable`, `reload`, `oauth.login` | @experimental |
```

- [ ] **Step 2: Update `README.md`**

Add an "Experimental APIs" section listing the @experimental namespaces with the standard upstream-volatility warning template.

- [ ] **Step 3: CHANGELOG entry**

```md
## 1.3.0 — 2026-04-29

### Added
- `CopilotClient` now exposes 10 namespace wrappers for upstream `session.rpc.*`:
  `plan`, `skills`, `agent`, `history`, `usage`, `shell`, `workspaces`, `name`, `instructions`, `mcp` (with nested `mcp.oauth.login`).
- Subpath export `@drunkcoding/ai-cli-clients/copilot/namespaces` for tree-shake-friendly imports of wrapper classes and types.
- `SessionNotStartedError`, `CopilotRpcError`, `CopilotExperimentalUnavailableError`.
- `test/unit/capability-matrix.test.mjs` — CI guard that asserts `docs/provider-capabilities.md` matches runtime `client.capabilities`.

### Notes
- 5 namespaces are marked `@experimental` upstream and may change shape in minor SDK releases:
  `skills`, `agent`, `history`, `usage`, `mcp`.
```

- [ ] **Step 4: Bump version**

`package.json`: `"version": "1.3.0"`.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: ALL PASS.

- [ ] **Step 6: Commit and tag**

```bash
rtk git add docs/provider-capabilities.md README.md CHANGELOG.md package.json
rtk git commit -m "chore(release): 1.3.0 — Copilot bonus RPC surface"
rtk git tag -a v1.3.0 -m "v1.3.0 — 10 Copilot bonus namespaces"
```

---

## Phase Z — Final reconciliation pass

### Task Z1: Regenerate `docs/provider-capabilities.md` against final implementation

**Files:**
- Modify: `docs/provider-capabilities.md`

- [ ] **Step 1: Run capability-matrix test in verification mode**

Run: `node --test test/unit/capability-matrix.test.mjs`
Expected: PASS — confirms doc matches all runtime capabilities.

- [ ] **Step 2: Manual scan**

Open the doc and verify:
1. Required surface table — unchanged
2. Optional capabilities table — `setModel`, `setPermissionMode`, `setMaxThinkingTokens`, `listSupportedModels`, `getMessages`, `richContent`, `hooks`, `mcp` rows all consistent with runtime (Copilot ✅ for everything except `setMaxThinkingTokens`).
3. Provider-specific table — only `kill`, `getCurrentTurnDetailed`, `getHistoryDetailed`, `getCurrentTurnHandle` (Copilot), `sendControlRequest`, `sendMcpMessage`, `sendMcpControlResponse`, `sendMessageWithContent`, `createQuestionSession` (Claude), `setMaxThinkingTokens` (Claude). 7 methods removed since Phase 1.0 (now on unified surface): `getOpenRequests`, `approveRequest`, `denyRequest`, `answerQuestion`, `getDetailedStatus`, `getPendingAction`, `interruptTurn`.
4. Snapshot shapes section — unchanged
5. Events section — `pending_request_added/removed/resolved` added under "Unified vocabulary"
6. Configuration divergence — `hooks` and `mcp` rows show ✅ on both providers; `permissionMode` row shows ✅ on both with vocabulary note
7. Permission mode vocabulary sub-section — present, lists both vocabularies and deprecation note
8. PTY transport — unchanged
9. Copilot bonus namespaces — present (added in Phase 1.3)
10. Deferred — Group D removed (closed by Phase 1.2); Group F still listed; generic-parameterized event maps still listed

- [ ] **Step 3: If any drift, fix inline and re-run capability-matrix test.**

- [ ] **Step 4: Commit (if any changes)**

```bash
rtk git add docs/provider-capabilities.md
rtk git commit -m "docs(provider-capabilities): final reconciliation pass after Phase 1.3"
```

---

## Self-review checklist (run before handing back to user)

- [ ] **Spec coverage:** every item in spec §4–§9 has a corresponding task above. Specifically:
  - §4 (Phase 1.1): Tasks A1–A13 cover setModel, listSupportedModels, getMessages, attachments, hooks, mcpServers, lifecycle, capability widening
  - §5 (Phase 1.2): Tasks B1–B12 cover PermissionMode rename, 3 events, PendingRequest types, queue, wiring, setPermissionMode, getDetailedStatus, interruptTurn, AICliClient additions, Claude legacy support, contract test
  - §6 (Phase 1.3): Tasks C1–C16 cover error scaffolding, resolver, 10 namespace wrappers, wiring, subpath export, capability-matrix test, doc/CHANGELOG
  - §7 (capability matrix): Tasks A13, B12, C16, Z1 amend the doc per phase + final reconciliation
  - §8 (testing): Each task includes its own unit test; B11 adds the cross-provider contract test; C15 adds the capability-matrix CI test
- [ ] **Placeholder scan:** No `TBD`, `TODO`, `implement later`, "similar to Task N" without code. Each step contains the actual code or command.
- [ ] **Type consistency:** `PendingRequest`, `PendingAction`, `ApproveDecision`, `QuestionResponse`, `DetailedStatus`, `UnifiedMessage` — all named the same across the plan and the spec.
- [ ] **Path consistency:** Every `Files:` block lists exact paths the engineer can `rtk git add`.

---

## Plan complete and saved.

**Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task with two-stage review between tasks; fastest iteration.

**2. Inline Execution** — Execute tasks in this session using `executing-plans` with batch checkpoints for review.

Which approach?
