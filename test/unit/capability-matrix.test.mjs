import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ClaudeClient } from '../../dist/esm/claude/index.js';
import { CopilotClient } from '../../dist/esm/copilot/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const matrixDocPath = resolve(__dirname, '../../docs/provider-capabilities.md');
const matrixDoc = readFileSync(matrixDocPath, 'utf8');

/**
 * Extract the "Optional capabilities (Group E)" table rows.
 *
 * Each row maps a method name to per-provider booleans + the
 * capabilities flag name. We use the flag name (last column, in
 * `backticks`) to look up the runtime capability.
 *
 * Returns: Map<flagName, { claude: boolean, copilot: boolean }>
 */
function parseOptionalCapabilities(doc) {
  const flags = new Map();
  const start = doc.indexOf('### Optional capabilities');
  if (start === -1) throw new Error('Could not find Optional capabilities section');
  const end = doc.indexOf('\n## ', start + 5); // next H2 (newline-anchored)
  const section = doc.slice(start, end === -1 ? doc.length : end);

  for (const rawLine of section.split('\n')) {
    const line = rawLine.trim();
    // Only consider table rows: pipe-delimited lines with at least 4 cells.
    if (!line.startsWith('|')) continue;
    // Skip alignment separator like |:----:|:----:|...
    if (/^\|[\s:|-]+\|$/.test(line)) continue;

    // Split into cells; remove empty leading/trailing from leading/trailing pipes.
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 4) continue;

    // Skip header row (contains "Method" / "Claude" labels).
    if (/^Method/i.test(cells[0]) && /Claude/i.test(cells[1])) continue;

    const [methodCell, claudeCell, copilotCell, flagCell] = cells;

    // The flag cell starts with `flagName` (in backticks), optionally followed
    // by " — note text". Extract the leading backticked identifier.
    const flagMatch = flagCell.match(/^`([A-Za-z_][\w]*)`/);
    if (!flagMatch) continue;
    const flagName = flagMatch[1];

    flags.set(flagName, {
      claude: cellToBool(claudeCell),
      copilot: cellToBool(copilotCell),
      methodLabel: methodCell,
    });
  }
  return flags;
}

/** Treat ✅, 'partial', 'full' as truthy; ❌, 'none' as falsy. */
function cellToBool(cell) {
  const t = cell.trim();
  if (t === '✅') return true;
  if (t === '❌') return false;
  if (/^(partial|full)$/i.test(t)) return true;
  if (/^none$/i.test(t)) return false;
  // Mixed cell — fall back to ✅ presence.
  if (/✅/.test(t)) return true;
  if (/❌/.test(t)) return false;
  // Treat 'partial'/'full' substrings as truthy if anywhere present.
  if (/partial|full/i.test(t)) return true;
  if (/none/i.test(t)) return false;
  return false;
}

test('parseOptionalCapabilities found a non-trivial set of flags', () => {
  const flags = parseOptionalCapabilities(matrixDoc);
  // Sanity check: we expect to find at least these flags.
  for (const expected of [
    'setModel',
    'listSupportedModels',
    'getMessages',
    'interactiveApproval',
    'setPermissionMode',
  ]) {
    assert.ok(flags.has(expected), `expected matrix to declare ${expected}`);
  }
  assert.ok(flags.size >= 5, `expected >= 5 capability flag rows in matrix, got ${flags.size}`);
});

test('matrix doc capability flags match Claude runtime capabilities', () => {
  const flags = parseOptionalCapabilities(matrixDoc);
  const c = new ClaudeClient({ cwd: '/tmp', sessionId: 'test' });

  for (const [flag, expected] of flags.entries()) {
    if (!(flag in c.capabilities)) continue; // skip flags the runtime doesn't track
    const runtime = c.capabilities[flag];
    if (typeof runtime === 'boolean') {
      assert.equal(
        runtime,
        expected.claude,
        `claude.${flag}: doc says ${expected.claude}, runtime says ${runtime}`,
      );
    }
    // Skip non-boolean flags (e.g., richContent string-literal, permissionModes array).
  }
});

test('matrix doc capability flags match Copilot runtime capabilities', () => {
  const flags = parseOptionalCapabilities(matrixDoc);
  const c = new CopilotClient({ cwd: '/tmp' });

  for (const [flag, expected] of flags.entries()) {
    if (!(flag in c.capabilities)) continue;
    const runtime = c.capabilities[flag];
    if (typeof runtime === 'boolean') {
      assert.equal(
        runtime,
        expected.copilot,
        `copilot.${flag}: doc says ${expected.copilot}, runtime says ${runtime}`,
      );
    }
  }
});

test('matrix doc richContent row matches runtime richContent string', () => {
  // Special-case the richContent row (string-literal capability).
  // Find the row whose flag is `richContent` and compare cell labels
  // ('partial'/'full'/'none') directly against runtime values.
  const start = matrixDoc.indexOf('### Optional capabilities');
  const end = matrixDoc.indexOf('\n## ', start + 5);
  const section = matrixDoc.slice(start, end === -1 ? matrixDoc.length : end);

  let claudeLabel = null;
  let copilotLabel = null;
  for (const rawLine of section.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 4) continue;
    if (!/^`?richContent`?/.test(cells[3])) continue;
    claudeLabel = normalizeRichContent(cells[1]);
    copilotLabel = normalizeRichContent(cells[2]);
    break;
  }
  assert.ok(claudeLabel, 'expected to find richContent row');

  const claude = new ClaudeClient({ cwd: '/tmp', sessionId: 'test' });
  const copilot = new CopilotClient({ cwd: '/tmp' });
  assert.equal(
    claude.capabilities.richContent,
    claudeLabel,
    `claude.richContent: doc says ${claudeLabel}, runtime says ${claude.capabilities.richContent}`,
  );
  assert.equal(
    copilot.capabilities.richContent,
    copilotLabel,
    `copilot.richContent: doc says ${copilotLabel}, runtime says ${copilot.capabilities.richContent}`,
  );
});

function normalizeRichContent(cell) {
  const t = cell.trim();
  if (/^partial$/i.test(t)) return 'partial';
  if (/^full$/i.test(t)) return 'full';
  if (/^none$/i.test(t)) return 'none';
  if (t === '❌') return 'none';
  // Default: assume 'partial' if ✅ marker (legacy doc style).
  if (t === '✅') return 'partial';
  return t;
}
