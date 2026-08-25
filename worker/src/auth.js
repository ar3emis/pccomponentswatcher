/**
 * Google sign-in (OAuth 2.0 authorization-code flow) and session cookies.
 */

import { sign, verify, decodeUnverified } from './jwt.js';

const SESSION_COOKIE = 'pcw_session';
const STATE_COOKIE = 'pcw_oauth_state';
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';

export function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

function cookie(name, value, { maxAge, secure = true }) {
  const bits = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

/** Redirects the visitor to Google, remembering a CSRF state and where to return. */
export async function startLogin(request, env) {
  const url = new URL(request.url);
  const returnTo = url.searchParams.get('returnTo') || '/';
  // A random state defeats login-CSRF; it is echoed back by Google and compared.
  const nonce = crypto.randomUUID();
  const state = await sign({ nonce, returnTo: returnTo.startsWith('/') ? returnTo : '/' }, env.SESSION_SECRET, 600);

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${url.origin}/auth/callback`,
    response_type: 'code',
    scope: 'openid email',
    state,
    prompt: 'select_account'
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${GOOGLE_AUTH}?${params}`,
      'Set-Cookie': cookie(STATE_COOKIE, nonce, { maxAge: 600, secure: url.protocol === 'https:' })
    }
  });
}

/** Handles Google's redirect back: exchanges the code and issues a session. */
export async function finishLogin(request, env, db) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (url.searchParams.get('error')) return redirect('/?auth=denied', url);
  if (!code || !state) return redirect('/?auth=failed', url);

  // The state must be both a token we signed and the one this browser started with.
  const claims = await verify(state, env.SESSION_SECRET);
  const expected = readCookie(request, STATE_COOKIE);
  if (!claims || !expected || claims.nonce !== expected) return redirect('/?auth=state', url);

  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: `${url.origin}/auth/callback`,
    grant_type: 'authorization_code'
  });

  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) return redirect('/?auth=exchange', url);

  const tokens = await res.json();
  // The id_token arrived directly from Google's token endpoint over TLS in a
  // request authenticated by our client secret, so its signature adds nothing;
  // Google documents skipping verification for exactly this flow. The claims
  // below are still checked, since they catch a misconfigured client.
  const idt = decodeUnverified(tokens.id_token || '');
  if (!idt) return redirect('/?auth=token', url);
  if (idt.aud !== env.GOOGLE_CLIENT_ID) return redirect('/?auth=aud', url);
  if (!/^(https:\/\/)?accounts\.google\.com$/.test(String(idt.iss))) return redirect('/?auth=iss', url);
  if (!idt.email || idt.email_verified === false) return redirect('/?auth=email', url);

  const user = await db.upsertUser(String(idt.email).toLowerCase(), idt.sub);
  const session = await sign({ uid: user.id, email: user.email }, env.SESSION_SECRET);

  const headers = new Headers({ Location: safePath(claims.returnTo) });
  headers.append('Set-Cookie', cookie(SESSION_COOKIE, session, { maxAge: 30 * 24 * 3600, secure: url.protocol === 'https:' }));
  headers.append('Set-Cookie', cookie(STATE_COOKIE, '', { maxAge: 0, secure: url.protocol === 'https:' }));
  return new Response(null, { status: 302, headers });
}

export function logout(request) {
  const url = new URL(request.url);
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': cookie(SESSION_COOKIE, '', { maxAge: 0, secure: url.protocol === 'https:' })
    }
  });
}

/** The signed-in user for a request, or null. */
export async function currentUser(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const claims = await verify(token, env.SESSION_SECRET);
  if (!claims || !claims.uid) return null;
  return { id: claims.uid, email: claims.email };
}

function redirect(to, base) {
  return new Response(null, { status: 302, headers: { Location: new URL(to, base.origin).toString() } });
}

/** Never let a returnTo bounce the visitor to another origin. */
function safePath(p) {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') ? p : '/';
}
