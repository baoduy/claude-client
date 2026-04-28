import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listCopilotSessionSummaries, readCopilotSessionRecord } from '../../dist/esm/copilot/sessions.js';

test('listCopilotSessionSummaries returns sessions from the configured copilot home', async () => {
  const home = await mkdtemp(join(tmpdir(), 'copilot-sessions-'));
  const stateDir = join(home, '.copilot', 'session-state', 'sess-1');
  await mkdir(stateDir, { recursive: true });
  await writeFile(join(stateDir, 'metadata.json'), JSON.stringify({
    sessionId: 'sess-1',
    title: 'Refactor pool',
    createdAt: '2026-04-28T00:00:00Z',
    messageCount: 4,
  }));

  const summaries = await listCopilotSessionSummaries({ homeDir: home });
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].sessionId, 'sess-1');
  assert.equal(summaries[0].title, 'Refactor pool');
  assert.equal(summaries[0].provider, 'copilot');
});

test('readCopilotSessionRecord returns metadata + raw messages for one session', async () => {
  const home = await mkdtemp(join(tmpdir(), 'copilot-sessions-'));
  const stateDir = join(home, '.copilot', 'session-state', 'sess-2');
  await mkdir(stateDir, { recursive: true });
  await writeFile(join(stateDir, 'metadata.json'), JSON.stringify({
    sessionId: 'sess-2', title: 'X', messageCount: 1,
  }));
  await writeFile(join(stateDir, 'messages.jsonl'),
    JSON.stringify({ role: 'user', content: 'hi' }) + '\n');

  const record = await readCopilotSessionRecord('sess-2', { homeDir: home });
  assert.equal(record.sessionId, 'sess-2');
  assert.equal(record.rawMessages.length, 1);
  assert.equal(record.rawMessages[0].role, 'user');
});
