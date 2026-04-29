import test from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../dist/esm/copilot/client.js';

class StreamingSdkSession {
  on(handler) {
    this._handler = handler;
    return () => { this._handler = null; };
  }
  async sendAndWait() {
    if (this._handler) {
      this._handler({ type: 'assistant.streaming_delta', delta: 'hello' });
      this._handler({ type: 'assistant.streaming_delta', delta: ' world' });
    }
    return { content: 'hello world' };
  }
}

class StreamingSdkClient {
  async createSession() { this.session = new StreamingSdkSession(); return this.session; }
  async stop() {}
}

function recordEvents(client) {
  const events = [];
  for (const ev of [
    'ready', 'text', 'text_done', 'reasoning', 'reasoning_done',
    'tool_use_start', 'tool_result', 'usage_update', 'status_change',
    'result', 'error', 'closed',
  ]) {
    client.on(ev, () => events.push(ev));
  }
  return events;
}

test('Copilot: text events fire before text_done; result fires before status_change(idle)', async () => {
  const client = new CopilotClient(
    { cwd: '/tmp' },
    { GhClientCtor: function () { return new StreamingSdkClient(); } },
  );
  const events = recordEvents(client);

  await client.start();
  const turn = client.send('hi');
  await turn.done;

  const lastTextIdx = events.lastIndexOf('text');
  const textDoneIdx = events.indexOf('text_done');
  const resultIdx = events.indexOf('result');
  const statusChanges = events.reduce((acc, e, i) => (e === 'status_change' ? acc.concat(i) : acc), []);

  assert.ok(lastTextIdx >= 0, 'expected at least one text event');
  assert.ok(textDoneIdx > lastTextIdx, 'text_done must fire after the last text chunk');
  assert.ok(resultIdx > textDoneIdx, 'result must fire after text_done');

  // status_change(idle) — it's the LAST status_change in the run since the
  // run starts on running and ends on idle.
  if (statusChanges.length >= 2) {
    const finalStatusChange = statusChanges[statusChanges.length - 1];
    assert.ok(resultIdx < finalStatusChange, 'result must fire before final status_change(idle)');
  }

  await client.close();
});

test('Copilot: text_done does not fire when no text was emitted', async () => {
  class SilentSession {
    on() { return () => {}; }
    async sendAndWait() { return { content: '' }; }
  }
  class SilentClient {
    async createSession() { this.session = new SilentSession(); return this.session; }
    async stop() {}
  }

  const client = new CopilotClient(
    { cwd: '/tmp' },
    { GhClientCtor: function () { return new SilentClient(); } },
  );
  let textDoneFired = false;
  client.on('text_done', () => { textDoneFired = true; });

  await client.start();
  const turn = client.send('hi');
  await turn.done.catch(() => {});

  assert.equal(textDoneFired, false, 'text_done should not fire on empty turn');
  await client.close();
});

test('Copilot: closed fires on close()', async () => {
  class StubSession {
    on() { return () => {}; }
    async sendAndWait() { return { content: '' }; }
  }
  class StubClient {
    async createSession() { this.session = new StubSession(); return this.session; }
    async stop() {}
  }

  const client = new CopilotClient(
    { cwd: '/tmp' },
    { GhClientCtor: function () { return new StubClient(); } },
  );
  let closedFired = false;
  client.on('closed', () => { closedFired = true; });
  await client.start();
  await client.close();
  assert.equal(closedFired, true);
});
