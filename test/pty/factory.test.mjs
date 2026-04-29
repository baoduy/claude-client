// test/pty/factory.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createPtyClient } from '../../dist/esm/pty/factory.js';
import { PtyDependencyMissingError, PtyBinaryNotFoundError } from '../../dist/esm/pty/errors.js';

function makeMockPtyModule({ onSpawn } = {}) {
  return {
    spawn: (bin, args, opts) => {
      onSpawn?.({ bin, args, opts });
      const emitter = new EventEmitter();
      return {
        pid: 1, cols: opts.cols, rows: opts.rows,
        write: () => {}, resize: () => {}, kill: () => {},
        onData: (cb) => emitter.on('data', cb),
        onExit: (cb) => emitter.on('exit', cb),
        _emitter: emitter,
      };
    },
  };
}

test('createPtyClient dispatches to claude with mapped args', async () => {
  let captured = null;
  const pty = makeMockPtyModule({ onSpawn: (info) => { captured = info; } });
  const client = await createPtyClient(
    { provider: 'claude', cwd: '/work', model: 'm', cols: 100, rows: 30 },
    { loadPty: async () => pty, exists: async () => true },
  );
  assert.equal(client.provider, 'claude');
  assert.equal(captured.bin, 'claude');
  assert.deepEqual(captured.args, ['--model', 'm']);
  assert.equal(captured.opts.cwd, '/work');
  assert.equal(captured.opts.cols, 100);
  assert.equal(captured.opts.rows, 30);
});

test('createPtyClient dispatches to copilot with mapped args', async () => {
  let captured = null;
  const pty = makeMockPtyModule({ onSpawn: (info) => { captured = info; } });
  const client = await createPtyClient(
    { provider: 'copilot', cwd: '/work', model: 'gpt-5.3', allowAll: true },
    { loadPty: async () => pty, exists: async () => true },
  );
  assert.equal(client.provider, 'copilot');
  assert.equal(captured.bin, 'copilot');
  assert.deepEqual(captured.args, ['--model', 'gpt-5.3', '--allow-all']);
});

test('createPtyClient defaults to cwd=process.cwd, cols=80, rows=24', async () => {
  let captured = null;
  const pty = makeMockPtyModule({ onSpawn: (info) => { captured = info; } });
  await createPtyClient(
    { provider: 'claude' },
    { loadPty: async () => pty, exists: async () => true },
  );
  assert.equal(captured.opts.cwd, process.cwd());
  assert.equal(captured.opts.cols, 80);
  assert.equal(captured.opts.rows, 24);
});

test('createPtyClient merges env on top of process.env', async () => {
  let captured = null;
  const pty = makeMockPtyModule({ onSpawn: (info) => { captured = info; } });
  await createPtyClient(
    { provider: 'claude', env: { MY_VAR: 'x' } },
    { loadPty: async () => pty, exists: async () => true },
  );
  assert.equal(captured.opts.env.MY_VAR, 'x');
  assert.equal(captured.opts.env.PATH, process.env.PATH, 'process.env carried through');
});

test('createPtyClient honors bin override', async () => {
  let captured = null;
  const pty = makeMockPtyModule({ onSpawn: (info) => { captured = info; } });
  await createPtyClient(
    { provider: 'claude', bin: '/usr/local/bin/claude' },
    { loadPty: async () => pty, exists: async () => true },
  );
  assert.equal(captured.bin, '/usr/local/bin/claude');
});

test('createPtyClient throws PtyDependencyMissingError when loadPty rejects', async () => {
  await assert.rejects(
    createPtyClient(
      { provider: 'claude' },
      { loadPty: async () => { throw new Error('Cannot find module \'node-pty\''); }, exists: async () => true },
    ),
    (err) => err instanceof PtyDependencyMissingError && /node-pty/.test(err.message),
  );
});

test('createPtyClient throws PtyBinaryNotFoundError when binary missing', async () => {
  const pty = makeMockPtyModule();
  await assert.rejects(
    createPtyClient(
      { provider: 'claude', bin: '/no/such/claude' },
      { loadPty: async () => pty, exists: async () => false },
    ),
    (err) => err instanceof PtyBinaryNotFoundError && err.bin === '/no/such/claude',
  );
});

test('createPtyClient throws on unknown provider', async () => {
  const pty = makeMockPtyModule();
  await assert.rejects(
    createPtyClient(
      { provider: 'not-a-provider', cwd: '/tmp' },
      { loadPty: async () => pty, exists: async () => true },
    ),
    /Unknown PTY provider: not-a-provider/,
  );
});
