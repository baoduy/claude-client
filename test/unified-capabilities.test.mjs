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
  'getMessages',
];

test('Claude capabilities are all true', () => {
  const c = new ClaudeClient({ cwd: '/tmp', sessionId: 'test' });
  for (const f of FLAGS) {
    if (f === 'richContent') {
      assert.notEqual(c.capabilities[f], 'none', `Claude.capabilities.${f} should not be 'none'`);
    } else {
      assert.equal(c.capabilities[f], true, `Claude.capabilities.${f} should be true`);
    }
  }
});

test('Copilot capabilities reflect Task A4/A5/A6/A9 progress (richContent: "full", setModel + listSupportedModels + getMessages: true)', () => {
  const c = new CopilotClient({ cwd: '/tmp' });
  // Group E flags expected to be true after each gap-fill task.
  const trueFlags = new Set(['setModel', 'listSupportedModels', 'getMessages']); // A5 + A6 + A9
  for (const f of FLAGS) {
    if (f === 'richContent') {
      // Task A4 widened richContent to 'full' once attachments were wired in.
      assert.equal(c.capabilities[f], 'full', `Copilot.capabilities.${f} should be 'full'`);
    } else if (trueFlags.has(f)) {
      assert.equal(c.capabilities[f], true, `Copilot.capabilities.${f} should be true`);
    } else {
      assert.equal(c.capabilities[f], false, `Copilot.capabilities.${f} should be false`);
    }
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

test('Copilot exposes only the optional methods its capabilities advertise', () => {
  const c = new CopilotClient({ cwd: '/tmp' });
  // Methods Copilot now implements (track Group E gap-fill progress).
  const presentMethods = new Set(['setModel', 'listSupportedModels', 'getMessages']); // A5 + A6 + A9
  for (const f of FLAGS.filter(x => x !== 'richContent')) {
    if (presentMethods.has(f)) {
      assert.equal(typeof c[f], 'function', `Copilot.${f} should be a method`);
    } else {
      assert.equal(c[f], undefined, `Copilot.${f} should be undefined`);
    }
  }
});
