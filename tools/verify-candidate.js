'use strict';

/**
 * Quick live-check for a candidate Shopify collection before it goes into
 * src/core/sources.js: fetches real products.json and prints title/price/stock
 * samples, so a false-positive collection (accessories, empty, wrong category)
 * is caught before it's treated as a working source.
 *
 * Usage: node tools/verify-candidate.js <base> <collection>
 */
const { fetchShopify } = require('../src/core/adapters/shopify');

const base = process.argv[2];
const collection = process.argv[3];

(async () => {
  const items = await fetchShopify({ base, collections: [collection], maxPages: 1 });
  console.log(`${base}/collections/${collection} -> ${items.length} variants`);
  for (const it of items.slice(0, 10)) {
    console.log(`  [${it.inStock ? 'IN' : 'OUT'}] ${it.price} — ${it.title}${it.variantText ? ' (' + it.variantText + ')' : ''}`);
  }
})().catch((err) => console.error('ERROR', err.message));
