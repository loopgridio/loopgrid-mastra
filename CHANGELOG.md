# Changelog

## 0.1.0 — 2026-10-11 — Source release; npm unpublished

- Initial standalone LoopGrid Mastra framework integration using the same decision-scoped evidence contract as LoopGrid's OpenAI Agents, Vercel AI SDK and Microsoft Agent integrations. No Claude Code plugin or MCP runtime dependency.
- One application-owned consequential decision spans tool/specification commitments, policy evaluation, optional authenticated human review, tool request and callback, host-supplied execution receipts, downstream outcome and signed verification.
- Native Mastra `createTool.execute(inputData, context)` enforcement, host-owned `createStep` factories, optional non-authorizing observation hooks and read-only verification tools.
- Guarded dispatch fails closed on Core outages, missing signed history, changed policy identity, argument mutation and previous uncertain side effects. Four additional security regression tests cover the release-hardening changes.
- **68/68 automated tests** and TypeScript checks passed on the corrected source. Windows Node 24.19.0 checks also passed against installed `@mastra/core@1.75.0`, Zod 4.6.6 and TypeScript 5.9.3, including real model-driven `Agent.generate()` and `Agent.stream()` calling synthetic in-memory tools.
- Real isolated LoopGrid Core E2E and offline signed-ledger verification passed. The tested Core's legacy evidence ZIP is not bundle-file-attested.
- Known transitive Mastra dependency advisory documented in `docs/DEPENDENCY-ADVISORY.md`. **Hosted GitHub Actions CI, npm publication and production-specific security/reconciliation review remain open gates.**
