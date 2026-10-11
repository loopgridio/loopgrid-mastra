/** Native Mastra adapter → real, isolated LoopGrid Core. NO real business-system actions.
 * The real Mastra SDK check is a separate gate. */
import assert from 'node:assert/strict';
import {LoopGridClient,LoopGridPolicyDenied,LoopGridApprovalRequired,LoopGridReconciliationRequired,startMastraDecision,resumeApprovedMastraDecision,createMastraGuardedTool} from '../src/index.js';
const url=process.env.LOOPGRID_BASE_URL;
if (!url || !/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/.test(url)) throw Error('Set LOOPGRID_BASE_URL to an isolated loopback development Core');
const post=async(path,body)=>{
 const r=await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error'});
 if (!r.ok) throw new Error(`Local sandbox setup failed HTTP ${r.status}: ${path}`);
 return r.json();
};
const workspace=await post('/api/v1/workspaces',{name:`Mastra native lifecycle E2E ${Date.now()}`,environment:'development',privacy_mode:'redacted',retention_days:7});
await post(`/api/v1/workspaces/${workspace.workspace_id}/policies`,{policy_id:'refund-policy',name:'Synthetic refund policy',version:'17.3',rule:{type:'amount_threshold',field:'amount',auto_approve_max:20,hard_limit:100,currency:'USD'},active:true});
const client=new LoopGridClient({baseUrl:url,workspaceId:workspace.workspace_id});
let executions=0;let realMoneyMoved=false;
const plan=amount=>({decisionType:'customer_refund',agent:{id:'mastra-demo-agent',version:'0.1.0'},authority:{limit_usd:100,scope:['refund:create']},
 model:{provider:'test',name:'offline-synthetic'},context:{prompt_version:'synthetic-v1',request_type:'local-test'},
 proposedAction:{tool:'sandbox.refund',arguments:{amount,currency:'USD',order:'DEMO-NO-MONEY'}},policyFields:{amount,currency:'USD'},
 input:{synthetic_customer:'not-real'},idempotencyKey:`mastra-v0.1.0-e2e-${Date.now()}-${amount}`});
const makeTool=scope=>createMastraGuardedTool(scope,{createTool:x=>x,id:'sandbox.refund',description:'In-memory test only',inputSchema:{},outputSchema:{},policyId:'refund-policy',
 execute:async args=>{executions++;return {receipt:`local-sandbox-${executions}`,amount:args.amount}},
 onExecuted:async result=>({tool:'sandbox.refund',externalReference:result.receipt}),
 onObserved:async result=>({status:'succeeded',source:'in-memory-local-test-ledger',externalReference:result.receipt})});
const allowed=await startMastraDecision(client,plan(15));
await allowed.recordModelCompleted({output:'Observed fake model proposal: refund $15',source:'synthetic-model-fixture',runId:'fake-run-1'});
const autoProof=await allowed.evaluatePolicy('refund-policy');assert.equal(autoProof.decision,'auto_allowed');assert.equal(autoProof.version,'17.3');
const allowResult=await makeTool(allowed).execute(allowed.spec.proposedAction.arguments,{});
assert.equal(allowResult.receipt,'local-sandbox-1');
const allowDetail=await client.getDecision(allowed.decisionId);
assert.deepEqual(allowDetail.events.map(x=>x.event_type),['decision_created','model_completed','policy_evaluated','tool_requested','tool_result','tool_executed','outcome_observed']);
assert.equal(allowDetail.verification.valid,true);
const approved=await startMastraDecision(client,plan(50));
const approvalProof=await approved.evaluatePolicy('refund-policy');assert.equal(approvalProof.decision,'human_approval_required');
await assert.rejects(makeTool(approved).execute(approved.spec.proposedAction.arguments,{}),LoopGridApprovalRequired);
assert.equal(executions,1);
await approved.recordHumanReview({action:'approve',reviewer:'local-e2e-authenticated-test-host',reason:'synthetic verified duplicate charge',authenticatedByHost:true});
const resumed=await resumeApprovedMastraDecision(client,approved.decisionId,approved.spec);
await makeTool(resumed).execute(resumed.spec.proposedAction.arguments,{});
assert.equal(executions,2);
await assert.rejects(resumeApprovedMastraDecision(client,approved.decisionId,approved.spec),LoopGridReconciliationRequired);
const approvedDetail=await client.getDecision(approved.decisionId);
assert.deepEqual(approvedDetail.events.map(x=>x.event_type),['decision_created','policy_evaluated','human_approved','tool_requested','tool_result','tool_executed','outcome_observed']);
assert.equal(approvedDetail.verification.valid,true);
for(const amount of [150]){
 const blocked=await startMastraDecision(client,plan(amount));await blocked.evaluatePolicy('refund-policy');
 await assert.rejects(makeTool(blocked).execute(blocked.spec.proposedAction.arguments,{}),LoopGridPolicyDenied);
 assert.equal(executions,2);
}
const chain=await client.verifyWorkspace();assert.equal(chain.valid,true,JSON.stringify(chain.failures));
const bundle=await client.downloadEvidence(approved.decisionId);assert.equal(bundle[0],0x50);assert.equal(bundle[1],0x4b);
if(process.env.LOOPGRID_EVIDENCE_ZIP_PATH){const {writeFile}=await import('node:fs/promises');await writeFile(process.env.LOOPGRID_EVIDENCE_ZIP_PATH,bundle);}
console.log(JSON.stringify({profile:'LoopGrid Mastra Integration v0.1.0',framework:'mastra-native tool execution adapter',coreWorkspace:workspace.workspace_id,
 decisionIds:{autoAllowed:allowed.decisionId,approved:approved.decisionId},policyVersions:['17.3'],
 autoEvents:allowDetail.events.length,approvedEvents:approvedDetail.events.length,workspaceEvents:chain.total_ledger_events,
 verificationValid:chain.valid,failures:chain.failures,sandboxExecutions:executions,realMoneyMoved,
 independentOfflineVerification:'separate verifier required',mastraSdkNativeAgent:'separate npm SDK gate'},null,2));
