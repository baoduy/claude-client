import { test } from 'node:test';
import assert from 'node:assert/strict';

test('subpath ./copilot/namespaces resolves and re-exports all 10 wrapper classes', async () => {
  // Use a relative path equivalent — direct package self-resolution requires
  // the package to be installed/linked, which CI may not do. The barrel build
  // output is the canonical artifact.
  const mod = await import('../../../dist/esm/copilot/namespaces/index.js');
  for (const k of [
    'CopilotPlanApi',
    'CopilotSkillsApi',
    'CopilotAgentApi',
    'CopilotHistoryApi',
    'CopilotUsageApi',
    'CopilotShellApi',
    'CopilotWorkspacesApi',
    'CopilotNameApi',
    'CopilotInstructionsApi',
    'CopilotMcpApi',
  ]) {
    assert.equal(typeof mod[k], 'function', `missing export: ${k}`);
  }
});

test('package.json declares ./copilot/namespaces subpath export', async () => {
  const fs = await import('node:fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.ok(pkg.exports['./copilot/namespaces'], 'missing exports["./copilot/namespaces"]');
  const entry = pkg.exports['./copilot/namespaces'];
  assert.equal(entry.types, './dist/types/copilot/namespaces/index.d.ts');
  assert.equal(entry.import, './dist/esm/copilot/namespaces/index.js');
  assert.equal(entry.require, './dist/cjs/copilot/namespaces/index.js');
});
