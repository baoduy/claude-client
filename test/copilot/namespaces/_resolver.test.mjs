import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeSessionResolver,
  callRpc,
} from '../../../dist/esm/copilot/namespaces/_resolver.js';

test('makeSessionResolver throws SessionNotStartedError if getter returns null', () => {
  const resolve = makeSessionResolver(() => null, 'plan.read');
  assert.throws(() => resolve(), (e) => e.name === 'SessionNotStartedError' && e.callsite === 'plan.read');
});

test('makeSessionResolver returns the session when getter returns one', () => {
  const fakeSession = { id: 's1' };
  const resolve = makeSessionResolver(() => fakeSession, 'plan.read');
  assert.equal(resolve(), fakeSession);
});

test('callRpc returns value on success', async () => {
  const result = await callRpc('plan', 'read', false, async () => ({ ok: 1 }));
  assert.deepEqual(result, { ok: 1 });
});

test('callRpc wraps thrown errors as CopilotRpcError', async () => {
  await assert.rejects(
    () => callRpc('plan', 'read', false, () => { throw new Error('boom'); }),
    (e) => e.name === 'CopilotRpcError' && e.namespace === 'plan' && e.method === 'read',
  );
});

test('callRpc with experimental=true wraps method-not-found as ExperimentalUnavailable', async () => {
  const err = new Error('Method not found');
  err.code = -32601;
  await assert.rejects(
    () => callRpc('mcp', 'list', true, async () => { throw err; }),
    (e) => e.name === 'CopilotExperimentalUnavailableError',
  );
});

test('callRpc with experimental=true wraps "method not found" message variant', async () => {
  await assert.rejects(
    () => callRpc('skills', 'reload', true, async () => { throw new Error('rpc method not found: skills.reload'); }),
    (e) => e.name === 'CopilotExperimentalUnavailableError',
  );
});

test('callRpc with experimental=false does NOT wrap as ExperimentalUnavailable', async () => {
  const err = new Error('Method not found');
  err.code = -32601;
  await assert.rejects(
    () => callRpc('plan', 'read', false, async () => { throw err; }),
    (e) => e.name === 'CopilotRpcError',  // not the experimental variant
  );
});

test('callRpc passes through synchronous return values too', async () => {
  const result = await callRpc('plan', 'read', false, () => 'sync');
  assert.equal(result, 'sync');
});
