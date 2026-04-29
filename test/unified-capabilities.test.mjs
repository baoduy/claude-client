import test from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeClient } from '../dist/esm/claude/client.js';
import { CopilotClient } from '../dist/esm/copilot/client.js';

const FLAGS = [
  'richContent',
  'setModel',
  'setPermissionMode',
  'setMaxThinkingTokens',
  'listSupportedModels',
];

test('Claude capabilities are all true', () => {
  const c = new ClaudeClient({ cwd: '/tmp', sessionId: 'test' });
  for (const f of FLAGS) {
    assert.equal(c.capabilities[f], true, `Claude.capabilities.${f} should be true`);
  }
});

test('Copilot capabilities are all false', () => {
  const c = new CopilotClient({ cwd: '/tmp' });
  for (const f of FLAGS) {
    assert.equal(c.capabilities[f], false, `Copilot.capabilities.${f} should be false`);
  }
});

test('capabilities object exists and has every documented flag', () => {
  const claude = new ClaudeClient({ cwd: '/tmp', sessionId: 'test' });
  const copilot = new CopilotClient({ cwd: '/tmp' });

  for (const f of FLAGS) {
    assert.ok(f in claude.capabilities, `Claude.capabilities missing flag ${f}`);
    assert.ok(f in copilot.capabilities, `Copilot.capabilities missing flag ${f}`);
  }
});

test('Claude provides the methods its capabilities advertise', () => {
  const c = new ClaudeClient({ cwd: '/tmp', sessionId: 'test' });
  for (const f of FLAGS.filter(x => x !== 'richContent')) {
    assert.equal(typeof c[f], 'function', `Claude.${f} should be a method`);
  }
});

test('Copilot omits the methods its capabilities decline', () => {
  const c = new CopilotClient({ cwd: '/tmp' });
  for (const f of FLAGS.filter(x => x !== 'richContent')) {
    assert.equal(c[f], undefined, `Copilot.${f} should be undefined`);
  }
});
