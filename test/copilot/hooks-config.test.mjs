import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';

test('hooks config is forwarded to createSession', async () => {
  let captured = null;
  class MockSession {
    constructor() { this.id = 'sess-1'; }
    on() { return () => {}; }
    async sendAndWait() { return { data: { content: 'ok' } }; }
    async abort() {}
    async disconnect() {}
  }
  class MockClient {
    async start() {}
    async stop() {}
    async createSession(cfg) { captured = cfg; return new MockSession(); }
    on() { return () => {}; }
  }
  const onPreToolUse = async () => undefined;
  const onSessionStart = async () => ({ additionalContext: 'hi' });

  const client = new CopilotClient(
    { cwd: process.cwd(), hooks: { onPreToolUse, onSessionStart } },
    { GhClientCtor: MockClient },
  );
  await client.start();
  assert.ok(captured);
  assert.equal(captured.hooks?.onPreToolUse, onPreToolUse);
  assert.equal(captured.hooks?.onSessionStart, onSessionStart);
  assert.equal(client.capabilities.hooks, true);
  await client.close();
});

test('absent hooks does not put a hooks key in createSession config', async () => {
  let captured = null;
  class MockClient {
    async start() {}
    async stop() {}
    async createSession(cfg) { captured = cfg; return { id: 's', on: () => () => {}, sendAndWait: async () => ({ data: { content: '' } }), abort: async () => {}, disconnect: async () => {} }; }
    on() { return () => {}; }
  }
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: MockClient });
  await client.start();
  assert.ok(captured);
  assert.equal(captured.hooks, undefined);
  await client.close();
});
