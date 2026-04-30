import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateLegacyPermissionMode } from '../../dist/esm/unified/index.js';

test('translateLegacyPermissionMode maps the legacy values', () => {
  assert.equal(translateLegacyPermissionMode('default'), 'prompt');
  assert.equal(translateLegacyPermissionMode('acceptEdits'), 'auto-edit');
  assert.equal(translateLegacyPermissionMode('auto'), 'auto-all');
  assert.equal(translateLegacyPermissionMode('bypassPermissions'), 'auto-all');
  assert.equal(translateLegacyPermissionMode('dontAsk'), 'auto-all');
  assert.equal(translateLegacyPermissionMode('plan'), 'plan');
});

test('translateLegacyPermissionMode passes through new vocab unchanged', () => {
  assert.equal(translateLegacyPermissionMode('prompt'), 'prompt');
  assert.equal(translateLegacyPermissionMode('auto-edit'), 'auto-edit');
  assert.equal(translateLegacyPermissionMode('auto-all'), 'auto-all');
  assert.equal(translateLegacyPermissionMode('plan'), 'plan');
  assert.equal(translateLegacyPermissionMode('autopilot'), 'autopilot');
});
