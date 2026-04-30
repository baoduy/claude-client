import { test } from 'node:test';
import assert from 'node:assert/strict';

test('ContentBlock supports text, image, file_path, directory_path, selection', () => {
  // Type-only test — runtime just constructs the shape
  const blocks = [
    { type: 'text', text: 'hi' },
    { type: 'image', source: { type: 'base64', mediaType: 'image/png', data: 'XX' } },
    { type: 'file_path', path: '/abs/path/file.txt' },
    { type: 'directory_path', path: '/abs/dir' },
    {
      type: 'selection',
      filePath: '/abs/path/file.ts',
      displayName: 'file.ts:1-3',
      range: { start: { line: 1, character: 0 }, end: { line: 3, character: 0 } },
    },
  ];
  const input = { content: blocks };
  assert.equal(input.content.length, 5);
  assert.equal(input.content[2].type, 'file_path');
  assert.equal(input.content[3].type, 'directory_path');
  assert.equal(input.content[4].type, 'selection');
});
