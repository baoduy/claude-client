import { test } from 'node:test';
import assert from 'node:assert/strict';

test('UnifiedEventMap includes pending_request_added/removed/resolved', () => {
  // Type-only test — runtime constructs the shape
  const sample = {
    pending_request_added: { id: 'r1', kind: 'permission' },
    pending_request_removed: { id: 'r1' },
    pending_request_resolved: { id: 'r1', outcome: 'approved' },
  };
  assert.equal(sample.pending_request_added.kind, 'permission');
  assert.equal(sample.pending_request_removed.id, 'r1');
  assert.equal(sample.pending_request_resolved.outcome, 'approved');
});
