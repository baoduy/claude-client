import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';
import { RequestNotHandled } from '../../dist/esm/copilot/errors.js';

function buildMock({ onCreateSession } = {}) {
  let lastConfig = null;
  class MockSession {
    constructor() { this.sessionId = 'sess-1'; }
    on() { return () => {}; }
    async sendAndWait() { return { data: { content: 'ok' } }; }
    async abort() {}
    async disconnect() {}
  }
  const ctor = class MockClient {
    async start() {}
    async stop() {}
    async createSession(cfg) {
      lastConfig = cfg;
      onCreateSession?.(cfg);
      return new MockSession();
    }
    on() { return () => {}; }
  };
  ctor.getLastConfig = () => lastConfig;
  return ctor;
}

test('Copilot installs internal onPermissionRequest if user did not provide one', async () => {
  const ctor = buildMock();
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
  await client.start();
  const cfg = ctor.getLastConfig();
  assert.equal(typeof cfg.onPermissionRequest, 'function');
  assert.equal(typeof cfg.onElicitationRequest, 'function');
  assert.equal(typeof cfg.onUserInputRequest, 'function');
  await client.close();
});

test('getOpenRequests returns the queue snapshot after a permission request comes in', async () => {
  const ctor = buildMock();
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
  await client.start();
  const cfg = ctor.getLastConfig();
  const promise = cfg.onPermissionRequest({ kind: 'write' }, { sessionId: 's1' });
  await new Promise(r => setImmediate(r));
  const opens = client.getOpenRequests();
  assert.equal(opens.length, 1);
  assert.equal(opens[0].kind, 'permission');
  await client.approveRequest(opens[0].id);
  const result = await promise;
  assert.equal(result.kind, 'approve-once');
  assert.equal(client.getOpenRequests().length, 0);
  await client.close();
});

test('User-provided onPermissionRequest is called first; RequestNotHandled falls through to queue', async () => {
  const userHandler = async (req) => {
    if (req.kind === 'read') return { kind: 'approve-once' };
    throw new RequestNotHandled();
  };
  const ctor = buildMock();
  const client = new CopilotClient(
    { cwd: process.cwd(), onPermissionRequest: userHandler },
    { GhClientCtor: ctor },
  );
  await client.start();
  const cfg = ctor.getLastConfig();
  const r1 = await cfg.onPermissionRequest({ kind: 'read' }, { sessionId: 's1' });
  assert.equal(r1.kind, 'approve-once');
  assert.equal(client.getOpenRequests().length, 0);

  const p = cfg.onPermissionRequest({ kind: 'write' }, { sessionId: 's1' });
  await new Promise(r => setImmediate(r));
  assert.equal(client.getOpenRequests().length, 1);
  const id = client.getOpenRequests()[0].id;
  await client.approveRequest(id);
  await p;
  assert.equal(client.getOpenRequests().length, 0);
  await client.close();
});

test('denyRequest resolves with reject + feedback', async () => {
  const ctor = buildMock();
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
  await client.start();
  const cfg = ctor.getLastConfig();
  const promise = cfg.onPermissionRequest({ kind: 'shell' }, { sessionId: 's1' });
  await new Promise(r => setImmediate(r));
  const id = client.getOpenRequests()[0].id;
  await client.denyRequest(id, 'no');
  const result = await promise;
  assert.equal(result.kind, 'reject');
  assert.equal(result.feedback, 'no');
  await client.close();
});

test('answerQuestion on elicitation entry resolves the SDK callback', async () => {
  const ctor = buildMock();
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
  await client.start();
  const cfg = ctor.getLastConfig();
  const promise = cfg.onElicitationRequest({ sessionId: 's1', message: 'name?' });
  await new Promise(r => setImmediate(r));
  const id = client.getOpenRequests()[0].id;
  await client.answerQuestion(id, { kind: 'form', values: { name: 'alice' } });
  const result = await promise;
  assert.equal(result.action, 'accept');
  assert.deepEqual(result.content, { name: 'alice' });
  await client.close();
});

test('getPendingAction returns the most recent open entry', async () => {
  const ctor = buildMock();
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
  await client.start();
  const cfg = ctor.getLastConfig();
  cfg.onPermissionRequest({ kind: 'write' }, { sessionId: 's1' });
  await new Promise(r => setImmediate(r));
  cfg.onElicitationRequest({ sessionId: 's1', message: 'x' });
  await new Promise(r => setImmediate(r));
  const action = client.getPendingAction();
  assert.equal(action?.kind, 'elicitation');
  await client.close();
});

test('client.capabilities.interactiveApproval === true', () => {
  const c = new CopilotClient({ cwd: process.cwd() });
  assert.equal(c.capabilities.interactiveApproval, true);
});

test('pending events emit on the client EventEmitter', async () => {
  const ctor = buildMock();
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
  await client.start();
  const events = [];
  client.on('pending_request_added', (ev) => events.push({ name: 'added', ...ev }));
  client.on('pending_request_removed', (ev) => events.push({ name: 'removed', ...ev }));
  client.on('pending_request_resolved', (ev) => events.push({ name: 'resolved', ...ev }));
  const cfg = ctor.getLastConfig();
  const p = cfg.onPermissionRequest({ kind: 'shell' }, { sessionId: 's1' });
  await new Promise(r => setImmediate(r));
  const id = client.getOpenRequests()[0].id;
  await client.approveRequest(id);
  await p;
  assert.equal(events.filter(e => e.name === 'added').length, 1);
  assert.equal(events.filter(e => e.name === 'removed').length, 1);
  assert.equal(events.filter(e => e.name === 'resolved').length, 1);
  await client.close();
});
