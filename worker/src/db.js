/** D1 access. Every statement is bound, never interpolated. */

export function makeDb(d1) {
  return {
    async upsertUser(email, googleSub) {
      // created_at is never rewritten for an existing user: the trial is derived
      // from it, so touching it here would hand out a fresh trial on every login.
      const existing = await d1.prepare('SELECT id, email, created_at FROM users WHERE email = ?').bind(email).first();
      if (existing) {
        if (googleSub) await d1.prepare('UPDATE users SET google_sub = ? WHERE id = ?').bind(googleSub, existing.id).run();
        return existing;
      }
      const id = crypto.randomUUID();
      const now = Date.now();
      await d1
        .prepare('INSERT INTO users (id, email, google_sub, created_at) VALUES (?, ?, ?, ?)')
        .bind(id, email, googleSub || null, now)
        .run();
      return { id, email, created_at: now };
    },

    getUserById(id) {
      return d1.prepare('SELECT id, email, created_at FROM users WHERE id = ?').bind(id).first();
    },

    getUserByEmail(email) {
      return d1.prepare('SELECT id, email, created_at FROM users WHERE email = ?').bind(email).first();
    },

    /**
     * User row plus subscription in one round trip. Both are needed on every
     * request that returns data, and the trial depends on users.created_at.
     */
    getAccount(userId) {
      return d1
        .prepare(
          `SELECT u.id, u.email, u.created_at,
                  s.stripe_customer_id, s.stripe_sub_id, s.status, s.current_period_end
           FROM users u
           LEFT JOIN subscriptions s ON s.user_id = u.id
           WHERE u.id = ?`
        )
        .bind(userId)
        .first();
    },

    getSubscription(userId) {
      return d1
        .prepare('SELECT stripe_customer_id, stripe_sub_id, status, current_period_end FROM subscriptions WHERE user_id = ?')
        .bind(userId)
        .first();
    },

    getUserByCustomerId(customerId) {
      return d1
        .prepare('SELECT u.id, u.email FROM users u JOIN subscriptions s ON s.user_id = u.id WHERE s.stripe_customer_id = ?')
        .bind(customerId)
        .first();
    },

    /** Records the Stripe customer before checkout, so the webhook can find the user. */
    linkCustomer(userId, customerId) {
      return d1
        .prepare(
          `INSERT INTO subscriptions (user_id, stripe_customer_id, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id = excluded.stripe_customer_id, updated_at = excluded.updated_at`
        )
        .bind(userId, customerId, Date.now())
        .run();
    },

    saveSubscription(userId, { customerId, subId, status, currentPeriodEnd }) {
      return d1
        .prepare(
          `INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_sub_id, status, current_period_end, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             stripe_customer_id = excluded.stripe_customer_id,
             stripe_sub_id      = excluded.stripe_sub_id,
             status             = excluded.status,
             current_period_end = excluded.current_period_end,
             updated_at         = excluded.updated_at`
        )
        .bind(userId, customerId || null, subId || null, status || null, currentPeriodEnd || null, Date.now())
        .run();
    },

    /** @returns true when this event has not been applied before. */
    async claimEvent(eventId) {
      try {
        await d1.prepare('INSERT INTO processed_events (id, processed_at) VALUES (?, ?)').bind(eventId, Date.now()).run();
        return true;
      } catch (_) {
        return false; // PRIMARY KEY collision — already handled.
      }
    }
  };
}
