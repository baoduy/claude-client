import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotSkillsApi } from '../../../dist/esm/copilot/namespaces/skills.js';

test('skills.list calls session.rpc.skills.list', async () => {
  const fakeSession = { rpc: { skills: { list: async () => [{ name: 'a' }] } } };
  const api = new CopilotSkillsApi(() => fakeSession);
  const r = await api.list();
  assert.deepEqual(r, [{ name: 'a' }]);
});

test('skills.list throws SessionNotStartedError if session null', async () => {
  const api = new CopilotSkillsApi(() => null);
  await assert.rejects(() => api.list(), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'skills.list');
});

test('skills.list wraps "method not found" as CopilotExperimentalUnavailableError', async () => {
  const fakeSession = {
    rpc: { skills: { list: async () => { const e = new Error('Method not found'); e.code = -32601; throw e; } } },
  };
  const api = new CopilotSkillsApi(() => fakeSession);
  await assert.rejects(
    () => api.list(),
    (e) => e.name === 'CopilotExperimentalUnavailableError' && e.namespace === 'skills' && e.method === 'list',
  );
});

test('skills.enable dispatches with params', async () => {
  const calls = [];
  const fakeSession = { rpc: { skills: { enable: async (p) => { calls.push(p); } } } };
  const api = new CopilotSkillsApi(() => fakeSession);
  await api.enable({ name: 'foo' });
  assert.deepEqual(calls, [{ name: 'foo' }]);
});

test('skills.enable throws SessionNotStartedError if session null', async () => {
  const api = new CopilotSkillsApi(() => null);
  await assert.rejects(() => api.enable({ name: 'x' }), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'skills.enable');
});

test('skills.disable dispatches with params', async () => {
  const calls = [];
  const fakeSession = { rpc: { skills: { disable: async (p) => { calls.push(p); } } } };
  const api = new CopilotSkillsApi(() => fakeSession);
  await api.disable({ name: 'foo' });
  assert.deepEqual(calls, [{ name: 'foo' }]);
});

test('skills.disable throws SessionNotStartedError if session null', async () => {
  const api = new CopilotSkillsApi(() => null);
  await assert.rejects(() => api.disable({ name: 'x' }), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'skills.disable');
});

test('skills.reload dispatches with no args', async () => {
  let called = false;
  const fakeSession = { rpc: { skills: { reload: async () => { called = true; } } } };
  const api = new CopilotSkillsApi(() => fakeSession);
  await api.reload();
  assert.equal(called, true);
});

test('skills.reload throws SessionNotStartedError if session null', async () => {
  const api = new CopilotSkillsApi(() => null);
  await assert.rejects(() => api.reload(), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'skills.reload');
});
