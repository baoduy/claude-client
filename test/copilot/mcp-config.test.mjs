import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';

test('mcpServers config is forwarded to createSession', async () => {
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

  const client = new CopilotClient(
    {
      cwd: process.cwd(),
      mcpServers: {
        local: { command: 'node', args: ['./mcp.js'], tools: ['*'] },
        remote: { type: 'http', url: 'https://x', tools: ['query'] },
      },
    },
    { GhClientCtor: MockClient },
  );
  await client.start();
  assert.ok(captured?.mcpServers);
  assert.deepEqual(Object.keys(captured.mcpServers), ['local', 'remote']);
  assert.equal(captured.mcpServers.local.command, 'node');
  assert.equal(captured.mcpServers.remote.url, 'https://x');
  assert.equal(client.capabilities.mcp, true);
  await client.close();
});

test('absent mcpServers does not put a mcpServers key in createSession config', async () => {
  let captured = null;
  class MockClient {
    async start() {}
    async stop() {}
    async createSession(cfg) { captured = cfg; return { id: 's', on: () => () => {}, sendAndWait: async () => ({ data: { content: '' } }), abort: async () => {}, disconnect: async () => {} }; }
    on() { return () => {}; }
  }
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: MockClient });
  await client.start();
  assert.equal(captured.mcpServers, undefined);
  await client.close();
});
