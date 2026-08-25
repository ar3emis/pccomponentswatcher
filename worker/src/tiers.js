/**
 * Worker-side copy of the tier rule.
 *
 * `src/core/tiers.js` is CommonJS and shared by the Node exporter and the
 * Electron app; Workers need ES modules. The rule itself is small and must not
 * drift, so `tools/test-tier-parity.js` fails the build if the two disagree.
 */

export const FREE_MAX_GB = 16;
export const ADMIN_EMAILS = ['sameek4@gmail.com'];
export const TIERS = { ANON: 'anon', FREE: 'free', PAID: 'paid' };

export function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(String(email || '').trim().toLowerCase());
}

const PAID_STATUSES = new Set(['active', 'trialing']);

export function tierFor(user, subscription) {
  if (!user) return TIERS.ANON;
  if (isAdminEmail(user.email)) return TIERS.PAID;
  if (!subscription) return TIERS.FREE;
  if (PAID_STATUSES.has(subscription.status)) return TIERS.PAID;
  if (subscription.status === 'canceled' && Number(subscription.current_period_end) * 1000 > Date.now()) {
    return TIERS.PAID;
  }
  return TIERS.FREE;
}
