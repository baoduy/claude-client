// test/pty/types.test-d.mts
// Type-level test. This file should produce no compile errors when
// the discriminated union is correct, and produce errors at the marked
// lines when the union narrows incorrectly. Run via:
//   npx tsc --noEmit test/pty/types.test-d.mts --module nodenext --moduleResolution nodenext --target es2022 --strict --skipLibCheck

import type { PtyClientConfig } from '../../dist/types/pty/index.d.ts';

// OK: claude config with claude-only field
const okClaude: PtyClientConfig = { provider: 'claude', model: 'm', permissionMode: 'auto' };
void okClaude;

// OK: copilot config with copilot-only fields
const okCopilot: PtyClientConfig = { provider: 'copilot', model: 'm', allowAll: true, allowTools: ['t'] };
void okCopilot;

// @ts-expect-error allowTools is copilot-only
const bad1: PtyClientConfig = { provider: 'claude', allowTools: [] };
void bad1;

// @ts-expect-error permissionMode is claude-only
const bad2: PtyClientConfig = { provider: 'copilot', permissionMode: 'auto' };
void bad2;
