// test/pty/claude-args.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClaudeArgs } from '../../dist/esm/pty/claude-args.js';

test('buildClaudeArgs returns empty array for empty config', () => {
  assert.deepEqual(buildClaudeArgs({}), []);
});

test('buildClaudeArgs maps model to --model', () => {
  assert.deepEqual(
    buildClaudeArgs({ model: 'claude-sonnet-4.5' }),
    ['--model', 'claude-sonnet-4.5'],
  );
});

test('buildClaudeArgs maps permissionMode to --permission-mode', () => {
  assert.deepEqual(
    buildClaudeArgs({ permissionMode: 'auto' }),
    ['--permission-mode', 'auto'],
  );
});

test('buildClaudeArgs maps both model and permissionMode in stable order', () => {
  assert.deepEqual(
    buildClaudeArgs({ model: 'm', permissionMode: 'plan' }),
    ['--model', 'm', '--permission-mode', 'plan'],
  );
});

test('buildClaudeArgs appends extraArgs last', () => {
  assert.deepEqual(
    buildClaudeArgs({ model: 'm', extraArgs: ['--resume', 'abc'] }),
    ['--model', 'm', '--resume', 'abc'],
  );
});
