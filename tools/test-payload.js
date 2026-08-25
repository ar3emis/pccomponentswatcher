'use strict';

/**
 * Guards the one invariant the paywall depends on: nothing that identifies
 * *where* a locked listing is sold may appear anywhere in the free payload.
 *
 * Run against real exported data:  node tools/test-payload.js [site/data-full.json]
 * Falls back to a synthetic snapshot when no export exists yet.
 *
 * This checks the serialised bytes, not the object shape, so a leak hidden in a
 * nested structure still trips it.
 */
const fs = require('fs');
const path = require('path');

const { splitSnapshot } = require('../src/core/payload');
const { FREE_MAX_GB } = require('../src/core/tiers');

let failures = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? '\n          ' + detail : ''}`);
  }
}

function synthetic() {
  const mk = (id, gb, country, source, price) => ({
    id,
    category: gb > 32 ? 'gpu' : 'ram',
    specKey: `spec-${gb}`,
    title: `Test Product ${gb}GB`,
    brandName: 'TestBrand',
    brandId: 'testbrand',
    memoryGB: gb,
    country,
    countryName: country,
    sourceName: source,
    sourceId: source.toLowerCase(),
    url: `https://${source.toLowerCase()}.example.com/p/${id}`,
    price,
    priceINR: price,
    currency: 'INR',
    inStock: true
  });
  return {
    fetchedAt: 1700000000000,
    fx: { toINR: { SGD: 63 }, provider: 'test' },
    sources: [],
    listings: [
      mk('a', 16, 'IN', 'FreeShop', 5000),
      mk('b', 8, 'SG', 'FreeShop2', 3000),
      mk('c', 32, 'HK', 'SecretShop', 90000),
      mk('d', 32, 'VN', 'HiddenMart', 120000),
      mk('e', 96, 'TH', 'PriceyPlace', 900000)
    ],
    history: { a: [{ t: 1, p: 5000, r: 5000 }], c: [{ t: 1, p: 90000, r: 90000 }] }
  };
}

const argPath = process.argv[2];
let snapshot;
let label;

if (argPath && fs.existsSync(argPath)) {
  const parsed = JSON.parse(fs.readFileSync(argPath, 'utf8'));
  snapshot = parsed.snapshot || parsed;
  label = argPath;
} else {
  const guess = path.join(__dirname, '..', 'site', 'data-full.json');
  if (fs.existsSync(guess)) {
    snapshot = JSON.parse(fs.readFileSync(guess, 'utf8')).snapshot;
    label = guess;
  } else {
    snapshot = synthetic();
    label = 'synthetic fixture';
  }
}

console.log(`payload split — source: ${label}\n`);

const { free, full } = splitSnapshot(snapshot);
const inStock = snapshot.listings.filter((l) => l.inStock);
const lockedSource = inStock.filter((l) => Number(l.memoryGB) > FREE_MAX_GB);
const freeJson = JSON.stringify(free);

// 1. Every visible free listing is genuinely within the free tier.
check(
  'no free listing exceeds the free capacity',
  free.listings.every((l) => Number(l.memoryGB) <= FREE_MAX_GB),
  free.listings.filter((l) => Number(l.memoryGB) > FREE_MAX_GB).map((l) => `${l.memoryGB}GB ${l.title}`).join(', ')
);

// 2. The locating fields of a locked listing must appear nowhere in the bytes.
const leaks = [];
for (const l of lockedSource) {
  for (const [field, value] of [
    ['url', l.url],
    ['sourceName', l.sourceName],
    ['countryName', l.countryName]
  ]) {
    if (!value) continue;
    // Only meaningful if that value is unique to locked rows — a retailer that
    // also sells free-tier items legitimately appears in the free payload.
    const alsoFree = free.listings.some((f) => f[field] === value);
    if (!alsoFree && freeJson.includes(String(value))) leaks.push(`${field}="${value}" (${l.title})`);
  }
}
check('no locked retailer / country / URL appears in the free payload', leaks.length === 0, leaks.slice(0, 5).join('\n          '));

// 3. Locked ids must not leak via the history map.
const lockedIds = lockedSource.map((l) => l.id).filter(Boolean);
const idLeaks = lockedIds.filter((id) => Object.prototype.hasOwnProperty.call(free.history, id));
check('locked listing ids absent from free history', idLeaks.length === 0, idLeaks.slice(0, 5).join(', '));

// 4. Aggregates must not carry a country/retailer/url key at all.
const aggKeyLeak = free.lockedListings.filter((a) => 'country' in a || 'sourceName' in a || 'url' in a);
check('locked aggregates expose no location keys', aggKeyLeak.length === 0, aggKeyLeak.slice(0, 3).map((a) => a.title).join(', '));

// 5. The full payload must still be complete.
check('full payload keeps every in-stock listing', full.listings.length === inStock.length, `${full.listings.length} vs ${inStock.length}`);

// 6. Nothing lost: every locked row is represented by some aggregate.
const covered = free.lockedListings.reduce((a, g) => a + g.offerCount, 0);
check('every locked listing is counted in an aggregate', covered === lockedSource.length, `${covered} vs ${lockedSource.length}`);

console.log(
  `\n  free: ${free.listings.length} listings + ${free.lockedListings.length} locked aggregates ` +
    `(${free.lockedCount} hidden) · full: ${full.listings.length} listings`
);

if (failures) {
  console.error(`\n${failures} check(s) FAILED — do not deploy.`);
  process.exit(1);
}
console.log('\nall checks passed.');
