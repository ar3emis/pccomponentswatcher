'use strict';

/**
 * Who may see which listings.
 *
 * The rule is deliberately in one place and shared by the exporter, the Worker
 * and the UI, so the three can never disagree about what is free.
 *
 * `memoryGB` is the shared capacity column: kit size for memory, VRAM for a
 * graphics card. Everything at or below the threshold is free; above it, the
 * *identity of the cheapest market* is what a subscription buys.
 */
const FREE_MAX_GB = 16;

/** Accounts that always get the full payload regardless of subscription. */
const ADMIN_EMAILS = ['sameek4@gmail.com'];

/**
 * Every new account gets full access for this long.
 *
 * The trial is derived from `users.created_at` rather than stored, so it cannot
 * drift out of sync, cannot be restarted by signing out and back in, and needs
 * no cleanup job. Signing up again with the same Google account reuses the same
 * row, so the trial does not restart.
 */
const TRIAL_DAYS = 7;

const TIERS = { ANON: 'anon', FREE: 'free', TRIAL: 'trial', PAID: 'paid' };

function isFreeListing(listing) {
  return Number(listing.memoryGB) <= FREE_MAX_GB;
}

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(String(email || '').trim().toLowerCase());
}

/** Paid access covers an active subscription and anything still inside a paid period. */
const PAID_STATUSES = new Set(['active', 'trialing']);

/** When a user's free trial ends, or null if their creation time is unknown. */
function trialEndsAt(user) {
  const created = Number(user && user.created_at);
  return Number.isFinite(created) && created > 0 ? created + TRIAL_DAYS * 86400 * 1000 : null;
}

function tierFor(user, subscription, now = Date.now()) {
  if (!user) return TIERS.ANON;
  if (isAdminEmail(user.email)) return TIERS.PAID;

  // A real subscription outranks the trial: someone who subscribes on day two
  // should be billed and shown as subscribed, not left looking like a trialist.
  if (subscription) {
    if (PAID_STATUSES.has(subscription.status)) return TIERS.PAID;
    // A cancelled subscription keeps working until the period it was paid for ends.
    if (subscription.status === 'canceled' && Number(subscription.current_period_end) * 1000 > now) {
      return TIERS.PAID;
    }
  }

  const ends = trialEndsAt(user);
  if (ends != null && now < ends) return TIERS.TRIAL;

  return TIERS.FREE;
}

/** Trial and paid see the same data; only the messaging differs. */
function hasFullAccess(tier) {
  return tier === TIERS.PAID || tier === TIERS.TRIAL;
}

module.exports = {
  FREE_MAX_GB,
  ADMIN_EMAILS,
  TRIAL_DAYS,
  TIERS,
  isFreeListing,
  isAdminEmail,
  tierFor,
  trialEndsAt,
  hasFullAccess
};
