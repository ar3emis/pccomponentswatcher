'use strict';

/**
 * Guards the "only show what you can actually buy" rule: a listing must not
 * read as in-stock when the retailer shows a price but no working checkout
 * path ("Enquire", "Notify me", "Coming soon"...), and — the opposite failure
 * — a product legitimately named around one of those words must not be
 * mistaken for its own stock status.
 */
const { NOT_BUYABLE_RE, withDefaults } = require('../src/core/stock');

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok   ' : 'FAIL '} ${name}${ok || !detail ? '' : '\n          ' + detail}`);
  if (!ok) failures++;
};

// ── stock.js itself ─────────────────────────────────────────────────────────

for (const phrase of ['Out of stock', 'SOLD OUT', 'Notify me when available', 'Enquire now', 'Coming soon', 'Discontinued', 'Call for price', 'Contact us for price', 'hết hàng', 'สินค้าหมด']) {
  check(`NOT_BUYABLE_RE matches "${phrase}"`, NOT_BUYABLE_RE.test(phrase));
}
for (const phrase of ['In stock', 'Add to cart', 'Pre-order now', 'Available on backorder', 'RTX 5090']) {
  check(`NOT_BUYABLE_RE does not match "${phrase}"`, !NOT_BUYABLE_RE.test(phrase), 'pre-order/backorder are deliberately excluded — see stock.js');
}

check('withDefaults with no custom pattern returns the shared defaults', withDefaults(undefined) && NOT_BUYABLE_RE.test('sold out'));
check('withDefaults keeps a custom pattern working', new RegExp(withDefaults('สินค้าหมดชั่วคราว'), 'i').test('สินค้าหมดชั่วคราว'));
check('withDefaults still catches the shared defaults alongside a custom pattern', new RegExp(withDefaults('สินค้าหมดชั่วคราว'), 'i').test('Enquire now'));

// ── woocommerce.js: real DOM fixtures served over an actual local HTTP server
// (adapters require('../http') at module load, so a real request exercises the
// same code path a live scrape does, rather than a mock that could quietly
// drift from it) ─────────────────────────────────────────────────────────────

const http = require('http');
const { fetchWoo } = require('../src/core/adapters/woocommerce');

function wooFixture(cards) {
  const li = (c) => `<li class="product ${c.cls || ''}"><h2 class="woocommerce-loop-product__title">${c.title}</h2>
    <span class="price"><span class="woocommerce-Price-amount">${c.price}</span></span>
    ${c.status || ''}<a href="/p/${encodeURIComponent(c.title)}"></a></li>`;
  return `<html><body>${cards.map(li).join('')}<li class="product"></li><li class="product"></li><li class="product"></li><li class="product"></li><li class="product"></li></body></html>`;
}

async function testWoo() {
  const html = wooFixture([
    { title: 'Corsair Vengeance 32GB DDR5', price: '$120', cls: '' },
    { title: 'G.Skill Trident Z5 64GB', price: '$220', cls: 'outofstock' },
    { title: 'Kingston Fury 16GB', price: '$60', status: '<span>Enquire for availability</span>' },
    { title: 'Discontinued Gaming RAM Pro 32GB', price: '$90', cls: '' } // title itself contains a flagged word
  ]);

  const server = http.createServer((_req, res) => res.end(html));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const items = await fetchWoo({ base: `http://127.0.0.1:${port}`, paths: ['/shop'], maxPages: 1 });
    const byTitle = Object.fromEntries(items.map((i) => [i.title, i]));

    check('a normal listing is in stock', byTitle['Corsair Vengeance 32GB DDR5']?.inStock === true);
    check('the outofstock class is still caught', byTitle['G.Skill Trident Z5 64GB']?.inStock === false);
    check('an "Enquire" status with no class change is caught', byTitle['Kingston Fury 16GB']?.inStock === false);
    check(
      'a title containing "Discontinued" is not mistaken for its own status',
      byTitle['Discontinued Gaming RAM Pro 32GB']?.inStock === true,
      'the word appears only in the title, which the check deliberately excludes'
    );
  } finally {
    server.close();
  }
}

testWoo()
  .then(() => {
    if (failures) {
      console.error(`\n${failures} check(s) FAILED.`);
      process.exit(1);
    }
    console.log('\nstock detection behaves correctly.');
  })
  .catch((err) => {
    console.error('test-stock crashed:', err);
    process.exit(1);
  });
