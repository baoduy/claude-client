import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendInputToCopilotMessage } from '../../dist/esm/copilot/attachments.js';
import { UnsupportedContentError } from '../../dist/esm/unified/index.js';

test('plain string maps to prompt only', () => {
  const out = sendInputToCopilotMessage('hello');
  assert.deepEqual(out, { prompt: 'hello' });
});

test('text-only content concatenates prompt with no attachments', () => {
  const out = sendInputToCopilotMessage({
    content: [
      { type: 'text', text: 'hi ' },
      { type: 'text', text: 'there' },
    ],
  });
  assert.deepEqual(out, { prompt: 'hi there' });
});

test('image base64 → blob attachment', () => {
  const out = sendInputToCopilotMessage({
    content: [
      { type: 'text', text: 'describe' },
      { type: 'image', source: { type: 'base64', mediaType: 'image/png', data: 'AAA' } },
    ],
  });
  assert.deepEqual(out.attachments, [{ type: 'blob', data: 'AAA', mimeType: 'image/png' }]);
  assert.equal(out.prompt, 'describe');
});

test('file_path → file attachment', () => {
  const out = sendInputToCopilotMessage({
    content: [{ type: 'text', text: 'read' }, { type: 'file_path', path: '/x/y.txt' }],
  });
  assert.deepEqual(out.attachments, [{ type: 'file', path: '/x/y.txt' }]);
});

test('directory_path → directory attachment', () => {
  const out = sendInputToCopilotMessage({
    content: [{ type: 'directory_path', path: '/x' }],
  });
  assert.deepEqual(out.attachments, [{ type: 'directory', path: '/x' }]);
});

test('selection → selection attachment with mapped range', () => {
  const out = sendInputToCopilotMessage({
    content: [{
      type: 'selection',
      filePath: '/x/y.ts',
      displayName: 'y.ts:1-3',
      range: { start: { line: 1, character: 0 }, end: { line: 3, character: 0 } },
    }],
  });
  assert.deepEqual(out.attachments, [{
    type: 'selection',
    filePath: '/x/y.ts',
    displayName: 'y.ts:1-3',
    selection: { start: { line: 1, character: 0 }, end: { line: 3, character: 0 } },
  }]);
});

test('image url throws UnsupportedContentError (Copilot has no URL attachment)', () => {
  assert.throws(
    () => sendInputToCopilotMessage({
      content: [{ type: 'image', source: { type: 'url', url: 'https://x' } }],
    }),
    (err) => err instanceof UnsupportedContentError,
  );
});

test('empty content array throws UnsupportedContentError', () => {
  assert.throws(
    () => sendInputToCopilotMessage({ content: [] }),
    (err) => err instanceof UnsupportedContentError,
  );
});

test('{ text: ... } variant maps to prompt only', () => {
  const out = sendInputToCopilotMessage({ text: 'wrapped' });
  assert.deepEqual(out, { prompt: 'wrapped' });
});
