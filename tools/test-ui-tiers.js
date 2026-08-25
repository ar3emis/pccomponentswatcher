'use strict';

/**
 * The UI branches on tier strings that the server produces. A typo on either
 * side ('trialing' vs 'trial') would silently show a subscriber the upgrade
 * banner, or worse, show a free user nothing at all — with no error anywhere.
 *
 * This compares the literal strings in the shipped renderer against the tier
 * vocabulary the access rule actually emits.
 */
const fs = require('fs');
const path = require('path');
const { TIERS, tierFor } = require('../src/core/tiers');

const app = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok   ' : 'FAIL '} ${name}${ok || !detail ? '' : '\n          ' + detail}`);
  if (!ok) failures++;
};

// Every tier the rule can return, gathered from real inputs rather than by
// reading TIERS, so a value that exists but is unreachable is still caught.
const DAY = 86400 * 1000;
const emitted = new Set([
  tierFor(null, null),
  tierFor({ email: 'a@b.com' }, null),
  tierFor({ email: 'a@b.com', created_at: Date.now() }, null),
  tierFor({ email: 'a@b.com' }, { status: 'active' }),
  tierFor({ email: 'sameek4@gmail.com' }, null),
  tierFor({ email: 'a@b.com', created_at: Date.now() - 30 * DAY }, { status: 'past_due' })
]);

console.log(`  tiers the access rule emits: ${[...emitted].sort().join(', ')}\n`);

check('every declared tier is reachable', Object.values(TIERS).every((t) => emitted.has(t)), `unreachable: ${Object.values(TIERS).filter((t) => !emitted.has(t))}`);

// Tier literals the renderer compares against, e.g.  a.tier === 'trial'
const compared = new Set();
for (const m of app.matchAll(/(?:a|state\.account)\.tier\s*===\s*'([a-z]+)'/g)) compared.add(m[1]);

console.log(`  tiers the renderer branches on: ${[...compared].sort().join(', ')}\n`);

check(
  'every tier the renderer checks is one the server can emit',
  [...compared].every((t) => emitted.has(t)),
  `unknown to the server: ${[...compared].filter((t) => !emitted.has(t)).join(', ')}`
);

// 'paid' and 'trial' must both be handled, or a paying user sees an upsell.
for (const t of ['paid', 'trial']) {
  check(`renderer explicitly handles the '${t}' tier`, compared.has(t));
}

// The renderer must never gate on 'anon' for the data itself — anonymous and
// free receive the same payload, and treating them differently invites drift.
check('renderer does not branch data rendering on anon', !/(?:a|state\.account)\.tier\s*===\s*'anon'/.test(app));

// The account object the bridge defaults to must carry the keys the UI reads.
const bridge = fs.readFileSync(path.join(__dirname, '..', 'web', 'bridge.js'), 'utf8');
const defaults = (bridge.match(/let account = \{([^}]*)\}/) || [])[1] || '';
for (const key of ['tier', 'priceUSD', 'trial', 'trialDays', 'signedIn']) {
  check(`bridge default account has '${key}'`, new RegExp(`\\b${key}\\s*:`).test(defaults), defaults.trim());
}

// Fields the UI reads off the account, which the Worker's /api/me must send.
const workerIndex = fs.readFileSync(path.join(__dirname, '..', 'worker', 'src', 'index.js'), 'utf8');
const meBlock = workerIndex.slice(workerIndex.indexOf('async function handleMe'), workerIndex.indexOf('async function handleData'));
for (const key of ['tier', 'trial', 'trialDays', 'priceUSD', 'admin', 'signedIn', 'email']) {
  // Accept both `key: value` and ES6 shorthand `key,`.
  const present = new RegExp(`\\b${key}\\s*(?::|,|\\n)`).test(meBlock);
  check(`/api/me returns '${key}'`, present);
}

if (failures) {
  console.error(`\n${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log('\nUI and server agree on the tier vocabulary.');
