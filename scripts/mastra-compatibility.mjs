/** REAL installed @mastra/core+Zod native import and tool-factory smoke.
 * No Core daemon or provider credentials needed; this is NOT Agent.generate/stream.
 */
import assert from 'node:assert/strict';
import {startMastraDecision,createMastraGuardedTool,createMastraLoopGridTools,createMastraLoopGridSteps} from '../src/index.js';
let createTool,createStep,z;
try {
  ({createTool}=await import('@mastra/core/tools'));
  ({createStep}=await import('@mastra/core/workflows'));
  ({z}=await import('zod'));
} catch {
  console.error('FAIL: Actual Mastra SDK/Zod unavailable. Install @mastra/core@^1.49.0 and zod@^4 before claiming SDK compatibility.');
  process.exit(2);
}
let created,policy,reviewState,events=[];const calls=[];
const core={workspaceId:'ws_native_test',
 recordDecision:async data=>{created=data;calls.push('decision');return {decision_id:'dec_native'}},
 evaluatePolicy:async()=>({decision:'auto_allowed',policy_id:'refund-policy',version:'17.3',policy_digest:'digest-test',reason:'allowed'}),
 appendEvent:async(id,input)=>{events.push(input);calls.push(input.event_type);return {seq:events.length}},
 getDecision:async()=>({summary:{workspace_id:'ws_native_test',proposed_action:created.proposed_action,policy:events.find(x=>x.event_type==='policy_evaluated')?.payload,approval_event:reviewState},events:events.map(x=>({event_type:x.event_type})),verification:{valid:true}}),
 verifyDecision:async()=>({valid:true,checked_events:events.length,failures:[]}),
 recordReview:async()=>({}),
};
const args={amount:15,currency:'USD',order:'NO-MONEY'};
const scope=await startMastraDecision(core,{decisionType:'customer_refund',agent:{id:'native-sdk'},authority:{limit_usd:100},model:{name:'fake-test-model'},context:{prompt_version:'native-smoke'},proposedAction:{tool:'sandbox_refund',arguments:args},policyFields:{amount:15}});
const tool=createMastraGuardedTool(scope,{createTool,id:'sandbox_refund',description:'Synthetic in-memory action only',
 inputSchema:z.object({amount:z.number(),currency:z.string(),order:z.string()}),
 outputSchema:z.object({receipt:z.string()}),policyId:'refund-policy',execute:async()=>({receipt:'in-memory-1'})});
assert.equal(tool.id,'sandbox_refund');
assert.equal(typeof tool.execute,'function');
const r=await tool.execute(args,{});
assert.equal(r.receipt,'in-memory-1');
assert.deepEqual(calls,['decision','policy_evaluated','tool_requested','tool_result']);
const view=createMastraLoopGridTools(core,{createTool,z});assert.equal(view.verifyDecision.id,'loopgrid-verify-decision');
const steps=createMastraLoopGridSteps(core,{createStep,z,startDecision:startMastraDecision});
assert.equal(steps.captureDecision.id,'loopgrid-capture-decision');
assert.equal(steps.verifyEvidence.id,'loopgrid-verify-evidence');
console.log('PASS: REAL installed Mastra createTool + createStep native factories and guarded tool execution');
console.log('NOTE: Agent.generate and Agent.stream remain separate live SDK/provider tests.');
