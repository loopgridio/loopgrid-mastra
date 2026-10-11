# LoopGrid for Mastra

**Decision-scoped policy enforcement and verifiable evidence for Mastra agents and workflows.**

**Package:** `loopgrid-mastra` · **Version:** `0.1.0` · **Status:** source validated locally; GitHub CI and npm publication pending.

Mastra runs the agent and invokes tools. **LoopGrid Core** evaluates the configured policy and stores signed, tamper-evident evidence. **Your application** supplies the real authority, authenticated reviewer and downstream outcome. This integration binds those responsibilities to **one consequential decision** rather than creating disconnected observations for each tool call.

> **Scope:** A native Mastra framework adapter. It is not the Claude Code plugin, does not launch MCP and does not modify LoopGrid Core or `loopgrid-mcp`.

## Lifecycle and trust boundaries

| Stage | LoopGrid event / check | Authoritative source |
| --- | --- | --- |
| Proposed consequential action | `decision_created`, exact tool and SHA-256 argument/spec commitments | Application host |
| Model response, when available | `model_completed`, hashed result | Host **after** a genuine Mastra `generate()`/`stream()` response |
| Policy decision | `policy_evaluated`, ID/version/digest | LoopGrid Core policy engine |
| Human approval, if required | `human_approved` or `human_rejected` | Authenticated human through the host's review service |
| Tool dispatch | `tool_requested` **before** guarded callback | `createMastraGuardedTool()` wrapping Mastra `createTool()` |
| Tool callback return or error | `tool_result` (not proof of business success) | Application callback |
| External execution receipt, if supplied | `tool_executed` | Trusted host/provider receipt |
| Independent downstream status, if supplied | `outcome_observed` | Trusted external observer |
| Integrity check | Core `/verify`; optional separate offline verifier | Core and separately trusted signing key |

**Not every decision has a human review or external effect.** Core policy denies dispatch when blocked, pending manual review, unavailable, or missing signed policy provenance. A tool call is never silently retried after a potentially irreversible attempt. Optional observational hooks are telemetry **only** and never authorize execution.

### Validation results

- **68/68** Node tests and TypeScript declaration checks passed on the **security-corrected build**, including Windows Node.js v24.19.0. Four tests cover exact-action binding, asynchronous argument mutation, policy identity and missing signed events.
- A real installed **`@mastra/core@1.75.0`**, `zod@4.6.6` compatibility check on **Windows, Node 24.19.0**: native `createTool`, `createStep`, guarded execution.
- Real model-provider **`Agent.generate()` and `Agent.stream()`** calls on Windows: each invoked exactly one **in-memory synthetic** guarded tool; both decision records verified against a local Docker LoopGrid Core `0.8.1-design-partner`.
- Real Core E2E on the **corrected source**: a fresh disposable workspace, 16 signed events, two simulated authorized executions, a human-review **test fixture**, no real payments, valid workspace chain and zero verification failures.
- Independent offline verification of the **corrected-source** E2E exported ledger passed with the test Core's separately trusted public key; the archived Core's legacy ZIP did **not** include bundle-file attestation.

**Still open:** GitHub-hosted cross-platform CI, npm ownership/publication, and deployment-specific authentication/reconciliation assessments. A documented **moderate-severity transitive dependency advisory** exists in the tested Mastra SDK tree; see [Dependency advisory](docs/DEPENDENCY-ADVISORY.md). These tests do **not** establish production reliability for customer financial operations.

## Install

The package is currently **unpublished on npm**. For a local developer test, clone the repository or extract the GitHub-ready source ZIP and run the commands below in the folder containing `package.json`:

```sh
node --version  # supported: Node >=22.18 or Node 24
npm test
npm pack --dry-run --json
npm install --no-save --ignore-scripts @mastra/core@1.75.0 zod@4.6.6 typescript@5.9.3
npm run test:mastra
npx --no-install tsc -p tsconfig.types.json
```

The `loopgrid-mastra` adapter has **no mandatory third-party runtime dependencies**. In the host app, provide the installed `createTool`, `createStep` and Zod. The tested SDK version above is pinned for repeatability; newer versions need a compatibility rerun before adoption.

## Minimal guarded-tool integration

> **Prerequisites:** A disposable local LoopGrid Core, an existing workspace and a configured Core policy named `refund-policy` that permits the synthetic test. The sample below uses no real payment SDK.

```js
import { LoopGridClient, startMastraDecision, createMastraGuardedTool } from 'loopgrid-mastra';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// The application obtains workspace identity, policy and credentials from its trusted host.
const client = new LoopGridClient({
  baseUrl: 'http://127.0.0.1:8000', // loopback development only; HTTPS required remotely
  workspaceId: 'YOUR_DISPOSABLE_WORKSPACE_ID',
  apiKey: process.env.LOOPGRID_SERVICE_KEY, // only when your Core requires one
});

// Create one scope per consequential decision with trusted, exact arguments.
const scope = await startMastraDecision(client, {
  decisionType: 'synthetic_refund',
  agent: { id: 'support-agent' },
  authority: { scope: ['refund:create'], limit_usd: 100 },
  model: { provider: 'test', name: 'example-model' },
  context: { prompt_version: 'support-v1' },
  proposedAction: {
    tool: 'sandbox_refund',
    arguments: { amount: 15, currency: 'USD', order: 'DEMO-001' },
  },
  policyFields: { amount: 15, currency: 'USD' },
  idempotencyKey: 'synthetic-refund-example-1',
});

const sandboxRefund = createMastraGuardedTool(scope, {
  createTool,
  id: 'sandbox_refund',
  description: 'Simulate a refund in memory without contacting a payment processor',
  inputSchema: z.object({
    amount: z.number(), currency: z.string(), order: z.string(),
  }),
  outputSchema: z.object({ receipt: z.string() }),
  policyId: 'refund-policy',
  execute: async (inputData, context) => ({ receipt: 'in-memory-simulation-only' }),
  // No onExecuted/onObserved in this sample: a tool return alone is NOT
  // an externally confirmed financial action or downstream outcome.
});

// Pass sandboxRefund to an actual Mastra Agent or Workflow tool registry.
// Mastra will call execute(inputData, context), which first checks Core policy
// and the signed action binding. The model cannot grant itself approval.
```

**Important:** The prepared action arguments must exactly match the arguments Mastra actually supplies. An agent that chooses different arguments will be denied rather than silently authorizing a different action. The host may record a *genuine* model result after awaiting `agent.generate()` with `scope.recordGenerateResult(result)`, or a completed stream with `scope.recordModelCompleted(...)`. These calls are host-explicit; the adapter does **not** claim automatic tracing of all model steps.

When Core requires human review, the guarded tool refuses to dispatch. The trusted host must authenticate a reviewer before calling `scope.recordHumanReview({action:'approve', reviewer, reason, authenticatedByHost:true})`. If the process restarts, use `resumeApprovedMastraDecision()` **only** after verifying the original signed decision, approval and the absence of any prior tool attempt. `authenticatedByHost:true` **is not an authentication system**.

See [Integration contract](INTEGRATION-CONTRACT.md) for the full policy, review, recovery and side-effect boundaries, and [real Core E2E script](scripts/real-core-e2e.mjs) for reproducible disposable workspace creation.

## Native Mastra helpers

- `createMastraGuardedTool(scope, options)` — **consequential tool gate** inside Mastra's actual `createTool().execute(inputData, context)`.
- `createMastraScopedObservationHooks(scope, options)` — optional **non-authorizing telemetry** linked to the same decision. Only correlates callbacks supplying a stable `toolCallId`; never layer it over the same guarded tool.
- `createMastraLoopGridTools(client, {createTool,z})` — read-only in-agent Core verification tool (not an offline verifier).
- `createMastraLoopGridSteps(client, {createStep,z,startDecision})` — host-owned workflow decision/verification factories, not a full auto-approval workflow.
- `LoopGridClient` — explicit REST client with remote-HTTPS enforcement, redirect refusal, response limits and sanitized errors.

## Evidence, privacy and offline verification

Decision records use Core `redacted` mode, with hash commitments for raw model and tool content. **Policy evaluation sends the actual proposed action arguments and host authority to the configured Core**, so do not include secrets in tool arguments. Low-entropy SHA-256 values can be guessable; hashing does not anonymize data.

```js
const status = await client.verifyDecision(scope.decisionId); // Core-side integrity check
if (status.valid !== true) throw new Error('Signed evidence failed verification');
const zip = await client.downloadEvidence(scope.decisionId);  // payloads excluded by default
```

For independent trust, validate the export with `loopgrid-verify` and a **separately trusted public key**. The archived Core version tested here generated a **legacy, non-file-attested ZIP**: do not describe that ZIP as a fully attested evidence bundle.

## Testing and release

| Test command | Purpose |
| --- | --- |
| `npm test` | 68 adapter tests including mutation/policy security regressions; no Core/model provider needed |
| `npm run test:coverage` | Local coverage |
| `npm run test:mastra` | Installed Mastra SDK native factory/guard smoke |
| `npm run test:core` | Local disposable Core lifecycle E2E; requires `LOOPGRID_BASE_URL` |
| `node scripts/mastra-real-agent-e2e.mjs` | Opt-in real provider `generate()`/`stream()`; requires credentials and disposable Core |
| `npx --no-install tsc -p tsconfig.types.json` | Public TypeScript declaration check |
| `npm pack --dry-run --json` | Inspect npm publication file inventory |

Follow [Windows validation](WINDOWS-TEST-STEPS.md) and [real Mastra SDK test steps](docs/REAL-MASTRA-SDK-TEST.md). The [validation record](VALIDATION.md) differentiates tests done in this build environment from the Windows results reported by the maintainer. The [release checklist](RELEASE-CHECKLIST.md) is **not** complete until hosted CI and operational signoff.

**Security:** [SECURITY.md](SECURITY.md) · **Privacy:** https://loopgrid.io/privacy/ · **Support:** hello@loopgrid.io · **Homepage:** https://loopgrid.io/integrations/ · **License:** Apache-2.0.
