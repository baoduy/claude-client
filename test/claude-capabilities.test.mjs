import test from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeClient } from '../dist/esm/claude/client.js';

test('ClaudeClient.capabilities reports all features supported', () => {
  const client = new ClaudeClient({ cwd: '/tmp', sessionId: 'test' });

  assert.equal(client.capabilities.richContent, 'partial');
  assert.equal(client.capabilities.setModel, true);
  assert.equal(client.capabilities.setPermissionMode, true);
  assert.equal(client.capabilities.setMaxThinkingTokens, true);
  assert.equal(client.capabilities.listSupportedModels, true);
  assert.equal(client.capabilities.getMessages, true);
});
