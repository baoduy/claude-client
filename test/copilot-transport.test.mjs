import test from 'node:test';
import assert from 'node:assert/strict';
import { CopilotTransport } from '../dist/esm/copilot/transport.js';
import { CopilotFeatureUnsupportedError } from '../dist/esm/copilot/errors.js';

// Minimal fake SDK conforming to our shim's expected surface
class FakeGhClient {
  constructor(opts) { this.opts = opts; this.stopped = false; }
  async createSession(config) {
    return new FakeGhSession(config?.model ?? 'auto', 'auto-id');
  }
  async resumeSession(id, _config) { return new FakeGhSession('resumed', id); }
  async stop() { this.stopped = true; }
}
class FakeGhSession {
  constructor(model, sessionId) {
    this.model = model;
    this.sessionId = sessionId;
  }
  async sendAndWait({ prompt }) { return { data: { content: `echo: ${prompt}` } }; }
}

test('CopilotTransport.start creates a session with the configured model', async () => {
  const transport = new CopilotTransport({
    GhClientCtor: FakeGhClient,
    config: { cwd: process.cwd(), model: 'gpt-5' },
  });
  await transport.start();
  assert.equal(transport.sessionId, 'auto-id');
  assert.ok(transport.session);
  await transport.stop();
});

test('CopilotTransport.start with resumeSessionId calls resumeSession', async () => {
  const transport = new CopilotTransport({
    GhClientCtor: FakeGhClient,
    config: { cwd: process.cwd(), resumeSessionId: 'prev-1' },
  });
  await transport.start();
  assert.equal(transport.sessionId, 'prev-1');
  await transport.stop();
});

test('CopilotTransport.start throws CopilotFeatureUnsupportedError for transport=pty', async () => {
  const transport = new CopilotTransport({
    GhClientCtor: FakeGhClient,
    config: { cwd: process.cwd(), transport: 'pty' },
  });
  await assert.rejects(transport.start(), CopilotFeatureUnsupportedError);
});
