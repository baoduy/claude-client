import test from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeClient } from '../dist/esm/claude/client.js';

test('ClaudeClient.getStatus returns UnifiedStatus (3-state)', () => {
  const client = new ClaudeClient({ cwd: '/tmp', sessionId: 'test' });
  const s = client.getStatus();
  assert.ok(['idle', 'running', 'error'].includes(s), `expected 3-state, got '${s}'`);
});

test('ClaudeClient.getStatus maps input_needed to running', () => {
  const client = new ClaudeClient({ cwd: '/tmp', sessionId: 'test' });
  Object.defineProperty(client, '_status', { value: 'input_needed', writable: true });
  assert.equal(client.getStatus(), 'running');
});

test('ClaudeClient.getDetailedStatus returns the 4-state status', () => {
  const client = new ClaudeClient({ cwd: '/tmp', sessionId: 'test' });

  Object.defineProperty(client, '_status', { value: 'input_needed', writable: true });
  assert.equal(client.getDetailedStatus(), 'input_needed');

  Object.defineProperty(client, '_status', { value: 'idle', writable: true });
  assert.equal(client.getDetailedStatus(), 'idle');
});
