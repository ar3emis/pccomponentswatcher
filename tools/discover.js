'use strict';

/**
 * Dev harness: probes candidate retailers for a machine-readable storefront.
 *
 * Shopify and Sapo/Haravan expose /collections/<handle>/products.json, which is
 * exact (per-variant price + stock). WooCommerce archives are scrapeable HTML.
 * Anything that needs a real browser is reported separately so it can be
 * checked with the Chromium harness instead.
 */
const { get, getJson, pool } = require('../src/core/http');

const RAM_HANDLES = ['ram', 'memory', 'ram-pc', 'desktop-ram', 'ddr5', 'ram-ddr5', 'ram-may-tinh', 'computer-memory', 'memory-ram'];
const GPU_HANDLES = ['gpu', 'graphic-card', 'graphics-card', 'graphic-cards', 'graphics-cards', 'vga', 'video-card', 'card-man-hinh', 'display-card'];

const CANDIDATES = [
  // India
  ['IN', 'https://mdcomputers.in'], ['IN', 'https://www.primeabgb.com'], ['IN', 'https://www.vedantcomputers.com'],
  ['IN', 'https://www.theitdepot.com'], ['IN', 'https://www.pcstudio.in'], ['IN', 'https://www.computechstore.in'],
  ['IN', 'https://www.eliteshopnow.com'], ['IN', 'https://tech-cart.in'], ['IN', 'https://www.itwarehouse.in'],
  ['IN', 'https://portronics.com'], ['IN', 'https://www.gamerzchoice.in'], ['IN', 'https://evetechindia.com'],
  ['IN', 'https://www.smcinternational.in'], ['IN', 'https://www.pcbuilder.in'],

  // Singapore
  ['SG', 'https://www.bizgram.com'], ['SG', 'https://www.dynacore.com.sg'], ['SG', 'https://www.hachi.tech'],
  ['SG', 'https://challenger.sg'], ['SG', 'https://sglaptop.com'], ['SG', 'https://www.corebuilders.com.sg'],
  ['SG', 'https://www.techdeals.sg'], ['SG', 'https://www.aftershockpc.com'], ['SG', 'https://cybermind.com.sg'],
  ['SG', 'https://www.venom.com.sg'], ['SG', 'https://www.itwork.com.sg'],

  // Malaysia
  ['MY', 'https://www.allithypermarket.com.my'], ['MY', 'https://www.viewnet.com.my'], ['MY', 'https://www.thundermatch.com.my'],
  ['MY', 'https://tmt.my'], ['MY', 'https://www.gempc.com.my'], ['MY', 'https://pcbytes.com.my'],
  ['MY', 'https://www.techhypermart.com'], ['MY', 'https://www.mesinkira.com.my'], ['MY', 'https://ideal.com.my'],
  ['MY', 'https://www.illegear.com'], ['MY', 'https://www.compuzone.com.my'], ['MY', 'https://www.pcimage.com.my'],

  // Thailand
  ['TH', 'https://www.jib.co.th'], ['TH', 'https://www.itcity.co.th'], ['TH', 'https://www.speedcom.co.th'],
  ['TH', 'https://www.hardwarehouse.co.th'], ['TH', 'https://www.dbugcomputer.com'], ['TH', 'https://www.ascenti.co.th'],
  ['TH', 'https://www.tsg.co.th'], ['TH', 'https://www.notebookspec.com'], ['TH', 'https://www.jaymart.co.th'],

  // Vietnam
  ['VN', 'https://memoryzone.com.vn'], ['VN', 'https://tncstore.vn'], ['VN', 'https://nguyencongpc.vn'],
  ['VN', 'https://hoanghapc.vn'], ['VN', 'https://hacom.vn'], ['VN', 'https://www.phucanh.vn'],
  ['VN', 'https://xgear.net'], ['VN', 'https://ankhangpc.vn'], ['VN', 'https://tinhocngoisao.com'],
  ['VN', 'https://vitinhnguyenhoang.com'], ['VN', 'https://buildpc.vn'], ['VN', 'https://www.anphatpc.com.vn'],

  // Hong Kong
  ['HK', 'https://www.jumbo-computer.com'], ['HK', 'https://www.centralfield.com'], ['HK', 'https://www.dgtech.hk'],
  ['HK', 'https://www.foundtech.com.hk'], ['HK', 'https://hkstellar.com'], ['HK', 'https://www.gears.com.hk'],
  ['HK', 'https://www.altechhk.com'], ['HK', 'https://www.hkpcshop.com'], ['HK', 'https://shop.megabyte.com.hk']
];

async function probeJsonStorefront(base) {
  // A storefront index tells us the real handles without guessing.
  for (const path of ['/collections.json?limit=250', '/collections.json']) {
    try {
      const d = await getJson(base + path, { timeout: 12000, retries: 0 });
      const cols = (d && d.collections) || [];
      if (!cols.length) continue;
      const ram = cols.filter((c) => /\bram\b|memory|記憶體|ddr/i.test(c.title + ' ' + c.handle)).map((c) => c.handle);
      const gpu = cols.filter((c) => /graphic|vga|gpu|顯示卡|card.*man.*hinh/i.test(c.title + ' ' + c.handle)).map((c) => c.handle);
      return { kind: 'storefront-index', ram: ram.slice(0, 6), gpu: gpu.slice(0, 6) };
    } catch (_) {}
  }

  // Otherwise try the common handles directly.
  const found = { ram: [], gpu: [] };
  for (const [key, handles] of [['ram', RAM_HANDLES], ['gpu', GPU_HANDLES]]) {
    for (const h of handles) {
      try {
        const d = await getJson(`${base}/collections/${h}/products.json?limit=5`, { timeout: 9000, retries: 0 });
        const n = (d && d.products && d.products.length) || 0;
        if (n) { found[key].push(h); break; }
      } catch (_) {}
    }
  }
  if (found.ram.length || found.gpu.length) return { kind: 'products-json', ...found };
  return null;
}

async function probeWoo(base) {
  try {
    const html = await get(`${base}/?s=DDR5&post_type=product`, { timeout: 15000, retries: 0 });
    const cards = (html.match(/class="[^"]*\bproduct\b[^"]*type-product/g) || []).length;
    const prices = (html.match(/woocommerce-Price-amount/g) || []).length;
    if (cards >= 3 && prices >= 3) return { kind: 'woocommerce', cards, prices };
    if (cards >= 3) return { kind: 'woocommerce-no-prices', cards, prices };
  } catch (err) {
    return { kind: 'blocked', error: String(err.message).slice(0, 40) };
  }
  return null;
}

(async () => {
  const results = await pool(CANDIDATES, 6, async ([country, base]) => {
    const json = await probeJsonStorefront(base);
    if (json && (json.ram.length || json.gpu.length)) return { country, base, ...json };
    const woo = await probeWoo(base);
    if (woo) return { country, base, ...woo };
    return { country, base, kind: 'none' };
  });

  const rank = { 'storefront-index': 0, 'products-json': 1, woocommerce: 2, 'woocommerce-no-prices': 3, blocked: 4, none: 5 };
  results.sort((a, b) => a.country.localeCompare(b.country) || rank[a.kind] - rank[b.kind]);

  for (const r of results) {
    if (r.kind === 'none') continue;
    const detail =
      r.ram || r.gpu
        ? `ram=[${(r.ram || []).join(',')}] gpu=[${(r.gpu || []).join(',')}]`
        : r.error || `cards=${r.cards} prices=${r.prices}`;
    console.log(`${r.country}  ${r.kind.padEnd(22)} ${r.base.replace(/^https?:\/\//, '').padEnd(30)} ${detail}`);
  }
  console.log('\nno machine-readable storefront:');
  console.log('  ' + results.filter((r) => r.kind === 'none').map((r) => r.base.replace(/^https?:\/\//, '')).join(', '));
})();
