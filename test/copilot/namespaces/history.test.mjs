import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotHistoryApi } from '../../../dist/esm/copilot/namespaces/history.js';

test('history.compact calls session.rpc.history.compact', async () => {
  const fakeSession = { rpc: { history: { compact: async () => ({ summary: 'ok' }) } } };
  const api = new CopilotHistoryApi(() => fakeSession);
  assert.deepEqual(await api.compact(), { summary: 'ok' });
});

test('history.compact throws SessionNotStartedError if null', async () => {
  const api = new CopilotHistoryApi(() => null);
  await assert.rejects(() => api.compact(), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'history.compact');
});

test('history.compact wraps method-not-found as CopilotExperimentalUnavailableError', async () => {
  const fakeSession = {
    rpc: { history: { compact: async () => { const e = new Error('Method not found'); e.code = -32601; throw e; } } },
  };
  const api = new CopilotHistoryApi(() => fakeSession);
  await assert.rejects(() => api.compact(), (e) => e.name === 'CopilotExperimentalUnavailableError');
});

test('history.truncate dispatches params', async () => {
  const calls = [];
  const fakeSession = { rpc: { history: { truncate: async (p) => { calls.push(p); return { removed: 5 }; } } } };
  const api = new CopilotHistoryApi(() => fakeSession);
  const r = await api.truncate({ keepLast: 10 });
  assert.deepEqual(calls, [{ keepLast: 10 }]);
  assert.deepEqual(r, { removed: 5 });
});

test('history.truncate throws SessionNotStartedError if null', async () => {
  const api = new CopilotHistoryApi(() => null);
  await assert.rejects(() => api.truncate({ keepLast: 1 }), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'history.truncate');
});
