import test from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';

class FakeGhClient {
  constructor(opts) { this.opts = opts; this.stopped = false; }
  async createSession(config) {
    return new FakeGhSession(config?.model ?? 'auto', config?.sessionId ?? 'auto-id');
  }
  async resumeSession(id, _config) { return new FakeGhSession('resumed', id); }
  async stop() { this.stopped = true; }
}
class FakeGhSession {
  constructor(model, sessionId) { this.model = model; this.sessionId = sessionId; }
}

test('CopilotClient emits ready after start()', async () => {
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: FakeGhClient });
  let ready = false;
  client.on('ready', () => { ready = true; });
  await client.start();
  assert.equal(ready, true);
  assert.equal(client.getStatus(), 'idle');
  assert.ok(client.sessionId);
  await client.close();
});

test('CopilotClient.close transitions through stop and forgets session', async () => {
  const client = new CopilotClient({ cwd: process.cwd() }, { GhClientCtor: FakeGhClient });
  await client.start();
  await client.close();
  assert.equal(client.getStatus(), 'idle');
});
