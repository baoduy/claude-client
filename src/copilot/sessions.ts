import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { SessionBrowserSummary, SessionBrowserRecord } from '../claude/types.js';

export interface CopilotSessionLocatorOptions {
  /** Override $HOME (test injection point). */
  homeDir?: string;
  /** Override the absolute path to .copilot directory. */
  copilotDir?: string;
}

interface CopilotSessionMetadata {
  sessionId: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  messageCount?: number;
  projectPath?: string;
  gitBranch?: string;
}

function resolveStateDir(opts?: CopilotSessionLocatorOptions): string {
  if (opts?.copilotDir) return join(opts.copilotDir, 'session-state');
  const home = opts?.homeDir ?? homedir();
  return join(home, '.copilot', 'session-state');
}

export async function listCopilotSessionSummaries(
  opts?: CopilotSessionLocatorOptions
): Promise<SessionBrowserSummary<CopilotSessionMetadata>[]> {
  const stateDir = resolveStateDir(opts);
  let entries: string[] = [];
  try {
    entries = await readdir(stateDir);
  } catch (err: any) {
    if (err?.code === 'ENOENT') return [];
    throw err;
  }

  const summaries: SessionBrowserSummary<CopilotSessionMetadata>[] = [];
  for (const id of entries) {
    const dir = join(stateDir, id);
    const s = await stat(dir).catch(() => null);
    if (!s?.isDirectory()) continue;
    const metaPath = join(dir, 'metadata.json');
    let meta: CopilotSessionMetadata | null = null;
    try {
      const raw = await readFile(metaPath, 'utf8');
      meta = JSON.parse(raw);
    } catch { continue; }
    if (!meta) continue;
    summaries.push({
      provider: 'copilot',
      sessionId: meta.sessionId ?? id,
      title: meta.title ?? id,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      messageCount: meta.messageCount ?? 0,
      projectPath: meta.projectPath,
      gitBranch: meta.gitBranch,
      raw: meta,
    });
  }
  return summaries;
}

export async function readCopilotSessionRecord(
  sessionId: string,
  opts?: CopilotSessionLocatorOptions
): Promise<SessionBrowserRecord<CopilotSessionMetadata, unknown>> {
  const stateDir = resolveStateDir(opts);
  const dir = join(stateDir, sessionId);
  const metaRaw = await readFile(join(dir, 'metadata.json'), 'utf8');
  const meta: CopilotSessionMetadata = JSON.parse(metaRaw);

  let rawMessages: unknown[] = [];
  try {
    const text = await readFile(join(dir, 'messages.jsonl'), 'utf8');
    rawMessages = text.split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err;
  }

  return {
    provider: 'copilot',
    sessionId: meta.sessionId ?? sessionId,
    title: meta.title ?? sessionId,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    messageCount: meta.messageCount ?? rawMessages.length,
    projectPath: meta.projectPath,
    gitBranch: meta.gitBranch,
    raw: meta,
    rawMessages,
    messages: [], // Cross-provider transcript normalization is Phase 2.
  };
}
