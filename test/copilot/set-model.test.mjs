import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';

test('setModel calls session.setModel(model)', async () => {
  const calls = [];
  class MockSession {
    constructor() { this.id = 'sess-1'; }
    on() { return () => {}; }
    async sendAndWait() { return { data: { content: 'ok' } }; }
    async abort() {}
    async disconnect() {}
    async setModel(model, options) { calls.push({ model, options }); }
  }
  class MockClient {
    async start() {}
    async stop() {}
    async createSession() { return new MockSession(); }
    on() { return () => {}; }
  }
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: MockClient });
  await client.start();
  await client.setModel('claude-sonnet-4.6');
  assert.deepEqual(calls, [{ model: 'claude-sonnet-4.6', options: undefined }]);
  assert.equal(client.capabilities.setModel, true);
  await client.close();
});

test('setModel throws if session not started', async () => {
  const client = new CopilotClient({ cwd: process.cwd() });
  await assert.rejects(() => client.setModel('x'), /not started|no .* session/i);
});
