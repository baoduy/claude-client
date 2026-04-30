import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotShellApi } from '../../../dist/esm/copilot/namespaces/shell.js';

test('shell.exec dispatches params and returns result', async () => {
  const calls = [];
  const fakeSession = { rpc: { shell: { exec: async (p) => { calls.push(p); return { exitCode: 0 }; } } } };
  const api = new CopilotShellApi(() => fakeSession);
  const r = await api.exec({ command: 'ls' });
  assert.deepEqual(calls, [{ command: 'ls' }]);
  assert.deepEqual(r, { exitCode: 0 });
});

test('shell.exec throws SessionNotStartedError if null', async () => {
  const api = new CopilotShellApi(() => null);
  await assert.rejects(() => api.exec({ command: 'x' }), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'shell.exec');
});

test('shell.exec wraps RPC errors as CopilotRpcError', async () => {
  const fakeSession = { rpc: { shell: { exec: async () => { throw new Error('boom'); } } } };
  const api = new CopilotShellApi(() => fakeSession);
  await assert.rejects(
    () => api.exec({ command: 'x' }),
    (e) => e.name === 'CopilotRpcError' && e.namespace === 'shell' && e.method === 'exec',
  );
});

test('shell.kill dispatches params', async () => {
  const calls = [];
  const fakeSession = { rpc: { shell: { kill: async (p) => { calls.push(p); return { killed: true }; } } } };
  const api = new CopilotShellApi(() => fakeSession);
  const r = await api.kill({ pid: 123 });
  assert.deepEqual(calls, [{ pid: 123 }]);
  assert.deepEqual(r, { killed: true });
});

test('shell.kill throws SessionNotStartedError if null', async () => {
  const api = new CopilotShellApi(() => null);
  await assert.rejects(() => api.kill({ pid: 1 }), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'shell.kill');
});
