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

test('ClaudeClient.getClaudeStatus returns the 4-state status', () => {
  const client = new ClaudeClient({ cwd: '/tmp', sessionId: 'test' });

  Object.defineProperty(client, '_status', { value: 'input_needed', writable: true });
  assert.equal(client.getClaudeStatus(), 'input_needed');

  Object.defineProperty(client, '_status', { value: 'idle', writable: true });
  assert.equal(client.getClaudeStatus(), 'idle');
});

test('ClaudeClient.getDetailedStatus returns unified DetailedStatus shape', () => {
  const client = new ClaudeClient({ cwd: '/tmp', sessionId: 'test' });

  Object.defineProperty(client, '_status', { value: 'input_needed', writable: true });
  const ds = client.getDetailedStatus();
  assert.equal(ds.status, 'running'); // input_needed collapses to running
  assert.equal(ds.phase, 'input_needed');
  assert.equal(typeof ds.pendingRequestCount, 'number');
  assert.equal(ds.raw.provider, 'claude');
});
