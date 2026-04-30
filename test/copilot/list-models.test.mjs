import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';

test('listSupportedModels wraps client.listModels and projects to unified shape', async () => {
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
    async createSession() { return new MockSession(); }
    on() { return () => {}; }
    async listModels() {
      return [
        { modelId: 'gpt-4.1', name: 'GPT-4.1' },
        { modelId: 'claude-sonnet-4.6' },
      ];
    }
  }
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: MockClient });
  await client.start();
  const resp = await client.listSupportedModels();
  assert.deepEqual(resp, {
    models: [
      { id: 'gpt-4.1', displayName: 'GPT-4.1' },
      { id: 'claude-sonnet-4.6', displayName: undefined },
    ],
  });
  assert.equal(client.capabilities.listSupportedModels, true);
  await client.close();
});

test('listSupportedModels handles empty list', async () => {
  class MockClient {
    async start() {}
    async stop() {}
    async createSession() {
      return { id: 's', on: () => () => {}, sendAndWait: async () => ({ data: { content: '' } }), abort: async () => {}, disconnect: async () => {} };
    }
    on() { return () => {}; }
    async listModels() { return []; }
  }
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: MockClient });
  await client.start();
  const resp = await client.listSupportedModels();
  assert.deepEqual(resp, { models: [] });
  await client.close();
});

test('listSupportedModels throws if not started', async () => {
  const client = new CopilotClient({ cwd: process.cwd() });
  await assert.rejects(() => client.listSupportedModels(), /not started/i);
});
