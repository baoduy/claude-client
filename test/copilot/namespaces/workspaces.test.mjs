import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotWorkspacesApi } from '../../../dist/esm/copilot/namespaces/workspaces.js';

test('workspaces.getWorkspace calls session.rpc.workspaces.getWorkspace', async () => {
  const fakeSession = { rpc: { workspaces: { getWorkspace: async () => ({ path: '/w' }) } } };
  const api = new CopilotWorkspacesApi(() => fakeSession);
  assert.deepEqual(await api.getWorkspace(), { path: '/w' });
});

test('workspaces.getWorkspace throws SessionNotStartedError if null', async () => {
  const api = new CopilotWorkspacesApi(() => null);
  await assert.rejects(() => api.getWorkspace(), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'workspaces.getWorkspace');
});

test('workspaces.getWorkspace wraps RPC errors as CopilotRpcError', async () => {
  const fakeSession = { rpc: { workspaces: { getWorkspace: async () => { throw new Error('boom'); } } } };
  const api = new CopilotWorkspacesApi(() => fakeSession);
  await assert.rejects(
    () => api.getWorkspace(),
    (e) => e.name === 'CopilotRpcError' && e.namespace === 'workspaces' && e.method === 'getWorkspace',
  );
});

test('workspaces.listFiles calls session.rpc.workspaces.listFiles', async () => {
  const fakeSession = { rpc: { workspaces: { listFiles: async () => ({ files: ['a.ts'] }) } } };
  const api = new CopilotWorkspacesApi(() => fakeSession);
  assert.deepEqual(await api.listFiles(), { files: ['a.ts'] });
});

test('workspaces.listFiles throws SessionNotStartedError if null', async () => {
  const api = new CopilotWorkspacesApi(() => null);
  await assert.rejects(() => api.listFiles(), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'workspaces.listFiles');
});

test('workspaces.readFile dispatches params', async () => {
  const calls = [];
  const fakeSession = { rpc: { workspaces: { readFile: async (p) => { calls.push(p); return { content: 'hi' }; } } } };
  const api = new CopilotWorkspacesApi(() => fakeSession);
  const r = await api.readFile({ path: 'a.ts' });
  assert.deepEqual(calls, [{ path: 'a.ts' }]);
  assert.deepEqual(r, { content: 'hi' });
});

test('workspaces.readFile throws SessionNotStartedError if null', async () => {
  const api = new CopilotWorkspacesApi(() => null);
  await assert.rejects(() => api.readFile({ path: 'x' }), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'workspaces.readFile');
});

test('workspaces.createFile dispatches params', async () => {
  const calls = [];
  const fakeSession = { rpc: { workspaces: { createFile: async (p) => { calls.push(p); } } } };
  const api = new CopilotWorkspacesApi(() => fakeSession);
  await api.createFile({ path: 'a.ts', content: 'x' });
  assert.deepEqual(calls, [{ path: 'a.ts', content: 'x' }]);
});

test('workspaces.createFile throws SessionNotStartedError if null', async () => {
  const api = new CopilotWorkspacesApi(() => null);
  await assert.rejects(() => api.createFile({ path: 'x', content: 'y' }), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'workspaces.createFile');
});
