'use strict';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const DEFAULT_HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache'
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** fetch() with timeout, retries and a browser-ish header set. */
async function get(url, opts = {}) {
  const { timeout = 30000, retries = 2, headers = {}, as = 'text' } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        redirect: 'follow',
        headers: { ...DEFAULT_HEADERS, ...headers }
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const body = as === 'json' ? await res.json() : await res.text();
      if (as === 'text' && (!body || body.length < 200)) throw new Error(`empty body (${body ? body.length : 0} bytes)`);
      return body;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) await sleep(700 * (attempt + 1));
    }
  }
  throw lastErr;
}

const getJson = (url, opts = {}) => get(url, { ...opts, as: 'json' });

/** Run async tasks with a concurrency ceiling so we stay polite to each host. */
async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

module.exports = { get, getJson, pool, sleep, UA };
