import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LoopGridPolicyDenied, LoopGridApprovalRequired,LoopGridReconciliationRequired,startMastraDecision,resumeApprovedMastraDecision,runWithLoopGridPolicy,createMastraGuardedTool,createMastraScopedObservationHooks,createMastraLoopGridTools,createMastraLoopGridSteps,sha256Commitment} from '../src/index.js';
const planned={tool:'sandbox.refund',arguments:{amount:15,currency:'USD',order:'SYNTH-001'}};
const base=()=>({decisionType:'customer_refund',agent:{id:'mastra-agent'},model:{name:'fake-llm',provider:'offline'},authority:{limit_usd:100,scope:['refund:create']},context:{prompt_version:'p-1',run_id:'r-1'},proposedAction:structuredClone(planned),idempotencyKey:'test-refund-1'});
const verdict=decision=>({decision,policy_id:'refund-policy',version:'v17',policy_digest:'abcdef123',reason:'policy engine result',input_commitment:'abcde'});
function mockCore(decision='auto_allowed') {
  const calls=[];const events=[];let created=null;let review=null;let valid=true;let pending=0;let replay=false;
  const client={workspaceId:'ws_test',
    recordDecision:async data=>{calls.push(['create',data]);created=data;return {decision_id:'dec_test',idempotent_replay:replay}},
    appendEvent:async (id,data)=>{calls.push(['event',data]);events.push({event_type:data.event_type,payload:data.payload});return {seq:events.length+1}},
    evaluatePolicy:async (...args)=>{calls.push(['evaluate',...args]);return verdict(decision)},
    recordReview:async (id,what)=>{calls.push(['review',what]);review=what.action;events.push({event_type:what.action==='approve'?'human_approved':'human_rejected'});return {state:review}},
    getDecision:async()=>({summary:{workspace_id:'ws_test',proposed_action:created?.proposed_action,policy:events.find(e=>e.event_type==='policy_evaluated')?.payload,approval_event:review==='approve'?'human_approved':review==='reject'?'human_rejected':null},events,verification:{valid}}),
    verifyDecision:async()=>({valid,checked_events:events.length,failures:[]}),
    recordAction:async(id,receipt)=>{calls.push(['action',receipt]);events.push({event_type:'tool_executed'});return {}},
    recordOutcome:async(id,receipt)=>{calls.push(['outcome',receipt]);events.push({event_type:'outcome_observed'});return {}},
  };
  return {client,calls,events,setValid:v=>valid=v,setReplay:v=>replay=v, setPending:v=>pending=v,reviewState:v=>review=v};
}
function eventTypes(calls) {return calls.filter(x=>x[0]==='event').map(x=>x[1].event_type)}
test('decision scope validates authority, agent, model, context, exact args before calling Core',async()=>{
  for(const field of ['agent','model','authority','context','proposedAction']) {const c=mockCore();const s=base();delete s[field];await assert.rejects(startMastraDecision(c.client,s),/required|non-empty|must/);assert.equal(c.calls.length,0)}
});
test('default redacted decision is proposed-only, holds hashed input/arguments, no external effects',async()=>{
  const c=mockCore();const s=base();s.input={user:'SENSITIVE_USER'};const scope=await startMastraDecision(c.client,s);
  assert.equal(scope.decisionId,'dec_test');assert.equal(c.calls.length,1);
  assert.equal(c.calls[0][1].privacy_mode,'redacted');assert.equal(c.calls[0][1].proposed_action.tool,'sandbox.refund');
  assert.equal(c.calls[0][1].proposed_action.arguments_sha256.length,64);
  assert.equal(JSON.stringify(c.calls).includes('SENSITIVE_USER'),false);
  assert.equal(JSON.stringify(c.calls).includes('SYNTH-001'),false);
});
test('signed model completion only from explicit host observation with SHA-256, retry key',async()=>{
  const c=mockCore();const scope=await startMastraDecision(c.client,base());
  await scope.recordGenerateResult({text:'private model thought',usage:{tokens:16}},{runId:'run_1'});
  assert.equal(c.calls.at(-1)[1].event_type,'model_completed');assert.equal(JSON.stringify(c.calls).includes('private model thought'),false);
  await assert.rejects(scope.recordGenerateResult({text:null}),/real Mastra/);
});
test('policy evidence includes actual version digest and input commitment',async()=>{
  const c=mockCore();const scope=await startMastraDecision(c.client,base());await scope.evaluatePolicy('refund-policy');
  assert.equal(c.calls[1][0],'evaluate');assert.equal(c.calls[1][2].amount,15);
  assert.equal(c.calls[2][1].payload.version,'v17');assert.equal(c.calls[2][1].payload.policy_digest,'abcdef123');
});
for(const decision of ['blocked','human_approval_required','manual_review_required']){
  test(`policy ${decision} denies unsigned tool dispatch`,async()=>{
    const c=mockCore(decision);const scope=await startMastraDecision(c.client,base());await scope.evaluatePolicy('refund-policy');let executions=0;
    await assert.rejects(scope.executeTool({toolName:'sandbox.refund',arguments:planned.arguments,execute:()=>{executions++}}),LoopGridPolicyDenied);
    assert.equal(executions,0);assert.equal(eventTypes(c.calls).includes('tool_requested'),false);
  });
}
test('guarded success records request then tool receipt, not business outcome',async()=>{
  const c=mockCore();const scope=await startMastraDecision(c.client,base());await scope.evaluatePolicy('refund-policy');
  let n=0;const result=await scope.executeTool({toolName:'sandbox.refund',arguments:planned.arguments,callId:'mastra-call-1',execute:()=>{n++;return {provider:'NOT_CONFIRMED'}}});
  assert.equal(n,1);assert.equal(result.result.provider,'NOT_CONFIRMED');
  assert.deepEqual(eventTypes(c.calls),['policy_evaluated','tool_requested','tool_result']);
  assert.equal(c.calls.at(-1)[1].payload.external_effect_confirmed,false);
  assert.equal(c.calls.some(x=>x[0]==='outcome'),false);
});
test('real external execution and observed outcome require trusted host receipts',async()=>{
  const c=mockCore();const scope=await startMastraDecision(c.client,base());await scope.evaluatePolicy('refund-policy');
  await scope.executeTool({toolName:'sandbox.refund',arguments:planned.arguments,execute:()=>({ref:'sandbox_42'}),
    onExecuted:async r=>({tool:'sandbox.refund',externalReference:r.ref}),
    onObserved:async r=>({source:'in-memory-sandbox',status:'succeeded',externalReference:r.ref})});
  assert.deepEqual(c.calls.filter(x=>['action','outcome'].includes(x[0])).map(x=>x[0]),['action','outcome']);
});
test('reject mismatched tool name and arguments without recording request or running callback',async()=>{
  const c=mockCore();const scope=await startMastraDecision(c.client,base());await scope.evaluatePolicy('refund-policy');let n=0;
  await assert.rejects(scope.executeTool({toolName:'other.refund',arguments:planned.arguments,execute:()=>n++}),LoopGridPolicyDenied);
  await assert.rejects(scope.executeTool({toolName:'sandbox.refund',arguments:{...planned.arguments,amount:16},execute:()=>n++}),LoopGridPolicyDenied);
  assert.equal(n,0);assert.equal(eventTypes(c.calls).includes('tool_requested'),false);
});
test('Core policy outage fails closed and leaves no request',async()=>{
  const c=mockCore();c.client.evaluatePolicy=async()=>{throw Error('private host token')};const scope=await startMastraDecision(c.client,base());
  await assert.rejects(scope.evaluatePolicy('refund-policy'),e=>e instanceof LoopGridPolicyDenied&&!e.message.includes('token'));
  assert.equal(eventTypes(c.calls).includes('tool_requested'),false);
});
test('policy evidence failure blocks dispatch',async()=>{
  const c=mockCore();c.client.appendEvent=async()=>{throw Error('unavailable')};const scope=await startMastraDecision(c.client,base());
  await assert.rejects(scope.evaluatePolicy('refund-policy'),/unavailable/);let n=0;
  await assert.rejects(scope.executeTool({toolName:'sandbox.refund',arguments:planned.arguments,execute:()=>n++}),LoopGridPolicyDenied);assert.equal(n,0);
});
test('policy version or digest missing fails closed',async()=>{
  const c=mockCore();c.client.evaluatePolicy=async()=>({decision:'auto_allowed',policy_id:'refund-policy'});
  const scope=await startMastraDecision(c.client,base());await assert.rejects(scope.evaluatePolicy('refund-policy'),LoopGridPolicyDenied);
});
test('signed ledger tampering stops dispatch',async()=>{
  const c=mockCore();const scope=await startMastraDecision(c.client,base());await scope.evaluatePolicy('refund-policy');c.setValid(false);let n=0;
  await assert.rejects(scope.executeTool({toolName:'sandbox.refund',arguments:planned.arguments,execute:()=>n++}),LoopGridPolicyDenied);assert.equal(n,0);
});
test('human review must be authenticated, real and approve matching action',async()=>{
  const c=mockCore('human_approval_required');const scope=await startMastraDecision(c.client,base());await scope.evaluatePolicy('refund-policy');
  await assert.rejects(scope.recordHumanReview({action:'approve',reviewer:'fake',reason:'x'}),/authenticate/);
  await assert.rejects(scope.recordHumanReview({action:'approve',authenticatedByHost:true,reviewer:'real'}),/reason/);
  await scope.recordHumanReview({action:'approve',authenticatedByHost:true,reviewer:'human@demo.invalid',reason:'Verified duplicate charge'});
  assert.equal(c.calls.find(x=>x[0]==='review')[1].reviewer,'human@demo.invalid');
  let n=0;await scope.executeTool({toolName:'sandbox.refund',arguments:planned.arguments,execute:()=>++n});assert.equal(n,1);
});
test('waiting approval does not permanently lock dispatch; approved review unblocks',async()=>{
  const c=mockCore('human_approval_required');const scope=await startMastraDecision(c.client,base());await scope.evaluatePolicy('refund-policy');let n=0;
  await assert.rejects(scope.executeTool({toolName:'sandbox.refund',arguments:planned.arguments,execute:()=>++n}),LoopGridApprovalRequired);
  await scope.recordHumanReview({action:'approve',reviewer:'host-human',reason:'confirmed',authenticatedByHost:true});
  await scope.executeTool({toolName:'sandbox.refund',arguments:planned.arguments,execute:()=>++n});assert.equal(n,1);
});
test('rejected human review cannot dispatch',async()=>{
  const c=mockCore('human_approval_required');const scope=await startMastraDecision(c.client,base());await scope.evaluatePolicy('refund-policy');
  await scope.recordHumanReview({action:'reject',reviewer:'real',reason:'not authorized',authenticatedByHost:true});
  await assert.rejects(scope.executeTool({toolName:'sandbox.refund',arguments:planned.arguments,execute:()=>true}),LoopGridPolicyDenied);
});
test('repeated execution on same scope cannot replay side effect',async()=>{
  const c=mockCore();const scope=await startMastraDecision(c.client,base());await scope.evaluatePolicy('refund-policy');let n=0;
  await scope.executeTool({toolName:'sandbox.refund',arguments:planned.arguments,execute:()=>++n});
  await assert.rejects(scope.executeTool({toolName:'sandbox.refund',arguments:planned.arguments,execute:()=>++n}),LoopGridReconciliationRequired);assert.equal(n,1);
});
test('concurrent execution race allows only one actual dispatch',async()=>{
  const c=mockCore();const scope=await startMastraDecision(c.client,base());await scope.evaluatePolicy('refund-policy');let n=0;
  const run=()=>scope.executeTool({toolName:'sandbox.refund',arguments:planned.arguments,execute:async()=>{n++;await new Promise(r=>setTimeout(r,5));return n}});
  const r=await Promise.allSettled([run(),run()]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(n,1);
});
test('ambiguous tool error records error only, no outcome and cannot replay',async()=>{
  const c=mockCore();const scope=await startMastraDecision(c.client,base());await scope.evaluatePolicy('refund-policy');let n=0;
  await assert.rejects(scope.executeTool({toolName:'sandbox.refund',arguments:planned.arguments,execute:()=>{n++;throw Error('real operation may have happened')}}),/may have happened/);
  assert.equal(c.calls.at(-1)[1].payload.external_effect_unknown,true);
  await assert.rejects(scope.executeTool({toolName:'sandbox.refund',arguments:planned.arguments,execute:()=>++n}),LoopGridReconciliationRequired);assert.equal(n,1);
});
test('receipt write after execution failure requires reconciliation, not replay',async()=>{
  const c=mockCore();const scope=await startMastraDecision(c.client,base());await scope.evaluatePolicy('refund-policy');
  const append=c.client.appendEvent;c.client.appendEvent=async(id,event)=>{if(event.event_type==='tool_result')throw Error('evidence down');return append(id,event)};
  let n=0;await assert.rejects(scope.executeTool({toolName:'sandbox.refund',arguments:planned.arguments,execute:()=>++n}),LoopGridReconciliationRequired);assert.equal(n,1);
});
test('idempotent create replay cannot execute without explicit recovery',async()=>{
  const c=mockCore();c.setReplay(true);const scope=await startMastraDecision(c.client,base());
  await assert.rejects(scope.evaluatePolicy('refund-policy'),LoopGridPolicyDenied);
  await assert.rejects(scope.executeTool({toolName:'sandbox.refund',arguments:planned.arguments,execute:()=>true}),LoopGridPolicyDenied);
});
test('signed approved decision can be safely rehydrated with exact binding',async()=>{
  const c=mockCore('human_approval_required');const scope=await startMastraDecision(c.client,base());await scope.evaluatePolicy('refund-policy');
  await scope.recordHumanReview({action:'approve',reviewer:'human',reason:'reviewed',authenticatedByHost:true});
  const restored=await resumeApprovedMastraDecision(c.client,'dec_test',base());let n=0;
  await restored.executeTool({toolName:'sandbox.refund',arguments:planned.arguments,execute:()=>++n});assert.equal(n,1);
  await assert.rejects(resumeApprovedMastraDecision(c.client,'dec_test',base()),LoopGridReconciliationRequired);
});
test('resume without correct args, review or valid chain fails',async()=>{
  const c=mockCore('human_approval_required');const scope=await startMastraDecision(c.client,base());await scope.evaluatePolicy('refund-policy');
  await assert.rejects(resumeApprovedMastraDecision(c.client,'dec_test',base()),LoopGridPolicyDenied);
  await scope.recordHumanReview({action:'approve',reviewer:'human',reason:'reviewed',authenticatedByHost:true});
  const bad=base();bad.proposedAction.arguments.amount=55;
  await assert.rejects(resumeApprovedMastraDecision(c.client,'dec_test',bad),LoopGridPolicyDenied);
  c.setValid(false);await assert.rejects(resumeApprovedMastraDecision(c.client,'dec_test',base()),LoopGridPolicyDenied);
});
test('concurrent decisions stay in distinct scopes with no global decision ID',async()=>{
  const a=mockCore(),b=mockCore();const [one,two]=await Promise.all([startMastraDecision(a.client,base()),startMastraDecision(b.client,base())]);
  assert.notEqual(one,two);await one.evaluatePolicy('refund-policy');assert.equal(b.calls.length,1);
});
test('single-call policy convenience also records exact request and does not fake outcome',async()=>{
  const c=mockCore();const r=await runWithLoopGridPolicy(c.client,{...base(),policyId:'refund-policy',execute:async()=>({ok:true})});
  assert.equal(r.result.ok,true);assert.deepEqual(eventTypes(c.calls),['policy_evaluated','tool_requested','tool_result']);
});
test('native Mastra createTool uses real execute(inputData, context) signature',async()=>{
  const c=mockCore(),scope=await startMastraDecision(c.client,base());let receivedCtx;
  const tool=createMastraGuardedTool(scope,{createTool:definition=>definition,id:'sandbox.refund',description:'Sandbox only',
    inputSchema:{},outputSchema:{},policyId:'refund-policy',execute:async (args,context)=>{receivedCtx=context;return args.amount}});
  const result=await tool.execute(planned.arguments,{requestContext:'TEST'});
  assert.equal(result,15);assert.equal(receivedCtx.requestContext,'TEST');
});
test('native agent observational hooks use same decision, not a new decision per call',async()=>{
  const c=mockCore();const scope=await startMastraDecision(c.client,base());const hooks=createMastraScopedObservationHooks(scope);
  await hooks.beforeToolCall({toolName:'safe.read',toolCallId:'call-1',input:{private:'SENSITIVE'}});
  await hooks.afterToolCall({toolName:'safe.read',toolCallId:'call-1',output:{private:'RESULT'}});
  assert.equal(c.calls.filter(c=>c[0]==='create').length,1);
  assert.deepEqual(eventTypes(c.calls),['tool_requested','tool_result']);
  assert.equal(JSON.stringify(c.calls).includes('SENSITIVE'),false);
  assert.equal(JSON.stringify(c.calls).includes('RESULT'),false);
});
test('observational hooks fail-safe on missing ID, duplicates, unpaired after',async()=>{
  const c=mockCore();const scope=await startMastraDecision(c.client,base());let errors=0;
  const hooks=createMastraScopedObservationHooks(scope,{onError:()=>errors++});
  await hooks.beforeToolCall({toolName:'read',input:{a:1}});
  await hooks.afterToolCall({toolName:'read',output:{a:1}});
  await hooks.beforeToolCall({toolName:'read',toolCallId:'same',input:{a:1}});
  await hooks.afterToolCall({toolName:'read',toolCallId:'same',output:{a:2}});
  await hooks.afterToolCall({toolName:'read',toolCallId:'same',output:{a:2}});
  assert.equal(errors,3);assert.deepEqual(eventTypes(c.calls),['tool_requested','tool_result']);
});
test('model-facing tools expose verify only: no approval or external action',async()=>{
  const c=mockCore();const z={object:x=>x,string:()=>true,boolean:()=>true,number:()=>true,array:()=>true,unknown:()=>true};
  const tools=createMastraLoopGridTools(c.client,{createTool:x=>x,z});assert.deepEqual(Object.keys(tools),['verifyDecision']);
  assert.equal((await tools.verifyDecision.execute({decisionId:'dec_test'})).valid,true);
});
test('Mastra native workflow factories delegate app-owned decision specification',async()=>{
  const c=mockCore();const chain={optional:()=>true};const z={object:x=>x,string:()=>chain,boolean:()=>true,unknown:()=>true,record:()=>true};
  const steps=createMastraLoopGridSteps(c.client,{createStep:x=>x,z,startDecision:startMastraDecision});
  const r=await steps.captureDecision.execute({inputData:{decisionType:'refund',agentId:'run-agent',tool:'sandbox.refund',toolArguments:planned.arguments,modelName:'fake',authority:{limit_usd:100},context:{prompt_version:'test'}}});
  assert.equal(r.proposedOnly,true);assert.equal(r.decisionId,'dec_test');
});
test('scope disallows overwrite of bound action fields by policyFields',async()=>{
  const c=mockCore();await assert.rejects(startMastraDecision(c.client,{...base(),policyFields:{tool:'evil'}}),/exact safe subset/);
});

test('recovery binds agent authority model and context to signed original specification',async()=>{
  const c=mockCore('human_approval_required');const scope=await startMastraDecision(c.client,base());await scope.evaluatePolicy('refund-policy');
  await scope.recordHumanReview({action:'approve',reviewer:'human',reason:'approved',authenticatedByHost:true});
  for(const field of ['agent','authority','model','context']) { const alt=base();alt[field]={...alt[field],tampered:'YES'};await assert.rejects(resumeApprovedMastraDecision(c.client,'dec_test',alt),LoopGridPolicyDenied); }
});


test('security: mutating caller-owned action after creation cannot change the signed dispatch',async()=>{
  const c=mockCore();const spec=base();const scope=await startMastraDecision(c.client,spec);
  spec.proposedAction.arguments.amount=999;spec.agent.id='untrusted-change';
  assert.equal(scope.spec.proposedAction.arguments.amount,15);
  assert.equal(scope.spec.agent.id,'mastra-agent');
  assert.equal(Object.isFrozen(scope.spec.proposedAction.arguments),true);
  await scope.evaluatePolicy('refund-policy');
  assert.equal(c.calls.find(x=>x[0]==='evaluate')[2].amount,15);
  let attempts=0;
  await assert.rejects(scope.executeTool({toolName:'sandbox.refund',arguments:spec.proposedAction.arguments,execute:()=>attempts++}),LoopGridPolicyDenied);
  assert.equal(attempts,0);assert.equal(eventTypes(c.calls).includes('tool_requested'),false);
});

test('security: pending Core verification cannot mutate supplied tool arguments before callback',async()=>{
  const c=mockCore();const scope=await startMastraDecision(c.client,base());await scope.evaluatePolicy('refund-policy');
  const args={...planned.arguments};let observed;
  const originalGetDecision=c.client.getDecision;
  c.client.getDecision=async()=>{args.amount=900;return originalGetDecision()};
  await scope.executeTool({toolName:'sandbox.refund',arguments:args,execute:value=>{observed=value.amount;return {ok:true}}});
  assert.equal(observed,15);assert.equal(args.amount,900);
});

test('security: guarded factory rejects preevaluated policy with different ID',async()=>{
  const c=mockCore();const scope=await startMastraDecision(c.client,base());await scope.evaluatePolicy('refund-policy');let attempts=0;
  const tool=createMastraGuardedTool(scope,{createTool:x=>x,id:'sandbox.refund',description:'Synthetic only',inputSchema:{},outputSchema:{},policyId:'other-policy',execute:()=>attempts++});
  await assert.rejects(tool.execute(planned.arguments,{}),LoopGridPolicyDenied);
  assert.equal(attempts,0);assert.equal(eventTypes(c.calls).includes('tool_requested'),false);
});

test('security: missing decision event history blocks guarded dispatch',async()=>{
  const c=mockCore();const scope=await startMastraDecision(c.client,base());await scope.evaluatePolicy('refund-policy');
  const originalGetDecision=c.client.getDecision;
  c.client.getDecision=async()=>{const d=await originalGetDecision();delete d.events;return d};
  let count=0;
  await assert.rejects(scope.executeTool({toolName:'sandbox.refund',arguments:planned.arguments,execute:()=>count++}),LoopGridPolicyDenied);
  assert.equal(count,0);assert.equal(eventTypes(c.calls).includes('tool_requested'),false);
});
