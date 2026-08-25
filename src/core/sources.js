'use strict';

/**
 * `defaultSelected` marks the markets a fresh profile starts with checked.
 * Every market newly added beyond the original six starts unchecked — opting
 * in is a deliberate choice, not something a bigger COUNTRIES array should
 * spring on an existing filter bar.
 */
const COUNTRIES = [
  { code: 'IN', name: 'India',     currency: 'INR', flag: '🇮🇳', defaultSelected: true },
  { code: 'SG', name: 'Singapore', currency: 'SGD', flag: '🇸🇬', defaultSelected: true },
  { code: 'MY', name: 'Malaysia',  currency: 'MYR', flag: '🇲🇾', defaultSelected: true },
  { code: 'TH', name: 'Thailand',  currency: 'THB', flag: '🇹🇭', defaultSelected: true },
  { code: 'VN', name: 'Vietnam',   currency: 'VND', flag: '🇻🇳', defaultSelected: true },
  { code: 'HK', name: 'Hong Kong', currency: 'HKD', flag: '🇭🇰', defaultSelected: true },
  { code: 'UK', name: 'United Kingdom', currency: 'GBP', flag: '🇬🇧' }
];

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

const CATEGORIES = [
  { id: 'ram', label: 'DDR5 memory', unit: 'GB' },
  { id: 'gpu', label: 'Graphics cards', unit: 'GB VRAM' }
];

/** Default WooCommerce archive selectors, reused by the Chromium fallback. */
const WOO_SELECTORS = {
  card: 'li.product, div.product.type-product',
  title: '.woocommerce-loop-product__title, h3.product-title, h2, h3',
  priceNew: '.price ins .woocommerce-Price-amount',
  price: '.price .woocommerce-Price-amount',
  link: 'a.woocommerce-LoopProduct-link, a',
  outOfStockRe: 'outofstock|out of stock|sold out'
};

/**
 * Retailer registry.
 *
 * `kind` picks the adapter. Every HTTP entry was verified against the live
 * site. `browser` entries render in a hidden Chromium window because the shop
 * needs JavaScript; `browserFallback` shops normally answer over HTTP but
 * serve a challenge page to non-browser clients, so we retry them in Chromium.
 *
 * `paths` / `collections` are grouped by product category.
 */
const SOURCES = [
  // ── India ────────────────────────────────────────────────────────────────
  {
    id: 'in-mdcomputers',
    name: 'MDComputers',
    country: 'IN',
    currency: 'INR',
    kind: 'generic',
    base: 'https://mdcomputers.in',
    site: 'https://mdcomputers.in',
    browserFallback: true,
    maxPages: 2,
    catalog: {
      ram: { paths: ['/index.php?route=product/search&search=DDR5%20RAM&limit=100&page={page}'] },
      gpu: {
        paths: [
          '/index.php?route=product/search&search=RTX%2050&limit=100&page={page}',
          '/index.php?route=product/search&search=Radeon%20RX&limit=100&page={page}'
        ]
      }
    },
    selectors: {
      card: '.retrinapro-productlist-all_products_design',
      title: 'h3.product-entities-title a',
      priceNew: '.price .ins',
      price: '.price',
      link: 'h3.product-entities-title a'
    }
  },
  {
    id: 'in-primeabgb',
    name: 'PrimeABGB',
    country: 'IN',
    currency: 'INR',
    kind: 'woo',
    base: 'https://www.primeabgb.com',
    site: 'https://www.primeabgb.com',
    maxPages: 3,
    catalog: {
      ram: { paths: ['/?s=DDR5+RAM&post_type=product&paged={page}'] },
      gpu: { paths: ['/buy-online-price-india/graphic-cards-gpu/page/{page}/'] }
    }
  },
  {
    id: 'in-vedant',
    name: 'Vedant Computers',
    country: 'IN',
    currency: 'INR',
    kind: 'generic',
    base: 'https://www.vedantcomputers.com',
    site: 'https://www.vedantcomputers.com',
    maxPages: 2,
    catalog: {
      ram: { paths: ['/index.php?route=product/search&search=DDR5&limit=100&page={page}'] },
      gpu: {
        paths: [
          '/index.php?route=product/search&search=RTX&limit=100&page={page}',
          '/index.php?route=product/search&search=Radeon&limit=100&page={page}'
        ]
      }
    },
    selectors: {
      card: '.product-layout',
      title: '.caption .name a',
      priceNew: '.price .price-new',
      price: '.price',
      link: '.caption .name a',
      stock: '.stat-2',
      outOfStockRe: 'out\\s*of\\s*stock|pre[\\s-]?order'
    }
  },

  {
    id: 'in-pcstudio',
    name: 'PC Studio',
    country: 'IN',
    currency: 'INR',
    kind: 'woo',
    base: 'https://www.pcstudio.in',
    site: 'https://www.pcstudio.in',
    maxPages: 4,
    catalog: {
      ram: { paths: ['/?s=DDR5&post_type=product&paged={page}'] },
      gpu: { paths: ['/?s=RTX&post_type=product&paged={page}', '/?s=Radeon+RX&post_type=product&paged={page}'] }
    }
  },

  // ── Singapore ────────────────────────────────────────────────────────────
  {
    id: 'sg-bizgram',
    name: 'Bizgram',
    country: 'SG',
    currency: 'SGD',
    kind: 'woo',
    base: 'https://www.bizgram.com',
    site: 'https://www.bizgram.com',
    maxPages: 3,
    catalog: {
      ram: { paths: ['/product-category/memory-ram/page/{page}/', '/?s=DDR5&post_type=product&paged={page}'] },
      gpu: { paths: ['/?s=RTX&post_type=product&paged={page}', '/?s=Radeon+RX&post_type=product&paged={page}'] }
    }
  },
  {
    id: 'sg-dynacore',
    name: 'Dynacore',
    country: 'SG',
    currency: 'SGD',
    kind: 'shopify',
    base: 'https://www.dynacore.com.sg',
    site: 'https://www.dynacore.com.sg',
    maxPages: 3,
    catalog: {
      ram: { collections: ['ram'] },
      gpu: { collections: ['gpu'] }
    }
  },

  // ── Malaysia ─────────────────────────────────────────────────────────────
  {
    id: 'my-allit',
    name: 'ALL IT Hypermarket',
    country: 'MY',
    currency: 'MYR',
    kind: 'shopify',
    base: 'https://www.allithypermarket.com.my',
    site: 'https://www.allithypermarket.com.my',
    maxPages: 4,
    catalog: {
      ram: { collections: ['ram', 'laptop-ram'] },
      gpu: { collections: ['graphic-cards', 'nvidia-graphics-card', 'radeon-graphics-card'] }
    }
  },
  // ── Vietnam ──────────────────────────────────────────────────────────────
  {
    id: 'vn-memoryzone',
    name: 'MemoryZone',
    country: 'VN',
    currency: 'VND',
    kind: 'sapo',
    base: 'https://memoryzone.com.vn',
    site: 'https://memoryzone.com.vn',
    maxPages: 4,
    catalog: {
      ram: { collections: ['ram-pc', 'ram', 'ram-pc-ddr5'] },
      gpu: { collections: ['vga'] }
    }
  },

  // ── Thailand ─────────────────────────────────────────────────────────────
  {
    id: 'th-jib',
    name: 'JIB',
    country: 'TH',
    currency: 'THB',
    kind: 'browser',
    base: 'https://www.jib.co.th',
    site: 'https://www.jib.co.th',
    // Large catalogue pages (600+ tiles) need time to finish rendering.
    settleMs: 15000,
    timeout: 95000,
    catalog: {
      ram: { paths: ['/web/product/product_list/2/53'] },
      gpu: { paths: ['/web/product/product_list/2/51'] }
    },
    selectors: {
      card: 'div.divboxpro',
      title: 'span.promo_name',
      price: 'p.price_total',
      link: 'a[href*="readProduct"]',
      outOfStockRe: 'สินค้าหมดชั่วคราว|สินค้าหมด'
    }
  },

  {
    id: 'th-speedcom',
    name: 'Speed Computer',
    country: 'TH',
    currency: 'THB',
    kind: 'shopify',
    base: 'https://www.speedcom.co.th',
    site: 'https://www.speedcom.co.th',
    maxPages: 3,
    catalog: {
      ram: { collections: ['random-access-memory', 'ram-for-pc', 'ram-notebook'] },
      gpu: { collections: ['vga-diy', 'graphic-card-amd', 'vga-nvidia-5000'] }
    }
  },

  // ── United Kingdom ───────────────────────────────────────────────────────
  {
    id: 'uk-computerorbit',
    name: 'ComputerOrbit',
    country: 'UK',
    currency: 'GBP',
    kind: 'shopify',
    base: 'https://www.computerorbit.com',
    site: 'https://www.computerorbit.com',
    maxPages: 3,
    catalog: {
      ram: { collections: ['ddr5-desktop-ram'] },
      gpu: { collections: ['graphics-cards'] }
    }
  },
  {
    id: 'uk-epsilonpc',
    name: 'Epsilon PC',
    country: 'UK',
    currency: 'GBP',
    kind: 'shopify',
    base: 'https://www.epsilonpc.co.uk',
    site: 'https://www.epsilonpc.co.uk',
    maxPages: 3,
    catalog: {
      ram: { collections: ['desktop-memory-ram-for-desktop-pc'] },
      gpu: { collections: ['graphics-card'] }
    }
  },

  // ── Hong Kong ────────────────────────────────────────────────────────────
  {
    id: 'hk-jumbo',
    name: 'Jumbo Computer',
    country: 'HK',
    currency: 'HKD',
    kind: 'shopify',
    base: 'https://www.jumbo-computer.com',
    site: 'https://www.jumbo-computer.com',
    maxPages: 3,
    catalog: {
      ram: { collections: ['電腦記憶體', 'corsair-電腦記憶體', 'g-skill-ram-電腦記憶體'] },
      gpu: { collections: ['顯示卡', 'rtx-5090-display-card', 'rtx-5080-display-card', 'amd-radeon-rx-9070-xt-display-card'] }
    }
  }
];

/**
 * Expands the registry into one job per (source × category), so each adapter
 * call knows exactly which parser its results should go through.
 */
function jobsFor(categoryIds) {
  const jobs = [];
  for (const source of SOURCES) {
    for (const cat of categoryIds) {
      const entry = source.catalog && source.catalog[cat];
      if (!entry) continue;
      jobs.push({
        ...source,
        category: cat,
        jobId: `${source.id}:${cat}`,
        paths: entry.paths || null,
        collections: entry.collections || null,
        selectors: entry.selectors || source.selectors || WOO_SELECTORS
      });
    }
  }
  return jobs;
}

module.exports = { SOURCES, COUNTRIES, COUNTRY_BY_CODE, CATEGORIES, WOO_SELECTORS, jobsFor };
