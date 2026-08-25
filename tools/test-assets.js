'use strict';

/**
 * `site/` is served to the public verbatim by the Worker's ASSETS binding.
 * Anything in it is reachable by URL with no authentication at all, so a price
 * payload landing there would silently defeat the paywall.
 *
 * This ran red once already — the first version of the exporter wrote
 * data-full.json straight into the asset root.
 */
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..', 'site');

const ALLOWED = new Set(['index.html', 'app.js', 'bridge.js', 'charts.js', 'styles.css', 'icon.png', 'favicon.ico', 'robots.txt']);

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok   ' : 'FAIL '} ${name}${ok || !detail ? '' : '\n          ' + detail}`);
  if (!ok) failures++;
};

if (!fs.existsSync(SITE)) {
  console.log('site/ not built — nothing to check.');
  process.exit(0);
}

const entries = fs.readdirSync(SITE);

check(
  'no unexpected files in the public asset root',
  entries.every((e) => ALLOWED.has(e)),
  'unexpected: ' + entries.filter((e) => !ALLOWED.has(e)).join(', ')
);

// Belt and braces: no file in site/ may contain a price payload, whatever it is called.
const suspicious = [];
for (const e of entries) {
  const full = path.join(SITE, e);
  if (!fs.statSync(full).isFile()) continue;
  if (fs.statSync(full).size > 200 * 1024 && /\.json$/i.test(e)) suspicious.push(`${e} (large JSON)`);
  if (/\.json$/i.test(e)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (parsed && parsed.snapshot && Array.isArray(parsed.snapshot.listings)) suspicious.push(`${e} (contains snapshot.listings)`);
    } catch (_) {}
  }
}
check('no price payload is publicly served', suspicious.length === 0, suspicious.join(', '));

console.log(`\n  site/: ${entries.join(', ')}`);

if (failures) {
  console.error(`\n${failures} check(s) FAILED — deploying this would expose paid data.`);
  process.exit(1);
}
console.log('\nasset root is clean.');
