import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ClaudeClient } from '../../dist/esm/index.js';

/**
 * Build a fake Claude `TurnSnapshot` with the fields `getMessages()` consumes.
 * Mirrors the shape from src/claude/turn-handle.ts.
 */
function fakeTurn() {
  return {
    id: 'turn-1',
    input: 'hi',
    status: 'completed',
    currentOutputKind: 'text',
    currentMessage: { type: 'text', content: '' },
    text: 'Hello there',
    thinking: 'thinking...',
    toolUses: [
      { id: 'tu-1', name: 'read_file', input: { path: '/tmp/x' }, startedAt: '2024-01-01T00:00:00.000Z' }
    ],
    toolResults: [
      { toolUseId: 'tu-1', content: 'content here', isError: false, receivedAt: '2024-01-01T00:00:00.500Z' }
    ],
    openRequests: [],
    history: [],
    startedAt: '2024-01-01T00:00:00.000Z',
    completedAt: '2024-01-01T00:00:01.000Z'
  };
}

test('Claude getMessages projects history into UnifiedMessage[]', async () => {
  const client = new ClaudeClient({ cwd: process.cwd() });

  // Stub the source projection reads from.
  const turn = fakeTurn();
  client.getHistoryDetailed = () => [turn];

  const msgs = await client.getMessages();
  assert.ok(Array.isArray(msgs));
  // 1 assistant + 1 tool use + 1 tool result = 3 messages
  assert.equal(msgs.length, 3);

  assert.equal(msgs[0].role, 'assistant');
  assert.equal(msgs[0].text, 'Hello there');
  assert.equal(msgs[0].reasoning, 'thinking...');
  assert.equal(msgs[0].id, 'turn-1#assistant');
  assert.equal(typeof msgs[0].timestamp, 'number');
  assert.equal(msgs[0].raw.provider, 'claude');

  assert.equal(msgs[1].role, 'tool');
  assert.equal(msgs[1].id, 'tu-1');
  assert.deepEqual(msgs[1].toolUse, { id: 'tu-1', name: 'read_file', input: { path: '/tmp/x' } });

  assert.equal(msgs[2].role, 'tool');
  assert.equal(msgs[2].id, 'tu-1#result');
  assert.deepEqual(msgs[2].toolResult, { toolUseId: 'tu-1', content: 'content here', isError: false });

  for (const m of msgs) assert.equal(m.raw.provider, 'claude');
  assert.equal(client.capabilities.getMessages, true);
});

test('Claude getMessages skips assistant message when text is empty', async () => {
  const client = new ClaudeClient({ cwd: process.cwd() });
  const turn = fakeTurn();
  turn.text = '';
  turn.thinking = '';
  client.getHistoryDetailed = () => [turn];

  const msgs = await client.getMessages();
  // Only 1 tool use + 1 tool result = 2 messages (no assistant)
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, 'tool');
  assert.equal(msgs[0].id, 'tu-1');
  assert.equal(msgs[1].role, 'tool');
  assert.equal(msgs[1].id, 'tu-1#result');
});

test('Claude getMessages omits reasoning field when thinking is empty', async () => {
  const client = new ClaudeClient({ cwd: process.cwd() });
  const turn = fakeTurn();
  turn.thinking = '';
  turn.toolUses = [];
  turn.toolResults = [];
  client.getHistoryDetailed = () => [turn];

  const msgs = await client.getMessages();
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].role, 'assistant');
  assert.equal(msgs[0].text, 'Hello there');
  assert.equal('reasoning' in msgs[0], false);
});

test('Claude getMessages returns empty array when no history', async () => {
  const client = new ClaudeClient({ cwd: process.cwd() });
  const msgs = await client.getMessages();
  assert.deepEqual(msgs, []);
});
