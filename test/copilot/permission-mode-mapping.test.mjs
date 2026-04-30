import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';

function buildMock({ rpcCalls = [] } = {}) {
  class MockSession {
    constructor() { this.id = 'sess-1'; }
    on() { return () => {}; }
    async sendAndWait() { return { data: { content: 'ok' } }; }
    async abort() {}
    async disconnect() {}
    rpc = {
      mode: {
        get: async () => 'interactive',
        set: async (params) => { rpcCalls.push({ path: 'mode.set', params }); },
      },
      permissions: {
        setApproveAll: async (params) => { rpcCalls.push({ path: 'permissions.setApproveAll', params }); return { ok: true }; },
        resetSessionApprovals: async () => ({ ok: true }),
      },
    };
  }
  const ctor = class MockClient {
    async start() {}
    async stop() {}
    async createSession() { return new MockSession(); }
    on() { return () => {}; }
  };
  return ctor;
}

test('setPermissionMode("prompt") sets mode interactive + setApproveAll(false)', async () => {
  const calls = [];
  const ctor = buildMock({ rpcCalls: calls });
  const c = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
  await c.start();
  await c.setPermissionMode('prompt');
  assert.deepEqual(calls.find(x => x.path === 'mode.set').params, { mode: 'interactive' });
  assert.deepEqual(calls.find(x => x.path === 'permissions.setApproveAll').params, { enabled: false });
  await c.close();
});

test('setPermissionMode("auto-all") sets interactive + setApproveAll(true)', async () => {
  const calls = [];
  const ctor = buildMock({ rpcCalls: calls });
  const c = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
  await c.start();
  await c.setPermissionMode('auto-all');
  assert.equal(calls.find(x => x.path === 'permissions.setApproveAll').params.enabled, true);
  assert.equal(calls.find(x => x.path === 'mode.set').params.mode, 'interactive');
  await c.close();
});

test('setPermissionMode("plan") sets mode plan', async () => {
  const calls = [];
  const ctor = buildMock({ rpcCalls: calls });
  const c = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
  await c.start();
  await c.setPermissionMode('plan');
  assert.equal(calls.find(x => x.path === 'mode.set').params.mode, 'plan');
  await c.close();
});

test('setPermissionMode("autopilot") sets mode autopilot', async () => {
  const calls = [];
  const ctor = buildMock({ rpcCalls: calls });
  const c = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
  await c.start();
  await c.setPermissionMode('autopilot');
  assert.equal(calls.find(x => x.path === 'mode.set').params.mode, 'autopilot');
  await c.close();
});

test('setPermissionMode accepts legacy vocabulary (bypassPermissions → auto-all)', async () => {
  const calls = [];
  const ctor = buildMock({ rpcCalls: calls });
  const c = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
  await c.start();
  await c.setPermissionMode('bypassPermissions');
  assert.equal(calls.find(x => x.path === 'permissions.setApproveAll').params.enabled, true);
  await c.close();
});

test('setPermissionMode("auto-edit") toggles queue.setAutoEdit + sets interactive', async () => {
  const calls = [];
  const ctor = buildMock({ rpcCalls: calls });
  const c = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
  await c.start();
  await c.setPermissionMode('auto-edit');
  assert.equal(calls.find(x => x.path === 'mode.set').params.mode, 'interactive');
  assert.equal(calls.find(x => x.path === 'permissions.setApproveAll').params.enabled, false);
  assert.equal(c.capabilities.permissionModes.includes('auto-edit'), true);
  await c.close();
});

test('capability.permissionModes lists 5 modes after start', () => {
  const c = new CopilotClient({ cwd: process.cwd() });
  assert.deepEqual([...c.capabilities.permissionModes], ['prompt', 'auto-edit', 'auto-all', 'plan', 'autopilot']);
  assert.equal(c.capabilities.setPermissionMode, true);
});

test('setPermissionMode rejects mode not in permissionModes list', async () => {
  const c = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: buildMock() });
  await c.start();
  await assert.rejects(() => c.setPermissionMode('definitely-not-a-mode'), /unsupported|not in permissionModes|does not support/i);
  await c.close();
});

test('setPermissionMode throws if session not started', async () => {
  const c = new CopilotClient({ cwd: process.cwd() });
  await assert.rejects(() => c.setPermissionMode('prompt'), /not started/i);
});
