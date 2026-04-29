import test from 'node:test';
import assert from 'node:assert/strict';
import { CopilotTurnHandle } from '../../dist/esm/copilot/turn-handle.js';

function seedSnapshot(id = 'copilot-t1') {
  return {
    id, status: 'pending', text: '', reasoning: undefined,
    toolUses: [], toolResults: [], usage: undefined, error: undefined,
    startedAt: Date.now(), completedAt: undefined,
    copilotToolCalls: [], copilotUsageRaw: undefined,
  };
}

test('CopilotTurnHandle delivers buffered updates to a late subscriber', async () => {
  const handle = new CopilotTurnHandle(seedSnapshot());
  handle.push({ kind: 'output', delta: 'hello ', snapshot: handle.current() });
  handle.push({ kind: 'output', delta: 'world',  snapshot: handle.current() });
  handle.complete({ ...handle.current(), status: 'completed', completedAt: Date.now() });

  const collected = [];
  for await (const u of handle.updates()) collected.push(u);
  const finalSnapshot = await handle.done;

  assert.equal(collected.length, 3);
  assert.equal(collected[0].kind, 'output');
  assert.equal(collected[2].kind, 'result');
  assert.equal(finalSnapshot.status, 'completed');
});

test('CopilotTurnHandle history() returns previously emitted updates', async () => {
  const handle = new CopilotTurnHandle(seedSnapshot());
  handle.push({ kind: 'output', delta: 'x', snapshot: handle.current() });
  assert.equal(handle.history().length, 1);
  assert.equal(handle.history()[0].kind, 'output');
});

test('CopilotTurnHandle done rejects when fail() is called', async () => {
  const handle = new CopilotTurnHandle(seedSnapshot());
  const failure = new Error('boom');
  handle.fail(failure);
  await assert.rejects(handle.done, /boom/);
});
