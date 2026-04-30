// examples/pty/electron-main.ts
//
// Sketch of the Electron main-process integration. Demonstrates the IPC
// pattern for forwarding bytes between the PTY and the renderer process.
// Renderer rendering (xterm.js or custom TUI) is intentionally out of scope.
//
// Wiring:
//   - main process owns the PtyClient (this file)
//   - IPC channel "pty:data"   — main → renderer (Buffer)
//   - IPC channel "pty:exit"   — main → renderer ({code, signal})
//   - IPC channel "pty:input"  — renderer → main (Buffer of keystrokes)
//   - IPC channel "pty:resize" — renderer → main ({cols, rows})

import { app, BrowserWindow, ipcMain } from 'electron';
import { createPtyClient, type PtyClient } from '@drunkcoding/ai-cli-clients';

let pty: PtyClient | null = null;

async function createPty(window: BrowserWindow) {
  pty = await createPtyClient({
    provider: 'claude',           // or 'copilot'
    cwd: app.getPath('userData'),
    cols: 120,
    rows: 30,
  });

  pty.on('data', (bytes) => window.webContents.send('pty:data', bytes));
  pty.on('exit', (code, signal) => window.webContents.send('pty:exit', { code, signal }));

  ipcMain.on('pty:input',  (_, chunk: Buffer)              => pty?.write(chunk));
  ipcMain.on('pty:resize', (_, cols: number, rows: number) => pty?.resize(cols, rows));
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 800 });
  await win.loadFile('renderer.html');
  await createPty(win);
});

app.on('window-all-closed', async () => {
  await pty?.close();
  if (process.platform !== 'darwin') app.quit();
});
