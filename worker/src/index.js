/**
 * PCComponentsWatcher API + site.
 *
 * The Worker serves the dashboard's static assets and one gated data endpoint.
 * The two data payloads are built by the scraper and uploaded to KV as
 * `data:free` and `data:full`; this code only picks which one to hand back. It
 * never filters a full payload down, so a bug here cannot leak a locked price —
 * the free blob simply does not contain one.
 */

import { startLogin, finishLogin, logout, currentUser } from './auth.js';
import { makeDb } from './db.js';
import { createCheckout, createPortal, verifyWebhook, applyWebhookEvent } from './stripe.js';
import { tierFor, TIERS, isAdminEmail, hasFullAccess, trialEndsAt, TRIAL_DAYS } from './tiers.js';

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      // Stripe must be verified against the raw body, before anything else reads it.
      if (pathname === '/api/stripe-webhook') return await handleWebhook(request, env);

      if (pathname === '/auth/google') return await startLogin(request, env);
      if (pathname === '/auth/callback') return await finishLogin(request, env, makeDb(env.DB));
      if (pathname === '/auth/logout') return logout(request);

      if (pathname === '/api/me') return await handleMe(request, env);
      if (pathname === '/api/data') return await handleData(request, env);
      if (pathname === '/api/checkout') return await handleCheckout(request, env, url);
      if (pathname === '/api/portal') return await handlePortal(request, env, url);

      if (pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);

      // Everything else is the static dashboard.
      return await env.ASSETS.fetch(request);
    } catch (err) {
      console.error('unhandled', pathname, err?.stack || err);
      return json({ error: 'internal error' }, 500);
    }
  }
};

/**
 * Resolves the caller's identity and entitlement in one place.
 *
 * The session cookie proves who the caller is but carries no entitlement — the
 * trial window and subscription status are read from the database on every
 * request, so a cancellation or an expiring trial takes effect immediately
 * rather than whenever the cookie happens to expire.
 */
async function resolveAccess(request, env) {
  const session = await currentUser(request, env);
  if (!session) return { user: null, tier: TIERS.ANON, subscription: null };

  const row = await makeDb(env.DB).getAccount(session.id);
  if (!row) return { user: null, tier: TIERS.ANON, subscription: null };

  const user = { id: row.id, email: row.email, created_at: row.created_at };
  const subscription = row.status
    ? {
        status: row.status,
        current_period_end: row.current_period_end,
        stripe_customer_id: row.stripe_customer_id
      }
    : row.stripe_customer_id
      ? { status: null, current_period_end: null, stripe_customer_id: row.stripe_customer_id }
      : null;

  return { user, subscription, tier: tierFor(user, subscription) };
}

async function handleMe(request, env) {
  const { user, tier, subscription } = await resolveAccess(request, env);
  const trialEnds = user ? trialEndsAt(user) : null;

  return json({
    signedIn: !!user,
    email: user?.email || null,
    tier,
    admin: !!user && isAdminEmail(user.email),
    fullAccess: hasFullAccess(tier),
    trial:
      tier === TIERS.TRIAL && trialEnds
        ? { endsAt: trialEnds, daysLeft: Math.max(0, Math.ceil((trialEnds - Date.now()) / 86400000)) }
        : null,
    trialDays: TRIAL_DAYS,
    subscription: subscription?.status
      ? { status: subscription.status, currentPeriodEnd: subscription.current_period_end, hasBilling: !!subscription.stripe_customer_id }
      : null,
    priceUSD: 5
  });
}

async function handleData(request, env) {
  const { tier } = await resolveAccess(request, env);
  const key = hasFullAccess(tier) ? 'data:full' : 'data:free';

  const body = await env.DATA.get(key, 'stream');
  if (!body) return json({ error: 'no data published yet' }, 503);

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Per-user entitlement — a shared cache must never reuse one visitor's copy.
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie',
      'X-Tier': tier
    }
  });
}

async function handleCheckout(request, env, url) {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
  const { user, tier } = await resolveAccess(request, env);
  if (!user) return json({ error: 'sign in first' }, 401);
  if (tier === TIERS.PAID) return json({ error: 'already subscribed' }, 409);

  const checkoutUrl = await createCheckout(env, makeDb(env.DB), user, url.origin);
  return json({ url: checkoutUrl });
}

async function handlePortal(request, env, url) {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
  const { user } = await resolveAccess(request, env);
  if (!user) return json({ error: 'sign in first' }, 401);

  try {
    const portalUrl = await createPortal(env, makeDb(env.DB), user, url.origin);
    return json({ url: portalUrl });
  } catch (err) {
    return json({ error: String(err.message || err) }, 400);
  }
}

async function handleWebhook(request, env) {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);

  const raw = await request.text();
  const event = await verifyWebhook(raw, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!event) return json({ error: 'invalid signature' }, 400);

  const result = await applyWebhookEvent(event, makeDb(env.DB));
  return json({ received: true, ...result });
}
