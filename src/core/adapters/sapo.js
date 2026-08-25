'use strict';

const { getJson } = require('../http');

/**
 * Sapo / Bizweb storefront JSON (the Vietnamese Shopify equivalent).
 * Same route shape as Shopify but a different product schema (`name` instead
 * of `title`, numeric prices, relative URLs).
 *
 * As with Shopify, one row is emitted per variant so a variant's price is
 * never attached to another variant's capacity.
 */
async function fetchSapo(source) {
  const out = [];
  const maxPages = source.maxPages || 4;

  for (const handle of source.collections) {
    for (let page = 1; page <= maxPages; page++) {
      const url = `${source.base}/collections/${encodeURI(handle)}/products.json?limit=50&page=${page}`;
      let data;
      try {
        data = await getJson(url, { timeout: 30000, retries: 2 });
      } catch (err) {
        if (page === 1) throw err;
        break;
      }
      const products = (data && data.products) || [];
      if (!products.length) break;

      for (const p of products) {
        const variants = (p.variants || []).filter((v) => Number(v.price) > 0);
        const rows = variants.length ? variants : Number(p.price) > 0 ? [{ price: p.price, available: p.available }] : [];

        for (const v of rows) {
          out.push({
            title: p.name || p.title || '',
            variantText: v.title && v.title !== 'Default Title' ? v.title : '',
            vendor: p.vendor || '',
            price: v.price,
            compareAt: v.compare_at_price || null,
            inStock: (v.available != null ? v.available : p.available) !== false,
            url: `${source.base}/${String(p.alias || p.handle || '').replace(/^\//, '')}`,
            sku: v.sku || `${p.id}-${v.id || 0}`,
            image: (v.featured_image && (v.featured_image.src || v.featured_image)) ||
              (p.featured_image && (p.featured_image.src || p.featured_image)) || null
          });
        }
      }
      if (products.length < 50) break;
    }
  }
  return out;
}

module.exports = { fetchSapo };
