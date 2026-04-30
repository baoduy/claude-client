import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotAgentApi } from '../../../dist/esm/copilot/namespaces/agent.js';

test('agent.list calls session.rpc.agent.list', async () => {
  const fakeSession = { rpc: { agent: { list: async () => [{ id: 'a' }] } } };
  const api = new CopilotAgentApi(() => fakeSession);
  assert.deepEqual(await api.list(), [{ id: 'a' }]);
});

test('agent.list throws SessionNotStartedError if session null', async () => {
  const api = new CopilotAgentApi(() => null);
  await assert.rejects(() => api.list(), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'agent.list');
});

test('agent.list wraps method-not-found as CopilotExperimentalUnavailableError', async () => {
  const fakeSession = {
    rpc: { agent: { list: async () => { const e = new Error('Method not found'); e.code = -32601; throw e; } } },
  };
  const api = new CopilotAgentApi(() => fakeSession);
  await assert.rejects(() => api.list(), (e) => e.name === 'CopilotExperimentalUnavailableError');
});

test('agent.getCurrent calls session.rpc.agent.getCurrent', async () => {
  const fakeSession = { rpc: { agent: { getCurrent: async () => ({ id: 'a' }) } } };
  const api = new CopilotAgentApi(() => fakeSession);
  assert.deepEqual(await api.getCurrent(), { id: 'a' });
});

test('agent.getCurrent throws SessionNotStartedError if null', async () => {
  const api = new CopilotAgentApi(() => null);
  await assert.rejects(() => api.getCurrent(), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'agent.getCurrent');
});

test('agent.select dispatches params and returns result', async () => {
  const calls = [];
  const fakeSession = { rpc: { agent: { select: async (p) => { calls.push(p); return { ok: true }; } } } };
  const api = new CopilotAgentApi(() => fakeSession);
  const r = await api.select({ id: 'foo' });
  assert.deepEqual(calls, [{ id: 'foo' }]);
  assert.deepEqual(r, { ok: true });
});

test('agent.select throws SessionNotStartedError if null', async () => {
  const api = new CopilotAgentApi(() => null);
  await assert.rejects(() => api.select({ id: 'x' }), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'agent.select');
});

test('agent.deselect dispatches with no args', async () => {
  let called = false;
  const fakeSession = { rpc: { agent: { deselect: async () => { called = true; } } } };
  const api = new CopilotAgentApi(() => fakeSession);
  await api.deselect();
  assert.equal(called, true);
});

test('agent.deselect throws SessionNotStartedError if null', async () => {
  const api = new CopilotAgentApi(() => null);
  await assert.rejects(() => api.deselect(), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'agent.deselect');
});

test('agent.reload calls session.rpc.agent.reload', async () => {
  const fakeSession = { rpc: { agent: { reload: async () => ({ count: 3 }) } } };
  const api = new CopilotAgentApi(() => fakeSession);
  assert.deepEqual(await api.reload(), { count: 3 });
});

test('agent.reload throws SessionNotStartedError if null', async () => {
  const api = new CopilotAgentApi(() => null);
  await assert.rejects(() => api.reload(), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'agent.reload');
});
