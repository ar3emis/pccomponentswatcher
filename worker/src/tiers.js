/**
 * Worker-side copy of the tier rule.
 *
 * `src/core/tiers.js` is CommonJS and shared by the Node exporter and the
 * Electron app; Workers need ES modules. The rule itself is small and must not
 * drift, so `tools/test-tier-parity.js` fails the build if the two disagree.
 */

export const FREE_MAX_GB = 16;
export const ADMIN_EMAILS = ['sameek4@gmail.com'];
export const TRIAL_DAYS = 7;
export const TIERS = { ANON: 'anon', FREE: 'free', TRIAL: 'trial', PAID: 'paid' };

export function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(String(email || '').trim().toLowerCase());
}

const PAID_STATUSES = new Set(['active', 'trialing']);

/** When a user's free trial ends, or null if their creation time is unknown. */
export function trialEndsAt(user) {
  const created = Number(user && user.created_at);
  return Number.isFinite(created) && created > 0 ? created + TRIAL_DAYS * 86400 * 1000 : null;
}

export function tierFor(user, subscription, now = Date.now()) {
  if (!user) return TIERS.ANON;
  if (isAdminEmail(user.email)) return TIERS.PAID;

  // A real subscription outranks the trial: someone who subscribes on day two
  // should be billed and shown as subscribed, not left looking like a trialist.
  if (subscription) {
    if (PAID_STATUSES.has(subscription.status)) return TIERS.PAID;
    if (subscription.status === 'canceled' && Number(subscription.current_period_end) * 1000 > now) {
      return TIERS.PAID;
    }
  }

  const ends = trialEndsAt(user);
  if (ends != null && now < ends) return TIERS.TRIAL;

  return TIERS.FREE;
}

/** Trial and paid see the same data; only the messaging differs. */
export function hasFullAccess(tier) {
  return tier === TIERS.PAID || tier === TIERS.TRIAL;
}
