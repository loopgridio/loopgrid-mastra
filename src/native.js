/** Mastra-native factories; no imports from Mastra in the runtime dependency graph. */
import { LoopGridPolicyDenied, LoopGridReconciliationRequired } from './integration.js';
import { sha256Commitment } from './privacy.js';

/** Authoritative policy boundary INSIDE the actual createTool execute(), not a telemetry hook. */
export function createMastraGuardedTool(scope, { createTool, id, description, inputSchema, outputSchema, policyId, execute, onExecuted, onObserved } = {}) {
  if (typeof createTool !== 'function') throw new TypeError('Use createTool from @mastra/core/tools');
  if (!id || !description || !inputSchema || !outputSchema || !policyId || typeof execute !== 'function') throw new TypeError('Tool ID, schema, policy and actual executor are required');
  if (scope.spec.proposedAction.tool !== id) throw new LoopGridPolicyDenied('Guarded tool ID must equal the planned tool ID',scope.decisionId);
  return createTool({id,description,inputSchema,outputSchema,
    // Mastra v1 execute(inputData, context). Never assume tool input comes wrapped in {inputData}.
    execute: async (inputData, context) => {
      if (!scope.policy) await scope.evaluatePolicy(policyId);
      if (scope.policy?.policy_id !== policyId)
        throw new LoopGridPolicyDenied('Guarded tool policy ID does not match the evaluated Core policy',scope.decisionId);
      const result = await scope.executeTool({toolName:id,arguments:inputData,
        execute: args=>execute(args,context),onExecuted,onObserved});
      return result.result;
    }
  });
}

/** Read-only observation, tied to an application-owned consequential decision.
 *  Not a policy enforcement boundary. Each callback MUST carry a stable toolCallId.
 *  Mastra hooks that omit toolCallId cannot be unambiguously correlated across parallel calls;
 *  use createMastraGuardedTool for consequential actions instead.
 */
export function createMastraScopedObservationHooks(scope,{toolNames,onError}={}) {
  if (toolNames && (!Array.isArray(toolNames) || toolNames.some(n=>typeof n !== 'string'))) throw new TypeError('toolNames must be an array');
  const pending = new Map();
  const seen = new Set();
  const report = error=>{ try { onError?.(error); } catch { /* observational only */ } };
  return {
    async beforeToolCall({toolName,input,toolCallId}={}) {
      if (toolNames && !toolNames.includes(toolName)) return;
      if (typeof toolCallId !== 'string' || !toolCallId.trim()) {report(new Error('Missing toolCallId; observation skipped to prevent false correlation'));return;}
      if (pending.has(toolCallId) || seen.has(toolCallId)) {report(new Error('Duplicate toolCallId; observation skipped'));return;}
      try {
        const hash = await sha256Commitment(input ?? null);
        await scope.client.appendEvent(scope.decisionId, {event_type:'tool_requested',actor_type:'tool',actor_id:toolName,
          payload:{call_id:toolCallId,tool:toolName,arguments_sha256:hash,capture_source:'mastra-beforeToolCall',observational_only:true},
          idempotency_key:`mastra-observe-request:${scope.decisionId}:${toolCallId}`});
        pending.set(toolCallId,{toolName,inputHash:hash});
      } catch(error) { report(error); }
    },
    async afterToolCall({toolName,toolCallId,output,error}={}) {
      if (toolNames && !toolNames.includes(toolName)) return;
      const paired=pending.get(toolCallId);
      if (!paired || paired.toolName !== toolName) {report(new Error('Unpaired Mastra afterToolCall; no outcome inferred'));return;}
      pending.delete(toolCallId);seen.add(toolCallId);
      try {
        const hash=await sha256Commitment(error ? {safe_error_name:safeErrorName(error)} : output ?? null);
        await scope.client.appendEvent(scope.decisionId,{event_type:'tool_result',actor_type:'tool',actor_id:toolName,
          payload:{call_id:toolCallId,status:error?'error':'returned',result_sha256:hash,external_effect_confirmed:false,observational_only:true},
          idempotency_key:`mastra-observe-result:${scope.decisionId}:${toolCallId}`});
      } catch(captureError) {report(captureError);}
    }
  };
}
function safeErrorName(error) {return ['Error','TypeError','RangeError','SyntaxError','AbortError'].includes(error?.name)?error.name:'Error';}

/** Optional read-only tools. Does not expose approval, policy mutation or external execution to LLM. */
export function createMastraLoopGridTools(client,{createTool,z}={}) {
  if (typeof createTool!=='function' || !z?.object) throw new TypeError('Pass installed Mastra createTool and zod');
  const verifyDecision = createTool({id:'loopgrid-verify-decision',description:'Verify an existing LoopGrid decision chain via Core (not offline verification).',
    inputSchema:z.object({decisionId:z.string()}),
    outputSchema:z.object({decisionId:z.string(),valid:z.boolean(),checkedEvents:z.number(),failures:z.array(z.unknown()),offlineVerifierUsed:z.boolean()}),
    execute:async ({decisionId}) => {const v=await client.verifyDecision(decisionId);return {decisionId,valid:v.valid===true,checkedEvents:v.checked_events??0,failures:v.failures??[],offlineVerifierUsed:false};}
  });
  return {verifyDecision};
}

/** Workflow-step bridge explicitly scopes decisions, never infers policy or human review. */
export function createMastraLoopGridSteps(client,{createStep,z,startDecision}={}) {
  if (typeof createStep!=='function'||!z?.object || typeof startDecision!=='function') throw new TypeError('Pass createStep, zod and application startDecision factory');
  const captureDecision=createStep({id:'loopgrid-capture-decision',
    inputSchema:z.object({decisionType:z.string(),agentId:z.string(),tool:z.string(),toolArguments:z.record(z.string(),z.unknown()),modelName:z.string(),authority:z.record(z.string(),z.unknown()),context:z.record(z.string(),z.unknown())}),
    outputSchema:z.object({decisionId:z.string(),proposedOnly:z.boolean()}),
    execute:async ({inputData})=>{const scope=await startDecision(client,{decisionType:inputData.decisionType,agent:{id:inputData.agentId},authority:inputData.authority,model:{name:inputData.modelName},context:inputData.context,proposedAction:{tool:inputData.tool,arguments:inputData.toolArguments}});return {decisionId:scope.decisionId,proposedOnly:true};}
  });
  const verifyEvidence=createStep({id:'loopgrid-verify-evidence',inputSchema:z.object({decisionId:z.string()}),
    outputSchema:z.object({decisionId:z.string(),valid:z.boolean(),offlineVerifierUsed:z.boolean()}),
    execute:async ({inputData})=>{const v=await client.verifyDecision(inputData.decisionId);return {decisionId:inputData.decisionId,valid:v.valid===true,offlineVerifierUsed:false};}});
  return {captureDecision,verifyEvidence};
}
