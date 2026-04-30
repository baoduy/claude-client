import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotNameApi } from '../../../dist/esm/copilot/namespaces/name.js';

test('name.get calls session.rpc.name.get', async () => {
  const fakeSession = { rpc: { name: { get: async () => ({ name: 'session-1' }) } } };
  const api = new CopilotNameApi(() => fakeSession);
  assert.deepEqual(await api.get(), { name: 'session-1' });
});

test('name.get throws SessionNotStartedError if null', async () => {
  const api = new CopilotNameApi(() => null);
  await assert.rejects(() => api.get(), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'name.get');
});

test('name.get wraps RPC errors as CopilotRpcError', async () => {
  const fakeSession = { rpc: { name: { get: async () => { throw new Error('boom'); } } } };
  const api = new CopilotNameApi(() => fakeSession);
  await assert.rejects(
    () => api.get(),
    (e) => e.name === 'CopilotRpcError' && e.namespace === 'name' && e.method === 'get',
  );
});

test('name.set dispatches params', async () => {
  const calls = [];
  const fakeSession = { rpc: { name: { set: async (p) => { calls.push(p); } } } };
  const api = new CopilotNameApi(() => fakeSession);
  await api.set({ name: 'new' });
  assert.deepEqual(calls, [{ name: 'new' }]);
});

test('name.set throws SessionNotStartedError if null', async () => {
  const api = new CopilotNameApi(() => null);
  await assert.rejects(() => api.set({ name: 'x' }), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'name.set');
});
