import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotPlanApi } from '../../../dist/esm/copilot/namespaces/plan.js';

test('plan.read calls session.rpc.plan.read', async () => {
  let called = false;
  const fakeSession = { rpc: { plan: { read: async () => { called = true; return { content: 'plan content' }; } } } };
  const api = new CopilotPlanApi(() => fakeSession);
  const r = await api.read();
  assert.equal(called, true);
  assert.deepEqual(r, { content: 'plan content' });
});

test('plan.read throws SessionNotStartedError if session getter returns null', async () => {
  const api = new CopilotPlanApi(() => null);
  await assert.rejects(() => api.read(), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'plan.read');
});

test('plan.read wraps RPC errors as CopilotRpcError', async () => {
  const fakeSession = { rpc: { plan: { read: async () => { throw new Error('boom'); } } } };
  const api = new CopilotPlanApi(() => fakeSession);
  await assert.rejects(
    () => api.read(),
    (e) => e.name === 'CopilotRpcError' && e.namespace === 'plan' && e.method === 'read',
  );
});

test('plan.update dispatches with params', async () => {
  const calls = [];
  const fakeSession = {
    rpc: { plan: { update: async (p) => { calls.push(p); } } },
  };
  const api = new CopilotPlanApi(() => fakeSession);
  await api.update({ content: 'new plan' });
  assert.deepEqual(calls, [{ content: 'new plan' }]);
});

test('plan.delete dispatches with no args', async () => {
  let called = false;
  const fakeSession = {
    rpc: { plan: { delete: async () => { called = true; } } },
  };
  const api = new CopilotPlanApi(() => fakeSession);
  await api.delete();
  assert.equal(called, true);
});

test('plan.update throws SessionNotStartedError if session null', async () => {
  const api = new CopilotPlanApi(() => null);
  await assert.rejects(() => api.update({ content: 'x' }), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'plan.update');
});

test('plan.delete throws SessionNotStartedError if session null', async () => {
  const api = new CopilotPlanApi(() => null);
  await assert.rejects(() => api.delete(), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'plan.delete');
});
