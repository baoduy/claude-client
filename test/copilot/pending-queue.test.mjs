import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PendingRequestQueue } from '../../dist/esm/copilot/pending-queue.js';

function makeRecorder() {
  const events = [];
  return {
    events,
    emit: (name, payload) => events.push({ name, payload }),
  };
}

test('registerPermission returns a pending Promise; resolveApprove resolves with approve-once', async () => {
  const rec = makeRecorder();
  const queue = new PendingRequestQueue({ emit: rec.emit });

  const promise = queue.registerPermission({ kind: 'write' }, 'sess-1');
  const added = rec.events.find(e => e.name === 'pending_request_added');
  assert.ok(added);
  assert.equal(added.payload.kind, 'permission');
  const id = added.payload.id;

  await queue.resolveApprove(id, { scope: 'once' });
  const result = await promise;
  assert.equal(result.kind, 'approve-once');

  assert.ok(rec.events.find(e => e.name === 'pending_request_removed' && e.payload.id === id));
  assert.ok(rec.events.find(e => e.name === 'pending_request_resolved' && e.payload.outcome === 'approved'));
});

test('resolveApprove with scope:session emits approve-for-session', async () => {
  const queue = new PendingRequestQueue({ emit: () => {} });
  const promise = queue.registerPermission({ kind: 'shell' }, 'sess-1');
  const id = queue.list()[0].id;
  await queue.resolveApprove(id, { scope: 'session' });
  const result = await promise;
  assert.equal(result.kind, 'approve-for-session');
});

test('resolveDeny resolves with reject + feedback', async () => {
  const queue = new PendingRequestQueue({ emit: () => {} });
  const promise = queue.registerPermission({ kind: 'shell' }, 'sess-1');
  const id = queue.list()[0].id;
  await queue.resolveDeny(id, 'no thanks');
  const result = await promise;
  assert.equal(result.kind, 'reject');
  assert.equal(result.feedback, 'no thanks');
});

test('list returns snapshot of all open requests in insertion order', () => {
  const queue = new PendingRequestQueue({ emit: () => {} });
  queue.registerPermission({ kind: 'write' }, 'sess');
  queue.registerElicitation({ sessionId: 'sess', message: 'name?' });
  const items = queue.list();
  assert.equal(items.length, 2);
  assert.equal(items[0].kind, 'permission');
  assert.equal(items[1].kind, 'elicitation');
});

test('getMostRecent returns last-added entry as PendingAction', () => {
  const queue = new PendingRequestQueue({ emit: () => {} });
  queue.registerPermission({ kind: 'write' }, 'sess');
  queue.registerElicitation({ sessionId: 'sess', message: 'name?' });
  const action = queue.getMostRecent();
  assert.equal(action?.kind, 'elicitation');
});

test('getMostRecent returns null when queue is empty', () => {
  const queue = new PendingRequestQueue({ emit: () => {} });
  assert.equal(queue.getMostRecent(), null);
});

test('size reports count of open entries', () => {
  const queue = new PendingRequestQueue({ emit: () => {} });
  assert.equal(queue.size(), 0);
  queue.registerPermission({ kind: 'shell' }, 'sess');
  assert.equal(queue.size(), 1);
  queue.registerElicitation({ sessionId: 'sess', message: 'm' });
  assert.equal(queue.size(), 2);
});

test('resolveQuestion on elicitation entry resolves with action accept + content', async () => {
  const queue = new PendingRequestQueue({ emit: () => {} });
  const promise = queue.registerElicitation({ sessionId: 'sess', message: 'name?' });
  const id = queue.list()[0].id;
  await queue.resolveQuestion(id, { kind: 'form', values: { name: 'alice' } });
  const result = await promise;
  assert.equal(result.action, 'accept');
  assert.deepEqual(result.content, { name: 'alice' });
});

test('resolveQuestion with cancel emits cancelled outcome', async () => {
  const events = [];
  const queue = new PendingRequestQueue({ emit: (n, p) => events.push({ n, p }) });
  queue.registerElicitation({ sessionId: 'sess', message: 'm' });
  const id = queue.list()[0].id;
  const promise = (async () => { await queue.resolveQuestion(id, { kind: 'cancel' }); })();
  await promise;
  const resolved = events.find(e => e.n === 'pending_request_resolved');
  assert.equal(resolved.p.outcome, 'cancelled');
});

test('resolveQuestion on user input entry returns UserInputResponse', async () => {
  const queue = new PendingRequestQueue({ emit: () => {} });
  const promise = queue.registerUserInput({ question: 'pick', choices: ['a', 'b'] }, 'sess');
  const id = queue.list()[0].id;
  await queue.resolveQuestion(id, { kind: 'choice', value: 'a' });
  const result = await promise;
  assert.equal(result.answer, 'a');
  assert.equal(result.wasFreeform, false);
});

test('resolveApprove on non-permission entry throws', async () => {
  const queue = new PendingRequestQueue({ emit: () => {} });
  queue.registerElicitation({ sessionId: 'sess', message: 'm' });
  const id = queue.list()[0].id;
  await assert.rejects(() => queue.resolveApprove(id, { scope: 'once' }), /No pending permission|is.*elicitation/i);
});

test('resolveApprove with unknown id throws', async () => {
  const queue = new PendingRequestQueue({ emit: () => {} });
  await assert.rejects(() => queue.resolveApprove('nope', { scope: 'once' }), /No pending/i);
});

test('setAutoEdit auto-resolves write permission requests with approve-once', async () => {
  const events = [];
  const queue = new PendingRequestQueue({ emit: (n, p) => events.push({ n, p }) });
  queue.setAutoEdit(true);
  const promise = queue.registerPermission({ kind: 'write' }, 'sess');
  const result = await promise;
  assert.equal(result.kind, 'approve-once');
  // Should have emitted added/removed/resolved synchronously
  assert.ok(events.find(e => e.n === 'pending_request_added'));
  assert.ok(events.find(e => e.n === 'pending_request_resolved' && e.p.outcome === 'approved'));
});

test('setAutoEdit does not affect non-write permission kinds', async () => {
  const queue = new PendingRequestQueue({ emit: () => {} });
  queue.setAutoEdit(true);
  queue.registerPermission({ kind: 'shell' }, 'sess');
  // Promise stays pending; queue retains the entry
  assert.equal(queue.size(), 1);
});
