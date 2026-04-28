import test from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';

class FakeGhClient {
  constructor(opts) { this.opts = opts; this.stopped = false; }
  async createSession(config) {
    return new FakeGhSession(config?.model ?? 'auto', config?.sessionId ?? 'auto-id');
  }
  async resumeSession(id, _config) { return new FakeGhSession('resumed', id); }
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

// ── send() / streaming tests ──────────────────────────────────────────────────

import { CopilotTurnHandle } from '../../dist/esm/copilot/turn-handle.js';

class StreamingFakeGhSession {
  constructor() {
    this._listeners = [];
    this.sendCalls = [];
  }
  on(handler) {
    // Subscription style: returns unsubscribe
    this._listeners.push(handler);
    return () => { this._listeners = this._listeners.filter(h => h !== handler); };
  }
  emit(payload) { this._listeners.forEach(h => h(payload)); }
  async sendAndWait({ prompt }) {
    this.sendCalls.push(prompt);
    queueMicrotask(() => {
      this.emit({ type: 'assistant.streaming_delta', delta: 'hello ' });
      this.emit({ type: 'assistant.streaming_delta', delta: 'world' });
      this.emit({ type: 'assistant.message_delta', usage: { inputTokens: 5, outputTokens: 2 } });
      this.emit({ type: 'session.idle' });
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
  // At minimum, the run should yield: 2x output, 1x usage (or skip), 1x result.
  // The exact event mapping depends on how the adapter handles message_delta;
  // we accept either of:
  //   ['output', 'output', 'usage', 'result']
  //   ['output', 'output', 'result']
  assert.ok(kinds.filter(k => k === 'output').length === 2, `expected 2 output updates, got ${JSON.stringify(kinds)}`);
  assert.equal(kinds[kinds.length - 1], 'result');

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
  client.on('result',       s => captured.push(['result', s.text]));

  const turn = client.send('hi');
  await turn.done;

  assert.equal(captured.filter(([n]) => n === 'output_delta').length, 2);
  assert.equal(captured.filter(([n]) => n === 'result').length, 1);
  await client.close();
});

// ── interrupt() tests ─────────────────────────────────────────────────────────

import { CopilotInterruptedError } from '../../dist/esm/copilot/index.js';

class HangingFakeGhSession {
  on() { return () => {}; }
  async sendAndWait() {
    return new Promise((_resolve, reject) => { this._reject = reject; /* never resolves */ });
  }
  async abort() { this._reject?.(new Error('cancelled by client')); }
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
