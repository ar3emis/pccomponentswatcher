# PCComponentsWatcher

Tracks **live DDR5 memory and graphics-card prices** worldwide and converts
every price to INR at the day's rate.

Ships as a Windows desktop app and as a public website, both built from the
same dashboard code.

## What it does

- Scrapes retailer listing pages directly — no third-party price API sits in between.
- Covers real, verified retailers only: a country is added when a genuine
  scrapeable storefront for it is found, not on the strength of the country
  existing. See [Retailers covered](#retailers-covered).
- Shows each price in the shop's own currency **and** in INR, using live mid-market rates.
- Records price history locally, so trends build up the longer you run it.
- Compares the same product across countries side by side, and charts the gaps.

## Products tracked

**Memory** — DDR5 kits of 16 / 24 / 32 / 48 / 64 / 96 / 128 GB from Corsair and
G.Skill first, then Kingston, Crucial, ADATA/XPG, TeamGroup, Patriot and other
established brands.

**Graphics cards** — GeForce RTX 50 and 40 series (including the 32 GB RTX 5090
and the 16 GB RTX 5080 / 5070 Ti), Radeon RX 9000 and 7000 series, the 32 GB
Radeon AI PRO R9700, and Intel Arc — from every major board partner.

Workstation boards are tracked alongside the consumer cards, since they compete
for the same buyers at the high-VRAM end: NVIDIA's RTX PRO Blackwell line (up to
the 96 GB RTX PRO 6000), RTX Ada Generation, the RTX A-series (A6000 down to
A4000), and AMD's Radeon PRO W-series.

Cards can be filtered by vendor (NVIDIA / AMD / Intel) before picking a model,
so the two ecosystems stay easy to tell apart.

## Running it

```
npm install
npm start
```

## Building the installer

```
npm run dist
```

The NSIS installer lands in `dist/`.

## The website

```
npm run export-web    # scrape, then build site/ and dist-data/
npm run dev-web       # serve it locally with a stub API
npm test              # the access-control guarantees
```

`web/bridge.js` stands in for the desktop preload, serving the same API surface
from the Worker, so `renderer/app.js` and `renderer/charts.js` are reused
byte-for-byte between the desktop app and the site.

Add `--no-browser` to skip the retailers that need a real browser engine, which
is much faster when you only want to check the HTTP sources.

`npm run dev-web` serves `/?tier=anon`, `/?tier=free` and `/?tier=paid` so each
access level can be seen without Google or Stripe configured.

### Access control

Signing in with Google starts a **7-day free trial** with full access. After it
ends the site stays free up to **16 GB** — memory kits and graphics cards alike.
Above that, a listing's *price range* is public but **which market and retailer
has it** requires a $5/month subscription. That split is deliberate: the
aggregation across every tracked market is the thing worth paying for, so
revealing the retailer would give the whole product away.

| Tier | Sees |
|---|---|
| Signed out | Listings ≤16 GB |
| Trial (7 days from first sign-in) | Everything |
| Free (trial expired) | Listings ≤16 GB |
| Subscribed — $5/month | Everything |

The trial is derived from `users.created_at`, not stored separately, so it
cannot drift, cannot be restarted by signing out, and needs no cleanup job.

Two payloads are built at scrape time and stored separately:

| Key | Contains |
|---|---|
| `data:free` | Listings ≤16 GB in full, plus one location-free aggregate per larger product |
| `data:full` | Everything |

The Worker chooses between them and never filters one into the other, so no
request-time bug can expose a locked price — the free payload simply never
contained one. `npm test` enforces this, along with the rule that no payload may
sit in the publicly-served asset root.

### Deployment

A GitHub Actions workflow re-scrapes every six hours, runs the access-control
tests, uploads both payloads to Cloudflare KV and deploys the Worker. Price
history is committed back to `data/history.json` so trend lines survive.

Setting up the Cloudflare, Google and Stripe accounts is described in
[SETUP.md](SETUP.md).

## How the data is fetched

Each retailer has an adapter chosen by shop platform:

| Adapter   | Used for                                                    |
|-----------|-------------------------------------------------------------|
| `shopify` | Shopify storefront JSON (`/collections/<x>/products.json`)  |
| `sapo`    | Sapo / Bizweb storefront JSON (the Vietnamese equivalent)    |
| `woo`     | WooCommerce product archives                                 |
| `generic` | Config-driven CSS selectors for bespoke shop templates       |
| `browser` | A hidden Chromium window, for shops that need JavaScript     |

Shops that answer plain HTTP requests with a bot-check page are retried
automatically inside the hidden Chromium window, which they accept.

Exchange rates come from `open.er-api.com`, with `frankfurter.dev` as a fallback.

Sources fail independently. A retailer that breaks shows up as an error row on
the **Sources & health** tab — the app never invents a price to fill a gap.

## Retailers covered

| Country | Retailers | Selected by default |
|---------|-----------|----------------------|
| India | MDComputers, PrimeABGB, Vedant Computers, PC Studio | Yes |
| Singapore | Bizgram, Dynacore | Yes |
| Malaysia | ALL IT Hypermarket | Yes |
| Thailand | JIB, Speed Computer | Yes |
| Vietnam | MemoryZone | Yes |
| Hong Kong | Jumbo Computer | Yes |
| United Kingdom | ComputerOrbit, Epsilon PC | No — opt in from the Country filter |

A country only appears here once a real, live-verified storefront is found for
it — see `tools/discover.js` for the probe used to sort a genuine Shopify/Sapo/
WooCommerce storefront from a site that just blocks scraping. Every market
added after the original six starts **unchecked**: the filter bar doesn't
balloon by default, and turning one on is a deliberate choice. See
`defaultSelected` in `src/core/sources.js`.

Prices are read **per product variant**, not per product page: a listing that
offers 16 GB and 32 GB under one title is two separate rows with their own
price and their own stock state. Only in-stock items are shown.

## Where data is stored

`%APPDATA%\PCComponentsWatcher\ramwatch-data.json` — current snapshot plus price history.
The **Show data file** button on the Sources tab opens it in Explorer.
