# npm-publish GitHub Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two GitHub Actions workflows (`ci.yml` and `npm-publish.yml`) adapted from `baoduy/ShareWorkflows/npm-publish.yaml`, plus a release setup doc covering one-time pre-work.

**Architecture:** CI runs on push/PR to main (typecheck + test). Publish runs on `workflow_dispatch` only — computes next version with `paulhatch/semantic-version`, patches `package.json`, builds, pushes a `v*` tag, creates a GitHub Release, and `npm publish --provenance`. The two workflows are independent; a CI failure cannot block a publish, a publish failure cannot break PR feedback.

**Tech Stack:** GitHub Actions (`actions/checkout@v4`, `actions/setup-node@v4`, `paulhatch/semantic-version@v5.4.0`, `softprops/action-gh-release@v2`), Node.js 22, npm.

**Spec:** `docs/superpowers/specs/2026-04-30-npm-publish-github-action-design.md`

---

## File Structure

| File | Purpose |
| ---- | ------- |
| `.github/workflows/ci.yml` | Always-on CI: push to `main` + PRs target `main`. Runs `npm ci`, `npm run typecheck`, `npm test` on Node 22. |
| `.github/workflows/npm-publish.yml` | Manual publish: `workflow_dispatch` only. Computes version, builds, tags, creates GH Release, publishes to npm with provenance. |
| `docs/release-setup.md` | Operator-facing doc: one-time pre-work (create `v1.3.0` tag, add `NPM_TOKEN` secret, confirm workflow permissions), commit-message convention, how to trigger a release. |

**Validation strategy.** GitHub Actions workflows can't be unit-tested locally. We validate by:
1. **YAML parse check** — `python3 -c "import yaml; yaml.safe_load(open(F))"` for each workflow.
2. **Structural check** — required top-level keys (`name`, `on`, `jobs`) present.
3. **Manual diff vs. spec** — walk every step in each workflow and confirm it matches the spec table.

This is the strongest local validation available without pushing to GitHub.

---

## Task 1: Create `.github/workflows/ci.yml`

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p .github/workflows
```

Expected: directory exists, no error.

- [ ] **Step 2: Write `ci.yml`**

Create `.github/workflows/ci.yml` with this exact content:

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

- [ ] **Step 3: Validate YAML parses**

Run:

```bash
python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/ci.yml')); assert 'name' in d and 'on' in d and 'jobs' in d; print('ok:', d['name'])"
```

Expected output: `ok: CI`

- [ ] **Step 4: Manual structural review**

Confirm every line matches the spec section "CI workflow (`ci.yml`)". Specifically:
- Triggers `push` to `main` and `pull_request` to `main` ✓
- Concurrency group `ci-${{ github.ref }}` with `cancel-in-progress: true` ✓
- Single job `build-and-test` on `ubuntu-latest` ✓
- Steps: checkout → setup-node 22 with `cache: npm` → `npm ci` → `npm run typecheck` → `npm test` ✓

- [ ] **Step 5: Commit**

```bash
rtk git add .github/workflows/ci.yml
rtk git commit -m "ci: add CI workflow (typecheck + test on push/PR to main)"
```

---

## Task 2: Create `.github/workflows/npm-publish.yml`

**Files:**
- Create: `.github/workflows/npm-publish.yml`

- [ ] **Step 1: Write `npm-publish.yml`**

Create `.github/workflows/npm-publish.yml` with this exact content:

```yaml
name: npm-publish

on:
  workflow_dispatch:

concurrency:
  group: npm-publish
  cancel-in-progress: false

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
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

- [ ] **Step 2: Validate YAML parses**

Run:

```bash
python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/npm-publish.yml')); assert 'name' in d and 'on' in d and 'jobs' in d; print('ok:', d['name'])"
```

Expected output: `ok: npm-publish`

- [ ] **Step 3: Validate trigger is workflow_dispatch only**

Run:

```bash
python3 -c "
import yaml
d = yaml.safe_load(open('.github/workflows/npm-publish.yml'))
on = d.get(True, d.get('on'))  # PyYAML parses bare 'on' as boolean True
assert on == 'workflow_dispatch' or 'workflow_dispatch' in on, f'unexpected trigger: {on!r}'
print('ok:', on)
"
```

Expected output: `ok: workflow_dispatch`

(Note: PyYAML interprets the bare key `on:` as boolean `True`. The check above handles both cases.)

- [ ] **Step 4: Validate permissions, steps, and key ordering**

Run:

```bash
python3 << 'EOF'
import yaml
d = yaml.safe_load(open('.github/workflows/npm-publish.yml'))
job = d['jobs']['release']
perms = job['permissions']
assert perms['contents'] == 'write', f"contents permission wrong: {perms}"
assert perms['id-token'] == 'write', f"id-token permission wrong: {perms}"
step_names = [s.get('name') or s.get('uses') or s.get('run','').split('\n')[0][:40] for s in job['steps']]
print('step order:')
for i, n in enumerate(step_names, 1):
    print(f'  {i}. {n}')
# Verify critical ordering: tag push BEFORE release BEFORE publish.
names = [s.get('name','') for s in job['steps']]
push_idx   = names.index('Push git tag')
rel_idx    = names.index('Create GitHub Release')
pub_idx    = names.index('Publish to npm')
assert push_idx < rel_idx < pub_idx, 'wrong order: tag/release/publish'
print('ok: tag → release → publish ordering preserved')
EOF
```

Expected: prints the step order, then `ok: tag → release → publish ordering preserved`.

- [ ] **Step 5: Manual structural review vs spec**

Walk every step against the spec section "Publish workflow (`npm-publish.yml`)". Confirm:
- `fetch-depth: 0, fetch-tags: true` on checkout (semantic-version needs tag history) ✓
- `paulhatch/semantic-version@v5.4.0` with `tag_prefix: "v"`, `major_pattern: "(MAJOR)"`, `minor_pattern: "(MINOR)"` ✓
- `setup-node` has `registry-url: 'https://registry.npmjs.org/'` (required for `NODE_AUTH_TOKEN` to work) ✓
- `npm ci` (not `npm install --force`) ✓
- Patch step uses `node -e` (not `sed`), patches root `package.json` ✓
- `Build` step has `NODE_OPTIONS: --max_old_space_size=4096` ✓
- Tag push step uses `github-actions[bot]` identity ✓
- GH Release uses `softprops/action-gh-release@v2`, `generate_release_notes: true`, `make_latest: true` ✓
- npm publish uses `--provenance --access public`, reads `NPM_TOKEN` from secrets ✓
- No `Enable_Release` gate (removed from upstream) ✓
- No `cd .out-bin` (this repo publishes the root) ✓

- [ ] **Step 6: Commit**

```bash
rtk git add .github/workflows/npm-publish.yml
rtk git commit -m "ci: add npm-publish workflow (workflow_dispatch, semantic-version, provenance)"
```

---

## Task 3: Create `docs/release-setup.md`

**Files:**
- Create: `docs/release-setup.md`

This doc tells the human operator how to perform the one-time pre-work and how to trigger a release once the workflows are in place.

- [ ] **Step 1: Write `docs/release-setup.md`**

Create the file with this exact content:

````markdown
# Release setup

This package is published to npm as [`@baoduy2412/ai-cli-client`](https://www.npmjs.com/package/@baoduy2412/ai-cli-client) by the
GitHub Actions workflow at `.github/workflows/npm-publish.yml`. CI runs on
every push and PR via `.github/workflows/ci.yml`.

## One-time setup (do this once before the first release)

### 1. Create the `v1.3.0` baseline tag

`paulhatch/semantic-version` computes the next version by walking commits
since the last `v*` tag. The repo currently has `package.json` at `1.3.0`
but no matching git tag. Without a baseline tag, the action would start from
`0.0.0` and try to publish a version that already exists on npm.

Run from a clean working tree on `main`:

```bash
git tag -a v1.3.0 -m "v1.3.0 baseline"
git push origin v1.3.0
```

### 2. Add the `NPM_TOKEN` secret

1. Create a granular access token at <https://www.npmjs.com/settings/baoduy2412/tokens/granular-access-tokens/new>:
   - **Permissions:** Read and write
   - **Packages and scopes:** select `@baoduy2412/ai-cli-client`
   - **Expiration:** your preference (e.g. 1 year)
2. In the GitHub repo, go to **Settings → Secrets and variables → Actions → New repository secret**.
3. Name: `NPM_TOKEN`. Value: paste the token. Save.

### 3. Confirm workflow permissions

The publish workflow needs to push tags and create releases.

In the GitHub repo, go to **Settings → Actions → General → Workflow permissions**
and ensure **"Read and write permissions"** is selected. (The workflow also
declares per-job `permissions:` blocks as defense-in-depth, but the repo-level
setting must allow those grants.)

## Triggering a release

1. Land all the commits you want to ship onto `main`. Use commit-message
   markers to control the bump:
   - `(MAJOR)` substring → major bump (e.g. `2.0.0`)
   - `(MINOR)` substring → minor bump (e.g. `1.4.0`)
   - otherwise → patch bump (e.g. `1.3.1`)
2. Update `CHANGELOG.md` with the upcoming version's notes (this repo
   maintains the changelog manually).
3. Go to **Actions → npm-publish → Run workflow** and click "Run workflow".
4. The workflow:
   - Computes the next version from commits since the last `v*` tag.
   - Runs `npm ci`, `npm run typecheck`, `npm test`.
   - Patches `package.json` to the computed version (in the runner, not
     committed back to `main`).
   - Builds.
   - Tags `v<version>` and pushes the tag to origin.
   - Creates a GitHub Release with auto-generated notes.
   - Publishes to npm with `--provenance --access public`.

## Failure modes

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| `npm publish` fails with `cannot republish over existing version` | No new commits since the last `v*` tag, so semantic-version computed the same version | Land at least one new commit, dispatch again. |
| `git push origin v<version>` fails with `tag already exists` | A previous run pushed the tag but failed before npm publish | Delete the local + remote tag, then re-run: `git tag -d v<version>; git push origin :refs/tags/v<version>` (do this only if you've confirmed the version was *not* published to npm) |
| `npm publish` fails with `403 Forbidden` | `NPM_TOKEN` missing or not scoped to `@baoduy2412/ai-cli-client` | Re-create the granular token with package scope, update secret. |
| `Push git tag` step fails with permission error | Repo's workflow permissions are read-only | Settings → Actions → General → Workflow permissions → Read and write. |

## Local verification before dispatching

```bash
npm ci
npm run typecheck
npm test
npm run build
npm pack --dry-run     # confirm tarball contents look right
```
````

- [ ] **Step 2: Verify the file was created**

Run:

```bash
ls -la docs/release-setup.md && wc -l docs/release-setup.md
```

Expected: file exists, ~80 lines.

- [ ] **Step 3: Commit**

```bash
rtk git add docs/release-setup.md
rtk git commit -m "docs: add release-setup guide for npm-publish workflow"
```

---

## Task 4: End-to-end self-check

**Files:** none (verification only).

- [ ] **Step 1: List the new files**

Run:

```bash
rtk ls .github/workflows && rtk ls docs/release-setup.md
```

Expected:
- `.github/workflows/ci.yml`
- `.github/workflows/npm-publish.yml`
- `docs/release-setup.md`

- [ ] **Step 2: Verify both workflows still parse**

Run:

```bash
python3 -c "
import yaml
for f in ['.github/workflows/ci.yml', '.github/workflows/npm-publish.yml']:
    d = yaml.safe_load(open(f))
    assert 'name' in d and 'jobs' in d, f'{f}: missing required keys'
    print(f, 'ok:', d['name'])
"
```

Expected:
```
.github/workflows/ci.yml ok: CI
.github/workflows/npm-publish.yml ok: npm-publish
```

- [ ] **Step 3: Confirm git status is clean**

Run:

```bash
rtk git status
```

Expected: `nothing to commit, working tree clean` (all three commits already made).

- [ ] **Step 4: Show the commits**

Run:

```bash
rtk git log --oneline -5
```

Expected: top three commits are the workflows + setup doc, plus the spec commit.

- [ ] **Step 5 (optional, requires user action): perform pre-work**

Out-of-band by the user (not part of automated execution):

```bash
git tag -a v1.3.0 -m "v1.3.0 baseline"
git push origin v1.3.0
```

Then add `NPM_TOKEN` to GitHub repo secrets per `docs/release-setup.md`.

This is **deliberately not automated** — it requires a real npm token (which Claude shouldn't see) and a tag push that affects every future workflow run.

---

## Self-Review Notes

**Spec coverage check:**
- "Two workflows under `.github/workflows/`" → Tasks 1, 2 ✓
- "CI on push/PR" → Task 1 ✓
- "Publish on workflow_dispatch with semantic-version, tag, GH release, provenance" → Task 2 ✓
- "Push computed tag back to origin (fix upstream bug)" → Task 2 step 1, "Push git tag" step ✓
- "One-time pre-work documented (v1.3.0 tag, NPM_TOKEN, workflow permissions)" → Task 3 ✓
- "Failure ordering: patch → build → tag → release → publish" → Task 2 step 4 verifies this ✓

**Placeholder scan:** none.

**Type/name consistency:** workflow names (`CI`, `npm-publish`), job names (`build-and-test`, `release`), and step names (`Push git tag`, `Create GitHub Release`, `Publish to npm`) used consistently across plan and validation steps.

**Scope check:** small, self-contained — three files, one of them documentation. Single plan is appropriate.
