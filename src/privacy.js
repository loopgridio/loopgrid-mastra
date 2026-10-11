/** Privacy-by-default hash commitments. Hashes of guessable values do not make them anonymous. */
function canonical(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (typeof value === 'object') {
    if (seen.has(value)) throw new TypeError('Cyclic evidence values are not supported');
    seen.add(value);
    const result = Array.isArray(value) ? value.map(v => canonical(v, seen)) : Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k], seen)]));
    seen.delete(value); return result;
  }
  return null;
}
export function canonicalJson(value) { return JSON.stringify(canonical(value)); }
export async function sha256Commitment(value) {
  const payload = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', payload);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}
