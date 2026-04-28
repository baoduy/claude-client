#!/usr/bin/env node
/**
 * Smoke test against a real Copilot CLI. Skips silently if no credentials.
 *   COPILOT_GITHUB_TOKEN or GH_TOKEN must be set, OR the user has previously
 *   run `copilot login` and the credential is in the system keychain.
 *
 * Usage: node scripts/integration-copilot-smoke.mjs
 */
import { CopilotClient } from '../dist/esm/copilot/index.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT_DIR = 'test-output/copilot-smoke';
await mkdir(OUT_DIR, { recursive: true });

const hasToken = !!(process.env.COPILOT_GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
if (!hasToken) {
  console.log('SKIP: no Copilot credentials in env (set COPILOT_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN).');
  process.exit(0);
}

const client = new CopilotClient({ cwd: process.cwd() });
const captured = [];
client.on('output_delta', d => captured.push({ kind: 'output_delta', d }));
client.on('result',       s => captured.push({ kind: 'result', text: s.text }));
client.on('error',        e => captured.push({ kind: 'error', message: e.message }));

try {
  await client.start();
  console.log('Session:', client.sessionId);

  const turn = client.send('Reply with the single word: pong');
  for await (const u of turn.updates()) {
    if (u.kind === 'output') process.stdout.write(u.delta);
  }
  process.stdout.write('\n');

  const final = await turn.done;
  await writeFile(join(OUT_DIR, 'transcript.json'), JSON.stringify({ final, captured }, null, 2));
  console.log('Final text:', final.text.slice(0, 200));
} finally {
  await client.close();
}
