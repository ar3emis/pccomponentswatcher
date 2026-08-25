/**
 * Minimal HS256 JWT, used for the session cookie.
 *
 * A signed cookie means sessions need no table and no read on every request;
 * the trade-off is that revocation waits for expiry, which is acceptable for a
 * 30-day price dashboard. Subscription state is *not* carried in the token —
 * it is read from the database per request, so a cancellation takes effect at
 * once rather than whenever the cookie happens to expire.
 */

const enc = new TextEncoder();

function b64urlEncode(bytes) {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function key(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function sign(payload, secret, ttlSeconds = 30 * 24 * 3600) {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const head = b64urlEncode(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const data = `${head}.${b64urlEncode(enc.encode(JSON.stringify(body)))}`;
  const sig = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(data));
  return `${data}.${b64urlEncode(sig)}`;
}

/** @returns the payload, or null when the token is absent, malformed, forged or expired. */
export async function verify(token, secret) {
  if (!token || token.split('.').length !== 3) return null;
  const [head, body, sig] = token.split('.');
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', await key(secret), b64urlDecode(sig), enc.encode(`${head}.${body}`));
  } catch (_) {
    return null;
  }
  if (!ok) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

/** Reads a JWT's payload WITHOUT verifying it. Only safe for a token just received over TLS. */
export function decodeUnverified(token) {
  try {
    return JSON.parse(new TextDecoder().decode(b64urlDecode(token.split('.')[1])));
  } catch (_) {
    return null;
  }
}
