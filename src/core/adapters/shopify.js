'use strict';

const { getJson } = require('../http');

/**
 * Shopify storefront JSON (/collections/<handle>/products.json).
 *
 * One row is emitted per *variant*, never per product. A listing such as
 * "Corsair Vengeance RGB DDR5 (16GB / 32GB)" is a single product with two
 * variants at different prices and different stock — collapsing it to one row
 * would attach one variant's price to another variant's capacity.
 */
async function fetchShopify(source) {
  const out = [];
  const maxPages = source.maxPages || 3;

  for (const handle of source.collections) {
    for (let page = 1; page <= maxPages; page++) {
      const url = `${source.base}/collections/${encodeURI(handle)}/products.json?limit=250&page=${page}`;
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
        for (const v of variantsOf(p.variants)) {
          out.push({
            title: p.title,
            variantText: variantLabel(v),
            vendor: p.vendor || '',
            price: v.price,
            compareAt: v.compare_at_price || null,
            inStock: v.available !== false,
            url: `${source.base}/products/${p.handle}${v.id ? `?variant=${v.id}` : ''}`,
            sku: v.sku || `${p.id}-${v.id}`,
            image: (v.featured_image && v.featured_image.src) || (p.images && p.images[0] && p.images[0].src) || null
          });
        }
      }
      if (products.length < 250) break;
    }
  }
  return out;
}

function variantsOf(variants) {
  if (!Array.isArray(variants)) return [];
  return variants.filter((v) => parseFloat(v.price) > 0);
}

/** "Default Title" carries no information; anything else describes the variant. */
function variantLabel(v) {
  const t = v.title || '';
  return t && t !== 'Default Title' ? t : '';
}

module.exports = { fetchShopify };
