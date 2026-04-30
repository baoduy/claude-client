import test from 'node:test';
import assert from 'node:assert/strict';
import { CopilotTurnHandle } from '../../dist/esm/copilot/turn-handle.js';
import { TurnHandle as ClaudeTurnHandle } from '../../dist/esm/claude/turn-handle.js';

function copilotSeed() {
  return {
    id: 'copilot-t', status: 'pending', text: '', reasoning: undefined,
    toolUses: [], toolResults: [], usage: undefined, error: undefined,
    startedAt: 0, completedAt: undefined,
    copilotToolCalls: [], copilotUsageRaw: undefined,
  };
}

test('CopilotTurnHandle satisfies TurnHandleBase contract', () => {
  const h = new CopilotTurnHandle(copilotSeed());
  assert.equal(typeof h.current, 'function');
  assert.equal(typeof h.history, 'function');
  assert.equal(typeof h.updates, 'function');
  assert.ok(h.done instanceof Promise);
  assert.equal(typeof h.updates()[Symbol.asyncIterator], 'function');
});

test('ClaudeTurnHandle satisfies TurnHandleBase contract', () => {
  assert.equal(typeof ClaudeTurnHandle.prototype.current, 'function');
  assert.equal(typeof ClaudeTurnHandle.prototype.history, 'function');
  assert.equal(typeof ClaudeTurnHandle.prototype.updates, 'function');
});
