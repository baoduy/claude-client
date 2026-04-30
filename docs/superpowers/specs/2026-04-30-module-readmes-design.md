# Module READMEs — Design

**Date:** 2026-04-30
**Status:** Draft, awaiting user review
**Topic:** Add a `README.md` to each module folder under `src/` so that future readers (humans and agents) can orient themselves without grepping the whole tree.

## Goal

Give every module folder a short, opinionated orientation document that answers three questions:

1. **What is this module for?**
2. **What does it export?**
3. **How do I use it from one level up?**

Module READMEs are *navigation aids*, not API references. Full type signatures and per-parameter docs live in source TSDoc; the READMEs link to source rather than duplicate it. This keeps them short and resistant to drift.

## Non-goals

- **Not** a full API reference per file. TSDoc owns that.
- **Not** a place to copy spec content from `docs/superpowers/specs/`. Link, don't duplicate.
- **Not** marketing copy. The root `README.md` already markets the package; module READMEs are internal-feeling navigation.

## Scope

Six new files, one per module folder:

| File | Module | Public surface (anchor) |
| --- | --- | --- |
| `src/README.md` | Top-level barrel | `AICliClient`, `createAICliClient`, `ClaudeClient`, `CopilotClient`, re-exports of `unified` and `pty` |
| `src/claude/README.md` | Claude provider | `ClaudeClient`, `attachMcpHandlers`, claude-specific types, sessions, task store/queue, question session |
| `src/copilot/README.md` | Copilot provider | `CopilotClient`, errors, types, sessions, namespaces sub-folder |
| `src/copilot/namespaces/README.md` | Copilot RPC namespaces | `CopilotPlanApi`, `CopilotSkillsApi`, `CopilotAgentApi`, `CopilotHistoryApi`, `CopilotUsageApi`, `CopilotShellApi`, `CopilotWorkspacesApi`, `CopilotNameApi`, `CopilotInstructionsApi`, `CopilotMcpApi` |
| `src/pty/README.md` | PTY transport | `createPtyClient`, `PtyClient`, `PtyClientConfig`, error hierarchy |
| `src/unified/README.md` | Shared unified surface | `TurnSnapshot`, `SendInput`, `ContentBlock`, `AICliCapabilities`, `UnifiedEventMap`, `UnsupportedContentError`, `translateLegacyPermissionMode` |

The barrel files (`index.ts`) are the source of truth for what each README documents — anything not re-exported is internal and gets at most a one-line mention under "Internal files".

## Per-README structure

Each file follows the same six sections, scaled to module size. A small module (e.g. `unified`) might be 60 lines; a busy one (e.g. `claude`) up to ~200.

### 1. Purpose

One paragraph. Who imports from this module? What problem does it solve? What's the boundary between this module and its neighbors?

### 2. Public exports

A table with two columns: **Name** | **Purpose** (one line each). Drawn directly from the module's `index.ts`. No signatures here — just a roster so a reader can scan and pick what to dig into.

### 3. Key interfaces

**Orientation-style (option A from brainstorming).** For the 2–5 most important types/classes:

- The name as a heading (`### ClaudeClient`)
- A 1–3 line description
- A bulleted list of method *names* (no full signatures), grouped by purpose if helpful
- A pointer to the source file for full TSDoc

Methods of negligible interest (constructors, simple getters) can be omitted; this section is curated, not exhaustive.

### 4. Usage

One minimal TypeScript example showing the typical call pattern from one level up. Should be runnable in spirit (real imports, real method calls) but doesn't need to be a complete program. Aim for ~10–25 lines.

For `src/copilot/namespaces/README.md` the example shows access via the parent client (`client.plan.list()`), since these classes are not constructed directly.

### 5. Internal files

A short list of non-exported files in the module, one line each. Helps future maintainers understand what each file is for without reading every one. Example:

```
- transport.ts — JSON-RPC stdio transport, internal
- pending-queue.ts — request/response correlation, internal
```

### 6. See also

Bulleted links to:
- The root `README.md`
- Relevant specs in `docs/superpowers/specs/` (e.g. PTY README links to `2026-04-29-pty-transport-design.md`)
- Sibling module READMEs that share a boundary (e.g. `claude/README.md` links to `unified/README.md`)

## Style

- Match the root `README.md`: prose-first, tables for enumerations, short TS code blocks.
- No emoji.
- No marketing fluff (this is for maintainers, not for npm).
- Headings use sentence case (`## Public exports`, not `## Public Exports`).
- Code blocks are TypeScript with realistic imports.
- Cross-references use relative paths (`../unified/`) rather than absolute (`src/unified/`) so they work when the file is read in-place on GitHub.

## Maintenance contract

A README's correctness is anchored to its module's `index.ts` barrel. Whenever a new export is added or removed from a barrel, the corresponding README's "Public exports" table should be updated in the same change. A pre-commit or CI check could enforce this later, but is **out of scope** for this work — for now, it's a convention.

The "Internal files" section is updated when files are added or removed from the folder. The "Key interfaces" section is curated and only changes when the curator's judgment of "what matters" changes — barrel additions don't automatically force updates here.

## Order of work

1. `src/unified/README.md` — smallest, pure types; sets the template tone.
2. `src/pty/README.md` — small, self-contained, good second pass at the template.
3. `src/copilot/namespaces/README.md` — uniform shape across 10 small classes.
4. `src/copilot/README.md` — depends on the namespaces README being in place to link to.
5. `src/claude/README.md` — largest module, most public surface.
6. `src/README.md` — top-level orientation that links to all five module READMEs above.

This ordering lets later READMEs link to earlier ones without forward references, and lets the template settle on small modules before being applied to the busy ones.

## Risks and mitigations

- **Drift risk.** Module surfaces change over time; READMEs go stale. *Mitigation:* anchor the "Public exports" table to the barrel and treat it as part of the barrel's diff. Curated sections (Key interfaces) accept some drift in exchange for staying readable.
- **Scope creep.** Easy to turn each README into a mini API reference. *Mitigation:* the explicit "no full signatures" rule from option A. If a section starts looking like TSDoc, delete it and link to the source file instead.
- **Duplication with specs.** Specs in `docs/superpowers/specs/` already describe several of these modules in depth. *Mitigation:* READMEs link to specs as background; they don't restate them.

## Out of scope

- Test folder READMEs (`test/`, `test/claude/`, etc.). Tests are organized by mirroring `src/`; no separate orientation needed.
- Top-level project README changes. Already exists and is owned separately.
- Adding doc-generation tooling (typedoc, etc.). Separate decision.
- A pre-commit hook to enforce barrel/README sync. Convention-only for now.

## Acceptance criteria

- All six README files exist at the paths listed in the Scope table.
- Each contains the six sections from "Per-README structure" (sections may be `_None._` if genuinely empty, e.g. a module with no internal files).
- Public exports tables match the corresponding `index.ts` barrels at the time of writing.
- No README contains a full type signature for any method that already has TSDoc in source.
- All cross-references resolve (relative paths to existing files).
- Files are committed in atomic commits — one per README — with messages of the form `docs(<module>): add module README`.

## Open questions

None. Option A (orientation-style key interfaces) was selected during brainstorming.
