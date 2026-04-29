import test from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeClient } from '../dist/esm/claude/client.js';
import { CopilotClient } from '../dist/esm/copilot/client.js';

const UNIFIED_EVENTS = [
  'ready',
  'text',
  'text_done',
  'reasoning',
  'reasoning_done',
  'tool_use_start',
  'tool_result',
  'usage_update',
  'status_change',
  'result',
  'error',
  'closed',
];

const PROVIDER_FACTORIES = [
  ['ClaudeClient', () => new ClaudeClient({ cwd: '/tmp', sessionId: 'test' })],
  ['CopilotClient', () => new CopilotClient({ cwd: '/tmp' })],
];

for (const [name, factory] of PROVIDER_FACTORIES) {
  test(`${name}: on() accepts every unified event without throwing`, () => {
    const client = factory();
    for (const ev of UNIFIED_EVENTS) {
      assert.doesNotThrow(
        () => client.on(ev, () => {}),
        `${name}.on('${ev}', ...) should accept`,
      );
    }
  });

  test(`${name}: off() removes a registered listener`, () => {
    const client = factory();
    let called = 0;
    const fn = () => { called += 1; };
    client.on('text', fn);
    client.off('text', fn);
    client.emit('text', 'hello');
    assert.equal(called, 0, `${name} listener should not fire after off()`);
  });
}
