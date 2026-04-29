import test from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeClient } from '../../dist/esm/claude/client.js';

test('ClaudeClient class declares provider = "claude" as a class field', () => {
  // Read the class definition's field by parsing the class source. This is
  // brittle but avoids spawning a CLI. In practice we rely on the
  // `implements AICliClient` typecheck (in src/ai-cli-client.ts) plus the
  // factory tests in test/factory.test.mjs to cover behavioral assertions.
  const src = ClaudeClient.toString();
  assert.match(src, /provider\s*=\s*['"]claude['"]/, 'class body declares provider field');
});
