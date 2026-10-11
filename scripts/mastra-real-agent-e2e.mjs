/** Opt-in live Mastra Agent.generate/stream smoke using in-memory side effect only.
 * Requires a real installed Mastra SDK, a provider key, and disposable development Core.
 * This script is not executed during package preparation or GitHub CI.
 */
import assert from 'node:assert/strict';
import {Agent} from '@mastra/core/agent';
import {createTool} from '@mastra/core/tools';
import {z} from 'zod';
import {LoopGridClient,startMastraDecision,createMastraGuardedTool} from '../src/index.js';
if (process.env.RUN_LIVE_MASTRA_AGENT_E2E !== 'YES') throw new Error('Set RUN_LIVE_MASTRA_AGENT_E2E=YES explicitly for this opt-in live model test');
const url=process.env.LOOPGRID_BASE_URL;
if (!/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/.test(url??'')) throw new Error('Only disposable loopback Core supported in live agent test');
const model=process.env.MASTRA_MODEL;
if (!model || !model.includes('/')) throw new Error('Set MASTRA_MODEL to a configured provider/model and its provider key');
const workspaceId=process.env.LOOPGRID_WORKSPACE;
if (!workspaceId || workspaceId==='default') throw new Error('Set LOOPGRID_WORKSPACE to a disposable isolated workspace with an active refund-policy');
const client=new LoopGridClient({baseUrl:url,workspaceId,apiKey:process.env.LOOPGRID_SERVICE_KEY});
let totalExecutions=0;
for(const method of ['generate','stream']){
 const args={amount:15,currency:'USD',order:`MASTRA-TEST-${method.toUpperCase()}`};
 const scope=await startMastraDecision(client,{decisionType:'synthetic_refund',agent:{id:`mastra-native-${method}`},
  authority:{scope:['refund:create'],limit_usd:100},model:{provider:model.split('/')[0],name:model.split('/').slice(1).join('/')},
  context:{prompt_version:`live-${method}-v1`},proposedAction:{tool:'sandbox_refund',arguments:args},policyFields:{amount:15,currency:'USD'},
  idempotencyKey:`mastra-live-v0.1.0-${method}-${Date.now()}`});
 const tool=createMastraGuardedTool(scope,{createTool,id:'sandbox_refund',description:'A purely synthetic, in-memory refund simulation. No real payment calls.',
  inputSchema:z.object({amount:z.number(),currency:z.string(),order:z.string()}),outputSchema:z.object({receipt:z.string()}),policyId:'refund-policy',
  execute:async()=>{totalExecutions++;return {receipt:`in-memory-${method}`}}});
 const agent=new Agent({id:`mastra-loopgrid-v0.1.0-${method}`,name:`Mastra LoopGrid ${method} v0.1.0`,instructions:'Follow the request literally and use sandbox_refund exactly once. No real payment APIs.',model,tools:{sandbox_refund:tool}});
 const prompt=`Use sandbox_refund once with amount 15, currency USD, order ${args.order}. Then report the synthetic result.`;
 let text;
 if(method==='generate'){
  const result=await agent.generate(prompt);text=result.text;
  if(typeof text==='string') await scope.recordGenerateResult(result,{runId:`mastra-live-${method}-${Date.now()}`});
 } else {
  const stream=await agent.stream(prompt);text='';
  for await(const chunk of stream.textStream) text+=chunk;
  await scope.recordModelCompleted({output:text,source:'mastra-agent-stream',runId:`mastra-live-${method}-${Date.now()}`});
 }
 assert.equal(totalExecutions,method==='generate'?1:2,'Expected exactly one real Mastra tool dispatch per agent run');
 const verify=await client.verifyDecision(scope.decisionId);assert.equal(verify.valid,true,JSON.stringify(verify.failures));
 console.log(`PASS: Mastra Agent.${method} used actual synthetic guarded tool and Core verified decision ${scope.decisionId}`);
}
console.log('PASS: Real Mastra agent generate+stream native tool execution; no external business actions');
