-- D1 schema for PCComponentsWatcher accounts and subscriptions.
-- Apply with:  npx wrangler d1 execute pcw-db --remote --file worker/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  google_sub  TEXT,
  created_at  INTEGER NOT NULL
);

-- One row per user. Stripe remains the source of truth; this is a local cache
-- kept current by the webhook so a page load never has to call Stripe.
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id              TEXT PRIMARY KEY REFERENCES users(id),
  stripe_customer_id   TEXT,
  stripe_sub_id        TEXT,
  status               TEXT,
  current_period_end   INTEGER,
  updated_at           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sub_customer ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_sub_stripe_id ON subscriptions(stripe_sub_id);

-- Every Stripe event id we have already applied, so a redelivered webhook is a
-- no-op rather than a duplicate state change.
CREATE TABLE IF NOT EXISTS processed_events (
  id           TEXT PRIMARY KEY,
  processed_at INTEGER NOT NULL
);
