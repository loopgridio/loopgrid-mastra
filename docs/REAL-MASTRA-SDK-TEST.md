# Native Mastra SDK and live agent validation — v0.1.0

**Maintainer-reported test result, 2026-10-11:** **Passed on the corrected 68-test source**, using Windows PowerShell, Node v24.19.0, `@mastra/core@1.75.0`, Zod 4.6.6 and TypeScript 5.9.3. All consequential tool actions in these tests were **synthetic and in-memory**. Hosted GitHub CI remains unrun.

## Tested native SDK path

- `npm test`: **68/68 passed** on corrected source.
- `node scripts/mastra-compatibility.mjs`: **PASS**, actual SDK `createTool`, `createStep` and guarded-tool execution.
- `npx --no-install tsc -p tsconfig.types.json`: **passed**.
- `node scripts/mastra-real-agent-e2e.mjs`: **PASS**, real `Agent.generate()` and `Agent.stream()` each called an in-memory `sandbox_refund` tool and verified the corresponding signed LoopGrid Core decision.

## Repeat the real agent test only on a disposable Core

The user must have a model-provider API key in the **current local PowerShell session**, a running disposable Core at `127.0.0.1:8000`, and an isolated workspace with a test `refund-policy` allowing 15 USD synthetic actions. Provider calls may incur charges.

```powershell
$env:LOOPGRID_BASE_URL = 'http://127.0.0.1:8000'
$env:LOOPGRID_WORKSPACE = 'YOUR_DISPOSABLE_WORKSPACE_ID'
$env:MASTRA_MODEL = 'openai/gpt-5-mini'
$env:RUN_LIVE_MASTRA_AGENT_E2E = 'YES'
# Enter OPENAI_API_KEY securely in this PowerShell process; never type it into script source.
node .\scripts\mastra-real-agent-e2e.mjs
```

**Expected:** three `PASS:` messages; no external payment calls. Never paste credentials into chat, GitHub, logs or CI. If any key is exposed, revoke it and replace it immediately.

## Isolated Core and independent evidence

```powershell
$env:LOOPGRID_BASE_URL = 'http://127.0.0.1:8000'
node .\scriptseal-core-e2e.mjs
```

The earlier Windows Core E2E created a workspace and recorded 16 signed events, including seven for an auto-allowed decision and seven for a test-reviewed decision; chain verification succeeded. Independent offline validation was conducted **separately in the build environment** using a pinned public key and `loopgrid-verify`; the tested legacy ZIP lacked file-level attestation. Windows Core E2E did not itself run that separate offline verifier.

## Safe CI and future upgrades

- GitHub Actions uses an unsigned public-PR-safe test matrix; no real provider credentials are supplied to PR workflows.
- The CI native SDK smoke pins known-tested versions; upgrades require a compatibility rerun.
- See `docs/DEPENDENCY-ADVISORY.md`. The transitive moderate `sprintf-js` advisory has not been declared remediated.
- Synthetic local success does not demonstrate real customer reviewer authentication or real provider exactly-once side effects.
