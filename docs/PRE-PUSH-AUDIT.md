# GitHub source and publication audit — LoopGrid Mastra v0.1.0

**Audit date:** 2026-10-11. **Intended repo:** `https://github.com/loopgridio/loopgrid-mastra`. Nothing was pushed by the audit process.

## Inventory and boundaries

- Standalone native Mastra integration: Core REST client, decision scope, guarded tool, observational hooks, read-only verifier tool and host-owned workflow steps.
- No Claude Code plugin artifacts, MCP launcher, Core database, live user data or embedded API keys in the source package inventory.
- Apache-2.0 `LICENSE` and `NOTICE.md` included; source files listed in npm's `files` allowlist. Tests, environment examples, E2E scripts, CI and development documents are **not** part of the npm tarball.

## Validations and security changes

| Check | Result and limitation |
| --- | --- |
| Automated tests | **68/68 passed** on audited corrected source in Windows Node v24.19.0 (reported by maintainer) |
| Native SDK | Mastra `1.75.0` guarded `createTool` and `createStep` **passed** on corrected source in Windows |
| Real LLM-driven agents | `Agent.generate()` and `Agent.stream()` each passed using synthetic in-memory tool and Core integrity check on corrected source |
| Real Core | Corrected-source isolated E2E **16 signed workspace events**, valid chain and two sandbox callbacks |
| Offline signed-ledger verification | **Passed separately** with trusted test public key; legacy ZIP lacks bundle-file attestation |
| TypeScript declarations | **Passed** with installed TypeScript `5.9.3` on Windows |
| Hosted CI | **Pending**, must be checked after first push |
| npm publish | **Not attempted**; npm scope rights and signoff pending |

**Security fix before the final source baseline:** The decision scope was changed to snapshot caller-provided action/specification values and tool inputs before asynchronous verification. Four regression tests ensure post-creation and in-flight mutations cannot change the committed action, mismatched policy IDs are denied, and missing signed events block guarded dispatch. The base lifecycle was preserved.

CI pins Mastra/Zod/TypeScript versions for the first compatibility matrix. The dependency audit found a transitive `sprintf-js` moderate DoS advisory in Mastra's dependency chain. No forced downgrade has been applied; release risk decision remains pending.

## Pre-commit checks

1. Inspect `git diff --cached --name-only` and `git diff --cached --check`; ensure only intended source/documents are staged.
2. Examine `.env.example` for placeholders only; confirm `.env`, `node_modules`, credentials, evidence ZIPs and provider responses are not staged.
3. Run `npm test`, native Mastra compatibility, TypeScript checking and `npm pack --dry-run --json` on the **v0.1.0** package metadata.
4. Commit as **`Initial release of LoopGrid Mastra integration v0.1.0`** and push to `main` only after these checks.
5. Review all hosted jobs before any GitHub release tag or npm publication. See `RELEASE-CHECKLIST.md`.
