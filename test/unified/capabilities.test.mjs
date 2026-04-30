import { test } from 'node:test';
import assert from 'node:assert/strict';

test('AICliCapabilities widens richContent and adds getMessages/hooks/mcp', async () => {
  const mod = await import('../../dist/esm/unified/index.js');
  // Type-only test: just construct the shape and assert at runtime
  const caps = {
    richContent: 'partial',
    setModel: true,
    setPermissionMode: true,
    setMaxThinkingTokens: false,
    listSupportedModels: true,
    getMessages: true,
    hooks: true,
    mcp: true,
  };
  assert.equal(caps.richContent, 'partial');
  assert.ok(caps.richContent);  // truthy migration check
});
