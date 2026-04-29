// examples/pty/basic-copilot.ts
//
// Spawn `copilot` in a real PTY. Otherwise identical to basic-claude.ts.
// Run with:
//   npm run build && node --import tsx examples/pty/basic-copilot.ts

import { createPtyClient } from '@baoduy2412/ai-cli-client';

async function main() {
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows    || 24;

  const pty = await createPtyClient({
    provider: 'copilot',
    cwd: process.cwd(),
    cols,
    rows,
  });

  pty.on('data',  (bytes: Buffer) => process.stdout.write(bytes));
  pty.on('exit',  (code) => { process.exit(code ?? 0); });
  pty.on('error', (err)  => { console.error('PTY error:', err); process.exit(1); });

  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on('data', (chunk: Buffer) => pty.write(chunk));

  process.stdout.on('resize', () => {
    pty.resize(process.stdout.columns ?? cols, process.stdout.rows ?? rows);
  });
}

main().catch((err) => { console.error(err); process.exit(1); });
