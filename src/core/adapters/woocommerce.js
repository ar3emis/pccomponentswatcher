'use strict';

const cheerio = require('cheerio');
const { get } = require('../http');
const { parsePrice } = require('../money');

/**
 * Generic WooCommerce product-archive scraper.
 * Works on the standard `li.product` loop markup that most Woo themes keep.
 */
async function fetchWoo(source) {
  const out = [];
  const maxPages = source.maxPages || 3;

  for (const pathTpl of source.paths) {
    for (let page = 1; page <= maxPages; page++) {
      const url = source.base + pathTpl.replace('{page}', String(page));
      let html;
      try {
        html = await get(url, { timeout: 35000, retries: 1 });
      } catch (err) {
        if (page === 1) throw err;
        break;
      }

      const $ = cheerio.load(html);
      const cards = $('li.product, div.product.type-product');
      if (!cards.length) break;

      let added = 0;
      cards.each((_, el) => {
        const $c = $(el);
        const rawTitle =
          $c.find('.woocommerce-loop-product__title').first().text().trim() ||
          $c.find('h3.product-title').first().text().trim() ||
          $c.find('h2, h3').first().text().trim();
        if (!rawTitle) return;

        // Sale prices render as <del>old</del><ins>new</ins>; prefer <ins>.
        const insPrice = $c.find('.price ins .woocommerce-Price-amount').first().text();
        const anyPrice = $c.find('.price .woocommerce-Price-amount').last().text();
        const price = parsePrice(insPrice || anyPrice);
        if (!price) return;

        const cls = ($c.attr('class') || '').toLowerCase();
        const href = $c.find('a.woocommerce-LoopProduct-link, a.woocommerce-loop-product__link, h2 a, a').first().attr('href');
        const title = titleFrom(rawTitle, href);

        out.push({
          title,
          vendor: '',
          price,
          inStock: !/\boutofstock\b/.test(cls),
          url: absolute(source.base, href),
          sku: (cls.match(/post-(\d+)/) || [])[1] || title,
          image: $c.find('img').first().attr('src') || null
        });
        added++;
      });

      if (!added || cards.length < 8) break;
    }
  }
  return out;
}

/**
 * Many Woo themes clamp the visible title to a fixed width and append an
 * ellipsis, which silently drops speed/CL/kit detail. The product slug carries
 * the full name, so fall back to it when the text is truncated.
 */
function titleFrom(text, href) {
  const truncated = /(…|\.\.\.)\s*$/.test(text || '');
  if (!truncated || !href) return text;
  const slug = String(href).split('?')[0].replace(/\/$/, '').split('/').pop() || '';
  if (slug.length < 12) return text;
  const expanded = decodeURIComponent(slug).replace(/-/g, ' ').trim();
  return expanded.length > (text || '').length ? expanded : text;
}

function absolute(base, href) {
  if (!href) return base;
  if (/^https?:/i.test(href)) return href;
  return base.replace(/\/$/, '') + '/' + href.replace(/^\//, '');
}

module.exports = { fetchWoo, absolute, titleFrom };
