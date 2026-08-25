'use strict';

/**
 * Builds the public static site into `site/`.
 *
 * Runs a full scrape, writes the result as a plain JSON payload, and copies the
 * dashboard's own UI files next to it. The site reuses `renderer/app.js` and
 * `renderer/charts.js` unchanged — `bridge.js` supplies the same API surface
 * the desktop preload does, backed by the static JSON instead of IPC.
 *
 * Usage: node tools/export-web.js [--no-browser]
 */
const fs = require('fs');
const path = require('path');

const { refreshAll } = require('../src/core/refresh');
const { SOURCES, COUNTRIES, CATEGORIES } = require('../src/core/sources');
const { BRANDS } = require('../src/core/brands');
const { GPU_MODELS, AIB_BRANDS } = require('../src/core/gpu');
const { RAM_CAPACITIES, GPU_VRAM } = require('../src/core/normalize');
const { splitSnapshot } = require('../src/core/payload');
const { FREE_MAX_GB } = require('../src/core/tiers');

const ROOT = path.join(__dirname, '..');

/**
 * `site/` is served publicly by the Worker's ASSETS binding, so the price
 * payloads must NOT live there — a file in that directory is reachable by URL
 * and would bypass the paywall entirely. Data goes to a sibling directory that
 * is only ever uploaded to KV.
 */
const OUT = path.join(ROOT, 'site');
const DATA_OUT = path.join(ROOT, 'dist-data');
const HISTORY_FILE = path.join(ROOT, 'data', 'history.json');

const useBrowser = !process.argv.includes('--no-browser');

/** Price history is carried between CI runs so the trend lines survive. */
function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch (_) {
    return {};
  }
}

function recordHistory(history, snapshot) {
  const ts = snapshot.fetchedAt;
  const SIX_HOURS = 6 * 3600 * 1000;

  for (const l of snapshot.listings) {
    let series = history[l.id];
    if (!series) series = history[l.id] = [];
    const last = series[series.length - 1];
    const changed = !last || last.p !== l.price || last.s !== (l.inStock ? 1 : 0);
    const stale = last && ts - last.t > SIX_HOURS;
    if (changed || stale) {
      series.push({ t: ts, p: l.price, r: l.priceINR == null ? null : Math.round(l.priceINR * 100) / 100, s: l.inStock ? 1 : 0 });
      if (series.length > 400) series.splice(0, series.length - 400);
    }
  }

  // Forget anything not seen for 120 days so the file cannot grow unbounded.
  const cutoff = Date.now() - 120 * 24 * 3600 * 1000;
  for (const [k, series] of Object.entries(history)) {
    if (!series.length || series[series.length - 1].t < cutoff) delete history[k];
  }
  return history;
}

async function main() {
  let deps = {};
  let closeBrowser = async () => {};

  if (useBrowser) {
    try {
      const pw = require('../src/core/adapters/playwright');
      deps = { browserFetch: pw.fetchWithPlaywright };
      closeBrowser = pw.closeBrowser;
      console.log('browser engine: playwright');
    } catch (err) {
      console.log('browser engine: unavailable (' + err.message + ') — HTTP sources only');
    }
  } else {
    console.log('browser engine: disabled by flag');
  }

  const snapshot = await refreshAll({
    deps,
    onProgress: (p) => {
      if (p.name) console.log(`  [${p.done}/${p.total}] ${p.name}`);
    }
  }).finally(() => closeBrowser());

  const history = recordHistory(loadHistory(), snapshot);

  // Only in-stock rows are published; the site never shows what you cannot buy.
  const listings = snapshot.listings.filter((l) => l.inStock);
  const keep = new Set(listings.map((l) => l.id));
  const trimmedHistory = {};
  for (const id of keep) if (history[id]) trimmedHistory[id] = history[id];

  // Reference data is identical in both tiers; only the snapshot differs.
  const common = {
    generatedAt: snapshot.fetchedAt,
    freeMaxGB: FREE_MAX_GB,
    // Empty size lists mean "no size filter" — see main.js. Defaulting to a
    // subset would hide tracked products behind a filter nobody set.
    settings: {
      autoRefreshMinutes: 0,
      refreshOnLaunch: false,
      countries: COUNTRIES.map((c) => c.code),
      ramCapacities: [],
      gpuVram: []
    },
    countries: COUNTRIES,
    categories: CATEGORIES,
    brands: BRANDS.map(({ id, name, tier }) => ({ id, name, tier })),
    gpuBrands: AIB_BRANDS.map(({ id, name }) => ({ id, name, tier: 2 })),
    gpuModels: GPU_MODELS.map(({ id, name, vendor, vram, tier }) => ({ id, name, vendor, vram, tier })),
    ramCapacities: RAM_CAPACITIES,
    gpuVram: GPU_VRAM,
    sources: SOURCES.map(({ id, name, country, site, kind }) => ({ id, name, country, site, kind }))
  };

  const { free, full } = splitSnapshot({ ...snapshot, listings, history: trimmedHistory });

  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(DATA_OUT, { recursive: true });
  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));
  fs.writeFileSync(path.join(DATA_OUT, 'data-free.json'), JSON.stringify({ ...common, tier: 'free', snapshot: free }));
  fs.writeFileSync(path.join(DATA_OUT, 'data-full.json'), JSON.stringify({ ...common, tier: 'paid', snapshot: full }));

  // A stale payload from an older build would still be publicly reachable.
  for (const stale of ['data.json', 'data-free.json', 'data-full.json']) {
    const p = path.join(OUT, stale);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  for (const f of ['styles.css', 'charts.js', 'app.js']) {
    fs.copyFileSync(path.join(ROOT, 'renderer', f), path.join(OUT, f));
  }
  for (const f of ['index.html', 'bridge.js']) {
    fs.copyFileSync(path.join(ROOT, 'web', f), path.join(OUT, f));
  }
  fs.copyFileSync(path.join(ROOT, 'build', 'icon.png'), path.join(OUT, 'icon.png'));

  const ok = snapshot.sources.filter((s) => s.ok).length;
  const ram = listings.filter((l) => l.category === 'ram').length;
  console.log(
    `\nsite/ written — ${listings.length} in-stock listings (${ram} memory, ${listings.length - ram} GPU) ` +
      `from ${ok}/${snapshot.sources.length} source jobs`
  );
  console.log(
    `  data-free.json  ${free.listings.length} listings ≤${FREE_MAX_GB}GB + ${free.lockedListings.length} locked aggregates`
  );
  console.log(`  data-full.json  ${full.listings.length} listings`);

  const byCountry = {};
  for (const l of listings) {
    byCountry[l.country] = byCountry[l.country] || { ram: 0, gpu: 0 };
    byCountry[l.country][l.category]++;
  }
  for (const [c, v] of Object.entries(byCountry)) console.log(`  ${c}  ram=${String(v.ram).padStart(4)}  gpu=${String(v.gpu).padStart(4)}`);

  const failed = snapshot.sources.filter((s) => !s.ok);
  if (failed.length) {
    console.log('\nfailed jobs:');
    for (const f of failed) console.log(`  ${f.country} ${f.category} ${f.name}: ${f.error}`);
  }
}

main().catch((err) => {
  console.error('export failed:', err);
  process.exit(1);
});
