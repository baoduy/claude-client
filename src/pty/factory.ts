// src/pty/factory.ts
import { access } from 'node:fs/promises';
import type { PtyClient, PtyClientConfig } from './types.js';
import { PtyClientImpl, type PtyModuleLike } from './client.js';
import {
  PtyDependencyMissingError,
  PtyBinaryNotFoundError,
  PtySpawnError,
} from './errors.js';
import { buildClaudeArgs }  from './claude-args.js';
import { buildCopilotArgs } from './copilot-args.js';

/** Test-injection seam. Not part of the public API. */
export interface PtyFactoryInternals {
  loadPty?: () => Promise<PtyModuleLike>;
  exists?: (path: string) => Promise<boolean>;
}

let cachedPtyModule: PtyModuleLike | null = null;

async function defaultLoadPty(): Promise<PtyModuleLike> {
  if (cachedPtyModule) return cachedPtyModule;
  try {
    const mod = await import('node-pty');
    cachedPtyModule = mod as PtyModuleLike;
    return cachedPtyModule;
  } catch (err) {
    throw new PtyDependencyMissingError(
      'PTY mode requires node-pty. Install it as a peer dependency: ' +
      '`npm install node-pty`. For Electron apps, rebuild against your ' +
      'Electron version: `npx @electron/rebuild`.',
      { cause: err },
    );
  }
}

async function defaultExists(path: string): Promise<boolean> {
  // Absolute path — direct check.
  if (path.includes('/') || path.includes('\\')) {
    try { await access(path); return true; } catch { return false; }
  }
  // PATH lookup — let the OS resolve at spawn time. Treat as existing.
  return true;
}

/**
 * Construct and start a PTY-mode client for the chosen provider.
 * Spawns the provider's binary in a real pseudo-terminal via node-pty
 * and returns a started client emitting raw bytes.
 *
 * @param config - Discriminated by `provider`.
 * @param internals - Test-only injection. Do not pass in production code.
 *
 * @example
 * const pty = await createPtyClient({ provider: 'claude', cwd: process.cwd() });
 * pty.on('data', (b) => process.stdout.write(b));
 *
 * @throws {PtyDependencyMissingError} if node-pty is not installed.
 * @throws {PtyBinaryNotFoundError} if the provider's binary cannot be located.
 * @throws {PtySpawnError} if node-pty.spawn() fails.
 */
export async function createPtyClient(
  config: PtyClientConfig,
  internals: PtyFactoryInternals = {},
): Promise<PtyClient> {
  const loadPty = internals.loadPty ?? defaultLoadPty;
  const exists  = internals.exists  ?? defaultExists;

  let pty: PtyModuleLike;
  try {
    pty = await loadPty();
  } catch (err) {
    if (err instanceof PtyDependencyMissingError) throw err;
    throw new PtyDependencyMissingError(
      'PTY mode requires node-pty. Install it as a peer dependency: ' +
      '`npm install node-pty`.',
      { cause: err },
    );
  }

  const { args, defaultBin } = buildArgs(config);
  const bin = config.bin ?? defaultBin;

  if (!(await exists(bin))) {
    throw new PtyBinaryNotFoundError(
      bin,
      `PTY binary not found: ${bin}. Ensure it is installed and on PATH, ` +
      'or pass `bin` in the config.',
    );
  }

  const client = new PtyClientImpl({
    provider: config.provider,
    pty,
    bin,
    args,
    cwd: config.cwd ?? process.cwd(),
    cols: config.cols ?? 80,
    rows: config.rows ?? 24,
    env: { ...process.env, ...config.env },
  });

  try {
    await client.start();
  } catch (err) {
    throw new PtySpawnError(
      `Failed to spawn PTY for ${config.provider}: ${(err as Error)?.message ?? err}`,
      { cause: err },
    );
  }
  return client;
}

function buildArgs(config: PtyClientConfig): { args: string[]; defaultBin: string } {
  switch (config.provider) {
    case 'claude': {
      const { provider: _p, bin: _b, ...rest } = config;
      void _p; void _b;
      return { args: buildClaudeArgs(rest), defaultBin: 'claude' };
    }
    case 'copilot': {
      const { provider: _p, bin: _b, ...rest } = config;
      void _p; void _b;
      return { args: buildCopilotArgs(rest), defaultBin: 'copilot' };
    }
    default: {
      const _exhaustive: never = config;
      throw new Error(
        `Unknown PTY provider: ${(_exhaustive as { provider: string }).provider}`,
      );
    }
  }
}
