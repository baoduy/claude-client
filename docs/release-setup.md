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
