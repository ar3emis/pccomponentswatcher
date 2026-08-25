/** D1 access. Every statement is bound, never interpolated. */

export function makeDb(d1) {
  return {
    async upsertUser(email, googleSub) {
      const existing = await d1.prepare('SELECT id, email FROM users WHERE email = ?').bind(email).first();
      if (existing) {
        if (googleSub) await d1.prepare('UPDATE users SET google_sub = ? WHERE id = ?').bind(googleSub, existing.id).run();
        return existing;
      }
      const id = crypto.randomUUID();
      await d1
        .prepare('INSERT INTO users (id, email, google_sub, created_at) VALUES (?, ?, ?, ?)')
        .bind(id, email, googleSub || null, Date.now())
        .run();
      return { id, email };
    },

    getUserById(id) {
      return d1.prepare('SELECT id, email FROM users WHERE id = ?').bind(id).first();
    },

    getUserByEmail(email) {
      return d1.prepare('SELECT id, email FROM users WHERE email = ?').bind(email).first();
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
