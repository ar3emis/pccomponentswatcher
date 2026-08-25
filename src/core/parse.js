'use strict';

const { detectBrand } = require('./brands');

const VALID_CAPACITIES = new Set([4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256]);

/** Product families worth naming in the comparison key. */
const FAMILIES = [
  [/\bdominator\s*(titanium)?\b/i, 'Dominator'],
  [/\bvengeance\b/i, 'Vengeance'],
  [/\btrident\s*z5?\b/i, 'Trident Z5'],
  [/\bripjaws\s*(s5|m5|x)?\b/i, 'Ripjaws'],
  [/\bflare\s*x5?\b/i, 'Flare X5'],
  [/\bfury\s*beast\b/i, 'Fury Beast'],
  [/\bfury\s*renegade\b/i, 'Fury Renegade'],
  [/\bfury\b/i, 'Fury'],
  [/\bballistix\b/i, 'Ballistix'],
  [/\bpro\s*overclocking\b/i, 'Pro OC'],
  [/\blancer\s*(blade|neo)?\b/i, 'Lancer'],
  [/\bcaster\b/i, 'Caster'],
  [/\bt[\s-]?force\s*(delta|xtreem|vulcan|expert)?\b/i, 'T-Force'],
  [/\bviper\s*(venom|elite|xtreme)?\b/i, 'Viper'],
  [/\bcras\b/i, 'CRAS'],
  [/\bthor\b/i, 'THOR'],
  [/\bpredator\b/i, 'Predator'],
  [/\baorus\b/i, 'AORUS']
];

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#8211;|&ndash;/gi, '-')
    .replace(/&#8377;/gi, 'INR ')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** DDR generation: 5 or 4, or null when the listing does not say. */
function detectGeneration(t) {
  if (/\bddr\s?-?\s?5\b/i.test(t) || /\bddr5[-\s]?\d{4}/i.test(t)) return 5;
  if (/\bddr\s?-?\s?4\b/i.test(t)) return 4;
  if (/\bddr\s?-?\s?3\b/i.test(t)) return 3;
  return null;
}

/**
 * Kit geometry. Returns { totalGB, modules, moduleGB, ambiguous }.
 * Handles "32GB Kit (2x16GB)", "2 x 16GB", "(2*16GB)", "64GB (2x32)".
 *
 * `ambiguous` marks a title that offers several capacities at once — e.g.
 * "Vengeance RGB DDR5 (16GB / 32GB)". Such a title cannot name the capacity of
 * any single price, so the caller must resolve it from the variant instead.
 */
function detectCapacity(t) {
  let modules = null;
  let moduleGB = null;
  let totalGB = null;

  const kit =
    t.match(/(\d{1,2})\s*[x*×]\s*(\d{1,3})\s*gb\b/i) ||
    t.match(/(\d{1,3})\s*gb\s*[x*×]\s*(\d{1,2})\b/i) ||
    t.match(/\(\s*(\d{1,2})\s*[x*×]\s*(\d{1,3})\s*\)/i);

  if (kit) {
    // "16GBx2" reverses the operands relative to "2x16GB".
    const reversed = /gb\s*[x*×]/i.test(kit[0]);
    const n = parseInt(reversed ? kit[2] : kit[1], 10);
    const size = parseInt(reversed ? kit[1] : kit[2], 10);
    if (n >= 1 && n <= 8 && VALID_CAPACITIES.has(size)) {
      modules = n;
      moduleGB = size;
      totalGB = n * size;
    }
  }

  // Standalone "NNGB" tokens; ignore ones glued into part numbers (e.g. CMK32GX5).
  const singles = [];
  const re = /(?:^|[^a-z0-9])(\d{1,3})\s*gb(?![a-z0-9])/gi;
  let m;
  while ((m = re.exec(t)) !== null) {
    const v = parseInt(m[1], 10);
    if (VALID_CAPACITIES.has(v)) singles.push(v);
  }

  // "(16GB / 32GB)" or "8GB | 16GB" — a menu of options, not one product.
  const distinct = Array.from(new Set(singles));
  const ambiguous = !kit && distinct.length > 1 && /\d\s*gb\s*(?:[/|]|\bor\b)\s*\d/i.test(t);

  if (totalGB == null && singles.length) {
    totalGB = Math.max(...singles);
    if (singles.length === 1) {
      const nMod = t.match(/(\d)\s*(?:pcs|pieces|sticks|modules|dimms)\b/i);
      modules = nMod ? parseInt(nMod[1], 10) : 1;
      moduleGB = modules === 1 ? totalGB : totalGB / modules;
      if (modules > 1) totalGB = moduleGB * modules;
    }
  }

  if (totalGB != null && !VALID_CAPACITIES.has(totalGB)) totalGB = null;
  return { totalGB, modules, moduleGB, ambiguous };
}

/** Data rate in MT/s. */
function detectSpeed(t) {
  const tagged = t.match(/ddr\s?-?\s?5\s*[-\s]?\s*(\d{4,5})\b/i);
  if (tagged) {
    const v = parseInt(tagged[1], 10);
    if (v >= 3600 && v <= 12000) return v;
  }
  const unit = t.match(/(\d{4,5})\s*(?:mhz|mt\/s|mts)\b/i);
  if (unit) {
    const v = parseInt(unit[1], 10);
    if (v >= 3600 && v <= 12000) return v;
  }
  const bare = t.match(
    /(?:^|[^a-z0-9])(4800|5200|5600|6000|6200|6400|6600|6800|7000|7200|7600|8000|8200|8400|8800|9000|9200|9600)(?![a-z0-9])/i
  );
  if (bare) return parseInt(bare[1], 10);
  return null;
}

function detectCas(t) {
  const m = t.match(/\bcl\s?-?\s?(\d{2})\b/i) || t.match(/\bc(\d{2})\b(?=\s|$)/i);
  if (m) {
    const v = parseInt(m[1], 10);
    if (v >= 26 && v <= 60) return v;
  }
  return null;
}

function detectFormFactor(t) {
  if (/\bso[-\s]?dimm\b|\bsodimm\b|\blaptop\b|\bnotebook\b/i.test(t)) return 'SODIMM';
  if (/\bcamm2?\b/i.test(t)) return 'CAMM2';
  return 'DIMM';
}

function detectServer(t) {
  return /\brdimm\b|\blrdimm\b|\becc\b|\bregistered\b|\bserver\s+memory\b/i.test(t);
}

function detectFamily(t) {
  for (const [re, name] of FAMILIES) {
    if (name && re.test(t)) return name;
  }
  return null;
}

function detectColor(t) {
  if (/\bwhite\b/i.test(t)) return 'White';
  if (/\bblack\b/i.test(t)) return 'Black';
  if (/\bsilver\b/i.test(t)) return 'Silver';
  return null;
}

/**
 * Full spec extraction from a product title, an optional vendor hint and the
 * variant label the price actually belongs to.
 * Returns null-ish fields rather than guessing when the listing is unclear.
 */
function parseTitle(rawTitle, vendorHint, variantText) {
  const title = stripHtml(rawTitle);
  const variant = stripHtml(variantText);
  const hay = vendorHint ? `${vendorHint} ${title}` : title;
  const full = variant ? `${title} ${variant}` : title;

  const brand = detectBrand(hay);

  // The variant is the authority on geometry: one product row can offer
  // several capacities, but a price always belongs to exactly one of them.
  const fromVariant = variant ? detectCapacity(variant) : { totalGB: null };
  const fromTitle = detectCapacity(title);
  const geom = fromVariant.totalGB != null ? fromVariant : fromTitle;

  // Unresolvable when the title lists options and no variant narrows it down.
  const ambiguous = fromVariant.totalGB == null && !!fromTitle.ambiguous;

  return {
    title: variant ? `${title} — ${variant}` : title,
    category: 'ram',
    ambiguous,
    brandId: brand ? brand.id : null,
    brandName: brand ? brand.name : null,
    brandTier: brand ? brand.tier : 9,
    family: detectFamily(title),
    generation: detectGeneration(full),
    totalGB: geom.totalGB,
    modules: geom.modules,
    moduleGB: geom.moduleGB,
    speed: detectSpeed(full),
    cas: detectCas(full),
    formFactor: detectFormFactor(full),
    isServer: detectServer(full),
    rgb: /\brgb\b/i.test(title),
    color: detectColor(full)
  };
}

/**
 * Stable cross-retailer key so the same kit can be compared between countries.
 * Deliberately coarse (brand + geometry + speed + CL) — part numbers differ per region.
 */
function specKey(s) {
  if (!s.brandId || !s.totalGB) return null;
  return [
    s.brandId,
    s.family ? s.family.toLowerCase().replace(/\s+/g, '') : 'x',
    `${s.totalGB}gb`,
    s.modules ? `${s.modules}x${s.moduleGB}` : 'x',
    s.speed ? `${s.speed}` : 'x',
    s.cas ? `cl${s.cas}` : 'x',
    s.rgb ? 'rgb' : 'nrgb'
  ].join('|');
}

/** Short human label used in the table's "Kit" column. */
function specLabel(s) {
  const bits = [];
  if (s.totalGB) bits.push(s.modules && s.modules > 1 ? `${s.totalGB}GB (${s.modules}x${s.moduleGB})` : `${s.totalGB}GB`);
  if (s.speed) bits.push(`${s.speed}`);
  if (s.cas) bits.push(`CL${s.cas}`);
  return bits.join(' · ');
}

module.exports = { parseTitle, specKey, specLabel, stripHtml, detectCapacity, VALID_CAPACITIES };
