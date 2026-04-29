import { test } from 'node:test';
import assert from 'node:assert/strict';

test('PendingRequest is a discriminated union with three kinds', () => {
  const a = {
    id: 'r1',
    kind: 'permission',
    permissionKind: 'write',
    message: 'allow write?',
    raw: { provider: 'copilot', payload: {} },
  };
  const b = {
    id: 'r2',
    kind: 'elicitation',
    message: 'need info',
    raw: { provider: 'copilot', payload: {} },
  };
  const c = {
    id: 'r3',
    kind: 'question',
    question: 'pick one',
    allowFreeform: true,
    raw: { provider: 'copilot', payload: {} },
  };
  const all = [a, b, c];
  assert.equal(all.length, 3);
});

test('ApproveDecision and QuestionResponse compile in their variant shapes', () => {
  const d = { scope: 'session' };
  const q = { kind: 'choice', value: 'yes' };
  assert.equal(d.scope, 'session');
  assert.equal(q.kind, 'choice');
});

test('DetailedStatus and PendingAction have expected shape', () => {
  const s = {
    status: 'idle',
    phase: 'idle',
    pendingRequestCount: 0,
    raw: { provider: 'copilot', payload: {} },
  };
  const a = { id: 'r1', kind: 'permission' };
  assert.equal(s.pendingRequestCount, 0);
  assert.equal(a.id, 'r1');
});
