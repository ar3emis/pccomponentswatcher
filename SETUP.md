# Deployment setup

Everything in this file needs a human: creating accounts, accepting terms and
handling payment details are steps I can't do for you. Once these are done, the
scheduled workflow takes over and you shouldn't need to touch it again.

Work through the sections in order — later ones need values from earlier ones.

**Status as of 2026-08-25: sections 1, 2 and 5 are done. Only Stripe (section 3)
and the last two secrets in section 4 are left.** The site is live at
<https://pccomponentswatcher.sameek4.workers.dev> — signed out it correctly
shows ≤16GB listings with the rest locked, and signing in as `sameek4@gmail.com`
correctly gets full access as the admin account. What's still missing:

- The Google OAuth consent screen is in **Testing** mode, so only
  `sameek4@gmail.com` (added as a test user) can sign in. Publishing it to let
  any visitor sign in needs a privacy policy — see "Before charging real money"
  below — filled in on the Branding page, then Audience → Publish app.
- Stripe was skipped entirely: no product, no webhook, no keys. Sign-in and the
  trial work today; subscribing does not.

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

## 1. Cloudflare — done

`<SITE_URL>` is <https://pccomponentswatcher.sameek4.workers.dev>. The `DATA`
KV namespace and `pcw-db` D1 database exist, their ids are in
`worker/wrangler.toml`, `schema.sql` has been applied, and the Worker is
deployed and serving the gated `/api/data` correctly. Nothing to do here unless
you want to move to a custom domain instead of `*.workers.dev`.

---

## 2. Google sign-in — done, but still in Testing

The OAuth client exists (project `pccomponentswatcher`), `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are set as Worker secrets, and signing in works. It's
deliberately left in **Testing** mode rather than published — publishing needs
a privacy policy link on the Branding page, which is a legal document, not
something to fill in with a placeholder. Right now only emails you add under
**Google Auth Platform → Audience → Test users** can sign in (100 max,
`sameek4@gmail.com` is already one). To let anyone sign in:

1. Write a real privacy policy and terms page and host them somewhere.
2. **Google Auth Platform → Branding** → fill in the app home page and privacy
   policy link.
3. **Google Auth Platform → Audience** → **Publish app**.

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

## 4. Worker secrets — Google and session done, Stripe left

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `SESSION_SECRET` are already set
(the last one was machine-generated and never written anywhere, including
here). Once section 3 gives you Stripe's values, from `worker/` run each and
paste the value when prompted:

```bash
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_PRICE_ID
wrangler secret put STRIPE_WEBHOOK_SECRET
```

Redeploy so the secrets take effect:

```bash
wrangler deploy
```

(If you ever need to rotate `SESSION_SECRET`, generate a fresh one yourself —
`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
— and `wrangler secret put SESSION_SECRET`. That signs everyone out; nothing
else breaks.)

---

## 5. GitHub Actions — done

`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set as repository
secrets, and a manual run was kicked off to confirm the full pipeline (scrape →
build → publish to KV → deploy) works unattended — check **Actions → Publish
price site** for its result if you want to see it. Once green, the six-hourly
schedule takes over on its own.

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
