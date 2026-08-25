'use strict';

/** Dev harness: runs the HTTP sources for real and prints what each returned. */
const { refreshAll } = require('../src/core/refresh');
const { SOURCES } = require('../src/core/sources');

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const cats = process.argv.includes('--gpu') ? ['gpu'] : process.argv.includes('--ram') ? ['ram'] : ['ram', 'gpu'];
const ids = only.length ? only : SOURCES.filter((s) => s.kind !== 'browser').map((s) => s.id);

refreshAll({ sourceIds: ids, categories: cats, concurrency: 4 })
  .then((snap) => {
    console.log('\nFX:', snap.fx.provider || snap.fx.error, snap.fx.asOf || '');
    console.log('\nSOURCES');
    for (const s of snap.sources) {
      const flag = s.ok ? 'ok ' : 'ERR';
      console.log(
        `  ${flag} ${s.country} ${s.category.toUpperCase()} ${s.name.padEnd(20)} raw=${String(s.rawCount).padStart(4)} kept=${String(s.count || 0).padStart(4)} ${(s.ms / 1000).toFixed(1)}s ${s.error || ''}`
      );
    }
    console.log('\nREJECTED:', snap.rejected);
    console.log('\nTOTAL DDR5 LISTINGS:', snap.listings.length);

    const byCountry = {};
    for (const l of snap.listings) byCountry[l.country] = (byCountry[l.country] || 0) + 1;
    console.log('BY COUNTRY:', byCountry);

    console.log('\nSAMPLE (cheapest per country, 32GB):');
    for (const c of Object.keys(byCountry)) {
      const rows = snap.listings.filter((l) => l.country === c && l.totalGB === 32 && l.inStock);
      rows.sort((a, b) => (a.priceINR || 1e18) - (b.priceINR || 1e18));
      const r = rows[0];
      if (r) {
        console.log(
          `  ${c} ${r.brandName} | ${r.kitLabel} | ${r.currency} ${r.price} = INR ${Math.round(r.priceINR)} | ${r.sourceName}`
        );
      }
    }
  })
  .catch((err) => {
    console.error('FATAL', err);
    process.exit(1);
  });
