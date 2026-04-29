// src/pty/types.ts

/**
 * Provider-agnostic PTY client. Pure passthrough — the underlying CLI
 * runs in a real pseudo-terminal; this client exposes raw bytes,
 * write, resize, kill, exit. The library does NOT render. Consumers
 * (typically Electron daemons) forward bytes to their own renderer.
 *
 * Not related to AICliClient — that's the structured surface for
 * non-TTY consumers. PTY mode and structured mode are distinct.
 */
export interface PtyClient {
  /** Runtime discriminator. Mirrors PtyClientConfig.provider. */
  readonly provider: 'claude' | 'copilot';
  /** OS process id once started. Null before start, after exit. */
  readonly pid: number | null;
  /** Current PTY columns. Updated by resize(). */
  readonly cols: number;
  /** Current PTY rows. Updated by resize(). */
  readonly rows: number;

  /** Idempotent. Factory already calls this; safe to call again. */
  start(): Promise<void>;
  /** Sync passthrough to node-pty. */
  write(data: string | Buffer): void;
  /** Sync. Updates cols/rows and forwards to the inner PTY. */
  resize(cols: number, rows: number): void;
  /** Sync fire-and-forget signal. Default 'SIGHUP'. */
  kill(signal?: NodeJS.Signals): void;
  /** Graceful: SIGHUP + await 'exit'. */
  close(): Promise<void>;

  on(event: 'data',  listener: (data: Buffer) => void): this;
  on(event: 'exit',  listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  off(event: string, listener: (...args: unknown[]) => void): this;
}

export interface PtyCommonConfig {
  /** Working directory of the spawned process. Default: process.cwd(). */
  cwd?: string;
  /** Initial PTY columns. Default: 80. */
  cols?: number;
  /** Initial PTY rows. Default: 24. */
  rows?: number;
  /** Merged onto process.env. */
  env?: Record<string, string>;
  /** Override the binary path. Default: provider's name on PATH. */
  bin?: string;
  /** Appended after mapped flags. Escape hatch for unmapped flags. */
  extraArgs?: string[];
}

export interface ClaudePtyConfig extends PtyCommonConfig {
  /** → --model <value>. Omitted if absent (CLI default applies). */
  model?: string;
  /** → --permission-mode <value>. */
  permissionMode?:
    | 'default' | 'acceptEdits' | 'auto'
    | 'plan'    | 'dontAsk'     | 'bypassPermissions';
}

export interface CopilotPtyConfig extends PtyCommonConfig {
  /** → --model <value>. */
  model?: string;
  /** → repeated --allow-tool <pattern>. */
  allowTools?: string[];
  /** → repeated --deny-tool <pattern>. */
  denyTools?: string[];
  /** → --allow-all (alias of --yolo). */
  allowAll?: boolean;
  /** → --allow-all-paths. */
  allowAllPaths?: boolean;
  /** → --allow-all-urls. */
  allowAllUrls?: boolean;
  /** → --no-ask-user. */
  noAskUser?: boolean;
  /** → repeated --add-dir <path>. */
  addDir?: string[];
}

export type PtyClientConfig =
  | ({ provider: 'claude' }  & ClaudePtyConfig)
  | ({ provider: 'copilot' } & CopilotPtyConfig);
