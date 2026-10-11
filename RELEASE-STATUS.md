# LoopGrid Mastra Integration v0.1.0 — Release status

**Date:** 2026-10-11
**Repository:** `https://github.com/loopgridio/loopgrid-mastra`
**Package name/version:** `@loopgrid/mastra@0.1.0`
**State:** Validated source package. **Not yet published to npm; no release tag until remaining gates are completed.**

## Why this integration is separate

This is a native Mastra framework adapter following the same **decision → policy → optional human approval → guarded tool call → execution evidence → observed outcome → verification** contract used by LoopGrid's other framework SDK integrations. It is not a Claude Code plugin or MCP launcher and does not alter LoopGrid Core.

## Validated behavior

- SHA-256 binding for the exact proposed tool, arguments and decision specification; Core-signed policy ID, version and digest.
- Host-authenticated review only; no model-generated approval or automatic resume following an attempted effect.
- Native Mastra guarded `createTool.execute(inputData, context)` and workflow-step factories.
- Distinct tool callback, trusted external-action receipt and downstream observed status.
- **68/68 Windows tests**, installed SDK compatibility, TypeScript check, real model-assisted `Agent.generate()` and `Agent.stream()` tool invocation and LoopGrid Core verification (synthetic tools only).
- Independently verified signed ledger from the corrected-source local E2E, with the tested legacy ZIP's lack of file attestation disclosed.

## Before release

1. Push the audited source with commit title **`Initial release of LoopGrid Mastra integration v0.1.0`**.
2. Confirm all GitHub Actions jobs green; record commit SHA and run URLs in `VALIDATION.md`.
3. Review the transitive Mastra `sprintf-js` advisory; document remediation or explicit risk acceptance for the intended deployment.
4. Confirm final consumer tarball contents, npm scope rights and application-side reviewer/authentication/reconciliation protections.
5. Only after signoff, create tag **`v0.1.0`** on the validated commit, publish a GitHub release, and separately approve npm publication.

**Source upload approval is not equivalent to production authorization or stable npm release approval.**
