'use strict';

const { getJson } = require('./http');

const CURRENCIES = ['INR', 'MYR', 'VND', 'THB', 'HKD', 'SGD', 'USD'];

/**
 * Live FX rates expressed as "1 unit of X = N INR".
 * Primary: open.er-api.com (no key, covers VND).
 * Fallback: frankfurter.dev (ECB, no VND) — used only if the primary is down.
 */
async function fetchRates() {
  try {
    const d = await getJson('https://open.er-api.com/v6/latest/USD', { timeout: 15000, retries: 1 });
    if (d && d.result === 'success' && d.rates && d.rates.INR) {
      return build(d.rates, 'open.er-api.com', d.time_last_update_utc || null);
    }
    throw new Error('unexpected payload');
  } catch (primaryErr) {
    const d = await getJson(
      'https://api.frankfurter.dev/v1/latest?base=USD&symbols=' + CURRENCIES.filter((c) => c !== 'USD').join(','),
      { timeout: 15000, retries: 1 }
    );
    if (!d || !d.rates || !d.rates.INR) throw primaryErr;
    return build({ ...d.rates, USD: 1 }, 'frankfurter.dev (ECB)', d.date || null);
  }
}

function build(usdRates, provider, asOf) {
  const inrPerUsd = usdRates.INR;
  const toINR = {};
  for (const c of CURRENCIES) {
    const perUsd = c === 'USD' ? 1 : usdRates[c];
    if (typeof perUsd === 'number' && perUsd > 0) toINR[c] = inrPerUsd / perUsd;
  }
  return { toINR, provider, asOf, fetchedAt: Date.now() };
}

module.exports = { fetchRates, CURRENCIES };
