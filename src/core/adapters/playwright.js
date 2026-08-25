'use strict';

/**
 * Playwright implementation of the browser scraper, used where Electron is not
 * available — chiefly the GitHub Actions runner that refreshes the public site.
 *
 * It mirrors `adapters/browser.js` exactly: same selector config, same
 * wait-for-grid behaviour, same extraction contract. Only the engine differs.
 */

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    const { chromium } = require('playwright');
    browserPromise = chromium.launch({
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });
  }
  return browserPromise;
}

async function closeBrowser() {
  if (!browserPromise) return;
  const b = await browserPromise;
  browserPromise = null;
  await b.close().catch(() => {});
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const { withDefaults } = require('../stock');

/** Renders each of a job's listing pages and extracts product cards. */
async function fetchWithPlaywright(job) {
  // Resolved here, in Node — extractInPage runs as a serialized function with
  // no module access, so a source with no outOfStockRe must not default to
  // "always in stock" once it reaches the page context.
  const sel = { ...job.selectors, outOfStockRe: withDefaults(job.selectors.outOfStockRe) };
  const out = [];
  const browser = await getBrowser();

  const context = await browser.newContext({
    userAgent: job.userAgent || UA,
    viewport: { width: 1440, height: 1800 },
    locale: 'en-US'
  });

  try {
    for (const pathTpl of job.paths || []) {
      const url = job.base + pathTpl.replace('{page}', '1');
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: job.timeout || 90000 });

        // Wait for the grid itself rather than a fixed delay — a slow page must
        // not be reported as an empty catalogue.
        await page
          .waitForSelector(sel.card, { timeout: Math.max(8000, job.settleMs || 10000), state: 'attached' })
          .catch(() => {});
        await page.waitForTimeout(1500);

        // Trigger lazy-loaded tiles.
        await page.evaluate(async () => {
          for (let i = 0; i < 8; i++) {
            window.scrollBy(0, window.innerHeight * 1.5);
            await new Promise((r) => setTimeout(r, 500));
          }
          window.scrollTo(0, 0);
          await new Promise((r) => setTimeout(r, 1200));
        });

        const items = await page.evaluate(extractInPage, sel);
        for (const it of items) out.push(it);
      } catch (err) {
        // One dead page must not lose the pages that did work.
        if (!out.length && (job.paths || []).length === 1) throw err;
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await context.close().catch(() => {});
  }

  return out;
}

/**
 * Runs inside the page. Kept byte-for-byte equivalent in behaviour to the
 * Electron extractor so both engines yield the same rows.
 */
function extractInPage(cfg) {
  const MONEY = /(?:฿|บาท|HK\$|\$|₫|đ|RM|₹|Rs\.?)\s?[\d.,]{3,}|[\d.,]{4,}\s?(?:฿|บาท|₫|đ|\.-)|\d{1,3}(?:[.,]\d{3})+/;
  const txt = (el, s) => {
    if (!s) return '';
    const n = el.querySelector(s);
    return n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
  };

  const lastPrice = (el) => {
    let found = '';
    for (const n of el.querySelectorAll('*')) {
      if (n.children.length) continue;
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (t && t.length < 40 && MONEY.test(t)) found = t;
    }
    return found;
  };

  const out = [];
  const seen = new Set();
  for (const c of document.querySelectorAll(cfg.card)) {
    const img = c.querySelector('img');
    const title = txt(c, cfg.title) || c.getAttribute('data-name') || (img && img.getAttribute('alt')) || '';
    if (!title) continue;

    const priceText =
      cfg.priceStrategy === 'last' ? lastPrice(c) : txt(c, cfg.priceNew) || txt(c, cfg.price) || lastPrice(c);
    if (!priceText) continue;

    const a = c.querySelector(cfg.link || 'a');
    const href = a ? a.href : location.href;
    const key = href + title;
    if (seen.has(key)) continue;
    seen.add(key);

    const blob = (c.className + ' ' + c.textContent).toLowerCase();
    const outOfStock = cfg.outOfStockRe ? new RegExp(cfg.outOfStockRe, 'i').test(blob) : false;

    out.push({
      title,
      vendor: '',
      priceText,
      inStock: !outOfStock,
      url: href,
      sku: title,
      image: img ? img.currentSrc || img.src || null : null
    });
  }
  return out;
}

module.exports = { fetchWithPlaywright, closeBrowser };
