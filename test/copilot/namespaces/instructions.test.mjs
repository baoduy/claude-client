import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotInstructionsApi } from '../../../dist/esm/copilot/namespaces/instructions.js';

test('instructions.getSources calls session.rpc.instructions.getSources', async () => {
  const fakeSession = { rpc: { instructions: { getSources: async () => ({ sources: ['CLAUDE.md'] }) } } };
  const api = new CopilotInstructionsApi(() => fakeSession);
  assert.deepEqual(await api.getSources(), { sources: ['CLAUDE.md'] });
});

test('instructions.getSources throws SessionNotStartedError if null', async () => {
  const api = new CopilotInstructionsApi(() => null);
  await assert.rejects(
    () => api.getSources(),
    (e) => e.name === 'SessionNotStartedError' && e.callsite === 'instructions.getSources',
  );
});

test('instructions.getSources wraps RPC errors as CopilotRpcError', async () => {
  const fakeSession = { rpc: { instructions: { getSources: async () => { throw new Error('boom'); } } } };
  const api = new CopilotInstructionsApi(() => fakeSession);
  await assert.rejects(
    () => api.getSources(),
    (e) => e.name === 'CopilotRpcError' && e.namespace === 'instructions' && e.method === 'getSources',
  );
});
