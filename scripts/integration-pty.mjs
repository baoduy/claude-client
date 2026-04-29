#!/usr/bin/env node
// scripts/integration-pty.mjs
//
// Integration smoke for the PTY transport. Skips silently when:
//   - node-pty is not installed (peer dep)
//   - the target binary is not on PATH
//   - the binary requires auth and credentials are absent (we still try once
//     and tolerate non-zero exit as long as some output came through)
//
// Usage:
//   npm run integration:pty
//   PTY_PROVIDER=claude npm run integration:pty   # only run claude
//   PTY_PROVIDER=copilot npm run integration:pty  # only run copilot

import { createPtyClient, PtyDependencyMissingError, PtyBinaryNotFoundError }
  from '../dist/esm/pty/index.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT_DIR = 'test-output/pty-smoke';
await mkdir(OUT_DIR, { recursive: true });

const which = process.env.PTY_PROVIDER;
const providers = which ? [which] : ['claude', 'copilot'];

let anyRan = false;

for (const provider of providers) {
  process.stdout.write(`\n--- ${provider} ---\n`);
  let client;
  try {
    client = await createPtyClient({ provider, cwd: process.cwd(), cols: 100, rows: 30 });
  } catch (err) {
    if (err instanceof PtyDependencyMissingError) {
      console.log(`SKIP (${provider}): node-pty not installed.`);
      continue;
    }
    if (err instanceof PtyBinaryNotFoundError) {
      console.log(`SKIP (${provider}): binary "${err.bin}" not found on PATH.`);
      continue;
    }
    throw err;
  }
  anyRan = true;
  let bytes = 0;
  client.on('data', (b) => { bytes += b.length; });

  // Wait briefly for any startup output, then close gracefully.
  await new Promise((r) => setTimeout(r, 1500));
  await client.close();

  await writeFile(
    join(OUT_DIR, `${provider}.json`),
    JSON.stringify({ provider, bytes, pid: client.pid }, null, 2),
  );
  console.log(`${provider}: received ${bytes} bytes; exit OK.`);
  if (bytes === 0) {
    console.warn(`WARN (${provider}): no output captured. Binary may have exited immediately.`);
  }
}

if (!anyRan) {
  console.log('\nSKIP: no PTY providers were runnable in this environment.');
  process.exit(0);
}
console.log('\nDone.');
