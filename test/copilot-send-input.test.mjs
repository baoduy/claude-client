import test from 'node:test';
import assert from 'node:assert/strict';
import { CopilotClient } from '../dist/esm/copilot/client.js';
import { UnsupportedContentError } from '../dist/esm/unified/errors.js';

// Construct without calling start() so the SDK transport never spawns.
// Calling send() without start() causes the async runTurn() to fail; we
// absorb that error so the synchronous validation behavior is what we test.
function newClient() {
  const c = new CopilotClient({ cwd: '/tmp' });
  c.on('error', () => {}); // absorb async "no session" errors
  return c;
}

test('CopilotClient.send accepts string without UnsupportedContentError', async () => {
  const client = newClient();
  let validationErr;
  try {
    const handle = client.send('hello');
    // wait for the resulting (expected non-validation) failure to drain
    await handle.done.catch(() => {});
  } catch (e) {
    if (e instanceof UnsupportedContentError) validationErr = e;
  }
  assert.equal(validationErr, undefined);
});

test('CopilotClient.send accepts {text} without UnsupportedContentError', async () => {
  const client = newClient();
  let validationErr;
  try {
    const handle = client.send({ text: 'hello' });
    await handle.done.catch(() => {});
  } catch (e) {
    if (e instanceof UnsupportedContentError) validationErr = e;
  }
  assert.equal(validationErr, undefined);
});

test('CopilotClient.send flattens text-only content blocks', async () => {
  const client = newClient();
  let validationErr;
  try {
    const handle = client.send({ content: [{ type: 'text', text: 'hello' }, { type: 'text', text: ' world' }] });
    await handle.done.catch(() => {});
  } catch (e) {
    if (e instanceof UnsupportedContentError) validationErr = e;
  }
  assert.equal(validationErr, undefined);
});

test('CopilotClient.send throws UnsupportedContentError on image block', () => {
  const client = newClient();
  assert.throws(
    () => client.send({ content: [{ type: 'image', source: { type: 'url', url: 'http://x' } }] }),
    (err) => {
      assert.ok(err instanceof UnsupportedContentError);
      assert.equal(err.provider, 'copilot');
      assert.equal(err.inputIndex, 0);
      assert.equal(err.unsupportedBlock.type, 'image');
      return true;
    },
  );
});

test('CopilotClient.send throws on image at index 1 with mixed content', () => {
  const client = newClient();
  assert.throws(
    () => client.send({
      content: [
        { type: 'text', text: 'hi' },
        { type: 'image', source: { type: 'url', url: 'http://x' } },
        { type: 'text', text: 'bye' },
      ],
    }),
    (err) => {
      assert.equal(err.inputIndex, 1);
      return true;
    },
  );
});

test('CopilotClient.send throws on empty content array', () => {
  const client = newClient();
  assert.throws(
    () => client.send({ content: [] }),
    (err) => err instanceof UnsupportedContentError,
  );
});

test('CopilotClient.sendMessage rejects synchronously on image block', () => {
  const client = newClient();
  assert.throws(
    () => client.sendMessage({ content: [{ type: 'image', source: { type: 'url', url: 'http://x' } }] }),
    (err) => err instanceof UnsupportedContentError,
  );
});

test('CopilotClient.queueMessage throws synchronously on image block', () => {
  const client = newClient();
  assert.throws(
    () => client.queueMessage({ content: [{ type: 'image', source: { type: 'url', url: 'http://x' } }] }),
    (err) => err instanceof UnsupportedContentError,
  );
});
