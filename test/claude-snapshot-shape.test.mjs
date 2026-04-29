import test from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeClient } from '../dist/esm/claude/client.js';

test('ClaudeClient.getCurrentTurn returns null pre-turn (unified shape)', () => {
  const client = new ClaudeClient({ cwd: '/tmp', sessionId: 'test' });
  assert.equal(client.getCurrentTurn(), null);
});

test('ClaudeClient.getHistory returns [] pre-turn (unified shape)', () => {
  const client = new ClaudeClient({ cwd: '/tmp', sessionId: 'test' });
  assert.deepEqual(client.getHistory(), []);
});

test('ClaudeClient.getCurrentTurnDetailed and getHistoryDetailed expose rich Claude shape', () => {
  const client = new ClaudeClient({ cwd: '/tmp', sessionId: 'test' });
  assert.equal(client.getCurrentTurnDetailed(), null);
  assert.deepEqual(client.getHistoryDetailed(), []);
});
