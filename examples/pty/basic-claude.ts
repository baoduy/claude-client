// examples/pty/basic-claude.ts
//
// Spawn `claude` in a real PTY, pipe its output to stdout, and forward
// stdin keystrokes (and SIGWINCH resize events) back into the PTY.
// Run with:
//   npm run build && node --import tsx examples/pty/basic-claude.ts
//
// You can ^C to kill, or type /exit inside the Claude UI.

import { createPtyClient } from '@baoduy2412/ai-cli-client';

async function main() {
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows    || 24;

  const pty = await createPtyClient({
    provider: 'claude',
    cwd: process.cwd(),
    cols,
    rows,
  });

  pty.on('data',  (bytes: Buffer) => process.stdout.write(bytes));
  pty.on('exit',  (code) => { process.exit(code ?? 0); });
  pty.on('error', (err)  => { console.error('PTY error:', err); process.exit(1); });

  // Forward stdin to the PTY in raw mode.
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on('data', (chunk: Buffer) => pty.write(chunk));

  // Forward terminal resize.
  process.stdout.on('resize', () => {
    pty.resize(process.stdout.columns ?? cols, process.stdout.rows ?? rows);
  });
}

main().catch((err) => { console.error(err); process.exit(1); });
