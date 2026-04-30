import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';

test('Copilot getMessages projects session.getMessages into UnifiedMessage[]', async () => {
  const sessionEvents = [
    { type: 'user.message', id: 'u1', timestamp: '2026-04-29T00:00:00Z', data: { content: 'hi' } },
    { type: 'assistant.message', id: 'a1', timestamp: '2026-04-29T00:00:01Z', data: { content: 'hello back' } },
    { type: 'tool.execution_start', id: 't1', timestamp: '2026-04-29T00:00:02Z',
      data: { toolUseId: 'call-1', toolName: 'read_file', arguments: { path: '/tmp/x' } } },
    { type: 'tool.execution_complete', id: 't2', timestamp: '2026-04-29T00:00:03Z',
      data: { toolUseId: 'call-1', output: 'ok', isError: false } },
    { type: 'session.idle', id: 's1', timestamp: '2026-04-29T00:00:04Z' },
  ];
  class MockSession {
    constructor() { this.id = 'sess-1'; }
    on() { return () => {}; }
    async sendAndWait() { return { data: { content: 'ok' } }; }
    async abort() {}
    async disconnect() {}
    async getMessages() { return sessionEvents; }
  }
  class MockClient {
    async start() {}
    async stop() {}
    async createSession() { return new MockSession(); }
    on() { return () => {}; }
  }
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: MockClient });
  await client.start();

  const msgs = await client.getMessages();
  // skip session.idle → 4 messages
  assert.equal(msgs.length, 4);
  assert.equal(msgs[0].role, 'user');
  assert.equal(msgs[0].text, 'hi');
  assert.equal(msgs[1].role, 'assistant');
  assert.equal(msgs[1].text, 'hello back');
  assert.equal(msgs[2].role, 'tool');
  assert.deepEqual(msgs[2].toolUse, { id: 'call-1', name: 'read_file', input: { path: '/tmp/x' } });
  assert.equal(msgs[3].role, 'tool');
  assert.deepEqual(msgs[3].toolResult, { toolUseId: 'call-1', content: 'ok', isError: false });

  for (const m of msgs) {
    assert.equal(m.raw.provider, 'copilot');
    assert.equal(typeof m.timestamp, 'number');
  }
  assert.equal(client.capabilities.getMessages, true);
  await client.close();
});

test('Copilot getMessages throws if not started', async () => {
  const client = new CopilotClient({ cwd: process.cwd() });
  await assert.rejects(() => client.getMessages(), /not started/i);
});

test('Copilot getMessages handles empty event list', async () => {
  class MockClient {
    async start() {}
    async stop() {}
    async createSession() {
      return {
        id: 's', on: () => () => {},
        sendAndWait: async () => ({ data: { content: '' } }),
        abort: async () => {}, disconnect: async () => {},
        getMessages: async () => [],
      };
    }
    on() { return () => {}; }
  }
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: MockClient });
  await client.start();
  const msgs = await client.getMessages();
  assert.deepEqual(msgs, []);
  await client.close();
});
