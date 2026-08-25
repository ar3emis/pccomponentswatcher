'use strict';

/**
 * Dev harness: renders shop pages in Electron and reports which DOM
 * structures hold product cards, so selectors can be written from fact.
 *
 * Usage: npx electron tools/dom-probe.js <url> [url2 ...]
 * Writes JSON to $PROBE_OUT (default .probe/out.json) — Electron detaches
 * stdout on Windows, so a file is the only reliable channel.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = process.env.PROBE_OUT || path.join(__dirname, '..', '.probe', 'out.json');
const SETTLE = Number(process.env.PROBE_SETTLE || 12000);
const HARD_LIMIT = Number(process.env.PROBE_LIMIT || 45000);
const urls = process.argv.slice(2).filter((a) => /^https?:/i.test(a));

const results = [];
function flush() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
}

const SCRIPT = String.raw`(() => {
  // Thai shops often print "12,900.-" with no symbol at all, so a bare
  // thousands-separated number has to count as a price too.
  const money = /(?:฿|บาท|HK\$|\$|₫|đ|RM|₹|Rs\.?)\s?[\d.,]{3,}|[\d.,]{4,}\s?(?:฿|บาท|₫|đ|\.-)|\d{1,3}(?:,\d{3})+/;
  const counts = new Map();
  const nodesFor = new Map();

  for (const el of document.querySelectorAll('*')) {
    if (!money.test(el.textContent || '')) continue;
    if (el.children.length > 8) continue;
    let p = el.parentElement, hops = 0;
    while (p && hops < 6) {
      const cls = (p.className && typeof p.className === 'string') ? p.className.trim() : '';
      if (cls) {
        const key = p.tagName.toLowerCase() + '.' + cls.split(/\s+/).filter(Boolean).slice(0, 3).join('.');
        counts.set(key, (counts.get(key) || 0) + 1);
        if (!nodesFor.has(key)) nodesFor.set(key, p);
      }
      p = p.parentElement; hops++;
    }
  }

  const top = [...counts.entries()].filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]).slice(0, 14);

  // PROBE_SELECTOR pins the dump to a specific card once one is identified.
  const pin = '__PIN__';
  let sampleNode = null;
  if (pin) {
    const hits = document.querySelectorAll(pin);
    sampleNode = hits.length > 1 ? hits[1] : hits[0];
  } else if (top.length) {
    sampleNode = nodesFor.get(top[0][0]);
  }
  const sample = sampleNode
    ? sampleNode.outerHTML.replace(/<img[^>]*>/g, '<img/>').replace(/\s+/g, ' ').slice(0, 2200)
    : '';

  // Inside the pinned card, list the leaf elements that actually hold a price
  // and the ones that hold the name — that is what a selector needs.
  const parts = [];
  if (sampleNode) {
    for (const n of sampleNode.querySelectorAll('*')) {
      if (n.children.length > 1) continue;
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 90) continue;
      const cls = (typeof n.className === 'string' ? n.className : '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      parts.push({ tag: n.tagName.toLowerCase(), cls, money: money.test(t), text: t.slice(0, 70) });
    }
  }

  // Category links, for finding the right listing URL.
  const links = [...document.querySelectorAll('a[href]')]
    .map((a) => ({ href: a.getAttribute('href') || '', text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) }))
    .filter((l) => new RegExp('__LINKS__', 'i').test(l.text + ' ' + l.href))
    .slice(0, 60);

  return {
    title: document.title,
    href: location.href,
    bodyLen: document.body ? document.body.innerHTML.length : 0,
    candidates: top,
    sample,
    parts,
    links
  };
})()`;

/** Loads one URL with a hard ceiling so a stalled page can never wedge the run. */
function probe(url) {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false,
      width: 1440,
      height: 1800,
      webPreferences: { contextIsolation: true, sandbox: true }
    });

    let settled = false;
    const done = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(limit);
      try { if (!win.isDestroyed()) win.destroy(); } catch (_) {}
      resolve({ url, ...payload });
    };

    const limit = setTimeout(() => done({ error: 'hard timeout — page never settled' }), HARD_LIMIT);

    const extract = async () => {
      try {
        await win.webContents.executeJavaScript(`new Promise(r => setTimeout(r, ${SETTLE}))`, true);
        await win.webContents.executeJavaScript(
          `(async () => { for (let i = 0; i < 6; i++) { window.scrollBy(0, innerHeight * 1.5); await new Promise(r => setTimeout(r, 450)); } })()`,
          true
        );
        const script = SCRIPT
          .replace('__PIN__', (process.env.PROBE_SELECTOR || '').replace(/'/g, "\'"))
          .replace('__LINKS__', (process.env.PROBE_LINKS || 'ram|memory|vga|graphic').replace(/'/g, "\'"));
        done(await win.webContents.executeJavaScript(script, true));
      } catch (err) {
        done({ error: String(err && err.message) });
      }
    };

    win.webContents.once('did-finish-load', extract);
    win.webContents.on('did-fail-load', (_e, code, desc, u, isMainFrame) => {
      if (isMainFrame && code !== -3) done({ error: `load failed ${code}: ${desc}` });
    });

    win.loadURL(url).catch((err) => done({ error: 'loadURL: ' + String(err && err.message) }));
  });
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  for (const url of urls) {
    results.push(await probe(url));
    flush();
  }
  flush();
  app.quit();
});
