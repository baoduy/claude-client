// Cross-provider contract tests for the unified AICliClient interactive
// approval surface (Phase 1.2 — B11). Both ClaudeClient and CopilotClient
// must satisfy the optional Group E methods listed in src/ai-cli-client.ts.
//
// Copilot is exercised end-to-end with the SDK ctor mocked. Claude needs
// no I/O for these checks — they only touch capability flags and the
// pre-turn `getOpenRequests()` accessor, which works on a freshly
// constructed ClaudeClient.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';
import { ClaudeClient } from '../../dist/esm/claude/client.js';

function buildCopilotMock() {
  class MockSession {
    constructor() {
      this.id = 'sess-1';
      this.sessionId = 'sess-1';
      this.rpc = {
        mode: { set: async () => {} },
        permissions: { setApproveAll: async () => ({}) },
      };
    }
    on() { return () => {}; }
    async sendAndWait() { return { data: { content: 'ok' } }; }
    async abort() {}
    async disconnect() {}
  }
  return class MockClient {
    async start() {}
    async stop() {}
    async createSession() { return new MockSession(); }
    on() { return () => {}; }
  };
}

const envs = [
  {
    name: 'copilot',
    needsStart: true,
    build: () => {
      const ctor = buildCopilotMock();
      return new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: ctor });
    },
  },
  {
    name: 'claude',
    // ClaudeClient does not need start() for these read-only contract checks
    // (no CLI process spawn required to read empty open-request queue / capabilities).
    needsStart: false,
    build: () => new ClaudeClient({ cwd: process.cwd(), sessionId: 'contract-test' }),
  },
];

for (const env of envs) {
  test(`[${env.name}] AICliClient.getOpenRequests returns array`, async () => {
    const client = env.build();
    if (env.needsStart) await client.start();
    const opens = client.getOpenRequests();
    assert.ok(Array.isArray(opens));
    if (env.needsStart) await client.close();
  });

  test(`[${env.name}] capability permissionModes is non-empty array`, async () => {
    const client = env.build();
    assert.ok(Array.isArray(client.capabilities.permissionModes));
    assert.ok(client.capabilities.permissionModes.length > 0);
  });

  test(`[${env.name}] capability interactiveApproval === true`, async () => {
    const client = env.build();
    assert.equal(client.capabilities.interactiveApproval, true);
  });
}
