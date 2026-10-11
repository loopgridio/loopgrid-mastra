# Windows validation — LoopGrid Mastra Integration v0.1.0

**Validated local baseline (2026-10-11):** Windows PowerShell, Node `v24.19.0`; `@mastra/core@1.75.0`, Zod `4.6.6`, TypeScript `5.9.3`. The corrected source passed **68/68 tests**, native SDK compatibility, declarations and model-assisted synthetic agent tests. The metadata-only version/name change should be checked before the first push.

## 1. Automated test, SDK and npm package checks

In the folder containing `package.json`:

```powershell
node --version
npm test
npm pack --dry-run --json
npm install --no-save --ignore-scripts '@mastra/core@1.75.0' 'zod@4.6.6' 'typescript@5.9.3'
node .\scripts\mastra-compatibility.mjs
npx --no-install tsc -p tsconfig.types.json
```

## 2. Isolated local Core E2E (optional rerun)

```powershell
$env:LOOPGRID_BASE_URL = 'http://127.0.0.1:8000'
Invoke-RestMethod 'http://127.0.0.1:8000/ready'
node .\scriptseal-core-e2e.mjs
```

Creates its own isolated workspace and policy. Expected: `verificationValid: true`, `sandboxExecutions: 2`, `realMoneyMoved: false`. The human review is a fixture, not a production identity provider.

## 3. Real Mastra agent (optional/billable)

Set the **replacement, unexposed** provider API key only in the local PowerShell process. Read `docs/REAL-MASTRA-SDK-TEST.md`; this test must not run with customer data or in public PR CI.

## 4. Security and release

See `docs/DEPENDENCY-ADVISORY.md` for the known transitive Mastra SDK advisory. Do not use `npm audit fix --force`. GitHub-hosted CI and npm release are separate gates; see `RELEASE-CHECKLIST.md`.
