"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCopilotSessionSummaries = listCopilotSessionSummaries;
exports.readCopilotSessionRecord = readCopilotSessionRecord;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const node_os_1 = require("node:os");
function resolveStateDir(opts) {
    if (opts?.copilotDir)
        return (0, node_path_1.join)(opts.copilotDir, 'session-state');
    const home = opts?.homeDir ?? (0, node_os_1.homedir)();
    return (0, node_path_1.join)(home, '.copilot', 'session-state');
}
async function listCopilotSessionSummaries(opts) {
    const stateDir = resolveStateDir(opts);
    let entries = [];
    try {
        entries = await (0, promises_1.readdir)(stateDir);
    }
    catch (err) {
        if (err?.code === 'ENOENT')
            return [];
        throw err;
    }
    const summaries = [];
    for (const id of entries) {
        const dir = (0, node_path_1.join)(stateDir, id);
        const s = await (0, promises_1.stat)(dir).catch(() => null);
        if (!s?.isDirectory())
            continue;
        const metaPath = (0, node_path_1.join)(dir, 'metadata.json');
        let meta = null;
        try {
            const raw = await (0, promises_1.readFile)(metaPath, 'utf8');
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
async function readCopilotSessionRecord(sessionId, opts) {
    const stateDir = resolveStateDir(opts);
    const dir = (0, node_path_1.join)(stateDir, sessionId);
    const metaRaw = await (0, promises_1.readFile)((0, node_path_1.join)(dir, 'metadata.json'), 'utf8');
    const meta = JSON.parse(metaRaw);
    let rawMessages = [];
    try {
        const text = await (0, promises_1.readFile)((0, node_path_1.join)(dir, 'messages.jsonl'), 'utf8');
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
