/** Minimal, explicit LoopGrid Core REST client; no telemetry, environment reads or SDK dependencies. */
export class LoopGridError extends Error {
  constructor(code, message, status = null) {
    super(message);
    this.name = 'LoopGridError'; this.code = code; this.status = status;
  }
}

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/;
export function assertId(value, field = 'identifier') {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new LoopGridError('BAD_INPUT', `${field} must be a nonempty safe identifier`);
  return value;
}
export function validateCoreOrigin(raw) {
  if (typeof raw !== 'string') throw new LoopGridError('BAD_URL', 'Core URL is required');
  let url;
  try { url = new URL(raw); } catch { throw new LoopGridError('BAD_URL', 'Invalid Core URL'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !['http:', 'https:'].includes(url.protocol)) {
    throw new LoopGridError('BAD_URL', 'Core URL must be a clean HTTP(S) origin without credentials, path, query or fragment');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !loopback) throw new LoopGridError('INSECURE_ORIGIN', 'Remote LoopGrid Core requires HTTPS');
  return url.origin;
}
function redactError(code, status) {
  const publicMessage = status ? `LoopGrid Core request failed (HTTP ${status})` : 'LoopGrid Core request failed';
  return new LoopGridError(code, publicMessage, status);
}
export class LoopGridClient {
  constructor({ baseUrl, apiKey, workspaceId = 'default', fetchImpl = globalThis.fetch, timeoutMs = 12000, maxResponseBytes = 4_000_000 } = {}) {
    this.baseUrl = validateCoreOrigin(baseUrl);
    if (apiKey != null && (typeof apiKey !== 'string' || apiKey.trim().length === 0)) throw new LoopGridError('BAD_INPUT', 'API key must be a nonempty string');
    this.apiKey = apiKey ?? null;
    this.workspaceId = assertId(workspaceId, 'workspaceId');
    if (typeof fetchImpl !== 'function') throw new LoopGridError('BAD_INPUT', 'A fetch implementation is required');
    this.fetchImpl = fetchImpl;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new LoopGridError('BAD_INPUT', 'timeoutMs must be 1..120000');
    if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1000) throw new LoopGridError('BAD_INPUT', 'Invalid maxResponseBytes');
    this.timeoutMs = timeoutMs; this.maxResponseBytes = maxResponseBytes;
  }
  async #request(method, path, body = undefined, { binary = false } = {}) {
    const headers = { Accept: binary ? 'application/zip' : 'application/json' };
    if (this.apiKey) headers['X-LoopGrid-Key'] = this.apiKey;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let result;
    try {
      result = await this.fetchImpl(this.baseUrl + path, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch { throw redactError('NETWORK_ERROR'); }
    if (result.status < 200 || result.status >= 300) throw redactError('HTTP_ERROR', result.status);
    // Enforce size limit even without a Content-Length header.
    const size = result.headers.get('content-length');
    if (size && Number(size) > this.maxResponseBytes) throw redactError('RESPONSE_TOO_LARGE');
    let data;
    try {
      if (result.body?.getReader) {
        const reader = result.body.getReader();
        const parts = []; let total = 0;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > this.maxResponseBytes) { await reader.cancel(); throw redactError('RESPONSE_TOO_LARGE'); }
            parts.push(value);
          }
          data = new Uint8Array(total); let offset = 0;
          for (const part of parts) { data.set(part, offset); offset += part.byteLength; }
        } finally { reader.releaseLock(); }
      } else {
        data = new Uint8Array(await result.arrayBuffer());
      }
    } catch (error) {
      if (error instanceof LoopGridError) throw error;
      throw redactError('READ_ERROR');
    }
    if (data.byteLength > this.maxResponseBytes) throw redactError('RESPONSE_TOO_LARGE');
    if (binary) return data;
    try { return JSON.parse(new TextDecoder().decode(data)); } catch { throw redactError('INVALID_RESPONSE'); }
  }
  recordDecision(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.decision_type !== 'string' || !body.decision_type.trim()) {
      throw new LoopGridError('BAD_INPUT', 'decision_type is required');
    }
    return this.#request('POST', '/api/v1/decisions', { ...body, workspace_id: this.workspaceId });
  }
  appendEvent(decisionId, { event_type, actor_type = 'integration', actor_id = 'mastra', payload = {}, idempotency_key } = {}) {
    assertId(decisionId, 'decisionId');
    const allowed = ['model_completed','policy_evaluated','tool_requested','tool_result','tool_executed','outcome_observed','telemetry_ingested','incident_flagged'];
    if (!allowed.includes(event_type)) throw new LoopGridError('BAD_INPUT', 'Unsupported event type; use recordReview for human oversight');
    return this.#request('POST', `/api/v1/decisions/${encodeURIComponent(decisionId)}/events`, { event_type, actor_type, actor_id, payload, ...(idempotency_key ? { idempotency_key: assertId(idempotency_key, 'idempotency key') } : {}) });
  }
  /** Caller must supply an actual execution receipt; this method never executes the action. */
  recordAction(decisionId, { tool, externalReference, actorId = 'mastra-tool', idempotencyKey, details = {} }) {
    if (typeof tool !== 'string' || !tool.trim() || typeof externalReference !== 'string' || !externalReference.trim()) throw new LoopGridError('BAD_INPUT', 'tool and actual externalReference are required');
    return this.appendEvent(decisionId, { event_type: 'tool_executed', actor_type: 'tool', actor_id: actorId,
      payload: { ...details, tool, external_reference: externalReference }, idempotency_key: idempotencyKey });
  }
  /** Observation must come from caller's real downstream system; no synthetic success. */
  recordOutcome(decisionId, { status, source, externalReference, actorId = 'mastra-observer', idempotencyKey, details = {} }) {
    if (!['succeeded','failed','pending','unknown'].includes(status) || typeof source !== 'string' || !source.trim() || typeof externalReference !== 'string' || !externalReference.trim()) throw new LoopGridError('BAD_INPUT', 'status, observed source and externalReference are required');
    return this.appendEvent(decisionId, { event_type: 'outcome_observed', actor_type: 'integration', actor_id: actorId,
      payload: { ...details, status, verified_against: source, external_reference: externalReference }, idempotency_key: idempotencyKey });
  }
  evaluatePolicy(policyId, proposedAction, authority = {}, context = {}) {
    assertId(policyId, 'policyId');
    return this.#request('POST', `/api/v1/workspaces/${encodeURIComponent(this.workspaceId)}/policies/evaluate`, { policy_id: policyId, proposed_action: proposedAction, authority, context });
  }
  getDecision(decisionId) { return this.#request('GET', `/api/v1/decisions/${encodeURIComponent(assertId(decisionId, 'decisionId'))}`); }
  verifyDecision(decisionId) { return this.#request('GET', `/api/v1/decisions/${encodeURIComponent(assertId(decisionId, 'decisionId'))}/verify`); }
  verifyWorkspace() { return this.#request('GET', `/api/v1/integrity/verify?workspace_id=${encodeURIComponent(this.workspaceId)}`); }
  downloadEvidence(decisionId, { includePayloads = false } = {}) {
    return this.#request('GET', `/api/v1/decisions/${encodeURIComponent(assertId(decisionId, 'decisionId'))}/evidence?include_payloads=${includePayloads ? 'true' : 'false'}`, undefined, { binary: true });
  }
  /** Requires authorized real human review; separate from agent tools. */
  recordReview(decisionId, { action, reviewer, reason = '' }) {
    assertId(decisionId, 'decisionId');
    if (!['approve', 'reject'].includes(action) || typeof reviewer !== 'string' || !reviewer.trim()) throw new LoopGridError('BAD_INPUT', 'Explicit review action and real human reviewer required');
    return this.#request('POST', `/api/v1/decisions/${encodeURIComponent(decisionId)}/review`, { action, reviewer, reason });
  }
}
