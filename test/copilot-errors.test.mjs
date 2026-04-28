import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CopilotError,
  CopilotAuthError,
  CopilotLaunchError,
  CopilotFeatureUnsupportedError,
  CopilotTurnError,
  CopilotInterruptedError,
  CopilotPermissionDeniedError,
} from '../dist/esm/copilot/errors.js';

test('every Copilot error subclass extends CopilotError and Error, with correct .name', () => {
  const cases = [
    [CopilotAuthError, 'CopilotAuthError'],
    [CopilotLaunchError, 'CopilotLaunchError'],
    [CopilotFeatureUnsupportedError, 'CopilotFeatureUnsupportedError'],
    [CopilotTurnError, 'CopilotTurnError'],
    [CopilotInterruptedError, 'CopilotInterruptedError'],
    [CopilotPermissionDeniedError, 'CopilotPermissionDeniedError'],
  ];
  for (const [Cls, name] of cases) {
    const err = new Cls('msg');
    assert.equal(err.name, name);
    assert.equal(err.message, 'msg');
    assert.ok(err instanceof CopilotError, `${name} must extend CopilotError`);
    assert.ok(err instanceof Error, `${name} must extend Error`);
  }
});

test('CopilotFeatureUnsupportedError exposes the unsupported field name', () => {
  const err = new CopilotFeatureUnsupportedError('mode', 'Copilot SDK 0.4.x does not yet support --mode passthrough');
  assert.equal(err.feature, 'mode');
  assert.match(err.message, /mode/);
});
