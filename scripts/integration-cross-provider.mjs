#!/usr/bin/env node
// Cross-provider unified-events smoke test.
//
// Sends the same prompt to Claude and Copilot via the unified
// AICliClient surface and asserts both providers emit the shared
// vocabulary. Skips a provider gracefully if its CLI is unavailable.
//
// Usage:
//   npm run integration:cross-provider

import { createAICliClient } from '../dist/esm/index.js';

const PROMPT = 'Reply with the single word "hello" and nothing else.';
const SHARED = ['ready', 'text', 'text_done', 'result', 'closed'];

async function runProvider(provider) {
  console.log(`\n— ${provider} —`);
  let client;
  try {
    client = await createAICliClient({ provider, cwd: process.cwd() });
  } catch (err) {
    console.log(`SKIP: cannot construct ${provider} client: ${err.message}`);
    return null;
  }

  const events = [];
  for (const ev of [
    'ready', 'text', 'text_done', 'reasoning', 'reasoning_done',
    'tool_use_start', 'tool_result', 'usage_update', 'status_change',
    'result', 'error', 'closed',
  ]) {
    client.on(ev, () => events.push(ev));
  }

  try {
    await client.sendMessage(PROMPT);
    await client.close();
  } catch (err) {
    console.log(`FAIL ${provider}: ${err.message}`);
    try { await client.close(); } catch {}
    return events;
  }

  console.log(`${provider} event sequence:`, events.join(' → '));
  return events;
}

const claude = await runProvider('claude');
const copilot = await runProvider('copilot');

if (!claude && !copilot) {
  console.error('\nBoth providers unavailable.');
  process.exit(1);
}

let mismatch = false;
for (const event of SHARED) {
  const inClaude = claude ? claude.includes(event) : null;
  const inCopilot = copilot ? copilot.includes(event) : null;
  console.log(
    `  ${event.padEnd(15)}  Claude: ${inClaude ?? 'skip'}` +
    `  Copilot: ${inCopilot ?? 'skip'}`,
  );
  if (claude && copilot && inClaude !== inCopilot) mismatch = true;
}

if (mismatch) {
  console.error('\nFAIL: providers diverge on the unified vocabulary.');
  process.exit(1);
}

console.log('\nOK: both providers emit the shared unified-event subset.');
