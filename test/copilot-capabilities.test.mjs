import test from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../dist/esm/copilot/client.js';

test('CopilotClient.capabilities reports rich content support and Group E features unsupported', () => {
  const client = new CopilotClient({ cwd: '/tmp' });

  // Task A4 widened richContent to 'full' (text + attachments via translator).
  assert.equal(client.capabilities.richContent, 'full');
  // Task A5 flipped setModel to true (wraps session.setModel).
  assert.equal(client.capabilities.setModel, true);
  // Task B7 flipped setPermissionMode to true (mode.set + permissions.setApproveAll).
  assert.equal(client.capabilities.setPermissionMode, true);
  assert.equal(client.capabilities.setMaxThinkingTokens, false);
  // Task A6 flipped listSupportedModels to true (wraps client.listModels).
  assert.equal(client.capabilities.listSupportedModels, true);
});

test('CopilotClient exposes setModel and listSupportedModels but not other Group E methods', () => {
  const client = new CopilotClient({ cwd: '/tmp' });

  // Task A5: setModel is now implemented.
  assert.equal(typeof client.setModel, 'function');
  // Task B7: setPermissionMode is now implemented.
  assert.equal(typeof client.setPermissionMode, 'function');
  assert.equal(client.setMaxThinkingTokens, undefined);
  // Task A6: listSupportedModels is now implemented.
  assert.equal(typeof client.listSupportedModels, 'function');
});
