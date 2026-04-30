import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotUsageApi } from '../../../dist/esm/copilot/namespaces/usage.js';

test('usage.getMetrics calls session.rpc.usage.getMetrics', async () => {
  const fakeSession = { rpc: { usage: { getMetrics: async () => ({ tokens: 100 }) } } };
  const api = new CopilotUsageApi(() => fakeSession);
  assert.deepEqual(await api.getMetrics(), { tokens: 100 });
});

test('usage.getMetrics throws SessionNotStartedError if null', async () => {
  const api = new CopilotUsageApi(() => null);
  await assert.rejects(() => api.getMetrics(), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'usage.getMetrics');
});

test('usage.getMetrics wraps method-not-found as CopilotExperimentalUnavailableError', async () => {
  const fakeSession = {
    rpc: { usage: { getMetrics: async () => { const e = new Error('Method not found'); e.code = -32601; throw e; } } },
  };
  const api = new CopilotUsageApi(() => fakeSession);
  await assert.rejects(() => api.getMetrics(), (e) => e.name === 'CopilotExperimentalUnavailableError');
});
