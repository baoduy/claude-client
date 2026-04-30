import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../../dist/esm/copilot/index.js';

test('CopilotClient exposes all 10 bonus namespaces as readonly fields', () => {
  const c = new CopilotClient({ cwd: process.cwd() });
  for (const ns of ['plan','skills','agent','history','usage','shell','workspaces','name','instructions','mcp']) {
    assert.ok(c[ns], `missing namespace: ${ns}`);
  }
  assert.ok(c.mcp.oauth, 'missing mcp.oauth nested namespace');
});

test('namespace methods throw SessionNotStartedError before start()', async () => {
  const c = new CopilotClient({ cwd: process.cwd() });
  await assert.rejects(() => c.plan.read(), (e) => e.name === 'SessionNotStartedError');
  await assert.rejects(() => c.shell.exec({ command: 'ls' }), (e) => e.name === 'SessionNotStartedError');
  await assert.rejects(() => c.name.get(), (e) => e.name === 'SessionNotStartedError');
});

test('namespace methods reach the SDK session after start()', async () => {
  let planRead = false;
  class MockSession {
    constructor() {
      this.id = 'sess-1';
      this.rpc = {
        mode: { set: async () => {} },
        permissions: { setApproveAll: async () => ({}) },
        plan: { read: async () => { planRead = true; return { content: 'p' }; } },
      };
    }
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
  }
  const c = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: MockClient });
  await c.start();
  const r = await c.plan.read();
  assert.equal(planRead, true);
  assert.deepEqual(r, { content: 'p' });
  await c.close();
});
