import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SessionNotStartedError,
  CopilotRpcError,
  CopilotExperimentalUnavailableError,
} from '../../dist/esm/copilot/index.js';

test('SessionNotStartedError carries name and callsite', () => {
  const e = new SessionNotStartedError('plan.read');
  assert.equal(e.name, 'SessionNotStartedError');
  assert.match(e.message, /plan\.read/);
  assert.equal(e.callsite, 'plan.read');
});

test('CopilotRpcError carries namespace, method, cause', () => {
  const cause = new Error('boom');
  const e = new CopilotRpcError('plan', 'read', cause);
  assert.equal(e.name, 'CopilotRpcError');
  assert.equal(e.namespace, 'plan');
  assert.equal(e.method, 'read');
  assert.equal(e.cause, cause);
  assert.equal(e.experimental, false);
});

test('CopilotExperimentalUnavailableError carries cliVersion + experimental flag', () => {
  const e = new CopilotExperimentalUnavailableError('mcp', 'list', '0.2.10');
  assert.equal(e.name, 'CopilotExperimentalUnavailableError');
  assert.equal(e.namespace, 'mcp');
  assert.equal(e.method, 'list');
  assert.equal(e.cliVersion, '0.2.10');
  assert.equal(e.experimental, true);
});

test('CopilotExperimentalUnavailableError handles undefined cliVersion', () => {
  const e = new CopilotExperimentalUnavailableError('skills', 'reload');
  assert.equal(e.cliVersion, undefined);
  assert.match(e.message, /unknown/i);
});
