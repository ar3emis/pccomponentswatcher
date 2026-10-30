# PCComponentsWatcher

Live **DDR5 memory and graphics-card prices**, read straight from retailers
around the world and converted to INR at the day's rate.

**Website:** <https://ar3emis.github.io/pccomponentswatcher/> — free, no sign-up,
refreshed every six hours.

It also runs as a Windows desktop app that refreshes on demand.

## What it shows

- Every price in the shop's own currency **and** in INR, at live mid-market rates.
- Only items that are actually in stock.
- The same product priced side by side across every market, cheapest highlighted.
- Price history, so trends build up the longer it runs.
- Charts: cheapest by country, cost per GB, cheapest by brand, and history over time.

## What it tracks

**Memory** — DDR5 kits from 16GB to 128GB: Corsair and G.Skill first, then
Kingston, Crucial, ADATA/XPG, TeamGroup, Patriot and other established brands,
in both desktop (DIMM) and laptop (SODIMM) form factors.

**Graphics cards** — GeForce RTX 50 and 40 series (including the 32GB RTX 5090
and the 16GB RTX 5080 / 5070 Ti), Radeon RX 9000 and 7000 series, the 32GB
Radeon AI PRO R9700, and Intel Arc — from every major board partner.

## Running it

```
npm install
npm start          # the desktop app
npm run export-web # scrape and build the site into site/
npm run dev-web    # serve site/ at http://localhost:4178
npm test           # parser and migration checks
```

Building the Windows installer:

```
npm run dist
```

The NSIS installer lands in `dist/`.

## How the data is fetched

Each retailer gets the adapter that matches its shop platform:

| Adapter    | Used for                                                     |
|------------|--------------------------------------------------------------|
| `shopify`  | Shopify storefront JSON (`/collections/<x>/products.json`)    |
| `sapo`     | Sapo / Bizweb storefront JSON (the Vietnamese equivalent)     |
| `woo`      | WooCommerce product archives                                  |
| `generic`  | Config-driven CSS selectors for bespoke shop templates        |
| `browser`  | A real browser, for shops that need JavaScript                |

Shops that answer a plain HTTP request with a bot-check page are retried
automatically in a real browser, which they accept. The browser engine is
injected rather than hardcoded: Electron's `BrowserWindow` in the desktop app,
Playwright on the CI runner that refreshes the site.

Exchange rates come from `open.er-api.com`, with `frankfurter.dev` as a fallback.

Sources fail independently. A retailer that breaks shows up as an error row on
the **Sources & health** tab — the app never invents a price to fill a gap, and
the publish job refuses to deploy a near-empty scrape.

## How the site is published

`.github/workflows/publish-site.yml` runs every six hours: it scrapes, writes
`site/data.json`, and deploys `site/` to GitHub Pages. Price history is committed
back to `data/history.json` so the trend lines survive between runs.

The page is static. `web/bridge.js` gives the shared UI the same API surface the
desktop preload provides over IPC, backed by that JSON file — which is why
`renderer/app.js` and `renderer/charts.js` are used verbatim in both builds.

There are no accounts and nothing is withheld: every visitor gets the whole
dataset from the same file.

## Accessibility

The interface is built to be usable with a keyboard and a screen reader: real
tab semantics with arrow-key navigation, sortable headers as buttons carrying
`aria-sort`, filter chips reporting `aria-pressed`, labels bound to every
control, a skip link, a visible focus ring, and reduced-motion support. It
follows the system light/dark setting, and on narrow screens each row becomes a
labelled card rather than a sideways scroll.

## Where data is stored

Desktop: `%APPDATA%\PCComponentsWatcher\ramwatch-data.json` — current snapshot
plus price history. The **Show data file** button on the Sources tab opens it.

Web: `site/data.json`, rebuilt by the scheduled job.

## A note on the prices

They are indicative. They exclude shipping, duties and local taxes, and can
change between refreshes. Always confirm on the retailer's own page before
buying — every product name links straight to the source listing.
