// test/pty/copilot-args.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCopilotArgs } from '../../dist/esm/pty/copilot-args.js';

test('buildCopilotArgs returns empty array for empty config', () => {
  assert.deepEqual(buildCopilotArgs({}), []);
});

test('buildCopilotArgs maps model to --model', () => {
  assert.deepEqual(buildCopilotArgs({ model: 'gpt-5.3' }), ['--model', 'gpt-5.3']);
});

test('buildCopilotArgs maps boolean flags', () => {
  assert.deepEqual(
    buildCopilotArgs({ allowAll: true, allowAllPaths: true, allowAllUrls: true, noAskUser: true }),
    ['--allow-all', '--allow-all-paths', '--allow-all-urls', '--no-ask-user'],
  );
});

test('buildCopilotArgs repeats --allow-tool for each entry', () => {
  assert.deepEqual(
    buildCopilotArgs({ allowTools: ['shell(git:*)', 'write(src/*)'] }),
    ['--allow-tool', 'shell(git:*)', '--allow-tool', 'write(src/*)'],
  );
});

test('buildCopilotArgs repeats --deny-tool for each entry', () => {
  assert.deepEqual(
    buildCopilotArgs({ denyTools: ['shell(git push)'] }),
    ['--deny-tool', 'shell(git push)'],
  );
});

test('buildCopilotArgs repeats --add-dir for each entry', () => {
  assert.deepEqual(
    buildCopilotArgs({ addDir: ['/a', '/b'] }),
    ['--add-dir', '/a', '--add-dir', '/b'],
  );
});

test('buildCopilotArgs appends extraArgs last', () => {
  assert.deepEqual(
    buildCopilotArgs({ model: 'm', extraArgs: ['--share'] }),
    ['--model', 'm', '--share'],
  );
});

test('buildCopilotArgs combines all categories in stable order', () => {
  assert.deepEqual(
    buildCopilotArgs({
      model: 'm',
      allowAll: true,
      allowTools: ['t1'],
      denyTools: ['t2'],
      addDir: ['/d'],
      extraArgs: ['--x'],
    }),
    ['--model', 'm', '--allow-all', '--allow-tool', 't1', '--deny-tool', 't2', '--add-dir', '/d', '--x'],
  );
});
