/**
 * Stripe subscription handling.
 *
 * Only three things touch Stripe: creating a Checkout session, opening the
 * billing portal, and consuming webhooks. Subscription state is mirrored into
 * D1 by the webhook so that rendering a page never makes a Stripe API call.
 */

const API = 'https://api.stripe.com/v1';

async function stripeCall(env, pathname, form) {
  const res = await fetch(`${API}${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(form)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `Stripe ${pathname} failed (${res.status})`);
  return json;
}

/** Starts a $5/month subscription checkout for the signed-in user. */
export async function createCheckout(env, db, user, origin) {
  let sub = await db.getSubscription(user.id);
  let customerId = sub?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripeCall(env, '/customers', {
      email: user.email,
      'metadata[user_id]': user.id
    });
    customerId = customer.id;
    await db.linkCustomer(user.id, customerId);
  }

  const session = await stripeCall(env, '/checkout/sessions', {
    mode: 'subscription',
    customer: customerId,
    'line_items[0][price]': env.STRIPE_PRICE_ID,
    'line_items[0][quantity]': '1',
    success_url: `${origin}/?checkout=success`,
    cancel_url: `${origin}/?checkout=cancelled`,
    'metadata[user_id]': user.id,
    'subscription_data[metadata][user_id]': user.id,
    allow_promotion_codes: 'true'
  });

  return session.url;
}

/** Stripe-hosted page where the user can update payment details or cancel. */
export async function createPortal(env, db, user, origin) {
  const sub = await db.getSubscription(user.id);
  if (!sub?.stripe_customer_id) throw new Error('no billing account yet');
  const session = await stripeCall(env, '/billing_portal/sessions', {
    customer: sub.stripe_customer_id,
    return_url: `${origin}/`
  });
  return session.url;
}

// ── Webhook ────────────────────────────────────────────────────────────────

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifies Stripe's signature over the raw body.
 *
 * This is the one place where a shortcut would be a real vulnerability: without
 * it, anyone who knows the URL could POST a forged "subscription active" event
 * and grant themselves a subscription.
 */
export async function verifyWebhook(rawBody, signatureHeader, secret, toleranceSeconds = 300) {
  if (!signatureHeader) return null;

  let timestamp = null;
  const provided = [];
  for (const part of signatureHeader.split(',')) {
    const [k, v] = part.split('=', 2);
    if (k?.trim() === 't') timestamp = v;
    if (k?.trim() === 'v1') provided.push(v);
  }
  if (!timestamp || !provided.length) return null;

  // Reject replays of an old, legitimately-signed event.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return null;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBytes = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${rawBody}`));
  const expected = [...new Uint8Array(sigBytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

  if (!provided.some((p) => timingSafeEqual(p, expected))) return null;

  try {
    return JSON.parse(rawBody);
  } catch (_) {
    return null;
  }
}

/** Applies a verified event to the local subscription mirror. */
export async function applyWebhookEvent(event, db) {
  // Stripe retries on any non-2xx, so the same event can arrive more than once.
  if (!(await db.claimEvent(event.id))) return { skipped: 'duplicate' };

  const obj = event.data?.object || {};

  switch (event.type) {
    case 'checkout.session.completed': {
      const userId = obj.metadata?.user_id;
      if (!userId || !obj.subscription) return { skipped: 'no subscription on session' };
      // The session carries no status; fetch nothing — the subscription.* events
      // that follow carry it. Record the link so those can resolve the user.
      await db.saveSubscription(userId, {
        customerId: obj.customer,
        subId: obj.subscription,
        status: 'active',
        currentPeriodEnd: null
      });
      return { applied: event.type };
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      // metadata is the reliable link; fall back to the customer mapping.
      let userId = obj.metadata?.user_id;
      if (!userId) {
        const user = await db.getUserByCustomerId(obj.customer);
        userId = user?.id;
      }
      if (!userId) return { skipped: 'unknown customer' };

      await db.saveSubscription(userId, {
        customerId: obj.customer,
        subId: obj.id,
        status: event.type.endsWith('deleted') ? 'canceled' : obj.status,
        currentPeriodEnd: obj.current_period_end
      });
      return { applied: event.type };
    }

    default:
      return { ignored: event.type };
  }
}
