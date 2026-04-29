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

test('top-level barrel exports createPtyClient', async () => {
  const mod = await import('../dist/esm/index.js');
  assert.equal(typeof mod.createPtyClient, 'function');
  assert.equal(typeof mod.PtyDependencyMissingError, 'function');
});

test('top-level barrel exports UnsupportedContentError (unified)', async () => {
  const mod = await import('../dist/esm/index.js');
  assert.equal(typeof mod.UnsupportedContentError, 'function');
});

test('./unified subpath barrel re-exports UnsupportedContentError', async () => {
  const mod = await import('../dist/esm/unified/index.js');
  assert.equal(typeof mod.UnsupportedContentError, 'function');
});
