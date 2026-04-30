import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';

function buildMock() {
  class MockSession {
    constructor() {
      this.id = 'sess-1';
      this.rpc = {
        mode: { set: async () => {} },
        permissions: { setApproveAll: async () => ({ ok: true }) },
      };
    }
    on() { return () => {}; }
    async sendAndWait() { return { data: { content: 'ok' } }; }
    async abort() {}
    async disconnect() {}
  }
  return class MockClient {
    async start() {}
    async stop() {}
    async createSession() { return new MockSession(); }
    on() { return () => {}; }
  };
}

test('getDetailedStatus reports status, phase, pendingCount, permissionMode, raw', async () => {
  const ctor = buildMock();
  const c = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
  await c.start();
  const s = c.getDetailedStatus();
  assert.equal(s.status, 'idle');
  assert.equal(s.pendingRequestCount, 0);
  assert.equal(s.permissionMode, 'prompt');
  assert.equal(s.raw.provider, 'copilot');
  assert.ok(typeof s.phase === 'string');
  assert.equal(c.capabilities.detailedStatus, true);
  await c.close();
});

test('getDetailedStatus reflects updated permissionMode after setPermissionMode', async () => {
  const ctor = buildMock();
  const c = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
  await c.start();
  await c.setPermissionMode('auto-all');
  const s = c.getDetailedStatus();
  assert.equal(s.permissionMode, 'auto-all');
  await c.close();
});

test('getDetailedStatus permissionMode normalizes legacy vocab', async () => {
  const ctor = buildMock();
  const c = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
  await c.start();
  await c.setPermissionMode('bypassPermissions');
  const s = c.getDetailedStatus();
  assert.equal(s.permissionMode, 'auto-all');
  await c.close();
});
