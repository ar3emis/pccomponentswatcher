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

const TIERS = { ANON: 'anon', FREE: 'free', PAID: 'paid' };

function isFreeListing(listing) {
  return Number(listing.memoryGB) <= FREE_MAX_GB;
}

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(String(email || '').trim().toLowerCase());
}

/** Paid access covers an active subscription and anything still inside a paid period. */
const PAID_STATUSES = new Set(['active', 'trialing']);

function tierFor(user, subscription) {
  if (!user) return TIERS.ANON;
  if (isAdminEmail(user.email)) return TIERS.PAID;
  if (!subscription) return TIERS.FREE;
  if (PAID_STATUSES.has(subscription.status)) return TIERS.PAID;
  // A cancelled subscription keeps working until the period it was paid for ends.
  if (subscription.status === 'canceled' && Number(subscription.current_period_end) * 1000 > Date.now()) {
    return TIERS.PAID;
  }
  return TIERS.FREE;
}

module.exports = { FREE_MAX_GB, ADMIN_EMAILS, TIERS, isFreeListing, isAdminEmail, tierFor };
