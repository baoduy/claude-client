import test from 'node:test';
import assert from 'node:assert/strict';
import { createAICliClient } from '../dist/esm/factory.js';
import { ClaudeClient } from '../dist/esm/claude/client.js';
import { CopilotClient } from '../dist/esm/copilot/client.js';

// We avoid spawning real CLI processes by stubbing the underlying providers.
// ClaudeClient.init spawns the Claude binary; CopilotClient.start opens an
// SDK transport. We mock those via prototype patching for these tests.

function withClaudeInitStub(fn) {
  const original = ClaudeClient.init;
  let stubInstance = null;
  ClaudeClient.init = async (config) => {
    // Run the real constructor so class-field initializers (provider, etc.)
    // execute, but skip start() to avoid spawning the CLI.
    stubInstance = new ClaudeClient(config);
    stubInstance._stubbedConfig = config;
    return stubInstance;
  };
  try {
    return fn(() => stubInstance);
  } finally {
    ClaudeClient.init = original;
  }
}

function withCopilotStartStub(fn) {
  const originalStart = CopilotClient.prototype.start;
  CopilotClient.prototype.start = async function () {
    this._stubbedStarted = true;
  };
  try {
    return fn();
  } finally {
    CopilotClient.prototype.start = originalStart;
  }
}

test('createAICliClient dispatches to ClaudeClient for provider: "claude"', async () => {
  await withClaudeInitStub(async (getStub) => {
    const client = await createAICliClient({ provider: 'claude', cwd: '/tmp' });
    assert.ok(client instanceof ClaudeClient, 'returns a ClaudeClient instance');
    assert.equal(client.provider, 'claude');
    const stub = getStub();
    assert.equal(stub._stubbedConfig.cwd, '/tmp');
    assert.equal(stub._stubbedConfig.provider, undefined, 'provider field is stripped');
  });
});

test('createAICliClient dispatches to CopilotClient for provider: "copilot"', async () => {
  await withCopilotStartStub(async () => {
    const client = await createAICliClient({ provider: 'copilot', cwd: '/tmp' });
    assert.ok(client instanceof CopilotClient, 'returns a CopilotClient instance');
    assert.equal(client.provider, 'copilot');
    assert.equal(client._stubbedStarted, true, 'auto-started');
  });
});

test('createAICliClient throws on unknown provider', async () => {
  await assert.rejects(
    createAICliClient({ provider: 'not-a-real-provider', cwd: '/tmp' }),
    /Unknown provider: not-a-real-provider/,
  );
});
