import test from 'node:test';
import assert from 'node:assert/strict';
import { createAICliClient } from '../dist/esm/index.js';
import { ClaudeClient } from '../dist/esm/claude/client.js';
import { CopilotClient } from '../dist/esm/copilot/client.js';

// Stub helpers (mirrors test/factory.test.mjs to avoid spawning real CLIs).
async function withClaudeInitStub(fn) {
  const original = ClaudeClient.init;
  ClaudeClient.init = async (config) => {
    return new ClaudeClient(config);
  };
  try {
    return await fn();
  } finally {
    ClaudeClient.init = original;
  }
}

async function withCopilotStartStub(fn) {
  const originalStart = CopilotClient.prototype.start;
  CopilotClient.prototype.start = async function () {
    this._stubbedStarted = true;
  };
  try {
    return await fn();
  } finally {
    CopilotClient.prototype.start = originalStart;
  }
}

const expectedMembers = [
  'provider',
  'sessionId',
  'capabilities',
  'start',
  'close',
  'send',
  'sendMessage',
  'queueMessage',
  'interrupt',
  'getStatus',
  'isProcessing',
  'getCurrentTurn',
  'getHistory',
  'on',
  'off',
];

const optionalMethods = [
  'setModel',
  'setPermissionMode',
  'setMaxThinkingTokens',
  'listSupportedModels',
];

test('factory-produced Claude client exposes the AICliClient surface', async () => {
  await withClaudeInitStub(async () => {
    const client = await createAICliClient({ provider: 'claude', cwd: '/tmp' });
    for (const member of expectedMembers) {
      assert.ok(member in client, `missing AICliClient member: ${member}`);
    }
    assert.equal(client.provider, 'claude');
  });
});

test('factory-produced Copilot client exposes the AICliClient surface', async () => {
  await withCopilotStartStub(async () => {
    const client = await createAICliClient({ provider: 'copilot', cwd: '/tmp' });
    for (const member of expectedMembers) {
      assert.ok(member in client, `missing AICliClient member: ${member}`);
    }
    assert.equal(client.provider, 'copilot');
  });
});

test('factory client and direct-constructed Claude client share the same surface', async () => {
  await withClaudeInitStub(async () => {
    const factoryClient = await createAICliClient({ provider: 'claude', cwd: '/tmp' });
    const directClient = await ClaudeClient.init({ cwd: '/tmp' });
    for (const member of expectedMembers) {
      assert.equal(member in factoryClient, member in directClient,
        `surface mismatch for member: ${member}`);
    }
  });
});

test('factory client and direct-constructed Copilot client share the same surface', async () => {
  await withCopilotStartStub(async () => {
    const factoryClient = await createAICliClient({ provider: 'copilot', cwd: '/tmp' });
    const directClient = new CopilotClient({ cwd: '/tmp' });
    await directClient.start();
    for (const member of expectedMembers) {
      assert.equal(member in factoryClient, member in directClient,
        `surface mismatch for member: ${member}`);
    }
  });
});

test('Claude client getStatus returns UnifiedStatus (3-state)', async () => {
  await withClaudeInitStub(async () => {
    const client = await createAICliClient({ provider: 'claude', cwd: '/tmp' });
    const s = client.getStatus();
    assert.ok(['idle', 'running', 'error'].includes(s), `expected 3-state, got '${s}'`);
  });
});

test('Copilot client getStatus returns UnifiedStatus (3-state)', async () => {
  await withCopilotStartStub(async () => {
    const client = await createAICliClient({ provider: 'copilot', cwd: '/tmp' });
    const s = client.getStatus();
    assert.ok(['idle', 'running', 'error'].includes(s));
  });
});

test('Claude optional method presence matches capabilities (all true)', async () => {
  await withClaudeInitStub(async () => {
    const client = await createAICliClient({ provider: 'claude', cwd: '/tmp' });
    for (const m of optionalMethods) {
      assert.equal(client.capabilities[m], true, `Claude.capabilities.${m} should be true`);
      assert.equal(typeof client[m], 'function', `Claude.${m} should be defined`);
    }
  });
});

test('Copilot optional method presence matches capabilities', async () => {
  await withCopilotStartStub(async () => {
    const client = await createAICliClient({ provider: 'copilot', cwd: '/tmp' });
    // Methods Copilot now implements (track Group E gap-fill progress).
    const presentMethods = new Set(['setModel', 'listSupportedModels']); // A5 + A6
    for (const m of optionalMethods) {
      if (presentMethods.has(m)) {
        assert.equal(client.capabilities[m], true, `Copilot.capabilities.${m} should be true`);
        assert.equal(typeof client[m], 'function', `Copilot.${m} should be a method`);
      } else {
        assert.equal(client.capabilities[m], false, `Copilot.capabilities.${m} should be false`);
        assert.equal(client[m], undefined, `Copilot.${m} should be undefined`);
      }
    }
  });
});
