'use strict';

/**
 * Locale-tolerant price parser.
 * Handles "₹8,000.00", "RM 499.00", "S$1,299", "HK$3,833.00",
 * "1.400.000₫" (dot thousands) and "฿4,590.-".
 */
function parsePrice(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (!raw) return null;

  let s = String(raw)
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&#8377;/g, '')
    .replace(/[^\d.,\-]/g, ' ')
    .trim();

  const m = s.match(/\d[\d.,]*/);
  if (!m) return null;
  let t = m[0].replace(/[.,]+$/, '');

  const lastDot = t.lastIndexOf('.');
  const lastComma = t.lastIndexOf(',');

  if (lastDot >= 0 && lastComma >= 0) {
    // Whichever separator comes last is the decimal point.
    if (lastDot > lastComma) t = t.replace(/,/g, '');
    else t = t.replace(/\./g, '').replace(',', '.');
  } else if (lastComma >= 0) {
    const tail = t.length - lastComma - 1;
    t = tail === 3 || t.split(',').length > 2 ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if (lastDot >= 0) {
    const tail = t.length - lastDot - 1;
    // "1.400.000" -> thousands; "499.00" -> decimal
    if (tail === 3 || t.split('.').length > 2) t = t.replace(/\./g, '');
  }

  const v = parseFloat(t);
  return Number.isFinite(v) && v > 0 ? v : null;
}

const CURRENCY_META = {
  INR: { symbol: '₹', decimals: 0, locale: 'en-IN' },
  SGD: { symbol: 'S$', decimals: 2, locale: 'en-SG' },
  MYR: { symbol: 'RM', decimals: 2, locale: 'ms-MY' },
  THB: { symbol: '฿', decimals: 0, locale: 'th-TH' },
  VND: { symbol: '₫', decimals: 0, locale: 'vi-VN' },
  HKD: { symbol: 'HK$', decimals: 0, locale: 'en-HK' },
  USD: { symbol: '$', decimals: 2, locale: 'en-US' }
};

module.exports = { parsePrice, CURRENCY_META };
