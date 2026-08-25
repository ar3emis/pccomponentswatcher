# Deployment setup

Everything in this file needs a human: creating accounts, accepting terms and
handling payment details are steps I can't do for you. Once these are done, the
scheduled workflow takes over and you shouldn't need to touch it again.

Work through the sections in order — later ones need values from earlier ones.

---

## 0. What you're setting up

| Piece | Does what | Cost |
|---|---|---|
| Cloudflare Worker | Serves the site and the gated `/api/data` | Free tier: 100k req/day |
| Cloudflare KV | Holds the two price payloads | Free tier |
| Cloudflare D1 | Users and subscription mirror | Free tier |
| Google OAuth | Sign-in | Free |
| Stripe | $5/month subscriptions | ~2.9% + 30¢ per charge |
| GitHub Actions | Six-hourly scrape and deploy | Free for public repos |

The access rule lives in `src/core/tiers.js`:

- Not signed in → listings **≤ 16 GB**
- First 7 days after signing in → **everything** (free trial)
- Trial over, no subscription → listings **≤ 16 GB**
- Subscriber → everything
- `sameek4@gmail.com` → everything, no subscription needed

The trial is measured from `users.created_at`, so signing out and back in does
not restart it. To change its length, edit `TRIAL_DAYS` in **both**
`src/core/tiers.js` and `worker/src/tiers.js` — `npm test` fails if they differ.

---

## 1. Cloudflare

Sign up at <https://dash.cloudflare.com/sign-up>, then from the repo root:

```bash
npm install -g wrangler
wrangler login
```

Create the two stores:

```bash
cd worker
wrangler kv namespace create DATA
wrangler d1 create pcw-db
```

Each command prints an `id`. Put them into `worker/wrangler.toml`, replacing
`PLACEHOLDER_KV_ID` and `PLACEHOLDER_D1_ID`.

Create the tables:

```bash
wrangler d1 execute pcw-db --remote --file schema.sql
```

Do a first deploy so the Worker gets a URL:

```bash
cd .. && npm run export-web && cd worker && wrangler deploy
```

Note the URL it prints — something like
`https://pccomponentswatcher.<your-subdomain>.workers.dev`. **Everything below
calls this `<SITE_URL>`.**

---

## 2. Google sign-in

1. Open <https://console.cloud.google.com/> and create a project.
2. **APIs & Services → OAuth consent screen**
   - User type: **External**, then Publish it (while in "Testing" only accounts
     you list by hand can sign in).
   - Scopes: `openid` and `email` are enough. Don't request more — extra scopes
     trigger Google's verification review.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Type: **Web application**
   - Authorised JavaScript origin: `<SITE_URL>`
   - Authorised redirect URI: `<SITE_URL>/auth/callback` — must match exactly,
     including `https://` and no trailing slash.
4. Copy the **Client ID** and **Client secret**.

---

## 3. Stripe

1. Sign up at <https://dashboard.stripe.com/register> and finish account
   activation (business details, bank account) — until you do, you're in test
   mode and can't take real payments.
2. **Products → Add product**
   - Name: `PCComponentsWatcher — Full access`
   - Price: **$5.00 USD**, **Recurring, monthly**
   - Save, then copy the **price ID** (`price_…`, *not* the product ID).
3. **Developers → Webhooks → Add endpoint**
   - URL: `<SITE_URL>/api/stripe-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the **signing secret** (`whsec_…`).
4. **Developers → API keys** → copy the **Secret key** (`sk_live_…` or
   `sk_test_…` while testing).

Test with card `4242 4242 4242 4242`, any future expiry, any CVC, while your
keys are the `sk_test_…` ones.

---

## 4. Worker secrets

From `worker/`, run each and paste the value when prompted:

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put SESSION_SECRET
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_PRICE_ID
wrangler secret put STRIPE_WEBHOOK_SECRET
```

Generate `SESSION_SECRET` yourself and paste the output — never reuse one from
a document, this repo included, since anyone holding it can forge a session
cookie for any account:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Changing `SESSION_SECRET` later signs everyone out; nothing else breaks. If you
ever suspect it leaked, rotating it is the fix.

Redeploy so the secrets take effect:

```bash
wrangler deploy
```

---

## 5. GitHub Actions

The workflow scrapes every six hours, then uploads and deploys. It needs two
repository secrets — **Settings → Secrets and variables → Actions → New
repository secret**:

| Secret | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dash → My Profile → API Tokens → Create Token → *Edit Cloudflare Workers* template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dash → Workers & Pages → right-hand sidebar |

Then run it once by hand: **Actions → Publish price site → Run workflow**.

---

## 6. Check it works

1. Open `<SITE_URL>` signed out — you should see listings up to 16 GB and locked
   rows above that.
2. Open DevTools → Network → `/api/data`. Confirm the response contains **no**
   listing above 16 GB. This is the check that actually matters.
3. Sign in with a non-admin Google account — the trial banner should appear and
   everything unlocks for 7 days.
4. Subscribe with the test card — the badge should change from "Trial" to
   "Subscribed" after Stripe redirects back.
5. Sign in as `sameek4@gmail.com` — full access with no subscription.

To see the expired-trial state without waiting a week, backdate the account:

```bash
cd worker
wrangler d1 execute pcw-db --remote \
  --command "UPDATE users SET created_at = created_at - 8*86400000 WHERE email = 'you@gmail.com'"
```

Reload — the account should now read "Free" and lock everything above 16 GB.

`npm test` runs the same guarantees locally and in CI:

- `test-tier-parity` — the Node and Worker copies of the access rule agree
- `test-payload` — no locked retailer, country, URL or price is in the free payload
- `test-assets` — no payload file sits in the publicly-served asset root

---

## Before charging real money

These aren't code, but they're not optional either.

- **Terms and a privacy policy.** You'll be storing Google email addresses and
  taking recurring payments. India's DPDP Act applies to you, GDPR applies if any
  EU customer subscribes, and Stripe's own terms require a refund/cancellation
  policy be published.
- **Tax.** Stripe Tax can calculate and remit; GST registration thresholds for
  digital services in India are worth checking with an accountant.
- **Scraped data.** The prices come from retailers' pages. Reselling access to
  aggregated pricing is common and generally defensible, but several of those
  sites' terms prohibit scraping, and you're now doing it commercially rather
  than personally. Worth a look before you advertise widely.
- **Refunds.** There's no refund flow in the code. Stripe's dashboard can issue
  them manually, which is fine at low volume.
