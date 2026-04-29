import test from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../dist/esm/copilot/client.js';

class StubGhClient {
  on() { return () => {}; }
  async sendAndWait() { return { content: '' }; }
  async close() {}
}

test('CopilotClient emits closed when close() is called', async () => {
  const client = new CopilotClient(
    { cwd: '/tmp' },
    { GhClientCtor: function () { return new StubGhClient(); } },
  );
  await client.start();

  let closedCode = 'unset';
  client.on('closed', (code) => { closedCode = code; });

  await client.close();

  assert.equal(closedCode, null, 'closed should fire with null exit code on graceful stop');
});
