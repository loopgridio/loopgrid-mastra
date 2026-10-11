/** LoopGrid Mastra native decision lifecycle adapter v0.1.0.
 * Host supplies authenticated reviewer identity, policy and external side-effect receipts.
 */
export type JsonObject = Record<string, unknown>;
export type PrivacyMode = 'redacted';
export interface ClientOptions { baseUrl: string; apiKey?: string | null; workspaceId?: string; fetchImpl?: typeof fetch; timeoutMs?: number; maxResponseBytes?: number }
export interface DecisionCreated { decision_id: string; idempotent_replay?: boolean; [key: string]: unknown }
export type PolicyDecision = 'auto_allowed' | 'blocked' | 'human_approval_required' | 'manual_review_required';
export interface PolicyVerdict { decision: PolicyDecision; policy_id: string; version: string; policy_digest: string; reason: string; input_commitment?: string }
export interface Verification {valid:boolean; workspace_id?:string; checked_events:number; total_ledger_events:number; failures:unknown[]; key_id?:string}
export interface DecisionSpecification {
  decisionType: string; serviceName?: string;
  agent: JsonObject & {id:string}; authority: JsonObject; model: JsonObject & {name:string}; context: JsonObject;
  proposedAction: {tool:string;arguments:JsonObject};
  /** Fields must be an exact subset of proposedAction.arguments (e.g. amount, currency). */
  policyFields?:JsonObject; input?:JsonObject; metadata?:JsonObject; privacyMode?:PrivacyMode;idempotencyKey?:string;
}
export interface EventInput {event_type:'model_completed'|'policy_evaluated'|'tool_requested'|'tool_result'|'tool_executed'|'outcome_observed'|'telemetry_ingested'|'incident_flagged'; actor_type?:'agent'|'tool'|'integration'|'policy'|'system';actor_id?:string;payload?:JsonObject;idempotency_key?:string}
export interface ActionReceipt { tool:string;externalReference:string;actorId?:string;idempotencyKey?:string;details?:JsonObject }
export interface OutcomeReceipt { status:'succeeded'|'failed'|'pending'|'unknown';source:string;externalReference:string;actorId?:string;idempotencyKey?:string;details?:JsonObject }
export class LoopGridError extends Error {code:string;status:number|null;constructor(code:string,message:string,status?:number|null)}
export function assertId(value:string,field?:string):string;
export function validateCoreOrigin(raw:string):string;
export class LoopGridClient {
  constructor(options:ClientOptions);
  readonly workspaceId:string;readonly baseUrl:string;
  recordDecision(input:JsonObject & {decision_type:string}):Promise<DecisionCreated>;
  appendEvent(decisionId:string,input:EventInput):Promise<JsonObject>;
  evaluatePolicy(policyId:string,action:JsonObject,authority?:JsonObject,context?:JsonObject):Promise<PolicyVerdict>;
  getDecision(decisionId:string):Promise<{summary:JsonObject;events:Array<JsonObject & {event_type:string}>;verification:Verification}>;
  verifyDecision(decisionId:string):Promise<Verification>;
  verifyWorkspace():Promise<Verification>;
  downloadEvidence(decisionId:string,options?:{includePayloads?:boolean}):Promise<Uint8Array>;
  recordReview(decisionId:string,review:{action:'approve'|'reject';reviewer:string;reason:string}):Promise<JsonObject>;
  recordAction(decisionId:string,receipt:ActionReceipt):Promise<JsonObject>;
  recordOutcome(decisionId:string,receipt:OutcomeReceipt):Promise<JsonObject>;
}
export function canonicalJson(value:unknown):string;
export function sha256Commitment(value:unknown):Promise<string>;
export class LoopGridPolicyDenied extends Error {readonly decisionId?:string;constructor(reason:string,decisionId?:string)}
export class LoopGridApprovalRequired extends LoopGridPolicyDenied {constructor(decisionId:string)}
export class LoopGridReconciliationRequired extends Error {readonly decisionId?:string;constructor(reason:string,decisionId?:string)}
export interface ExecuteToolOptions<T=unknown> {
  toolName:string;arguments:JsonObject;execute:(args:JsonObject)=>Promise<T>|T;callId?:string;
  onExecuted?:(result:T)=>Promise<ActionReceipt|null|undefined>|ActionReceipt|null|undefined;
  onObserved?:(result:T)=>Promise<OutcomeReceipt|null|undefined>|OutcomeReceipt|null|undefined;
}
export class MastraDecisionScope {
  readonly client:LoopGridClient;readonly decisionId:string;readonly spec:DecisionSpecification;
  readonly argumentsSha256:string;readonly specSha256:string;readonly replayed:boolean;readonly restored:boolean;
  readonly policy:PolicyVerdict|null;
  recordModelCompleted(input:{output:unknown;source:string;runId?:string;usage?:JsonObject}):Promise<JsonObject>;
  recordGenerateResult(result:{text:string;usage?:JsonObject},options?:{runId?:string}):Promise<JsonObject>;
  evaluatePolicy(policyId:string):Promise<PolicyVerdict>;
  recordHumanReview(input:{action:'approve'|'reject';reviewer:string;reason:string;authenticatedByHost:true}):Promise<JsonObject>;
  executeTool<T>(options:ExecuteToolOptions<T>):Promise<{decisionId:string;result:T;policyDecision:PolicyDecision;toolCallId:string}>;
}
export function startMastraDecision(client:LoopGridClient,spec:DecisionSpecification):Promise<MastraDecisionScope>;
export function resumeApprovedMastraDecision(client:LoopGridClient,decisionId:string,spec:DecisionSpecification):Promise<MastraDecisionScope>;
export function runWithLoopGridPolicy<T>(client:LoopGridClient,options:DecisionSpecification & {policyId:string;execute:(args:JsonObject)=>Promise<T>|T}):Promise<{decisionId:string;result:T;policyDecision:PolicyDecision;toolCallId:string}>;
export function createMastraGuardedTool<T>(scope:MastraDecisionScope,opts:{createTool:(def:any)=>T;id:string;description:string;inputSchema:unknown;outputSchema:unknown;policyId:string;execute:(inputData:JsonObject,context:unknown)=>Promise<unknown>|unknown;onExecuted?:(result:unknown)=>Promise<ActionReceipt|null|undefined>|ActionReceipt|null|undefined;onObserved?:(result:unknown)=>Promise<OutcomeReceipt|null|undefined>|OutcomeReceipt|null|undefined}):T;
export interface MastraHookCall {toolName?:string;toolCallId?:string;input?:unknown;output?:unknown;error?:unknown}
export function createMastraScopedObservationHooks(scope:MastraDecisionScope,options?:{toolNames?:string[];onError?:(error:unknown)=>void}):{beforeToolCall:(call:MastraHookCall)=>Promise<void>;afterToolCall:(call:MastraHookCall)=>Promise<void>};
export function createMastraLoopGridTools<T>(client:LoopGridClient,factories:{createTool:(def:any)=>T;z:any}):{verifyDecision:T};
export function createMastraLoopGridSteps<T>(client:LoopGridClient,factories:{createStep:(def:any)=>T;z:any;startDecision:typeof startMastraDecision}):{captureDecision:T;verifyEvidence:T};
