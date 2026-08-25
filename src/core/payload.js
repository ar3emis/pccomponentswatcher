'use strict';

const { isFreeListing } = require('./tiers');

/**
 * Splits a snapshot into the two payloads the site serves.
 *
 * The free payload is built by *construction*, never by deleting fields from a
 * full row: every locked listing is replaced by an aggregate that names no
 * country, no retailer and no URL. A field can therefore only reach a free
 * visitor if it is explicitly listed below, which is the property that makes
 * this safe to serve from a cache.
 *
 * What a subscription buys is *where* the cheapest price is. The aggregate
 * deliberately keeps the price range and the spread — the shopper can see a
 * good deal exists, but finding it still means checking six markets by hand.
 */

/** The only fields of a locked listing that ever leave the server. */
function lockedAggregate(group) {
  const prices = group.map((l) => l.priceINR).filter((p) => p != null);
  const ref = group[0];
  if (!prices.length) return null;

  const min = Math.min(...prices);
  const max = Math.max(...prices);

  return {
    locked: true,
    // Identity of the product, which is not what is being sold.
    specKey: ref.specKey,
    category: ref.category,
    title: ref.title,
    brandId: ref.brandId,
    brandName: ref.brandName,
    brandTier: ref.brandTier,
    memoryGB: ref.memoryGB,
    modelId: ref.modelId,
    modelName: ref.modelName,
    vendor: ref.vendor,
    vram: ref.vram,
    kitLabel: ref.kitLabel,
    totalGB: ref.totalGB,
    modules: ref.modules,
    moduleGB: ref.moduleGB,
    speed: ref.speed,
    cas: ref.cas,
    formFactor: ref.formFactor,
    rgb: ref.rgb,
    oc: ref.oc,

    // The teaser: how good the deal is, never where it is.
    offerCount: group.length,
    marketCount: new Set(group.map((l) => l.country)).size,
    minPriceINR: Math.round(min),
    maxPriceINR: Math.round(max),
    spreadPct: min > 0 ? Math.round(((max - min) / min) * 100) : 0
  };
}

/**
 * @returns {{ free: object, full: object }} two independent snapshot objects.
 */
function splitSnapshot(snapshot) {
  const inStock = snapshot.listings.filter((l) => l.inStock);
  const freeRows = inStock.filter(isFreeListing);
  const lockedRows = inStock.filter((l) => !isFreeListing(l));

  // Locked listings collapse to one row per distinct product.
  const groups = new Map();
  for (const l of lockedRows) {
    const key = l.specKey || `${l.category}|${l.title}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  const locked = Array.from(groups.values()).map(lockedAggregate).filter(Boolean);

  // History is keyed by listing id, so a free payload must only carry the ids
  // it actually ships — otherwise the price series leaks the locked rows.
  const freeIds = new Set(freeRows.map((l) => l.id));
  const freeHistory = {};
  for (const [id, series] of Object.entries(snapshot.history || {})) {
    if (freeIds.has(id)) freeHistory[id] = series;
  }

  const shared = {
    fetchedAt: snapshot.fetchedAt,
    fx: snapshot.fx,
    sources: snapshot.sources
  };

  return {
    free: {
      ...shared,
      listings: freeRows,
      lockedListings: locked,
      history: freeHistory,
      lockedCount: lockedRows.length
    },
    full: {
      ...shared,
      listings: inStock,
      lockedListings: [],
      history: snapshot.history || {},
      lockedCount: 0
    }
  };
}

module.exports = { splitSnapshot, lockedAggregate };
