import test from 'node:test';
import assert from 'node:assert/strict';

test('top-level barrel exports createAICliClient', async () => {
  const mod = await import('../dist/esm/index.js');
  assert.equal(typeof mod.createAICliClient, 'function');
});

test('top-level barrel still exports ClaudeClient and CopilotClient', async () => {
  const mod = await import('../dist/esm/index.js');
  assert.equal(typeof mod.ClaudeClient, 'function');
  assert.equal(typeof mod.CopilotClient, 'function');
});
