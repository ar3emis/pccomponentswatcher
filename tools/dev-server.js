'use strict';

/**
 * Local stand-in for the Worker, for UI work without Google or Stripe set up.
 *
 * It serves `site/` and answers the same three endpoints the Worker does,
 * choosing the payload from a `tier` query or cookie so all three states can be
 * exercised in a browser:
 *
 *   node tools/dev-server.js            → anonymous
 *   then visit /?tier=free  /?tier=paid /?tier=anon
 *
 * This is a development tool only. It performs no authentication whatsoever and
 * must never be exposed to a network.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'site');
const DATA = path.join(__dirname, '..', 'dist-data');
const PORT = Number(process.env.PORT || 8791);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
    res.end(body);
  };
  const sendJson = (status, obj, headers = {}) =>
    send(status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', ...headers });

  // Tier is sticky so a page reload keeps whatever state you are testing.
  const qTier = url.searchParams.get('tier');
  const tier = qTier || readCookie(req, 'dev_tier') || 'anon';
  const setTier = qTier ? { 'Set-Cookie': `dev_tier=${qTier}; Path=/; Max-Age=86400; SameSite=Lax` } : {};

  if (url.pathname === '/api/me') {
    const accounts = {
      anon: { signedIn: false, email: null, tier: 'anon', admin: false, subscription: null, priceUSD: 5 },
      free: { signedIn: true, email: 'tester@gmail.com', tier: 'free', admin: false, subscription: null, priceUSD: 5 },
      paid: {
        signedIn: true,
        email: 'sameek4@gmail.com',
        tier: 'paid',
        admin: true,
        subscription: { status: 'active', currentPeriodEnd: null, hasBilling: false },
        priceUSD: 5
      }
    };
    return sendJson(200, accounts[tier] || accounts.anon, setTier);
  }

  if (url.pathname === '/api/data') {
    const file = tier === 'paid' ? 'data-full.json' : 'data-free.json';
    const full = path.join(DATA, file);
    if (!fs.existsSync(full)) return sendJson(503, { error: `${file} not built — run npm run export-web` });
    return send(200, fs.readFileSync(full), { 'Content-Type': 'application/json; charset=utf-8', 'X-Tier': tier, ...setTier });
  }

  if (url.pathname === '/api/checkout' || url.pathname === '/api/portal') {
    return sendJson(200, { url: `/?tier=paid&stub=${url.pathname.slice(5)}` }, setTier);
  }

  if (url.pathname === '/auth/google') return send(302, '', { Location: '/?tier=free', ...setTier });
  if (url.pathname === '/auth/logout') return send(302, '', { Location: '/?tier=anon', ...setTier });

  // Static files.
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return send(404, 'not found', { 'Content-Type': 'text/plain' });
  }
  send(200, fs.readFileSync(file), { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', ...setTier });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`dev server  http://localhost:${PORT}`);
  console.log(`  /?tier=anon   signed out`);
  console.log(`  /?tier=free   signed in, no subscription`);
  console.log(`  /?tier=paid   subscriber`);
});
