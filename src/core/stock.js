'use strict';

/**
 * Phrases that mean a listing cannot actually be bought right now, even when
 * the retailer still renders a price for it — "Enquire", "Notify me",
 * "Coming soon" and "Call for price" are the common ways a shop keeps a
 * product visible (and priced) without a working checkout path.
 *
 * Kept deliberately narrow: "pre-order" and "backorder" are excluded, since
 * on several tracked sites those genuinely complete a purchase today for
 * later shipment — treating them as unbuyable would hide real availability,
 * not manufacture it.
 *
 * A plain string, not a RegExp: the in-page extractors (browser.js,
 * playwright.js) run inside a serialized function with no access to this
 * module, so the source text is threaded through as data instead.
 */
const NOT_BUYABLE_SOURCE =
  'out\\s*of\\s*stock|sold\\s*out|notify\\s*me|enquire|coming\\s*soon|discontinued|' +
  'temporarily\\s*unavailable|currently\\s*unavailable|call\\s*for\\s*price|contact\\s*(us\\s*)?for\\s*price|' +
  'hết\\s*hàng|สินค้าหมด|缺貨|售完';

const NOT_BUYABLE_RE = new RegExp(NOT_BUYABLE_SOURCE, 'i');

/** Combines a source's own out-of-stock pattern with the shared defaults, so a site-specific phrase adds coverage instead of replacing it. */
function withDefaults(customSource) {
  return customSource ? `(?:${customSource})|(?:${NOT_BUYABLE_SOURCE})` : NOT_BUYABLE_SOURCE;
}

module.exports = { NOT_BUYABLE_SOURCE, NOT_BUYABLE_RE, withDefaults };
