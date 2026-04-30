# Design — GitHub Action: build & publish to npm

**Date:** 2026-04-30
**Status:** Approved for implementation
**Topic:** GitHub Actions workflows for CI and npm release of `@drunkcoding/ai-cli-clients`

## Context

The repository has no `.github/workflows/` directory. Builds, tests, and npm
publishes have been performed manually. The user pointed at a shared workflow
template at
`https://raw.githubusercontent.com/baoduy/ShareWorkflows/refs/heads/main/.github/workflows/npm-publish.yaml`
and asked to adapt it for this repo.

The shared template is **incompatible as-is** with this repo:

| Shared template assumes        | Reality in this repo                       |
| ------------------------------ | ------------------------------------------ |
| Build output dir `.out-bin/`   | `dist/`                                    |
| `sed` replaces `"version": "0.0.1"` in package.json | Current version `1.3.0`                    |
| npm scope `@drunk-pulumi`      | `@baoduy2412`                              |
| Node 20                        | `engines: ">=22"`                          |
| `Enable_Release` env gate (never set anywhere) | n/a                                        |
| Triggered only by `workflow_call` | Needs a caller workflow with triggers      |

Decision: copy + adapt the workflow inline rather than calling it remotely or
upstreaming a parameterized version (the latter is a separate, larger piece of
work).

## Goals

1. Two workflows under `.github/workflows/`:
   - `ci.yml` — runs on every push to `main` and PR to `main`.
   - `npm-publish.yml` — runs on `workflow_dispatch` only, computes next
     version from commit messages since the last `v*` tag, builds, tags,
     creates a GitHub Release, and publishes to npm with provenance.
2. CI and publish are separate. A failing PR cannot publish; a failing publish
   cannot break PR feedback.
3. The publish workflow always pushes the computed git tag back to origin so
   the next run starts from the new baseline. (The upstream template forgets
   to do this, which would cause the same version to be computed on every
   subsequent run.)
4. Minimal blast radius: pure-additive change, no existing workflows touched,
   reversible by deleting the two new files.

## Non-goals

- Pre-release / beta channels (`npm publish --tag next`).
- Automated CHANGELOG generation. The repo maintains `CHANGELOG.md` manually.
- Slack/Discord notifications.
- Node version matrix in CI (Node 22 only initially).
- Lint step (no lint configuration exists in `package.json`).
- Refactoring or upstreaming the shared workflow into a parameterized form.
- Branch protection rule changes (workflow files only; repo settings out of
  scope).

## Architecture

```
.github/
└── workflows/
    ├── ci.yml             # always-on: push to main + PRs
    └── npm-publish.yml    # workflow_dispatch only
```

### Versioning model

`paulhatch/semantic-version` reads commits since the last `v*` tag and bumps
based on substring markers in commit messages:

- `(MAJOR)` substring → major bump
- `(MINOR)` substring → minor bump
- otherwise → patch bump

This matches the shared template's convention exactly. The previous
`version-bump` skill / manual `npm version` flow remains compatible — any
manual bump that creates a `v*` tag on the way out resets the baseline for
semantic-version on the next run.

### One-time pre-work outside the workflows

1. Create `v1.3.0` git tag at HEAD and push it. Without this, semantic-version
   sees no tags, starts from `0.0.0`, and computes a version lower than what
   already exists on npm — a guaranteed `npm publish` conflict on first run.
2. Add the `NPM_TOKEN` secret to GitHub repository secrets. Granular access
   token, scoped to `@drunkcoding/ai-cli-clients`, "Publish + read" access.
3. Confirm Settings → Actions → General → Workflow permissions allows
   "Read and write" for `GITHUB_TOKEN`. (Per-job `permissions:` blocks are
   still set explicitly in each workflow as defense-in-depth.)

## CI workflow (`ci.yml`)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci
      - run: npm run typecheck
      - run: npm test
```

Notes:

- `npm ci` (not `npm install --force`) — fails loudly on lockfile drift.
- `cache: npm` built into `setup-node` replaces the upstream's separate
  `actions/cache` step.
- `npm test` already runs `build` first via the script in `package.json`, so
  build coverage is implicit.
- `node-pty` is an optional peer dep; not installed in CI. PTY tests skip
  gracefully when absent (existing pattern in the test suite).
- `concurrency` cancels in-flight runs on the same ref when a new push
  arrives — saves CI minutes on rapid-fire pushes.
- Single Node 22 to start. Adding a matrix later is a one-line change.

## Publish workflow (`npm-publish.yml`)

```yaml
name: npm-publish

on:
  workflow_dispatch:

concurrency:
  group: npm-publish
  cancel-in-progress: false   # never cancel a half-published run

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write     # tag push + GH release
      id-token: write     # npm provenance attestation
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          fetch-tags: true

      - name: Calculate next version
        id: version
        uses: paulhatch/semantic-version@v5.4.0
        with:
          tag_prefix: "v"
          major_pattern: "(MAJOR)"
          minor_pattern: "(MINOR)"
          version_format: "${major}.${minor}.${patch}"
          bump_each_commit: false
          search_commit_body: false

      - name: Set NEXT_VERSION
        run: echo "NEXT_VERSION=${{ steps.version.outputs.version }}" >> $GITHUB_ENV

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: 'https://registry.npmjs.org/'
          cache: npm

      - run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Test
        run: npm test

      - name: Patch package.json version
        run: |
          node -e "
            const fs = require('fs');
            const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
            pkg.version = process.env.NEXT_VERSION;
            fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
          "

      - name: Build
        run: npm run build
        env:
          NODE_OPTIONS: --max_old_space_size=4096

      - name: Push git tag
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git tag -a "v${NEXT_VERSION}" -m "v${NEXT_VERSION}"
          git push origin "v${NEXT_VERSION}"

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v${{ env.NEXT_VERSION }}
          name: v${{ env.NEXT_VERSION }}
          generate_release_notes: true
          make_latest: true
        env:
          GITHUB_TOKEN: ${{ github.token }}

      - name: Publish to npm
        run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Key differences from the upstream shared workflow

| Upstream                                         | Here                                                  | Why                                                                          |
| ------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `cd .out-bin && sed ... 0.0.1 ...`               | `node -e ...` patches root `package.json`             | This repo publishes the root and has a real version. No `.out-bin` indirection. |
| Implicit `Enable_Release` env (never set)        | Removed                                               | Manual `workflow_dispatch` itself is the gate.                               |
| No tag pushed back to git                        | Explicit `git tag && git push`                        | Without this, semantic-version computes the same version on every subsequent run. |
| `npm install --force`                            | `npm ci`                                              | Reproducible installs; fails on lockfile drift.                              |
| `npm config set scope "@drunk-pulumi"` then publish | `npm publish --access public` (scope already in `package.json`) | Scope is correct in this repo's `package.json` (`@baoduy2412`).              |
| No provenance                                    | `--provenance` (+ `id-token: write` permission)       | Best practice; ties npm artifact to this exact workflow run.                 |
| Run on `workflow_call`                           | Run on `workflow_dispatch`                            | Per Q5-A in brainstorm: single, unambiguous entry point.                     |
| Patches `package.json` but does not commit it   | Same — patch is in-runner only                        | The git tag is the persistent record; no commit-back-to-main needed.         |

### Failure ordering

The order of the final four steps is deliberate:

1. **Patch + build.** Fail here → nothing was published, no tag exists. Re-run safely.
2. **Push git tag.** Fail here (e.g. tag already exists) → abort before npm publish. Prevents "tag missing on a published version" drift.
3. **Create GH Release.** If this fails after the tag pushed, the tag still
   exists; npm publish has not yet run. Re-run will fail at "tag already
   exists" — clear error, no double-publish.
4. **`npm publish --provenance --access public`.** Last and irreversible.

### Edge cases handled

- *No new commits since last tag* — semantic-version computes the same
  version, npm publish fails with "cannot republish over existing version".
  Workflow exits with a clear error. Acceptable for v1; can be hardened later
  by checking `steps.version.outputs.changed`.
- *Tag already exists locally* — `git tag -a` fails before publish.
- *Tests fail* — publish never reached.
- *PTY tests* — `node-pty` not installed in CI; tests skip gracefully.

## Risk

- **Low blast radius.** Both files are new. No existing workflows to break.
- **Auth surface.** Single new secret (`NPM_TOKEN`). Granular tokens limit damage.
- **Reversibility.** Pure additive change; deleting `.github/workflows/`
  reverts cleanly.

## Brainstorm Q&A summary

| Q  | Choice | Rationale                                                                 |
| -- | ------ | ------------------------------------------------------------------------- |
| Q1 | B      | Copy + adapt inline (vs. upstream `workflow_call` or fresh tailored).     |
| Q2 | D      | CI on push/PR, manual dispatch for publish.                               |
| Q3 | C      | Auto-bump via `paulhatch/semantic-version` (matches upstream exactly).    |
| Q4 | A      | Literal `(MAJOR)` / `(MINOR)` markers (matches upstream).                 |
| Q5 | A      | `workflow_dispatch` only; provenance + GH release enabled.                |
| Q6 | recommended defaults | push+PR, `npm ci` → typecheck → test, Node 22 only, `NPM_TOKEN`, skip `node-pty`. |
