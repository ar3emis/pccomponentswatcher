'use strict';

const cheerio = require('cheerio');
const { get } = require('../http');
const { parsePrice } = require('../money');
const { absolute } = require('./woocommerce');

/**
 * Config-driven HTML scraper for shops that are neither Shopify nor WooCommerce.
 * A source supplies CSS selectors for the card, title, price and link.
 */
async function fetchGeneric(source) {
  const out = [];
  const sel = source.selectors;
  const maxPages = source.maxPages || 3;

  for (const pathTpl of source.paths) {
    for (let page = 1; page <= maxPages; page++) {
      const url = source.base + pathTpl.replace('{page}', String(page));
      let html;
      try {
        html = await get(url, { timeout: 40000, retries: 1 });
      } catch (err) {
        if (page === 1) throw err;
        break;
      }

      const $ = cheerio.load(html);
      const cards = $(sel.card);
      if (!cards.length) break;

      let added = 0;
      cards.each((_, el) => {
        const $c = $(el);
        const title = text($c, sel.title);
        if (!title) return;

        const price = parsePrice(text($c, sel.priceNew) || text($c, sel.price));
        if (!price) return;

        const href = $c.find(sel.link || 'a').first().attr('href');
        const stockBlob = sel.stock ? text($c, sel.stock) : ($c.attr('class') || '') + ' ' + ($c.html() || '').slice(0, 400);
        const outOfStockRe = sel.outOfStockRe
          ? new RegExp(sel.outOfStockRe, 'i')
          : /out\s*of\s*stock|sold\s*out|hết hàng|สินค้าหมด|缺貨/i;
        const outOfStock = outOfStockRe.test(stockBlob);

        out.push({
          title,
          vendor: '',
          price,
          inStock: !outOfStock,
          url: absolute(source.base, href),
          sku: title,
          image: $c.find('img').first().attr('data-src') || $c.find('img').first().attr('src') || null
        });
        added++;
      });

      if (!added) break;
    }
  }
  return out;
}

function text($c, selector) {
  if (!selector) return '';
  const n = $c.find(selector).first();
  return n.length ? n.text().replace(/\s+/g, ' ').trim() : '';
}

module.exports = { fetchGeneric };
