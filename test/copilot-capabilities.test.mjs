import test from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../dist/esm/copilot/client.js';

test('CopilotClient.capabilities reports all features unsupported', () => {
  const client = new CopilotClient({ cwd: '/tmp' });

  assert.equal(client.capabilities.richContent, false);
  assert.equal(client.capabilities.setModel, false);
  assert.equal(client.capabilities.setPermissionMode, false);
  assert.equal(client.capabilities.setMaxThinkingTokens, false);
  assert.equal(client.capabilities.listSupportedModels, false);
});

test('CopilotClient does NOT expose Group E methods', () => {
  const client = new CopilotClient({ cwd: '/tmp' });

  assert.equal(client.setModel, undefined);
  assert.equal(client.setPermissionMode, undefined);
  assert.equal(client.setMaxThinkingTokens, undefined);
  assert.equal(client.listSupportedModels, undefined);
});
