import test from 'node:test';
import assert from 'node:assert/strict';
import { CopilotTurnHandle } from '../../dist/esm/copilot/turn-handle.js';

function seedSnapshot(turnId = 't1') {
  return {
    turnId, status: 'running', text: '', reasoningText: '',
    toolCalls: [], usage: null,
    startedAt: Date.now(), endedAt: null, error: null,
  };
}

test('CopilotTurnHandle delivers buffered updates to a late subscriber', async () => {
  const handle = new CopilotTurnHandle(seedSnapshot());
  handle.push({ kind: 'output', delta: 'hello ', snapshot: handle.current() });
  handle.push({ kind: 'output', delta: 'world',  snapshot: handle.current() });
  handle.complete({ ...handle.current(), status: 'completed', endedAt: Date.now() });

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
