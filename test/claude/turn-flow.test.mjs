import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ClaudeClient } from '../../dist/esm/index.js';

function createClient() {
  const client = new ClaudeClient({ cwd: process.cwd() });
  const sentMessages = [];
  const controlResponses = [];

  client.sendMessage = async (text) => {
    sentMessages.push({ type: 'text', text });
  };

  client.sendMessageWithContent = async (content) => {
    sentMessages.push({ type: 'content', content });
  };

  client.sendControlResponse = async (requestId, responseData) => {
    controlResponses.push({ requestId, responseData });
  };

  client.interrupt = async () => {};
  client.setPermissionMode = async () => {};
  client.setModel = async () => {};
  client.setMaxThinkingTokens = async () => {};
  client.listSupportedModels = async () => ({ models: [], defaultModel: null, raw: {} });

  return { client, sentMessages, controlResponses };
}

test('ClaudeClient streams updates without polling', async () => {
  const { client, sentMessages } = createClient();

  const turn = client.send('Hello Claude');
  assert.equal(sentMessages.length, 1);
  assert.deepEqual(sentMessages[0], { type: 'text', text: 'Hello Claude' });

  client.emit('stream_event', {
    type: 'stream_event',
    session_id: 'session-1',
    parent_tool_use_id: null,
    uuid: 'stream-1',
    event: { type: 'message_start', message: {} }
  });
  client._accumulatedText = 'Hello';
  client.emit('text', 'Hello');
  client._accumulatedThinking = 'Thinking';
  client.emit('reasoning', 'Thinking');

  const snapshot = turn.current();
  assert.equal(snapshot.status, 'running');
  assert.equal(snapshot.text, 'Hello');
  assert.equal(snapshot.thinking, 'Thinking');
  assert.equal(snapshot.currentOutputKind, 'thinking');

  client.emit('result', {
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 12,
    duration_api_ms: 8,
    num_turns: 1,
    result: 'Completed'
  });

  const completed = await turn.done;
  assert.equal(completed.status, 'completed');
  assert.equal(completed.result.result, 'Completed');
});

test('ClaudeClient queues turns and starts the next after result', async () => {
  const { client, sentMessages } = createClient();

  const first = client.send('First');
  const second = client.send('Second');

  assert.equal(first.current().status, 'running');
  assert.equal(second.current().status, 'queued');
  assert.equal(sentMessages.length, 1);

  client.emit('result', {
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 10,
    duration_api_ms: 5,
    num_turns: 1,
    result: 'done'
  });

  await first.done;
  assert.equal(sentMessages.length, 2);
  assert.deepEqual(sentMessages[1], { type: 'text', text: 'Second' });
  assert.equal(second.current().status, 'running');
});

test('ClaudeClient exposes and resolves tool approval requests', async () => {
  const { client, controlResponses } = createClient();

  const turn = client.send('Run a command');

  client.emit('control_request', {
    type: 'control_request',
    request_id: 'sdk-req-1',
    request: {
      subtype: 'can_use_tool',
      tool_name: 'Bash',
      tool_use_id: 'tool-1',
      input: { command: 'ls' },
      permission_suggestions: [{ type: 'allow_always', description: 'Always allow' }],
      decision_reason: 'Need shell access'
    }
  });

  const openRequests = client.getOpenRequests();
  assert.equal(openRequests.length, 1);
  assert.equal(openRequests[0].kind, 'tool_approval');
  assert.equal(openRequests[0].toolName, 'Bash');
  assert.equal(turn.getOpenRequests().length, 1);

  await client.approveRequest(openRequests[0].id, { always: true });

  assert.equal(controlResponses.length, 1);
  assert.equal(controlResponses[0].requestId, 'sdk-req-1');
  assert.equal(controlResponses[0].responseData.behavior, 'allow');
  assert.equal(controlResponses[0].responseData.toolUseID, 'tool-1');
  assert.equal(client.getOpenRequests().length, 0);
});

test('ClaudeClient answers AskUserQuestion requests', async () => {
  const { client, controlResponses } = createClient();

  client.send('Ask me something');

  client.emit('control_request', {
    type: 'control_request',
    request_id: 'sdk-question-1',
    request: {
      subtype: 'can_use_tool',
      tool_name: 'AskUserQuestion',
      input: {
        questions: [
          {
            header: 'Color',
            question: 'Pick a color',
            options: ['Red', 'Blue']
          },
          {
            header: 'Pets',
            question: 'Pick pets',
            options: ['Cat', 'Dog'],
            multiSelect: true
          }
        ]
      }
    }
  });

  const request = client.getOpenRequests()[0];
  assert.equal(request.kind, 'question');
  assert.equal(request.questions.length, 2);

  await client.answerQuestion(request.id, {
    Color: 'Blue',
    Pets: ['Cat', 'Dog']
  });

  assert.equal(controlResponses.length, 1);
  assert.equal(controlResponses[0].requestId, 'sdk-question-1');
  assert.deepEqual(controlResponses[0].responseData.updatedInput, {
    question: 'Color, Pets',
    answers: {
      Color: 'Blue',
      Pets: ['Cat', 'Dog']
    }
  });
  assert.equal(client.getOpenRequests().length, 0);
});

test('ClaudeClient attaches to an existing waiting turn and answers questions', async () => {
  const { client, controlResponses } = createClient();

  client.emit('control_request', {
    type: 'control_request',
    request_id: 'sdk-question-remote',
    request: {
      subtype: 'can_use_tool',
      tool_name: 'AskUserQuestion',
      input: {
        questions: [
          {
            header: 'Resume',
            question: 'Resume the waiting session?',
            options: ['Yes', 'No']
          }
        ]
      }
    }
  });

  const [request] = client.getOpenRequests();
  assert.equal(request.kind, 'question');
  assert.equal(client.getCurrentTurnDetailed()?.metadata?.synthetic, true);
  assert.equal(client.getCurrentTurnDetailed()?.metadata?.resumed, true);

  await client.answerQuestion(request.id, 'Yes');

  assert.equal(controlResponses.length, 1);
  assert.equal(controlResponses[0].requestId, 'sdk-question-remote');
  assert.deepEqual(controlResponses[0].responseData.updatedInput, {
    question: 'Resume the waiting session?',
    answers: {
      Resume: 'Yes'
    }
  });
  assert.equal(client.getOpenRequests().length, 0);
});

test('ClaudeClient supports incremental question sessions', async () => {
  const { client, controlResponses } = createClient();

  client.send('Ask me something else');

  client.emit('control_request', {
    type: 'control_request',
    request_id: 'sdk-question-2',
    request: {
      subtype: 'can_use_tool',
      tool_name: 'AskUserQuestion',
      input: {
        questions: [
          {
            id: 'color-id',
            header: 'Color',
            question: 'Pick a color',
            options: ['Red', 'Blue']
          },
          {
            id: 'pets-id',
            header: 'Pets',
            question: 'Pick pets',
            options: ['Cat', 'Dog'],
            multiSelect: true
          }
        ]
      }
    }
  });

  const [request] = client.getOpenRequests();
  const session = client.createQuestionSession(request.id);

  assert.equal(session.getCurrentQuestion()?.id, 'color-id');
  session.setCurrentAnswer('Blue');
  session.next();
  session.setAnswer('pets-id', ['Cat', 'Dog']);

  assert.deepEqual(session.current().answers, {
    'color-id': 'Blue',
    'pets-id': ['Cat', 'Dog']
  });

  await session.submit();

  assert.equal(controlResponses.length, 1);
  assert.deepEqual(controlResponses[0].responseData.updatedInput, {
    question: 'Color, Pets',
    answers: {
      Color: 'Blue',
      Pets: ['Cat', 'Dog']
    }
  });
});

test('ClaudeClient.init returns a ClaudeClient instance', async () => {
  const originalStart = ClaudeClient.prototype.start;
  ClaudeClient.prototype.start = async function start() {};

  try {
    const client = await ClaudeClient.init({ cwd: process.cwd() });
    assert.ok(client instanceof ClaudeClient);
    client.kill();
  } finally {
    ClaudeClient.prototype.start = originalStart;
  }
});
