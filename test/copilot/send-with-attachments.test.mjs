import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../../dist/esm/copilot/index.js';

// Minimal SDK mocks shared across tests. Each test instantiates fresh ones so
// the captured-message arrays don't bleed between tests.
function makeMocks(captured) {
  class MockSession {
    constructor() { this.sessionId = 'sess-1'; }
    on() { return () => {}; }
    async sendAndWait(message) {
      captured.push(message);
      return { data: { content: 'ok' } };
    }
    async abort() {}
    async disconnect() {}
  }
  class MockClient {
    async start() {}
    async stop() {}
    async createSession() { return new MockSession(); }
    async resumeSession() { return new MockSession(); }
    on() { return () => {}; }
  }
  return { MockClient };
}

test('client.capabilities.richContent === "full" after Task A4', () => {
  const client = new CopilotClient({ cwd: process.cwd() });
  assert.equal(client.capabilities.richContent, 'full');
});

test('send() with image base64 dispatches blob attachment to SDK', async () => {
  const captured = [];
  const { MockClient } = makeMocks(captured);

  const client = new CopilotClient(
    { cwd: process.cwd() },
    { GhClientCtor: MockClient },
  );
  await client.start();

  const turn = client.send({
    content: [
      { type: 'text', text: 'describe' },
      { type: 'image', source: { type: 'base64', mediaType: 'image/png', data: 'AAA' } },
    ],
  });
  await turn.done.catch(() => {});
  await client.close();

  assert.equal(captured.length, 1);
  assert.equal(captured[0].prompt, 'describe');
  assert.deepEqual(captured[0].attachments, [
    { type: 'blob', data: 'AAA', mimeType: 'image/png' },
  ]);
});

test('send() with text-only input passes prompt-only message (no attachments key)', async () => {
  const captured = [];
  const { MockClient } = makeMocks(captured);

  const client = new CopilotClient(
    { cwd: process.cwd() },
    { GhClientCtor: MockClient },
  );
  await client.start();
  const turn = client.send('plain hello');
  await turn.done.catch(() => {});
  await client.close();

  assert.equal(captured.length, 1);
  assert.equal(captured[0].prompt, 'plain hello');
  // Attachments key should be absent (or undefined) when no attachments
  assert.ok(captured[0].attachments === undefined);
});

test('send() with image url throws synchronously (UnsupportedContentError)', () => {
  const client = new CopilotClient({ cwd: process.cwd() });
  // Note: no start() — translator pre-scan happens before any session is needed
  assert.throws(
    () => client.send({ content: [{ type: 'image', source: { type: 'url', url: 'https://x' } }] }),
    /UnsupportedContent|unsupported/i,
  );
});
