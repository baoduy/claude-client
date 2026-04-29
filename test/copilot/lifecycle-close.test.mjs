import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';

function makeMockClient(opts = {}) {
  const order = opts.order ?? [];
  class MockSession {
    constructor() { this.id = 'sess-1'; }
    on() { return () => {}; }
    async sendAndWait() { return { data: { content: 'ok' } }; }
    async abort() { order.push('abort'); }
    async disconnect() { order.push('disconnect'); }
  }
  return class MockClient {
    async start() {}
    async stop() { order.push('stop'); }
    async createSession() { return new MockSession(); }
    on() { return () => {}; }
  };
}

test('close() calls session.abort, session.disconnect, then client.stop in order', async () => {
  const order = [];
  const ctor = makeMockClient({ order });
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
  await client.start();
  await client.close();
  assert.deepEqual(order, ['abort', 'disconnect', 'stop']);
});

test('close() emits closed event with null exit code', async (t) => {
  const ctor = makeMockClient();
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
  await client.start();
  const spy = t.mock.fn();
  client.on('closed', spy);
  await client.close();
  assert.equal(spy.mock.callCount(), 1);
  assert.deepEqual(spy.mock.calls[0].arguments, [null]);
});

test('close() is idempotent — calling twice does not double-emit', async () => {
  const ctor = makeMockClient();
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
  await client.start();
  let count = 0;
  client.on('closed', () => count++);
  await client.close();
  await client.close();
  assert.equal(count, 1);
});

test('close() is idempotent — second call does not re-invoke abort/disconnect/stop', async () => {
  const order = [];
  const ctor = makeMockClient({ order });
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
  await client.start();
  await client.close();
  await client.close();
  assert.deepEqual(order, ['abort', 'disconnect', 'stop']);
});

test('close() swallows errors from session.abort and session.disconnect', async () => {
  class MockSession {
    constructor() { this.id = 'sess-1'; }
    on() { return () => {}; }
    async sendAndWait() { return { data: { content: 'ok' } }; }
    async abort() { throw new Error('abort failed'); }
    async disconnect() { throw new Error('disconnect failed'); }
  }
  let stopped = false;
  class MockClient {
    async start() {}
    async stop() { stopped = true; }
    async createSession() { return new MockSession(); }
    on() { return () => {}; }
  }
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: MockClient });
  await client.start();
  await client.close();   // should not throw
  assert.equal(stopped, true);
});
