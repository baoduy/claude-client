import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';

function buildMock({ aborts = [] } = {}) {
  class MockSession {
    constructor() {
      this.id = 'sess-1';
      this.rpc = { mode: { set: async () => {} }, permissions: { setApproveAll: async () => ({}) } };
    }
    on() { return () => {}; }
    async sendAndWait() { return { data: { content: 'ok' } }; }
    async abort() { aborts.push(Date.now()); }
    async disconnect() {}
  }
  return class MockClient {
    async start() {}
    async stop() {}
    async createSession() { return new MockSession(); }
    on() { return () => {}; }
  };
}

test('interruptTurn() calls session.abort', async () => {
  const aborts = [];
  const ctor = buildMock({ aborts });
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
  await client.start();
  await client.interruptTurn();
  assert.equal(aborts.length, 1);
  await client.close();
});

test('interruptTurn(turnId) ignores the argument and still aborts', async () => {
  const aborts = [];
  const ctor = buildMock({ aborts });
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
  await client.start();
  await client.interruptTurn('turn-xyz');
  assert.equal(aborts.length, 1);
  await client.close();
});

test('interruptTurn() is a no-op if session not started', async () => {
  const client = new CopilotClient({ cwd: process.cwd() });
  // Should not throw
  await client.interruptTurn();
});

test('capability interruptTurnGranularity === "session-only"', () => {
  const c = new CopilotClient({ cwd: process.cwd() });
  assert.equal(c.capabilities.interruptTurnGranularity, 'session-only');
});
