// src/pty/client.ts
import { EventEmitter } from 'node:events';
import type { PtyClient } from './types.js';

/**
 * Minimal subset of node-pty's IPty surface we depend on. Lets us
 * inject mocks in tests without depending on node-pty types here.
 */
interface PtyHandle {
  pid: number;
  cols: number;
  rows: number;
  write(data: string | Buffer): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(cb: (data: string) => void): void;
  onExit(cb: (e: { exitCode: number; signal?: number | string }) => void): void;
}

interface PtyModuleLike {
  spawn(
    bin: string,
    args: string[],
    opts: { cwd: string; cols: number; rows: number; env: NodeJS.ProcessEnv; name?: string },
  ): PtyHandle;
}

export interface PtyClientImplOptions {
  provider: 'claude' | 'copilot';
  pty: PtyModuleLike;
  bin: string;
  args: string[];
  cwd: string;
  cols: number;
  rows: number;
  env: NodeJS.ProcessEnv;
}

/**
 * Provider-agnostic PTY client wrapping a node-pty IPty handle.
 * Constructed by the factory; not exported as a public class.
 */
export class PtyClientImpl extends EventEmitter implements PtyClient {
  readonly provider: 'claude' | 'copilot';
  private _pid: number | null = null;
  private _cols: number;
  private _rows: number;
  private readonly opts: PtyClientImplOptions;
  private handle: PtyHandle | null = null;

  constructor(opts: PtyClientImplOptions) {
    super();
    this.opts = opts;
    this.provider = opts.provider;
    this._cols = opts.cols;
    this._rows = opts.rows;
  }

  get pid(): number | null { return this._pid; }
  get cols(): number { return this._cols; }
  get rows(): number { return this._rows; }

  async start(): Promise<void> {
    if (this.handle) return;
    const handle = this.opts.pty.spawn(this.opts.bin, this.opts.args, {
      cwd: this.opts.cwd,
      cols: this.opts.cols,
      rows: this.opts.rows,
      env: this.opts.env,
      name: 'xterm-256color',
    });
    this.handle = handle;
    this._pid = handle.pid;
    handle.onData((data) => {
      this.emit('data', Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'));
    });
    handle.onExit(({ exitCode, signal }) => {
      this._pid = null;
      const sig = typeof signal === 'string' ? (signal as NodeJS.Signals) : null;
      const code = typeof exitCode === 'number' ? exitCode : null;
      this.emit('exit', code, sig);
    });
  }

  write(data: string | Buffer): void {
    this.handle?.write(data);
  }

  resize(cols: number, rows: number): void {
    this._cols = cols;
    this._rows = rows;
    this.handle?.resize(cols, rows);
  }

  kill(signal: NodeJS.Signals = 'SIGHUP'): void {
    this.handle?.kill(signal);
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.handle || this._pid === null) { resolve(); return; }
      this.once('exit', () => resolve());
      this.handle.kill('SIGHUP');
    });
  }
}
