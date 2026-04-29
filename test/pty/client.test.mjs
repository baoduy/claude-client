// test/pty/client.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PtyClientImpl } from '../../dist/esm/pty/client.js';

/** Mock IPty: emits 'data' and 'exit' via internal EventEmitter; records writes. */
function makeMockPty({ pid = 1234 } = {}) {
  const emitter = new EventEmitter();
  const writes = [];
  const resizes = [];
  const kills = [];
  const ipty = {
    pid,
    cols: 80,
    rows: 24,
    write: (data) => { writes.push(data); },
    resize: (cols, rows) => { resizes.push([cols, rows]); ipty.cols = cols; ipty.rows = rows; },
    kill: (sig) => { kills.push(sig); },
    onData:    (cb) => emitter.on('data', cb),
    onExit:    (cb) => emitter.on('exit', cb),
  };
  return { ipty, emitter, writes, resizes, kills };
}

/** Mock pty module: spawn returns the configured IPty mock. */
function makeMockPtyModule(ipty) {
  return {
    spawn: (_bin, _args, _opts) => ipty,
  };
}

test('PtyClientImpl exposes provider, pid, cols, rows after start', async () => {
  const { ipty } = makeMockPty({ pid: 9999 });
  const pty = makeMockPtyModule(ipty);
  const client = new PtyClientImpl({
    provider: 'claude', pty, bin: 'claude', args: [],
    cwd: '/tmp', cols: 100, rows: 30, env: {},
  });
  await client.start();
  assert.equal(client.provider, 'claude');
  assert.equal(client.pid, 9999);
  assert.equal(client.cols, 100);
  assert.equal(client.rows, 30);
});

test('PtyClientImpl re-emits data as Buffer', async () => {
  const { ipty, emitter } = makeMockPty();
  const client = new PtyClientImpl({
    provider: 'claude', pty: makeMockPtyModule(ipty), bin: 'claude', args: [],
    cwd: '/tmp', cols: 80, rows: 24, env: {},
  });
  await client.start();
  const seen = [];
  client.on('data', b => seen.push(b));
  emitter.emit('data', 'hello');
  assert.equal(seen.length, 1);
  assert.ok(Buffer.isBuffer(seen[0]), 'data is Buffer');
  assert.equal(seen[0].toString('utf8'), 'hello');
});

test('PtyClientImpl write forwards to inner pty', async () => {
  const { ipty, writes } = makeMockPty();
  const client = new PtyClientImpl({
    provider: 'claude', pty: makeMockPtyModule(ipty), bin: 'claude', args: [],
    cwd: '/tmp', cols: 80, rows: 24, env: {},
  });
  await client.start();
  client.write('abc');
  client.write(Buffer.from('def'));
  assert.deepEqual(writes.map(String), ['abc', 'def']);
});

test('PtyClientImpl resize updates cols/rows and forwards', async () => {
  const { ipty, resizes } = makeMockPty();
  const client = new PtyClientImpl({
    provider: 'claude', pty: makeMockPtyModule(ipty), bin: 'claude', args: [],
    cwd: '/tmp', cols: 80, rows: 24, env: {},
  });
  await client.start();
  client.resize(120, 40);
  assert.equal(client.cols, 120);
  assert.equal(client.rows, 40);
  assert.deepEqual(resizes, [[120, 40]]);
});

test('PtyClientImpl kill forwards default SIGHUP and explicit signal', async () => {
  const { ipty, kills } = makeMockPty();
  const client = new PtyClientImpl({
    provider: 'claude', pty: makeMockPtyModule(ipty), bin: 'claude', args: [],
    cwd: '/tmp', cols: 80, rows: 24, env: {},
  });
  await client.start();
  client.kill();
  client.kill('SIGTERM');
  assert.deepEqual(kills, ['SIGHUP', 'SIGTERM']);
});

test('PtyClientImpl close sends SIGHUP and resolves on exit', async () => {
  const { ipty, emitter, kills } = makeMockPty();
  const client = new PtyClientImpl({
    provider: 'claude', pty: makeMockPtyModule(ipty), bin: 'claude', args: [],
    cwd: '/tmp', cols: 80, rows: 24, env: {},
  });
  await client.start();
  const closed = client.close();
  // simulate the underlying process exiting
  setImmediate(() => emitter.emit('exit', { exitCode: 0, signal: undefined }));
  await closed;
  assert.deepEqual(kills, ['SIGHUP']);
});

test('PtyClientImpl exit event reports code and signal', async () => {
  const { ipty, emitter } = makeMockPty();
  const client = new PtyClientImpl({
    provider: 'claude', pty: makeMockPtyModule(ipty), bin: 'claude', args: [],
    cwd: '/tmp', cols: 80, rows: 24, env: {},
  });
  await client.start();
  let exitCalls = [];
  client.on('exit', (code, signal) => exitCalls.push({ code, signal }));
  emitter.emit('exit', { exitCode: 137, signal: 'SIGKILL' });
  assert.deepEqual(exitCalls, [{ code: 137, signal: 'SIGKILL' }]);
});

test('PtyClientImpl pid is null after exit', async () => {
  const { ipty, emitter } = makeMockPty();
  const client = new PtyClientImpl({
    provider: 'claude', pty: makeMockPtyModule(ipty), bin: 'claude', args: [],
    cwd: '/tmp', cols: 80, rows: 24, env: {},
  });
  await client.start();
  emitter.emit('exit', { exitCode: 0, signal: undefined });
  assert.equal(client.pid, null);
});

test('PtyClientImpl start is idempotent', async () => {
  const { ipty } = makeMockPty();
  const pty = makeMockPtyModule(ipty);
  let spawnCount = 0;
  const wrappedPty = { spawn: (...a) => { spawnCount++; return pty.spawn(...a); } };
  const client = new PtyClientImpl({
    provider: 'claude', pty: wrappedPty, bin: 'claude', args: [],
    cwd: '/tmp', cols: 80, rows: 24, env: {},
  });
  await client.start();
  await client.start();
  assert.equal(spawnCount, 1, 'spawn called only once');
});
