import test from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeClient } from '../dist/esm/claude/client.js';
import { CopilotClient } from '../dist/esm/copilot/client.js';

const PROVIDERS = [
  ['ClaudeClient', () => new ClaudeClient({ cwd: '/tmp', sessionId: 'test' })],
  ['CopilotClient', () => new CopilotClient({ cwd: '/tmp' })],
];

for (const [name, factory] of PROVIDERS) {
  test(`${name}.getCurrentTurn() returns null pre-turn`, () => {
    const client = factory();
    assert.equal(client.getCurrentTurn(), null);
  });

  test(`${name}.getHistory() returns [] pre-turn`, () => {
    const client = factory();
    assert.deepEqual(client.getHistory(), []);
  });
}

test('Copilot snapshot shape: id is a string, status pending|completed|errored, startedAt is number, toolUses/toolResults are arrays', async () => {
  // Drive a synthetic turn through Copilot to get a real snapshot.
  class StubGhSession {
    on() { return () => {}; }
    async sendAndWait() { return { content: 'hello' }; }
  }
  class StubGhClient {
    async createSession() { this.session = new StubGhSession(); return this.session; }
    async stop() {}
  }

  const client = new CopilotClient({ cwd: '/tmp' }, { GhClientCtor: function () { return new StubGhClient(); } });
  await client.start();
  const turn = client.send('hi');
  await turn.done.catch(() => {});

  const history = client.getHistory();
  assert.equal(history.length, 1, 'history should have one completed turn');
  const snap = history[0];

  assert.equal(typeof snap.id, 'string');
  assert.ok(snap.id.startsWith('copilot-'), 'Copilot ids should be prefixed');
  assert.ok(['pending', 'completed', 'errored'].includes(snap.status));
  assert.equal(typeof snap.text, 'string');
  assert.ok(Array.isArray(snap.toolUses));
  assert.ok(Array.isArray(snap.toolResults));
  assert.equal(typeof snap.startedAt, 'number');
  if (snap.completedAt !== undefined) {
    assert.equal(typeof snap.completedAt, 'number');
  }

  await client.close();
});
