/** LoopGrid Mastra decision lifecycle: host authority, Core policy, native tool execution.
 *  No Claude hooks, MCP launchers, global decision IDs, or inferred external effects.
 */
import { randomUUID, createHash } from 'node:crypto';
import { assertId } from './client.js';
import { canonicalJson, sha256Commitment } from './privacy.js';

export class LoopGridPolicyDenied extends Error {
  constructor(reason, decisionId) { super(reason); this.name = 'LoopGridPolicyDenied'; this.decisionId = decisionId; }
}
export class LoopGridApprovalRequired extends LoopGridPolicyDenied {
  constructor(decisionId) { super('A real authenticated human review is required before tool execution', decisionId); this.name = 'LoopGridApprovalRequired'; }
}
export class LoopGridReconciliationRequired extends Error {
  constructor(reason, decisionId) { super(reason); this.name = 'LoopGridReconciliationRequired'; this.decisionId = decisionId; }
}
const hasKeys = value => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
function needString(value, label) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string`); return value; }
const safeErrorName = error => ['Error','TypeError','RangeError','SyntaxError','ReferenceError','AbortError','AggregateError'].includes(error?.name) ? error.name : 'Error';
const safeName = value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,120}$/.test(value) ? value : 'unknown-tool';
function idempotency(eventType, decisionId, callId) {
  // Event-specific, workspace-safe, under Core's 160-character limit.
  const digest = createHash('sha256').update(`${eventType}|${decisionId}|${callId}`).digest('hex').slice(0, 32);
  return `mastra:${eventType}:${digest}`;
}
function validateSpec(spec) {
  if (!spec || typeof spec !== 'object') throw new TypeError('Decision specification required');
  needString(spec.decisionType, 'decisionType');
  if (!hasKeys(spec.agent)) throw new TypeError('agent must be non-empty');
  needString(spec.agent.id, 'agent.id');
  if (!hasKeys(spec.authority)) throw new TypeError('authority is required and cannot be inferred from the model');
  if (!hasKeys(spec.model)) throw new TypeError('model must be non-empty');
  needString(spec.model.name, 'model.name');
  if (!hasKeys(spec.context)) throw new TypeError('context must be non-empty');
  if (!hasKeys(spec.proposedAction)) throw new TypeError('proposedAction must describe one exact consequential tool call');
  needString(spec.proposedAction.tool, 'proposedAction.tool');
  if (!Object.hasOwn(spec.proposedAction, 'arguments') || !hasKeys(spec.proposedAction.arguments)) throw new TypeError('proposedAction.arguments must be a non-empty object');
  if (spec.privacyMode && !['redacted'].includes(spec.privacyMode)) throw new TypeError('Consequential scopes use redacted mode to allow signed policy/review recovery');
  if (spec.idempotencyKey !== undefined) assertId(spec.idempotencyKey, 'idempotencyKey');
}
/** Snapshot the submitted JSON evidence once. Never retain host-owned mutable references.
 * The exact canonical snapshot is used for hashing, Core policy input and tool binding.
 */
function snapshotSpec(spec) {
  const snapshot = JSON.parse(canonicalJson(spec));
  const deepFreeze = value => {
    if (value && typeof value === 'object') {
      for (const member of Object.values(value)) deepFreeze(member);
      Object.freeze(value);
    }
    return value;
  };
  return deepFreeze(snapshot);
}
function policyProof(verdict, policyId) {
  if (!verdict || !['auto_allowed','blocked','human_approval_required','manual_review_required'].includes(verdict.decision))
    throw new LoopGridPolicyDenied('Core returned an unrecognized policy verdict');
  if (verdict.policy_id !== policyId || typeof verdict.version !== 'string' || !verdict.version || typeof verdict.policy_digest !== 'string' || !verdict.policy_digest)
    throw new LoopGridPolicyDenied('Core policy provenance missing or mismatched');
  // Send exactly the provenance returned by Core; do not invent a policy version or authority.
  return {
    decision: verdict.decision, reason: typeof verdict.reason === 'string' ? verdict.reason : 'unspecified',
    policy_id: verdict.policy_id, version: verdict.version, policy_digest: verdict.policy_digest,
    ...(typeof verdict.input_commitment === 'string' ? {input_commitment:verdict.input_commitment} : {})
  };
}

export class MastraDecisionScope {
  constructor(client, spec, decisionId, fingerprint, specHash, { replayed = false, restored = false, policy = null } = {}) {
    this.client = client;
    Object.defineProperties(this, {
      decisionId: { value: decisionId, enumerable: true },
      spec: { value: snapshotSpec(spec), enumerable: true },
      argumentsSha256: { value: fingerprint, enumerable: true },
      specSha256: { value: specHash, enumerable: true }
    });
    this.replayed = replayed;
    this.restored = restored;
    this.policy = policy;
    this._dispatchAttempted = false;
    this._dispatchInFlight = false;
    this._reviewAction = null;
  }
  /** Explicit completed model result, supplied by the trusted host after generate()/stream(). */
  async recordModelCompleted({ output, source, runId, usage } = {}) {
    needString(source, 'source');
    if (output === undefined) throw new TypeError('Pass an actual observed model output, not an invented completion');
    const payload = {
      source, output_sha256: await sha256Commitment(output), observed_model_name: this.spec.model.name,
      ...(runId ? {mastra_run_id: assertId(runId, 'runId')} : {}),
      ...(usage && typeof usage === 'object' ? {usage_sha256: await sha256Commitment(usage)} : {})
    };
    return this.client.appendEvent(this.decisionId, {event_type:'model_completed', actor_type:'agent', actor_id:this.spec.agent.id,
      payload, ...(runId ? {idempotency_key:idempotency('model',this.decisionId,runId)} : {})});
  }
  /** Host invokes after it has awaited a real Mastra Agent.generate() response. No model call is made here. */
  async recordGenerateResult(result, { runId } = {}) {
    if (!result || typeof result !== 'object' || typeof result.text !== 'string') throw new TypeError('Expected a real Mastra generate result with text');
    return this.recordModelCompleted({output:result.text,source:'mastra-agent-generate',runId,usage:result.usage});
  }
  async evaluatePolicy(policyId) {
    if (this.replayed && !this.restored) throw new LoopGridPolicyDenied('Existing idempotent decision: do not re-evaluate or replay automatically',this.decisionId);
    if (this.policy) throw new LoopGridPolicyDenied('Production policy already evaluated for this decision', this.decisionId);
    needString(policyId,'policyId');
    const action = { ...this.spec.proposedAction.arguments, tool: this.spec.proposedAction.tool };
    const context = this.spec.context;
    let verdict;
    try { verdict = await this.client.evaluatePolicy(policyId, action, this.spec.authority, context); }
    catch { throw new LoopGridPolicyDenied('Core policy evaluation unavailable; execution denied', this.decisionId); }
    const proof = policyProof(verdict, policyId);
    await this.client.appendEvent(this.decisionId,{event_type:'policy_evaluated', actor_type:'policy',actor_id:policyId,
      payload:proof,idempotency_key:idempotency('policy',this.decisionId,policyId)});
    this.policy = proof;
    return proof;
  }
  /** Only an authenticated host / reviewer service may call this. No agent tools expose it. */
  async recordHumanReview({action, reviewer, reason, authenticatedByHost = false} = {}) {
    if (!authenticatedByHost) throw new TypeError('Host must authenticate the reviewer before recording approval');
    if (this.policy?.decision !== 'human_approval_required') throw new LoopGridPolicyDenied('This decision is not awaiting human review',this.decisionId);
    if (this._reviewAction) throw new LoopGridPolicyDenied('Review already recorded',this.decisionId);
    if (!['approve','reject'].includes(action)) throw new TypeError('Review must explicitly approve or reject');
    needString(reviewer,'reviewer'); needString(reason,'review reason');
    const result = await this.client.recordReview(this.decisionId,{action,reviewer,reason});
    this._reviewAction = action;
    return result;
  }
  async #verifyReady() {
    if (this.replayed && !this.restored) throw new LoopGridPolicyDenied('An idempotent replay cannot execute a tool automatically; use explicit verified recovery',this.decisionId);
    if (!this.policy) throw new LoopGridPolicyDenied('Policy evidence required before execution',this.decisionId);
    if (this.policy.decision === 'blocked' || this.policy.decision === 'manual_review_required') throw new LoopGridPolicyDenied('Policy did not authorize this action',this.decisionId);
    if (!['auto_allowed','human_approval_required'].includes(this.policy.decision)) throw new LoopGridPolicyDenied('Unknown policy state',this.decisionId);
    // Authoritative signed state check; in-memory flags and model-provided strings never authorize execution.
    const detail = await this.client.getDecision(this.decisionId);
    if (detail.verification?.valid !== true || detail.summary?.workspace_id !== this.client.workspaceId) throw new LoopGridPolicyDenied('Decision workspace integrity check failed',this.decisionId);
    const summary = detail.summary;
    if (summary?.proposed_action?.tool !== this.spec.proposedAction.tool || summary?.proposed_action?.arguments_sha256 !== this.argumentsSha256 || summary?.proposed_action?.spec_sha256 !== this.specSha256)
      throw new LoopGridPolicyDenied('Signed proposed action differs from expected tool and argument commitment',this.decisionId);
    if (summary.policy?.decision !== this.policy.decision || summary.policy?.policy_id !== this.policy.policy_id ||
        summary.policy?.version !== this.policy.version || summary.policy?.policy_digest !== this.policy.policy_digest)
      throw new LoopGridPolicyDenied('Recorded policy provenance missing or mismatched',this.decisionId);
    if (this.policy.decision === 'human_approval_required' && summary.approval_event !== 'human_approved') throw new LoopGridApprovalRequired(this.decisionId);
    if (summary.approval_event === 'human_rejected') throw new LoopGridPolicyDenied('Human reviewer rejected action',this.decisionId);
    // No automatic replay after tool dispatch, including ambiguous/failed prior executions.
    if (!Array.isArray(detail.events))
      throw new LoopGridPolicyDenied('Signed event history unavailable; cannot rule out a prior dispatch',this.decisionId);
    if (detail.events.some(e=>['tool_requested','tool_result','tool_executed','outcome_observed'].includes(e.event_type)))
      throw new LoopGridReconciliationRequired('Prior tool activity exists; do not automatically replay external action',this.decisionId);
  }
  /** Verified state + exact arguments, then signed tool_requested before actual execute(). */
  async executeTool({toolName, arguments: args, execute, callId = randomUUID(), onExecuted, onObserved} = {}) {
    if (this._dispatchAttempted || this._dispatchInFlight) throw new LoopGridReconciliationRequired('One consequential dispatch at a time; reconcile instead of retrying', this.decisionId);
    if (typeof execute !== 'function') throw new TypeError('execute must be a callable host-owned tool');
    if (onObserved && !onExecuted) throw new TypeError('onObserved requires a real external execution receipt');
    needString(toolName,'toolName');assertId(callId,'callId');
    // Snapshot the tool arguments before awaiting Core: the caller cannot change
    // an object between authorization and the actual tool callback (TOCTOU).
    const dispatchArgs = JSON.parse(canonicalJson(args));
    if (toolName !== this.spec.proposedAction.tool || canonicalJson(dispatchArgs) !== canonicalJson(this.spec.proposedAction.arguments))
      throw new LoopGridPolicyDenied('Tool name/arguments differ from signed proposed action',this.decisionId);
    // Claim a temporary mutex synchronously; human-review denial may safely release it before dispatch.
    this._dispatchInFlight = true;
    try { await this.#verifyReady(); } catch (error) { this._dispatchInFlight = false; throw error; }
    this._dispatchAttempted = true;
    this._dispatchInFlight = false;
    await this.client.appendEvent(this.decisionId, {event_type:'tool_requested',actor_type:'tool',actor_id:safeName(toolName),
      payload:{tool:toolName,arguments_sha256:this.argumentsSha256,call_id:callId,actual_invocation_boundary:true},
      idempotency_key:idempotency('requested',this.decisionId,callId)});
    let result;
    try { result = await execute(dispatchArgs); }
    catch (error) {
      try { await this.client.appendEvent(this.decisionId,{event_type:'tool_result',actor_type:'tool',actor_id:safeName(toolName),
        payload:{call_id:callId,status:'error',error_name:safeErrorName(error),external_effect_unknown:true},
        idempotency_key:idempotency('result',this.decisionId,callId)}); }
      catch { /* original callback may already have moved money; no retry */ }
      throw error;
    }
    // Do not translate success of JS callback to confirmed external effect.
    try { await this.client.appendEvent(this.decisionId,{event_type:'tool_result',actor_type:'tool',actor_id:safeName(toolName),
      payload:{call_id:callId,status:'returned',result_sha256:await sha256Commitment(result),external_effect_confirmed:false},
      idempotency_key:idempotency('result',this.decisionId,callId)}); }
    catch { throw new LoopGridReconciliationRequired('Tool returned but evidence receipt write failed; reconcile external state manually',this.decisionId); }
    if (onExecuted) {
      const receipt = await onExecuted(result);
      if (receipt) await this.client.recordAction(this.decisionId,{...receipt,idempotencyKey:idempotency('action',this.decisionId,callId)});
    }
    if (onObserved) {
      const observed = await onObserved(result);
      if (observed) await this.client.recordOutcome(this.decisionId,{...observed,idempotencyKey:idempotency('outcome',this.decisionId,callId)});
    }
    return {decisionId:this.decisionId, result, policyDecision:this.policy.decision, toolCallId:callId};
  }
}

/** One decision scope per consequential run. No global or cross-user mutable correlation map. */
export async function startMastraDecision(client, spec) {
  validateSpec(spec);
  spec = snapshotSpec(spec);
  const argumentsSha256 = await sha256Commitment(spec.proposedAction.arguments);
  const specHash = await sha256Commitment({agent:spec.agent,model:spec.model,authority:spec.authority,context:spec.context,proposedAction:spec.proposedAction});
  if (spec.policyFields) {
    if (!hasKeys(spec.policyFields) || Object.entries(spec.policyFields).some(([k,v])=>k==='tool'||k==='arguments_sha256'||k==='spec_sha256'||!Object.hasOwn(spec.proposedAction.arguments,k)||canonicalJson(v)!==canonicalJson(spec.proposedAction.arguments[k])))
      throw new TypeError('policyFields must be an exact safe subset of planned tool arguments');
  }
  const proposed = Object.freeze({...(spec.policyFields ?? {}), tool:spec.proposedAction.tool,arguments_sha256:argumentsSha256,spec_sha256:specHash});
  const created = await client.recordDecision({decision_type:spec.decisionType,service_name:spec.serviceName ?? 'mastra',privacy_mode:'redacted',
    agent:spec.agent,authority:spec.authority,model:spec.model,context:spec.context,
    input:{sha256:await sha256Commitment(spec.input ?? {})},proposed_action:proposed,
    metadata:{...(spec.metadata ?? {}),source:'mastra-native',proposed_only_not_executed:true},
    ...(spec.idempotencyKey ? {idempotency_key:spec.idempotencyKey}: {})});
  if (!created.decision_id) throw new TypeError('Core did not return a decision ID');
  return new MastraDecisionScope(client, spec, created.decision_id, argumentsSha256,specHash,{replayed:created.idempotent_replay === true});
}

/** Restart-safe recovery only for signed, approved decisions with NO existing tool attempts. */
export async function resumeApprovedMastraDecision(client, decisionId, spec) {
  validateSpec(spec);assertId(decisionId,'decisionId');
  spec = snapshotSpec(spec);
  const fingerprint = await sha256Commitment(spec.proposedAction.arguments);
  const specHash = await sha256Commitment({agent:spec.agent,model:spec.model,authority:spec.authority,context:spec.context,proposedAction:spec.proposedAction});
  const detail = await client.getDecision(decisionId);
  if (detail.verification?.valid !== true || detail.summary?.workspace_id !== client.workspaceId ||
    detail.summary?.proposed_action?.tool !== spec.proposedAction.tool || detail.summary?.proposed_action?.arguments_sha256 !== fingerprint || detail.summary?.proposed_action?.spec_sha256 !== specHash ||
    detail.summary?.policy?.decision !== 'human_approval_required' || detail.summary?.approval_event !== 'human_approved')
    throw new LoopGridPolicyDenied('Cannot safely recover: signed decision/policy/approval/action binding mismatch',decisionId);
  if (!Array.isArray(detail.events) || detail.events.some(e=>['tool_requested','tool_result','tool_executed','outcome_observed'].includes(e.event_type)))
    throw new LoopGridReconciliationRequired('Previous tool attempt present; recovery must not replay effects',decisionId);
  const p = detail.summary.policy;
  if (!p.policy_id || !p.version || !p.policy_digest) throw new LoopGridPolicyDenied('Verified policy provenance unavailable',decisionId);
  return new MastraDecisionScope(client,spec,decisionId,fingerprint,specHash,{replayed:true,restored:true,policy:p});
}

/** Convenience one-shot guard; approval-required actions remain pending for a real host reviewer. */
export async function runWithLoopGridPolicy(client,{policyId,execute,...spec}={}) {
  const scope = await startMastraDecision(client,spec);
  await scope.evaluatePolicy(policyId);
  return scope.executeTool({toolName:spec.proposedAction.tool,arguments:spec.proposedAction.arguments,execute});
}
