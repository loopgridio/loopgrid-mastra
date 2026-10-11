# Security and disclosure — LoopGrid Mastra Integration v0.1.0

Contact: **hello@loopgrid.io**. Do not open public issues containing API keys, reviewer identities, customer records or copied signed private evidence.

- Adapter is a standalone Mastra native package; it does not import Claude Code plugin hooks/MCP or modify Core.
- Application-owned authority and reviewer authentication cannot be inferred from LLM text or tool availability. `authenticatedByHost: true` is an assertion by trusted host code, not user authentication.
- For consequential actions use `createMastraGuardedTool`; before/after observational hooks alone do not enforce policy and cannot guarantee signed evidence before a side effect.
- Core `redacted` mode is used to preserve readable policy and approval state while hashing raw input and exact tool arguments; policy evaluations still transmit selected argument facts to the configured Core.
- External outcome recording requires an actual external receipt and observation; a JavaScript callback return proves only a local return.
- After an ambiguous dispatch or receipt-write failure, do not retry automatically. A `tool_requested` event is sufficient to disallow safe automated restart.
- Core's full workspace chain verification is required before guarded dispatch; invalidate execution if verification is false, even if the current decision itself has no error.
- Set Core HTTPS and tokens in trusted host deployment settings; never copy credentials into example code, `.env.example`, tests or npm package tarball.
- The npm package has no install lifecycle scripts and never reads `process.env` on its own. Hosted GitHub CI and any npm release remain pending. See `docs/DEPENDENCY-ADVISORY.md` for a known transitive Mastra SDK DoS advisory.

## Exact-action binding hardening

The adapter snapshots the host's JSON decision specification at scope creation and freezes that internal snapshot. It also snapshots the tool input before awaiting signed Core-state checks. This closes a local time-of-check/time-of-use route where caller-owned mutable objects could otherwise diverge from the originally signed tool argument commitment. A pre-evaluated Core policy must match the guarded tool's policy ID, and a decision detail without a readable event history fails closed. Regression tests verify all four cases.
