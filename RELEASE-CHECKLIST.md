# Release checklist — LoopGrid Mastra Integration v0.1.0

**Repository:** `loopgridio/loopgrid-mastra`
**Package:** `@loopgrid/mastra@0.1.0`
**State:** Source validated; GitHub CI and npm publication pending.

## Integration contract — confirmed

- [x] Native Mastra adapter independent of Claude Code, MCP and LoopGrid Core implementation.
- [x] One decision scope with exact proposed action/arguments/spec commitments and signed policy provenance.
- [x] Optional authentic human review; no fabricated approval or automatic uncertain-effect replay.
- [x] Guarded `tool_requested` before callback; tool result, external receipt and observed outcome are separate.
- [x] Privacy-preserving evidence defaults; honest boundaries for observation hooks and host authentication.

## Completed test gates

- [x] Corrected-source Node automated tests **68/68 passed** on Windows Node v24.19.0.
- [x] TypeScript declarations passed on Windows.
- [x] Installed `@mastra/core@1.75.0` native `createTool` + `createStep` guarded compatibility passed on Windows.
- [x] Real model-backed `Agent.generate()` and `Agent.stream()` passed with a synthetic in-memory tool and valid Core verification on the **corrected 68-test source**.
- [x] Local Docker LoopGrid Core `0.8.1-design-partner` E2E passed with 16 signed events, two synthetic callbacks and no verification failures.
- [x] Corrected-source isolated Core E2E and independent offline ledger validation passed; legacy non-file-attested ZIP limitation documented.
- [x] Prior npm tarball allowlist and isolated offline consumer installation tested; recheck on the final versioned package.

## Required before npm release

- [ ] GitHub `main` pushed and **all hosted CI jobs green**, including 6 OS/Node combinations plus pinned native SDK job.
- [ ] Final `@loopgrid/mastra@0.1.0` tarball inspected and installed into a fresh consumer using the tagged commit.
- [ ] Transitive moderate `sprintf-js` advisory impact assessed and remediated or risk accepted explicitly; never force-downgrade tested Mastra SDK.
- [ ] Deployment-specific review: actual reviewer authentication, Core credentials/TLS, real provider side-effect reconciliation and recovery.
- [ ] Confirm ownership/access to the npm `@loopgrid` scope and review registry publication permissions.
- [ ] Approve exact commit SHA; create `v0.1.0` tag, GitHub release, then publish npm via a separate explicit release step.

Never add provider keys or production workspace secrets to GitHub workflows. No real payment SDK is exercised by the test suite.
