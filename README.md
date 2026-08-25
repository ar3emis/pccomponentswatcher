# PCComponentsWatcher

Tracks **live DDR5 memory and graphics-card prices** across six Asian markets
and converts every price to INR at the day's rate.

Ships as a Windows desktop app and as a public website, both built from the
same dashboard code.

## What it does

- Scrapes retailer listing pages directly — no third-party price API sits in between.
- Covers India, Singapore, Malaysia, Thailand, Vietnam and Hong Kong.
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
npm run export-web
```

Runs a full scrape and writes a self-contained static site into `site/` —
`data.json` plus the dashboard's own HTML, CSS and JS. `web/bridge.js` stands in
for the desktop preload, serving the same API surface from that JSON, so
`renderer/app.js` and `renderer/charts.js` are reused byte-for-byte.

Add `--no-browser` to skip the retailers that need a real browser engine, which
is much faster when you only want to check the HTTP sources.

A GitHub Actions workflow re-runs the scrape every six hours and republishes to
GitHub Pages. Price history is committed back to `data/history.json` between
runs so the trend lines survive.

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

| Country | Retailers |
|---------|-----------|
| India | MDComputers, PrimeABGB, Vedant Computers |
| Singapore | Bizgram, Dynacore |
| Malaysia | ALL IT Hypermarket |
| Thailand | JIB |
| Vietnam | MemoryZone |
| Hong Kong | Jumbo Computer |

Prices are read **per product variant**, not per product page: a listing that
offers 16 GB and 32 GB under one title is two separate rows with their own
price and their own stock state. Only in-stock items are shown.

## Where data is stored

`%APPDATA%\PCComponentsWatcher\ramwatch-data.json` — current snapshot plus price history.
The **Show data file** button on the Sources tab opens it in Explorer.
