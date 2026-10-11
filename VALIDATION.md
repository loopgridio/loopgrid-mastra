# Validation record — LoopGrid Mastra Integration v0.1.0

**Updated:** 2026-10-11. **Status:** Source validated; npm unpublished. The environment used and the kind of evidence are identified below. Hosted CI is not represented as passed.

## Source implementation and local-Core verification

- Corrected integration source passed **68/68 automated tests**; earlier development iterations passed 64 tests before four additional regression checks and exact-action hardening.
- The build-environment test suite reported **99.27% overall line coverage** on the corrected source using Node 22.16.0 (below the published >=22.18 engine floor); coverage is a local measurement, not a Windows measurement.
- Build-environment declaration checking and npm pack validation passed. An npm tarball had been installed into an isolated offline consumer; the **new 0.1.0 versioned tarball** must be checked before publishing.
- Against isolated real LoopGrid Core `0.8.1-design-partner`, the corrected source recorded **16 signed workspace events** spanning policy allow, synthetic authenticated-review fixture and deny cases; two in-memory executions; valid signed chain; zero verification failures.
- Independent `loopgrid-verify` validated the ledger exported from the corrected-source isolated E2E using a pinned separately trusted test public key (seven validated events for the selected decision). The tested Core exported a **legacy evidence ZIP without bundle-level file attestation**.

## Maintainer Windows validations (reported from PowerShell transcript)

**Machine:** Windows PowerShell, Node `v24.19.0`; installed `@mastra/core@1.75.0`, `zod@4.6.6`, `typescript@5.9.3`.

**Security-corrected source, after four regression tests were added:**

- `npm test`: **68 passed, 0 failed**.
- `node scripts/mastra-compatibility.mjs`: **PASS** against installed Mastra `createTool`, `createStep` and guarded synthetic callback.
- `npx --no-install tsc -p tsconfig.types.json`: **passed** (no reported diagnostics).
- `node scripts/mastra-real-agent-e2e.mjs`: **PASS** through live provider-backed `Agent.generate()` and `Agent.stream()`, each calling a separate synthetic in-memory guarded tool and verifying Core decision integrity. Successful decision IDs in this Windows run: `dec_b7632662a03640b4a1aa9469`, `dec_5454e45c14094589b52f954c`.

**Earlier Docker Core E2E (prior to the final name-only edits):** Docker Core `/ready` responded with database OK, Ed25519 signer and encrypted vault; `node scripts/real-core-e2e.mjs` reported workspace `ws_c25eb861aeab4e7d`, **16 signed events**, valid verification, zero failures, two in-memory callbacks and no money moved.

**Dependency audit:** A temporary lockfile audit for the tested Mastra tree found **five moderate dependency-tree reports tracing to one `sprintf-js` DoS advisory**. This is a documented, unremediated transitive SDK finding; see `docs/DEPENDENCY-ADVISORY.md`.

## Gates not yet satisfied

- GitHub-hosted CI on Ubuntu/Windows/macOS and pinned native Mastra SDK job, with URLs and commit hash recorded.
- Final tag-specific npm tarball extraction/consumer smoke and npm scope ownership.
- Explicit dependency-advisory security decision for target customer deployments.
- Production reviewer authentication and real-business-action reconciliation/cancellation tests.
- Independent validation of a bundle-file-attested evidence ZIP from a compatible newer Core.

## Trust limitations

- Guarded tools only: arbitrary Mastra tools bypassing the wrapper are not protected by this adapter.
- Model observation is host-explicit; callback return does **not** equal confirmed external business success.
- Human approval depends on the host's verified identity; local tests use fixtures, not an identity provider.
- No exactly-once external action guarantee; ambiguous outcomes require provider reconciliation, not replay.
