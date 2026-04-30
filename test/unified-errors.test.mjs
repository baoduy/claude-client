import test from 'node:test';
import assert from 'node:assert/strict';
import { UnsupportedContentError } from '../dist/esm/unified/errors.js';

test('UnsupportedContentError carries provider, block, and inputIndex', () => {
  const block = { type: 'image', source: { type: 'url', url: 'https://x' } };
  const err = new UnsupportedContentError('copilot', block, 2);

  assert.equal(err.name, 'UnsupportedContentError');
  assert.equal(err.provider, 'copilot');
  assert.deepEqual(err.unsupportedBlock, block);
  assert.equal(err.inputIndex, 2);
  assert.match(err.message, /Provider 'copilot'/);
  assert.match(err.message, /'image'/);
  assert.match(err.message, /index 2/);
  assert.ok(err instanceof Error);
});
