import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotMcpApi } from '../../../dist/esm/copilot/namespaces/mcp.js';

test('mcp.list calls session.rpc.mcp.list', async () => {
  const fakeSession = { rpc: { mcp: { list: async () => [{ name: 's1' }] } } };
  const api = new CopilotMcpApi(() => fakeSession);
  assert.deepEqual(await api.list(), [{ name: 's1' }]);
});

test('mcp.list throws SessionNotStartedError if null', async () => {
  const api = new CopilotMcpApi(() => null);
  await assert.rejects(() => api.list(), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'mcp.list');
});

test('mcp.list wraps method-not-found as CopilotExperimentalUnavailableError', async () => {
  const fakeSession = {
    rpc: { mcp: { list: async () => { const e = new Error('Method not found'); e.code = -32601; throw e; } } },
  };
  const api = new CopilotMcpApi(() => fakeSession);
  await assert.rejects(() => api.list(), (e) => e.name === 'CopilotExperimentalUnavailableError');
});

test('mcp.enable dispatches params', async () => {
  const calls = [];
  const fakeSession = { rpc: { mcp: { enable: async (p) => { calls.push(p); } } } };
  const api = new CopilotMcpApi(() => fakeSession);
  await api.enable({ name: 's1' });
  assert.deepEqual(calls, [{ name: 's1' }]);
});

test('mcp.enable throws SessionNotStartedError if null', async () => {
  const api = new CopilotMcpApi(() => null);
  await assert.rejects(() => api.enable({ name: 'x' }), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'mcp.enable');
});

test('mcp.disable dispatches params', async () => {
  const calls = [];
  const fakeSession = { rpc: { mcp: { disable: async (p) => { calls.push(p); } } } };
  const api = new CopilotMcpApi(() => fakeSession);
  await api.disable({ name: 's1' });
  assert.deepEqual(calls, [{ name: 's1' }]);
});

test('mcp.disable throws SessionNotStartedError if null', async () => {
  const api = new CopilotMcpApi(() => null);
  await assert.rejects(() => api.disable({ name: 'x' }), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'mcp.disable');
});

test('mcp.reload dispatches with no args', async () => {
  let called = false;
  const fakeSession = { rpc: { mcp: { reload: async () => { called = true; } } } };
  const api = new CopilotMcpApi(() => fakeSession);
  await api.reload();
  assert.equal(called, true);
});

test('mcp.reload throws SessionNotStartedError if null', async () => {
  const api = new CopilotMcpApi(() => null);
  await assert.rejects(() => api.reload(), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'mcp.reload');
});

test('mcp.oauth.login dispatches params and returns result', async () => {
  const calls = [];
  const fakeSession = {
    rpc: { mcp: { oauth: { login: async (p) => { calls.push(p); return { url: 'https://x' }; } } } },
  };
  const api = new CopilotMcpApi(() => fakeSession);
  const r = await api.oauth.login({ name: 's1' });
  assert.deepEqual(calls, [{ name: 's1' }]);
  assert.deepEqual(r, { url: 'https://x' });
});

test('mcp.oauth.login throws SessionNotStartedError if null with correct callsite', async () => {
  const api = new CopilotMcpApi(() => null);
  await assert.rejects(
    () => api.oauth.login({ name: 'x' }),
    (e) => e.name === 'SessionNotStartedError' && e.callsite === 'mcp.oauth.login',
  );
});

test('mcp.oauth.login wraps method-not-found as CopilotExperimentalUnavailableError', async () => {
  const fakeSession = {
    rpc: { mcp: { oauth: { login: async () => { const e = new Error('Method not found'); e.code = -32601; throw e; } } } },
  };
  const api = new CopilotMcpApi(() => fakeSession);
  await assert.rejects(
    () => api.oauth.login({ name: 'x' }),
    (e) => e.name === 'CopilotExperimentalUnavailableError' && e.namespace === 'mcp.oauth' && e.method === 'login',
  );
});
