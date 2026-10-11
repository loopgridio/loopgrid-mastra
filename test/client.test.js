import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LoopGridClient, LoopGridError, validateCoreOrigin, assertId } from '../src/index.js';

function mockClient(handler, options = {}) {
  const calls = [];
  const client = new LoopGridClient({baseUrl:'http://127.0.0.1:8000', apiKey:'fake-secret-do-not-log', workspaceId:'ws-test',
    fetchImpl: async (url, options) => { calls.push({url, options}); return handler(url, options); }, ...options });
  return {client, calls};
}
const reply = (body, code = 200, headers = {'content-type':'application/json'}) => new Response(JSON.stringify(body), {status:code, headers});

for (const uri of ['https://core.example.invalid', 'http://localhost:8000/', 'http://127.0.0.1:8000','http://[::1]:8000']) {
  test(`accept secure/loopback origin ${uri}`, () => assert.equal(typeof validateCoreOrigin(uri), 'string'));
}
for (const uri of ['http://core.example.invalid', 'https://foo:bar@core.example.invalid', 'https://core.example.invalid/x', 'https://core.example.invalid?debug=1', 'https://core.example.invalid/#foo', 'file:///tmp/z', 'https://core.example.invalid/%2fsecret', 'garbage']) {
  test(`reject unsafe Core URL ${uri}`, () => assert.throws(() => validateCoreOrigin(uri), LoopGridError));
}
test('require nonempty safe IDs', () => { for (const id of ['', 'foo/bar','../foo','foo?bar',' ']) assert.throws(() => assertId(id)); assert.equal(assertId('ws_1-a:3'), 'ws_1-a:3'); });
test('auth header scoped to Core with request body and redirect refused', async () => {
  const {client,calls} = mockClient(() => reply({decision_id:'dec_123'}));
  const result = await client.recordDecision({decision_type:'refund',workspace_id:'malicious-other', privacy_mode:'redacted'});
  assert.equal(result.decision_id,'dec_123'); assert.equal(calls[0].url,'http://127.0.0.1:8000/api/v1/decisions');
  assert.equal(calls[0].options.headers['X-LoopGrid-Key'], 'fake-secret-do-not-log');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(JSON.parse(calls[0].options.body).workspace_id, 'ws-test');
});
test('service key never embedded in errors even if returned by server', async () => {
  const {client} = mockClient(() => reply({detail:'fake-secret-do-not-log'},401));
  await assert.rejects(client.recordDecision({decision_type:'refund'}), e => e.code==='HTTP_ERROR' && e.status===401 && !e.message.includes('fake-secret'));
});
test('network errors redact transport exception and do not reveal URLs', async () => {
  const {client} = mockClient(() => {throw Error('HTTP error with fake-secret-do-not-log');});
  await assert.rejects(client.verifyWorkspace(), e => e.code==='NETWORK_ERROR' && !e.message.includes('fake-secret'));
});
test('response size header is bounded', async () => {
  const {client} = mockClient(() => reply({},200,{'content-length':'20000000'}));
  await assert.rejects(client.verifyWorkspace(), e=>e.code==='RESPONSE_TOO_LARGE');
});
test('response bytes are bounded regardless of content length', async () => {
  const {client} = mockClient(() => reply({payload:'z'.repeat(11000)}), {maxResponseBytes:1000});
  await assert.rejects(client.verifyWorkspace(), e=>e.code==='RESPONSE_TOO_LARGE');
});
test('invalid JSON surfaces sanitized failure', async () => {
  const {client} = mockClient(() => new Response('not json'));
  await assert.rejects(client.verifyWorkspace(), e=>e.code==='INVALID_RESPONSE');
});
test('recordDecision requires type and does not send anything otherwise', () => {
  const {client,calls} = mockClient(() => reply({}));
  assert.throws(() => client.recordDecision({}), LoopGridError); assert.equal(calls.length,0);
});
test('appendEvent forbids human review forgery event', () => {
  const {client,calls} = mockClient(() => reply({}));
  assert.throws(() => client.appendEvent('dec_1',{event_type:'human_approved'}), /recordReview/); assert.equal(calls.length,0);
});
test('action requires external proof reference', () => {
  const {client,calls} = mockClient(() => reply({}));
  assert.throws(()=>client.recordAction('dec_1',{tool:'stripe.refund'}), /externalReference/); assert.equal(calls.length,0);
});
test('outcome requires verified source and observed status', () => {
  const {client,calls} = mockClient(() => reply({}));
  assert.throws(()=>client.recordOutcome('dec_1',{status:'succeeded',source:'stripe'}),/externalReference/);assert.equal(calls.length,0);
});
test('append real action receipt and observed outcome use correct event types', async () => {
  const {client,calls} = mockClient(() => reply({seq:2}));
  await client.recordAction('dec_12',{tool:'sandbox.refund',externalReference:'sandbox_tx1',idempotencyKey:'action-once'});
  await client.recordOutcome('dec_12',{status:'succeeded',source:'sandbox-statement',externalReference:'sandbox_tx1'});
  assert.equal(JSON.parse(calls[0].options.body).event_type,'tool_executed');
  assert.equal(JSON.parse(calls[1].options.body).event_type,'outcome_observed');
});
test('policy evaluation uses workspace id, exact policy and proposed action', async () => {
  const {client,calls} = mockClient(()=>reply({decision:'blocked'}));
  await client.evaluatePolicy('refund-threshold',{tool:'refund',amount:15},{scope:['refund:create']});
  assert.equal(calls[0].url,'http://127.0.0.1:8000/api/v1/workspaces/ws-test/policies/evaluate');
  assert.equal(JSON.parse(calls[0].options.body).policy_id,'refund-threshold');
});
test('verification is workspace-scoped; never upgrades invalid result', async () => {
  const {client,calls} = mockClient(()=>reply({valid:false,failures:[{seq:89}],total_ledger_events:90}));
  const result=await client.verifyDecision('dec_1');assert.equal(result.valid,false);
  assert.equal(calls[0].url.endsWith('/api/v1/decisions/dec_1/verify'),true);
});
test('export excludes raw payloads by default', async () => {
  const calls=[];const {client}=mockClient((url,options)=>{calls.push({url, options}); return new Response(new Uint8Array([80,75,3,4]),{headers:{'content-type':'application/zip'}});});
  const bytes=await client.downloadEvidence('dec_1');assert.equal(bytes[0],80);
  assert.match(calls[0].url,/include_payloads=false/);
  await client.downloadEvidence('dec_1',{includePayloads:true}); assert.match(calls[1].url,/include_payloads=true/);
});
test('human review is separate, requires explicit reviewer and action', async () => {
  const {client,calls}=mockClient(()=>reply({state:'approve'}));
  assert.throws(()=>client.recordReview('dec_1',{action:'approve'}),/human reviewer/);
  await client.recordReview('dec_1',{action:'approve',reviewer:'alice@customer.example',reason:'Confirmed'});
  assert.match(calls[0].url,/review$/); assert.equal(JSON.parse(calls[0].options.body).reviewer,'alice@customer.example');
});
test('400/409 propagate code but not response contents', async () => {
  const {client}=mockClient(()=>reply({detail:'secret'},409));
  await assert.rejects(client.recordReview('dec_1',{action:'approve',reviewer:'alice'}), e=>e.status===409 && !e.message.includes('secret'));
});
test('request does not read any ambient environment variable', async () => {
  const old=process.env.LOOPGRID_SERVICE_KEY;process.env.LOOPGRID_SERVICE_KEY='ambient-do-not-use';
  try { const {client,calls}=mockClient(()=>reply({ready:true}),{apiKey:null});await client.verifyWorkspace();assert.equal(calls[0].options.headers['X-LoopGrid-Key'],undefined); }
  finally { if(old===undefined)delete process.env.LOOPGRID_SERVICE_KEY; else process.env.LOOPGRID_SERVICE_KEY=old; }
});
test('streaming response is capped before full body materialization', async () => {
  const body = new ReadableStream({start(controller){controller.enqueue(new Uint8Array(500));controller.enqueue(new Uint8Array(1200));controller.close()}});
  const {client} = mockClient(()=>new Response(body),{maxResponseBytes:1000});
  await assert.rejects(client.verifyWorkspace(),e=>e.code==='RESPONSE_TOO_LARGE');
});
