# LoopGrid for Mastra — native integration contract v0.1.0

**Status:** v0.1.0 source validation complete; hosted CI and npm publication pending. Not production-approved. Updated 2026-10-11.

## Separation of responsibilities

- **Mastra** executes the model, validates tool arguments and owns tool invocation, workflow orchestration, streaming, cancellation and its own approval surfaces.
- **LoopGrid Core** stores workspace-scoped, signed, append-only events, evaluates active policies, accepts real human review submissions, exports evidence and verifies Ed25519 + SHA-256 workspace integrity.
- **Application host** supplies authenticated agent identity, delegated authority, model identity, versioned context, exact proposed action, actual external execution receipts, downstream outcome observations, and authentic reviewer identity. None of these are inferred from an LLM output.
- **This package** maps the events and blocks its *own guarded tool executor* unless the Core policy and signed state permit dispatch. It does not confer authority on unrelated Mastra tools.

No Claude Code `.mcp.json`, plugin hooks, MCP launcher, AI-model approval impersonation or machine credential scraping.

## Decision-scoped lifecycle

| True source | Signed LoopGrid evidence | Constraints |
| --- | --- | --- |
| Host `startMastraDecision` | `decision_created` | One consequential action per scope; exact tool, args SHA-256 and full governance-spec SHA-256 committed; redacted Core privacy mode |
| Host after actual Mastra generate/stream model observation | `model_completed` | Explicit `recordGenerateResult` or `recordModelCompleted`, hashes only; never inferred from a proposed model call |
| Core `/policies/evaluate` | `policy_evaluated` | Actual Core policy ID, version and digest required; one evaluation per decision; fail closed on error |
| Authenticated host reviewer (only if Core requires) | `human_approved` / `human_rejected` | Signed via Core review endpoint; no model-exposed approval tool |
| `createMastraGuardedTool` at real `execute(inputData, context)` boundary | `tool_requested` | Must match original exact tool ID/arguments SHA-256; written *before* actual invocation |
| Executed JavaScript callback return/throw | `tool_result` | Hash-only success/failure receipt; never evidence of external business success |
| Trusted host receipt from provider or simulated sandbox | `tool_executed` | Only when explicitly supplied; callback return is insufficient |
| Trusted downstream observer | `outcome_observed` | Host-supplied source, external reference and status; no inference |
| Core or external CLI | `/verify`, portable ZIP | Service-side verification is distinct from independent offline trusted-key verification |

### Enforce/observe distinction

- **Consequential execution** MUST use `createMastraGuardedTool` with real Core evaluation and action-binding. An agent `beforeToolCall` or arbitrary telemetry callback is not an equivalent authorization barrier.
- **Optional `createMastraScopedObservationHooks`** is telemetry only; it requires an explicit Mastra `toolCallId` for matching before and after events. The published agent hook docs do not guarantee the ID in every runtime callback, so missing or ambiguous IDs are skipped and reported to `onError`. It never creates a new decision; it must not be layered over the same guarded action to avoid duplicate tool evidence.
- Policy-required actions must not be executed outside the guarded executor. A host that catches a denial and bypasses the guard breaks the contract.
- The decision specification is snapshotted and immutable within its scope, and incoming tool arguments are independently snapshotted before asynchronous integrity checks; later caller mutations cannot change the authorized action. Signed Core state must include the original event history and matching policy ID/version/digest.
- If `tool_requested` was persisted but the process crashed before response, a resume **must not replay** the external effect; reconcile manually.

### Approval recovery

- `recordHumanReview` requires the host to authenticate the real reviewer *before* it calls this method (`authenticatedByHost:true` is an explicit attestation, not an authentication mechanism).
- `resumeApprovedMastraDecision` reads and verifies Core state, compares signed tool/arguments/spec commitments, requires a recorded approval, and refuses to resume if a prior tool attempt exists. No policy or approval is fabricated.
- A Mastra native `requireApproval` prompt is **not itself** a LoopGrid human review. The host must bind the approval to the same signed action and call the separate review endpoint. In native Mastra workflows, use host-owned suspend/resume boundaries and the same decision scope.

## Privacy / security

- Default to `redacted` Core mode; original model/tool input or output content is transmitted as commitments, not raw values, by integration capture helpers. Policy evaluation necessarily sends the *selected policy facts* and exact action arguments to the configured Core.
- SHA-256 commitments of low-entropy values may be guessed. Do not represent them as anonymity.
- The app controls the Core URL/key explicitly. Remote Core must use HTTPS. URL credentials are refused, cross-host redirect following is disabled, responses and timeouts bounded, and Core exceptions sanitized.
- The integration has no side-effect retry. Event idempotency keys prevent duplicate evidence when a host retries a specific event; they cannot guarantee exactly-once external actions. After ambiguous failure reconcile with the real provider.
- Core's workspace-wide verification includes historical events: a tampered event anywhere in the workspace invalidates verification even when the current decision itself is sound.

## Framework API contract

Mastra docs (July 2026 tool-hook release): `beforeToolCall` can block, `afterToolCall` occurs after returned/failed invocation, and `createTool` is the tool-execution boundary. The tested adapter targets `@mastra/core >=1.49.0` with JavaScript and Zod; actual installed SDK compatibility **passed on Windows with `@mastra/core@1.75.0`**, including guarded `createTool()` and `createStep()` factories; hosted CI and production operations remain release gates. The native tool runs `execute(inputData, context)`. See `scripts/mastra-compatibility.mjs` and `docs/REAL-MASTRA-SDK-TEST.md`.

## Explicitly not included

No direct Stripe/Salesforce/ServiceNow action execution; no production payment, no automated authenticated review, no inference of policy from generic Mastra approval flags, no standalone offline verifier bundled, and no production operational guarantee from an isolated local Core test. No direct changes to LoopGrid Core or the existing MCP package.
