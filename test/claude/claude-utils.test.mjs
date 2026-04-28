import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';

import {
  TaskMessageQueue,
  TaskStore,
  attachMcpHandlers,
  escapeProjectPath,
  listProjects,
  listProjectsAsync,
  listSessions,
  getSessionDetails,
  getSessionDetailsAsync,
  getMessagesSince,
  normalizeClaudeSessionMessages,
  listClaudeSessionSummaries,
  readClaudeSessionRecord,
  SessionWatcher
} from '../../dist/esm/index.js';

async function createClaudeFixtureRoot(prefix = 'claude-client-utils-') {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const claudeProjectsDir = join(root, '.claude', 'projects');
  await mkdir(claudeProjectsDir, { recursive: true });
  return { root, claudeProjectsDir };
}

async function writeSessionProject(root, projectPath, entries, messagesBySession = {}) {
  const storageDir = join(root, '.claude', 'projects', escapeProjectPath(projectPath));
  await mkdir(storageDir, { recursive: true });

  await writeFile(join(storageDir, 'sessions-index.json'), JSON.stringify({
    version: 1,
    entries
  }), 'utf8');

  for (const [sessionId, lines] of Object.entries(messagesBySession)) {
    await writeFile(join(storageDir, `${sessionId}.jsonl`), lines.join('\n'), 'utf8');
  }

  return storageDir;
}

test('TaskMessageQueue supports dequeueAll and clear modes', async () => {
  const queue = new TaskMessageQueue();

  await queue.enqueue('task-a', {
    taskId: 'task-a',
    message: { type: 'first' },
    timestamp: new Date('2026-01-01T00:00:00.000Z')
  });
  await queue.enqueue('task-a', {
    taskId: 'task-a',
    message: { type: 'second' },
    timestamp: new Date('2026-01-01T00:00:01.000Z')
  });

  const all = await queue.dequeueAll('task-a');
  assert.equal(all.length, 2);
  assert.equal((await queue.dequeue('task-a')), undefined);

  await queue.enqueue('task-a', {
    taskId: 'task-a',
    message: { type: 'kept' },
    timestamp: new Date('2026-01-01T00:00:02.000Z')
  });
  await queue.enqueue('task-b', {
    taskId: 'task-b',
    message: { type: 'deleted' },
    timestamp: new Date('2026-01-01T00:00:03.000Z')
  });

  queue.clear('task-b');
  assert.equal((await queue.dequeue('task-b')), undefined);
  assert.equal((await queue.dequeue('task-a'))?.message.type, 'kept');

  await queue.enqueue('task-c', {
    taskId: 'task-c',
    message: { type: 'clear-all' },
    timestamp: new Date('2026-01-01T00:00:04.000Z')
  });
  queue.clear();
  assert.equal((await queue.dequeue('task-c')), undefined);
});

test('TaskStore emits lifecycle events and handles missing updates', () => {
  const store = new TaskStore();
  const created = [];
  const updated = [];

  store.on('created', (task) => created.push(task.id));
  store.on('updated', (task) => updated.push(task.status));

  store.createTask('task-1', { metadata: { source: 'test' } });
  store.setStatus('task-1', 'running');
  store.failTask('task-1', 'boom', { failed: true });
  store.cancelTask('task-1', 'stop');
  store.completeTask('task-1', { done: true });

  assert.deepEqual(created, ['task-1']);
  assert.deepEqual(updated, ['running', 'failed', 'cancelled', 'completed']);
  assert.equal(store.updateTask('missing', { status: 'running' }), null);
  assert.equal(store.getTask('missing'), null);
  assert.equal(store.listTasks().length, 1);

  store.clear();
  assert.equal(store.listTasks().length, 0);
});

test('attachMcpHandlers handles missing handlers, pass-through, and errors', async () => {
  const client = new EventEmitter();
  const responses = [];

  const dispose = attachMcpHandlers(client, {
    pass: () => ({ jsonrpc: '2.0', result: { ok: true }, id: 99 }),
    raw: () => 'value',
    boom: () => {
      throw new Error('failure');
    }
  });

  const respond = async (body) => {
    responses.push(body);
  };

  client.emit('mcp_message', { serverName: 'unknown', message: {}, respond });
  client.emit('mcp_message', { serverName: 'pass', message: { id: 10 }, respond });
  client.emit('mcp_message', { serverName: 'raw', message: {}, respond });
  client.emit('mcp_message', { serverName: 'boom', message: { id: 7 }, respond });

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(responses.length, 4);
  assert.ok(responses.some((response) =>
    response.jsonrpc === '2.0' &&
    response.id === 0 &&
    response.result &&
    Object.keys(response.result).length === 0
  ));
  assert.ok(responses.some((response) =>
    response.jsonrpc === '2.0' &&
    response.id === 99 &&
    response.result &&
    response.result.ok === true
  ));
  assert.ok(responses.some((response) =>
    response.jsonrpc === '2.0' &&
    response.id === 0 &&
    response.result === 'value'
  ));
  assert.ok(responses.some((response) =>
    response.jsonrpc === '2.0' &&
    response.id === 7 &&
    response.error &&
    response.error.code === -32000 &&
    response.error.message === 'failure'
  ));

  dispose();
  client.emit('mcp_message', { serverName: 'unknown', message: {}, respond });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(responses.length, 4);
});

test('listProjects and listProjectsAsync read valid and fallback indexes', async () => {
  const { root, claudeProjectsDir } = await createClaudeFixtureRoot();
  const projectA = join(root, 'workspace-a');
  const projectB = join(root, 'workspace-b');

  const storageA = await writeSessionProject(root, projectA, [
    {
      sessionId: 'a-1',
      fullPath: join(claudeProjectsDir, 'a-1.jsonl'),
      fileMtime: 100,
      firstPrompt: 'one',
      messageCount: 1,
      created: '2026-01-01T00:00:00.000Z',
      modified: '2026-01-01T00:00:01.000Z',
      projectPath: projectA,
      isSidechain: false
    }
  ]);

  const storageB = join(root, '.claude', 'projects', escapeProjectPath(projectB));
  await mkdir(storageB, { recursive: true });
  await writeFile(join(storageB, 'sessions-index.json'), '{bad json', 'utf8');
  await writeFile(join(storageB, 'b-1.jsonl'), '{}\n', 'utf8');
  await writeFile(join(storageB, 'b-2.jsonl'), '{}\n', 'utf8');

  const now = new Date();
  await utimes(storageA, now, new Date(now.getTime() - 10_000));
  await utimes(storageB, now, now);

  const syncProjects = listProjects({ homeDir: root });
  const asyncProjects = await listProjectsAsync({ homeDir: root });

  assert.equal(syncProjects.length, 2);
  assert.equal(asyncProjects.length, 2);
  assert.equal(syncProjects[0].sessionCount, 2);
  assert.equal(syncProjects[0].path, projectB.replace(/[^a-zA-Z0-9]/g, '/'));
  assert.equal(syncProjects[1].path, projectA);
  assert.equal(asyncProjects[0].sessionCount, 2);
  assert.equal(asyncProjects[1].sessionCount, 1);
});

test('listSessions, getSessionDetails, and getMessagesSince handle edge cases', async () => {
  const { root } = await createClaudeFixtureRoot('claude-client-session-data-');
  const projectPath = join(root, 'proj');

  const sessionId = 's-1';
  await writeSessionProject(root, projectPath, [
    {
      sessionId,
      fullPath: 'ignored',
      fileMtime: 100,
      firstPrompt: 'hello',
      messageCount: 2,
      created: '2026-01-01T00:00:00.000Z',
      modified: '2026-01-01T00:00:03.000Z',
      projectPath,
      isSidechain: false
    },
    {
      sessionId: 's-2',
      fullPath: 'ignored',
      fileMtime: 90,
      firstPrompt: 'older',
      messageCount: 1,
      created: '2026-01-01T00:00:00.000Z',
      modified: '2026-01-01T00:00:02.000Z',
      projectPath,
      isSidechain: false
    }
  ], {
    [sessionId]: [
      JSON.stringify({ type: 'summary', summary: 'Session Summary', timestamp: '2026-01-01T00:00:00.000Z' }),
      '{invalid-json',
      JSON.stringify({
        type: 'user',
        sessionId,
        timestamp: '2026-01-01T00:00:01.000Z',
        gitBranch: 'main',
        message: { role: 'user', content: [{ type: 'text', text: 'Hi' }] }
      }),
      JSON.stringify({
        type: 'assistant',
        sessionId,
        timestamp: '2026-01-01T00:00:03.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] }
      })
    ]
  });

  const sessions = await listSessions(projectPath, { homeDir: root });
  assert.deepEqual(sessions.map((session) => session.sessionId), ['s-1', 's-2']);
  assert.deepEqual(await listSessions(join(root, 'missing'), { homeDir: root }), []);

  const details = getSessionDetails(sessionId, projectPath, { homeDir: root });
  assert.ok(details);
  assert.equal(details.summary, 'Session Summary');
  assert.equal(details.gitBranch, 'main');
  assert.equal(details.messageCount, 2);
  assert.equal(details.messages.length, 3);

  const asyncDetails = await getSessionDetailsAsync(sessionId, projectPath, { homeDir: root });
  assert.ok(asyncDetails);
  assert.equal(asyncDetails.messageCount, 2);

  const since = new Date('2026-01-01T00:00:01.500Z');
  const recent = getMessagesSince(sessionId, projectPath, since, { homeDir: root });
  assert.equal(recent.length, 1);
  assert.equal(recent[0].type, 'assistant');

  assert.equal(getSessionDetails('missing', projectPath, { homeDir: root }), null);
  assert.equal(await getSessionDetailsAsync('missing', projectPath, { homeDir: root }), null);
});

test('normalizeClaudeSessionMessages handles mixed content and unresolved approvals', () => {
  const rawMessages = [
    {
      type: 'summary',
      sessionId: 'session-1',
      uuid: 'summary-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      summary: 'Top Summary'
    },
    {
      type: 'queue-operation',
      sessionId: 'session-1',
      uuid: 'ignored-queue',
      timestamp: '2026-01-01T00:00:00.500Z'
    },
    {
      type: 'assistant',
      sessionId: 'session-1',
      uuid: 'assistant-1',
      timestamp: '2026-01-01T00:00:01.000Z',
      todos: [{ status: 'in_progress', content: 'Implement tests' }],
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Thinking...' },
          { type: 'text', text: 'Hello world' },
          { type: 'tool_use', id: 'tool-open', name: 'Bash', input: { command: 'ls' } },
          { type: 'unknown_block', value: { a: 1 } }
        ]
      }
    },
    {
      type: 'assistant',
      sessionId: 'session-1',
      uuid: 'assistant-2',
      timestamp: '2026-01-01T00:00:02.000Z',
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tool-done', name: 'Read', input: { path: '/tmp' } },
          { type: 'tool_result', tool_use_id: 'tool-done', content: 'ok', is_error: false }
        ]
      }
    },
    {
      type: 'assistant',
      sessionId: 'session-1',
      uuid: 'assistant-3',
      timestamp: '2026-01-01T00:00:03.000Z',
      toolUseResult: { output: 'ERROR: denied' },
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tool-open', name: 'Bash', input: { command: 'ls' } }
        ]
      }
    },
    {
      type: 'assistant',
      sessionId: 'session-1',
      uuid: 'assistant-4',
      timestamp: '2026-01-01T00:00:04.000Z',
      toolUseResult: { output: 'ERROR: denied' },
      message: {
        role: 'assistant',
        content: []
      }
    },
    {
      type: 'file-history-snapshot',
      sessionId: 'session-1',
      uuid: 'ignored-snapshot',
      timestamp: '2026-01-01T00:00:03.500Z'
    }
  ];

  const normalized = normalizeClaudeSessionMessages(rawMessages);

  assert.ok(normalized.some((message) => message.content[0].type === 'thinking'));
  assert.ok(normalized.some((message) => message.content[0].type === 'tool_result'));
  assert.ok(normalized.some((message) => message.content[0].type === 'plan'));
  assert.ok(normalized.some((message) => {
    const block = message.content[0];
    return block.type === 'approval_needed' && block.payload.toolUseId === 'tool-open';
  }));
  assert.equal(normalized.some((message) => message.itemId.includes('ignored-queue')), false);
  assert.equal(normalized.some((message) => message.itemId.includes('ignored-snapshot')), false);
});

test('listClaudeSessionSummaries and readClaudeSessionRecord shape browser payloads', async () => {
  const { root } = await createClaudeFixtureRoot('claude-client-browser-');
  const projectPath = join(root, 'project');
  const sessionId = 'claude-session-1';

  await writeSessionProject(root, projectPath, [
    {
      sessionId,
      fullPath: 'unused',
      fileMtime: 100,
      firstPrompt: '',
      messageCount: 1,
      created: '2026-01-01T00:00:00.000Z',
      modified: '2026-01-01T00:00:01.000Z',
      projectPath,
      isSidechain: false
    }
  ], {
    [sessionId]: [
      JSON.stringify({
        type: 'user',
        sessionId,
        timestamp: '2026-01-01T00:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'First prompt' }] }
      })
    ]
  });

  const summaries = await listClaudeSessionSummaries(projectPath, { homeDir: root });
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].title, 'Claude session');
  assert.equal(summaries[0].provider, 'claude');

  const record = await readClaudeSessionRecord(sessionId, projectPath, { homeDir: root });
  assert.ok(record);
  assert.equal(record.provider, 'claude');
  assert.equal(record.title, 'First prompt');
  assert.equal(record.messages.length >= 1, true);

  const missing = await readClaudeSessionRecord('missing', projectPath, { homeDir: root });
  assert.equal(missing, null);
});

test('SessionWatcher utility methods track ownership and internal cleanup', async () => {
  const originalHome = process.env.HOME;
  const { root } = await createClaudeFixtureRoot('claude-client-watcher-');
  process.env.HOME = root;
  try {
    const projectPath = join(root, 'watch-project');
    await writeSessionProject(root, projectPath, [
      {
        sessionId: 'watch-1',
        fullPath: 'unused',
        fileMtime: 100,
        firstPrompt: 'watch',
        messageCount: 1,
        created: '2026-01-01T00:00:00.000Z',
        modified: '2026-01-01T00:00:01.000Z',
        projectPath,
        isSidechain: false
      }
    ]);

    const watcher = new SessionWatcher();

    watcher.markAsOwned('s-1');
    assert.equal(watcher.ownedSessions.has('s-1'), true);
    watcher.unmarkAsOwned('s-1');
    assert.equal(watcher.ownedSessions.has('s-1'), false);

    const before = watcher.getPollInterval('/project');
    watcher.recordActivity('/project');
    const after = watcher.getPollInterval('/project');
    assert.equal(before >= after, true);

    await watcher.updateKnownState(projectPath);
    const known = watcher.lastKnownState.get(projectPath);
    assert.equal(known.get('watch-1'), 100);

    await writeSessionProject(root, projectPath, [
      {
        sessionId: 'watch-1',
        fullPath: 'unused',
        fileMtime: 200,
        firstPrompt: 'watch',
        messageCount: 1,
        created: '2026-01-01T00:00:00.000Z',
        modified: '2026-01-01T00:00:02.000Z',
        projectPath,
        isSidechain: false
      },
      {
        sessionId: 'watch-owned',
        fullPath: 'unused',
        fileMtime: 300,
        firstPrompt: 'owned',
        messageCount: 1,
        created: '2026-01-01T00:00:00.000Z',
        modified: '2026-01-01T00:00:03.000Z',
        projectPath,
        isSidechain: false
      }
    ]);

    const events = [];
    watcher.on('session_new', (entry) => events.push({ type: 'new', id: entry.sessionId }));
    watcher.on('session_updated', (entry) => events.push({ type: 'updated', id: entry.sessionId }));
    watcher.markAsOwned('watch-owned');

    await watcher.checkForChanges(projectPath);
    assert.ok(events.some((event) => event.type === 'updated' && event.id === 'watch-1'));
    assert.equal(events.some((event) => event.id === 'watch-owned'), false);

    watcher.startPolling(projectPath);
    watcher.unwatchProject(projectPath);

    // Verify missing storage path short-circuits without throwing.
    watcher.watchProject('/this/project/does/not/exist');

    const fakeWatcher = { closed: false, close() { this.closed = true; } };
    watcher.watchers.set('/project-a', fakeWatcher);
    watcher.pollTimers.set('/project-a', setTimeout(() => {}, 60_000));
    watcher.lastKnownState.set('/project-a', new Map([['s-1', 100]]));

    watcher.unwatchProject('/project-a');
    assert.equal(watcher.watchers.has('/project-a'), false);
    assert.equal(watcher.pollTimers.has('/project-a'), false);
    assert.equal(watcher.lastKnownState.has('/project-a'), false);
    assert.equal(fakeWatcher.closed, true);

    const fakeWatcherB = { close() {} };
    watcher.watchers.set('/project-b', fakeWatcherB);
    watcher.close();
    assert.equal(watcher.watchers.size, 0);
  } finally {
    process.env.HOME = originalHome;
  }
});