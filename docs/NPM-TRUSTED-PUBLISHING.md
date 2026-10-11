# LoopGrid Mastra — npm Trusted Publishing (next release)

## Current release baseline

- GitHub: `loopgridio/loopgrid-mastra`
- npm: `loopgrid-mastra`
- Public release: `0.1.0`, tag `v0.1.0`, commit `e58ac89`
- Already published and fresh-install verified. **Never try to republish 0.1.0.**
- This workflow **does not change the application or LoopGrid evidence lifecycle**.

## Add the workflow now (no publishing)

Copy `.github/workflows/release.yml` to the matching path in your current GitHub repository. This file triggers on **future** GitHub Releases (`release.published`) only. Pushing the workflow file does **not** replay prior releases.

Optional but recommended: under GitHub → Settings → Environments, create `npm` and require review before deployments. The workflow names `environment: npm`. Ensure the named environment exists, and configure branch/tag deployment restrictions as appropriate for your repository.

Commit example:

```powershell
git add .github/workflows/release.yml docs/NPM-TRUSTED-PUBLISHING.md
git diff --cached --check
git commit -m "ci: prepare npm trusted publishing for Mastra"
git push origin main
```

Check the existing adapter GitHub Actions workflow is green. Verify `npm view loopgrid-mastra version` remains `0.1.0`.

**Do not configure npm Trusted Publisher today unless the next version is ready to publish within 2 days.** A newly created publisher must be validated by its first successful publish within that window, or it expires.

## When the next version is ready

1. Bump `package.json` and documentation to the next intended version (for example, `0.1.1` only if a real change warrants it).
2. Run unit, SDK, TypeScript, Core/E2E and package checks; push the version commit. Wait for green CI.
3. Confirm npm still shows the prior version and the new version is not yet published.
4. In npmjs.com → `loopgrid-mastra` → **Settings → Trusted Publisher**, choose **GitHub Actions** and fill in **exactly**:

   | npm field | Enter |
   |---|---|
   | Organization / user | `loopgridio` |
   | Repository | `loopgrid-mastra` |
   | Workflow filename | `release.yml` (not the full path) |
   | Environment name | `npm` |
   | Allowed actions | Enable **npm publish** (this workflow uses direct publishing) |

5. On GitHub, tag the exact tested version commit and push the tag, then **publish a new GitHub Release** for that tag. The release event starts this workflow. If your `npm` GitHub environment has required reviewers, approve the job there.
6. Verify the new `npm publish` job succeeds, npm's `latest` points to the new version, provenance is visible if generated, and a clean npm install/import succeeds.
7. **Only after the first OIDC publish works**, consider npm package Settings → Publishing access → “Require two-factor authentication and disallow tokens”, and remove unnecessary long-lived publishing tokens. This keeps a working recovery path until trust is validated.

## Built-in protections

- No token in repository, actions secrets or workflow.
- `id-token: write` is scoped to the publish job.
- Only *published* GitHub Releases trigger publishing; pre-releases are excluded.
- Name and version must match `loopgrid-mastra` and `vX.Y.Z`.
- Repository identity and checked-out tag/commit are checked before publication.
- The npm registry is queried and an existing version is **skipped**; registry errors stop the job.
- Adapter tests, a real SDK factory smoke test, declaration checks and tarball audit run before publishing.
- The known transitive Mastra SDK dependency advisory remains a separate documented risk; do not automatically force breaking dependency downgrades.

## npm documentation

- https://docs.npmjs.com/trusted-publishers/
- https://docs.npmjs.com/generating-provenance-statements/
- https://docs.npmjs.com/staged-publishing/
