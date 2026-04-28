import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
function resolveStateDir(opts) {
    if (opts?.copilotDir)
        return join(opts.copilotDir, 'session-state');
    const home = opts?.homeDir ?? homedir();
    return join(home, '.copilot', 'session-state');
}
export async function listCopilotSessionSummaries(opts) {
    const stateDir = resolveStateDir(opts);
    let entries = [];
    try {
        entries = await readdir(stateDir);
    }
    catch (err) {
        if (err?.code === 'ENOENT')
            return [];
        throw err;
    }
    const summaries = [];
    for (const id of entries) {
        const dir = join(stateDir, id);
        const s = await stat(dir).catch(() => null);
        if (!s?.isDirectory())
            continue;
        const metaPath = join(dir, 'metadata.json');
        let meta = null;
        try {
            const raw = await readFile(metaPath, 'utf8');
            meta = JSON.parse(raw);
        }
        catch {
            continue;
        }
        if (!meta)
            continue;
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
export async function readCopilotSessionRecord(sessionId, opts) {
    const stateDir = resolveStateDir(opts);
    const dir = join(stateDir, sessionId);
    const metaRaw = await readFile(join(dir, 'metadata.json'), 'utf8');
    const meta = JSON.parse(metaRaw);
    let rawMessages = [];
    try {
        const text = await readFile(join(dir, 'messages.jsonl'), 'utf8');
        rawMessages = text.split('\n').filter(Boolean).map(line => JSON.parse(line));
    }
    catch (err) {
        if (err?.code !== 'ENOENT')
            throw err;
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
