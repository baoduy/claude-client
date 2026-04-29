import test from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/client.js';

test('CopilotClient class declares provider = "copilot" as a class field', () => {
  const src = CopilotClient.toString();
  assert.match(src, /provider\s*=\s*['"]copilot['"]/, 'class body declares provider field');
});
