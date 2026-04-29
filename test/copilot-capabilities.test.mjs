import test from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../dist/esm/copilot/client.js';

test('CopilotClient.capabilities reports rich content support and Group E features unsupported', () => {
  const client = new CopilotClient({ cwd: '/tmp' });

  // Task A4 widened richContent to 'full' (text + attachments via translator).
  assert.equal(client.capabilities.richContent, 'full');
  // Task A5 flipped setModel to true (wraps session.setModel).
  assert.equal(client.capabilities.setModel, true);
  assert.equal(client.capabilities.setPermissionMode, false);
  assert.equal(client.capabilities.setMaxThinkingTokens, false);
  assert.equal(client.capabilities.listSupportedModels, false);
});

test('CopilotClient exposes setModel but not other Group E methods', () => {
  const client = new CopilotClient({ cwd: '/tmp' });

  // Task A5: setModel is now implemented.
  assert.equal(typeof client.setModel, 'function');
  assert.equal(client.setPermissionMode, undefined);
  assert.equal(client.setMaxThinkingTokens, undefined);
  assert.equal(client.listSupportedModels, undefined);
});
