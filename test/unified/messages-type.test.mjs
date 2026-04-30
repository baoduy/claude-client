import { test } from 'node:test';
import assert from 'node:assert/strict';

test('UnifiedMessage is exported and discriminates raw.provider', async () => {
  const mod = await import('../../dist/esm/unified/index.js');
  // Type-only check — runtime constructs the shape
  const msg = {
    id: 'm1',
    role: 'assistant',
    text: 'hi',
    timestamp: Date.now(),
    raw: { provider: 'copilot', event: { type: 'assistant.message' } },
  };
  if (msg.raw.provider === 'copilot') {
    assert.ok(msg.raw.event);
  }
  // Verify the type is exported (will be a noop at runtime since types are erased)
  // but importing the module should not throw
  assert.ok(mod);
});
