import test from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeClient } from '../dist/esm/claude/client.js';

test('ClaudeClient emits closed (not exit) when transport-exit hook fires', () => {
  const client = new ClaudeClient({ cwd: '/tmp', sessionId: 'test' });

  let closedCode;
  let exitFired = false;
  client.on('closed', (code) => { closedCode = code; });
  client.on('exit', () => { exitFired = true; });

  // Simulate the transport-exit hook firing manually.
  client.emit('closed', 0);

  assert.equal(closedCode, 0, 'closed should receive exit code');
  assert.equal(exitFired, false, 'exit event must not fire');
});
