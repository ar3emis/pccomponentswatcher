'use strict';

const { withDefaults } = require('../stock');

/**
 * Renders a shop page inside a hidden Electron BrowserWindow and extracts
 * product cards from the live DOM.
 *
 * This is how we reach shops that render prices with JavaScript or sit behind
 * a browser-integrity challenge — a real Chromium engine handles both, where a
 * plain HTTP request only ever sees a placeholder page.
 */
async function fetchBrowser(source, deps) {
  const { BrowserWindow } = deps;
  // A source with no outOfStockRe must still catch the common "Enquire" /
  // "Notify me" / "Coming soon" cases rather than default to always in-stock —
  // resolved here, in Node, since the in-page script below has no module access.
  const sel = { ...source.selectors, outOfStockRe: withDefaults(source.selectors.outOfStockRe) };
  const out = [];

  for (const pathTpl of source.paths) {
    const url = source.base + pathTpl;
    const items = await loadAndExtract(BrowserWindow, url, sel, source);
    for (const it of items) out.push(it);
  }
  return out;
}

function loadAndExtract(BrowserWindow, url, sel, source) {
  return new Promise((resolve, reject) => {
    let win = new BrowserWindow({
      show: false,
      width: 1440,
      height: 1800,
      webPreferences: {
        // Offscreen rendering crashes on some bot-check pages; a normal
        // hidden window renders the same DOM without the instability.
        // Images stay enabled: several shops lazy-render product tiles from
        // image intersection observers, and blocking images starves them.
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false
      }
    });

    let settled = false;
    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      try {
        if (win && !win.isDestroyed()) win.destroy();
      } catch (_) {}
      win = null;
      err ? reject(err) : resolve(val);
    };

    const hardTimer = setTimeout(() => finish(new Error('browser render timeout')), source.timeout || 75000);

    win.webContents.setAudioMuted(true);
    // Only a main-frame failure matters. Shops routinely embed ad and chat
    // iframes that their own CSP blocks; those must not abort the scrape.
    win.webContents.on('did-fail-load', (_e, code, desc, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) finish(new Error(`load failed ${code}: ${desc}`));
    });

    win.webContents.once('did-finish-load', async () => {
      try {
        // Wait for the product grid to actually exist rather than trusting a
        // fixed delay — these shops render at wildly different speeds, and a
        // page that is merely slow must not be reported as an empty catalogue.
        await win.webContents.executeJavaScript(waitForCardsScript(sel, source.settleMs || 6000), true);

        // Scroll to trigger lazy-loaded tiles, then let them settle.
        await win.webContents.executeJavaScript(
          `(async () => {
             for (let y = 0; y < 8; y++) { window.scrollBy(0, window.innerHeight * 1.5); await new Promise(r => setTimeout(r, 500)); }
             window.scrollTo(0, 0);
             await new Promise(r => setTimeout(r, 1200));
           })()`,
          true
        );

        const items = await win.webContents.executeJavaScript(extractorScript(sel), true);
        finish(null, Array.isArray(items) ? items : []);
      } catch (err) {
        finish(err);
      }
    });

    // Pass options only when there is something to say: an explicit
    // `{ userAgent: undefined }` makes Chromium send a broken UA header.
    const loadOpts = source.userAgent ? { userAgent: source.userAgent } : undefined;
    win.loadURL(url, loadOpts).catch((err) => finish(err));
  });
}

/**
 * Polls for the card selector until it matches, or the budget runs out.
 * Resolves either way — an empty page is a real (reportable) outcome.
 */
function waitForCardsScript(sel, budgetMs) {
  const card = JSON.stringify(sel.card);
  return `(async () => {
    const deadline = Date.now() + ${Math.max(4000, budgetMs)};
    while (Date.now() < deadline) {
      if (document.querySelectorAll(${card}).length > 0) {
        // Found the grid; give it a moment to finish populating.
        await new Promise(r => setTimeout(r, 1500));
        return true;
      }
      await new Promise(r => setTimeout(r, 750));
    }
    return false;
  })()`;
}

/** Builds a self-contained DOM extraction expression from selector config. */
function extractorScript(sel) {
  const cfg = JSON.stringify(sel);
  return `(() => {
    const cfg = ${cfg};
    const MONEY = /(?:฿|บาท|HK\$|\$|₫|đ|RM|₹|Rs\.?)\s?[\d.,]{3,}|[\d.,]{4,}\s?(?:฿|บาท|₫|đ|\.-)|\d{1,3}(?:[.,]\d{3})+/;
    const txt = (el, s) => { if (!s) return ''; const n = el.querySelector(s); return n ? n.textContent.replace(/\s+/g,' ').trim() : ''; };

    // Shops built with utility-class CSS have no stable price selector, so the
    // last price-shaped leaf in the card is used: sale prices render after the
    // struck-through original.
    const lastPrice = (el) => {
      let found = '';
      for (const n of el.querySelectorAll('*')) {
        if (n.children.length) continue;
        const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
        if (t && t.length < 40 && MONEY.test(t)) found = t;
      }
      return found;
    };

    const cards = Array.from(document.querySelectorAll(cfg.card));
    const seen = new Set();
    const out = [];
    for (const c of cards) {
      const img = c.querySelector('img');
      const title = txt(c, cfg.title) || c.getAttribute('data-name') || (img && img.getAttribute('alt')) || '';
      if (!title) continue;
      const priceText = (cfg.priceStrategy === 'last')
        ? lastPrice(c)
        : (txt(c, cfg.priceNew) || txt(c, cfg.price) || lastPrice(c));
      if (!priceText) continue;
      const a = c.querySelector(cfg.link || 'a');
      const href = a ? a.href : location.href;
      if (seen.has(href + title)) continue;
      seen.add(href + title);
      const blob = (c.className + ' ' + c.textContent).toLowerCase();
      const outOfStock = cfg.outOfStockRe ? new RegExp(cfg.outOfStockRe, 'i').test(blob) : false;
      out.push({
        title,
        vendor: '',
        priceText,
        inStock: !outOfStock,
        url: href,
        sku: title,
        image: img ? (img.currentSrc || img.src || null) : null
      });
    }
    return out;
  })()`;
}

module.exports = { fetchBrowser };
