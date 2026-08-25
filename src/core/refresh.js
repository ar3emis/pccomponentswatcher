'use strict';

const crypto = require('crypto');

const { jobsFor, COUNTRY_BY_CODE, WOO_SELECTORS } = require('./sources');
const { fetchRates } = require('./fx');
const { pool } = require('./http');
const { parsePrice } = require('./money');
const { normalize, RAM_CAPACITIES, GPU_VRAM } = require('./normalize');

const { fetchShopify } = require('./adapters/shopify');
const { fetchSapo } = require('./adapters/sapo');
const { fetchWoo } = require('./adapters/woocommerce');
const { fetchGeneric } = require('./adapters/generic');
const { fetchBrowser } = require('./adapters/browser');

const ADAPTERS = {
  shopify: fetchShopify,
  sapo: fetchSapo,
  woo: fetchWoo,
  generic: fetchGeneric,
  browser: fetchBrowser
};

const CATEGORY_IDS = ['ram', 'gpu'];

/**
 * Runs every retailer × category job, normalises the results and converts to
 * INR. Jobs fail independently — a dead retailer surfaces as an error row in
 * the UI rather than silently shrinking the dataset.
 */
async function refreshAll(opts = {}) {
  const { deps = {}, onProgress = () => {}, categories = CATEGORY_IDS, sourceIds = null, concurrency = 4 } = opts;

  // Rendering a shop in a real browser is done by whichever engine the host
  // provides: Electron's BrowserWindow in the desktop app, Playwright in CI.
  const browserFetch =
    deps.browserFetch || (deps.BrowserWindow ? (job) => fetchBrowser(job, deps) : null);

  const fxPromise = fetchRates().catch((err) => ({ error: err.message }));

  const jobs = jobsFor(categories).filter((j) => (sourceIds ? sourceIds.includes(j.id) : true));
  const statuses = [];
  const rawByJob = new Map();

  // Browser jobs run one at a time — each owns a hidden Chromium window.
  const httpJobs = jobs.filter((j) => j.kind !== 'browser');
  const browserJobs = jobs.filter((j) => j.kind === 'browser');

  onProgress({ phase: 'start', total: jobs.length, done: 0 });
  let done = 0;

  const runOne = async (job) => {
    const started = Date.now();
    let viaBrowser = job.kind === 'browser';
    const base = {
      jobId: job.jobId,
      id: job.id,
      name: job.name,
      category: job.category,
      country: job.country,
      site: job.site,
      kind: job.kind
    };

    try {
      const adapter = ADAPTERS[job.kind];
      if (!adapter) throw new Error(`no adapter for kind "${job.kind}"`);
      if (job.kind === 'browser' && !browserFetch) throw new Error('no browser engine available');

      let items;
      try {
        items = job.kind === 'browser' ? await browserFetch(job) : await adapter(job, deps);
      } catch (httpErr) {
        // Some shops answer plain HTTP clients with a challenge page. Re-run
        // the same listing in a real browser, which they accept.
        if (!canFallBack(job, httpErr, browserFetch)) throw httpErr;
        items = await browserFetch(toBrowserJob(job));
        viaBrowser = true;
      }

      rawByJob.set(job.jobId, items);
      statuses.push({ ...base, viaBrowser, ok: true, rawCount: items.length, ms: Date.now() - started, error: null });
    } catch (err) {
      rawByJob.set(job.jobId, []);
      statuses.push({
        ...base,
        viaBrowser,
        ok: false,
        rawCount: 0,
        ms: Date.now() - started,
        error: String((err && err.message) || err)
      });
    }
    done++;
    onProgress({ phase: 'source', total: jobs.length, done, name: `${job.name} · ${job.category.toUpperCase()}` });
  };

  await pool(httpJobs, concurrency, runOne);
  for (const j of browserJobs) await runOne(j);

  const fx = await fxPromise;
  const fxOk = fx && fx.toINR && fx.toINR.INR;

  const listings = [];
  const rejected = {};

  for (const job of jobs) {
    const items = rawByJob.get(job.jobId) || [];
    const seen = new Set();
    let kept = 0;

    for (const item of items) {
      const price = parsePrice(item.price != null ? item.price : item.priceText);
      if (!price) continue;

      const { spec, reject } = normalize(item.title, item.vendor, job.category, item.variantText);
      if (reject) {
        rejected[reject] = (rejected[reject] || 0) + 1;
        continue;
      }

      const dedupe = `${item.url}|${spec.specKey || spec.title}|${price}|${item.inStock !== false}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      const rate = fxOk ? fx.toINR[job.currency] : null;
      const priceINR = rate ? price * rate : null;

      listings.push({
        id: hash(`${job.id}|${job.category}|${item.sku || item.url || spec.title}`),
        category: job.category,
        sourceId: job.id,
        sourceName: job.name,
        country: job.country,
        countryName: (COUNTRY_BY_CODE.get(job.country) || {}).name || job.country,
        currency: job.currency,
        price,
        priceINR,
        pricePerGBINR: priceINR && spec.memoryGB ? priceINR / spec.memoryGB : null,
        inStock: item.inStock !== false,
        url: item.url,
        image: item.image || null,

        title: spec.title,
        brandId: spec.brandId,
        brandName: spec.brandName,
        brandTier: spec.brandTier,

        // Memory-specific
        family: spec.family || null,
        generation: spec.generation || null,
        totalGB: spec.totalGB || null,
        modules: spec.modules || null,
        moduleGB: spec.moduleGB || null,
        speed: spec.speed || null,
        cas: spec.cas || null,

        // GPU-specific
        modelId: spec.modelId || null,
        modelName: spec.modelName || null,
        vendor: spec.vendor || null,
        vram: spec.vram || null,
        oc: !!spec.oc,

        // Shared
        memoryGB: spec.memoryGB,
        formFactor: spec.formFactor,
        rgb: !!spec.rgb,
        color: spec.color || null,
        kitLabel: spec.kitLabel,
        specKey: spec.specKey
      });
      kept++;
    }

    const st = statuses.find((s) => s.jobId === job.jobId);
    if (st) st.count = kept;
  }

  return {
    fetchedAt: Date.now(),
    fx: fxOk ? fx : { error: (fx && fx.error) || 'exchange rates unavailable' },
    sources: statuses.sort(
      (a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name) || a.category.localeCompare(b.category)
    ),
    listings,
    rejected
  };
}

/** True when a failed HTTP job looks blocked rather than genuinely broken. */
function canFallBack(job, err, browserFetch) {
  if (!job.browserFallback || !browserFetch) return false;
  const msg = String((err && err.message) || err);
  return /HTTP (401|403|405|429|503)|challenge|timeout|aborted/i.test(msg);
}

/** Recasts an HTTP job as a browser job, page 1 only. */
function toBrowserJob(job) {
  return {
    ...job,
    kind: 'browser',
    settleMs: job.settleMs || 6000,
    paths: (job.paths || ['/']).map((p) => p.replace('{page}', '1')),
    selectors: job.selectors || WOO_SELECTORS
  };
}

function hash(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
}

module.exports = { refreshAll, RAM_CAPACITIES, GPU_VRAM, CATEGORY_IDS };
