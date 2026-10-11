# First GitHub push — LoopGrid Mastra Integration v0.1.0

**Repository:** `https://github.com/loopgridio/loopgrid-mastra`
**Default branch:** `main`
**Initial commit message:** `Initial release of LoopGrid Mastra integration v0.1.0`
**Future release tag:** `v0.1.0` (**do not create until CI and release checks pass**).

## 1. Prepare the validated source

Use the final GitHub-ready v0.1.0 folder (not an earlier package). Run `npm test` (expect **68/68**), `npm pack --dry-run --json`, native Mastra compatibility and TypeScript checks using `WINDOWS-TEST-STEPS.md`. The corrected 68-test source already passed installed SDK + live synthetic agents on Windows; the version/name-only edits still need a metadata smoke check.

## 2. Initialize Git only if necessary

**If you already ran `git init` in an earlier folder**, use `git status` and `git remote -v`; do not initialize or reset the repo again. Use the provided update overlay to bring the existing folder up to the final source, remove the obsolete release-decision document, and stage all changes with `git add -A`.

**For a clean new folder only:**

```powershell
git init
git branch -M main
git remote add origin https://github.com/loopgridio/loopgrid-mastra.git
git add -A
```

Review before commit:

```powershell
git status --short
git diff --cached --name-only
git diff --cached --check
git diff --cached -- .env.example
```

No real `.env`, provider keys, evidence ZIPs, databases, `node_modules` or local execution transcripts should be staged. `.env.example` must contain placeholders only. If anything unexpected is staged, **stop and inspect it**; never push secrets.

## 3. Commit and push

```powershell
git commit -m "Initial release of LoopGrid Mastra integration v0.1.0"
git push -u origin main
```

If remote `origin` exists, verify it with `git remote -v` rather than resetting it. If the GitHub repository has commits that are absent locally, reconcile histories instead of force-pushing.

## 4. Hosted CI and version release

Open `https://github.com/loopgridio/loopgrid-mastra/actions` and confirm **all seven configurations** pass (Ubuntu/Windows/macOS × Node 22.18/24, plus Mastra native SDK on Ubuntu). No live provider credentials belong in public pull-request CI.

Record the commit SHA and CI run URL in `VALIDATION.md`. Before a version tag or npm publication, review `RELEASE-CHECKLIST.md`, the known SDK advisory in `docs/DEPENDENCY-ADVISORY.md`, and the final consumer package. Only after explicit signoff create the annotated tag `v0.1.0` and GitHub release for the **tested commit**.
