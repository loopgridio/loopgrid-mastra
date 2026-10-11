import { LoopGridClient, startMastraDecision, createMastraGuardedTool, resumeApprovedMastraDecision, type DecisionSpecification, type MastraDecisionScope } from '../src/index.js';
const core=new LoopGridClient({baseUrl:'http://127.0.0.1:8000',workspaceId:'ws_test'});
const spec:DecisionSpecification={decisionType:'refund',agent:{id:'x'},model:{name:'synthetic'},authority:{limit_usd:10},context:{prompt_version:'v1'},proposedAction:{tool:'refund',arguments:{amount:5}}};
const scope:Promise<MastraDecisionScope>=startMastraDecision(core,spec);
async function check() { const s=await scope;await s.evaluatePolicy('refund');await s.recordHumanReview({action:'approve',reviewer:'human',reason:'reviewed',authenticatedByHost:true});
 const t=createMastraGuardedTool(s,{createTool:x=>x,id:'refund',description:'A synthetic action',inputSchema:{},outputSchema:{},policyId:'refund',execute: async (input,context)=>({input,context})});
 await resumeApprovedMastraDecision(core,s.decisionId,spec);return t;
}
void check;
