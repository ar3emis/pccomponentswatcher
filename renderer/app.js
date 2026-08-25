'use strict';

const api = window.ramwatch;

const state = {
  settings: {},
  countries: [],
  brands: [],
  gpuBrands: [],
  gpuModels: [],
  ramCapacities: [],
  gpuVram: [],
  sources: [],
  snapshot: null,
  history: {},
  category: 'ram',
  filters: {
    countries: new Set(),
    memory: new Set(),
    brands: new Set(),
    models: new Set(),
    vendors: new Set(),
    form: 'DIMM',
    best: 'all',
    search: ''
  },
  sort: { key: 'priceINR', dir: 'asc' },
  tab: 'table',
  compareCompleteOnly: false,
  // Web only. The desktop app has no accounts, so this stays null there and
  // every account-aware branch below degrades to the unrestricted view.
  account: null,
  freeMaxGB: null
};

const VENDOR_ORDER = ['NVIDIA', 'AMD', 'Intel'];

const COUNTRY_COLORS = {
  IN: '#4d9dff',
  SG: '#35d07f',
  MY: '#f0b429',
  TH: '#c084fc',
  VN: '#ff8a65',
  HK: '#4dd0e1',
  UK: '#e05d5d'
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const isGpu = () => state.category === 'gpu';

// ── Formatting ─────────────────────────────────────────────────────────────

const CURRENCY_DECIMALS = { INR: 0, SGD: 2, MYR: 2, THB: 0, VND: 0, HKD: 0, USD: 2, GBP: 2 };
const CURRENCY_SYMBOL = { INR: '₹', SGD: 'S$', MYR: 'RM', THB: '฿', VND: '₫', HKD: 'HK$', USD: '$', GBP: '£' };

function fmtLocal(value, currency) {
  const d = CURRENCY_DECIMALS[currency] != null ? CURRENCY_DECIMALS[currency] : 2;
  return `${CURRENCY_SYMBOL[currency] || ''}${value.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

function fmtINR(value) {
  if (value == null) return '—';
  return '₹' + Math.round(value).toLocaleString('en-IN');
}

function fmtAgo(ts) {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function median(values) {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// ── Filtering ──────────────────────────────────────────────────────────────

/**
 * Locked products the server described but would not price, filtered by the
 * same controls as the real rows. Empty for subscribers and on the desktop.
 */
function visibleLocked() {
  const snap = state.snapshot;
  if (!snap || !snap.lockedListings) return [];
  const f = state.filters;
  const terms = f.search.toLowerCase().split(/\s+/).filter(Boolean);
  const gpu = isGpu();

  return snap.lockedListings.filter((l) => {
    if (l.category !== state.category) return false;
    if (f.memory.size && !f.memory.has(l.memoryGB)) return false;
    if (gpu) {
      if (f.vendors.size && !f.vendors.has(l.vendor)) return false;
      if (f.models.size && !f.models.has(l.modelId)) return false;
    } else if (f.form !== 'all' && l.formFactor !== f.form) return false;
    if (f.brands.size && !f.brands.has(l.brandId)) return false;
    if (terms.length) {
      // Deliberately excludes retailer and country: a locked row has neither.
      const hay = `${l.title} ${l.brandName} ${l.modelName || ''}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

function visibleListings() {
  const snap = state.snapshot;
  if (!snap) return [];
  const f = state.filters;
  const terms = f.search.toLowerCase().split(/\s+/).filter(Boolean);
  const gpu = isGpu();

  let rows = snap.listings.filter((l) => {
    if (l.category !== state.category) return false;
    if (f.countries.size && !f.countries.has(l.country)) return false;
    if (f.memory.size && !f.memory.has(l.memoryGB)) return false;
    if (gpu) {
      if (f.vendors.size && !f.vendors.has(l.vendor)) return false;
      if (f.models.size && !f.models.has(l.modelId)) return false;
    } else if (f.form !== 'all' && l.formFactor !== f.form) return false;
    if (f.brands.size && !f.brands.has(l.brandId)) return false;
    // The dashboard only ever shows what you can actually buy right now.
    if (!l.inStock) return false;
    if (terms.length) {
      const hay = `${l.title} ${l.brandName} ${l.modelName || ''} ${l.sourceName} ${l.countryName}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });

  // "Best price" views collapse the list to one winner per country / product.
  if (f.best !== 'all') {
    const keep = new Map();
    for (const r of rows) {
      if (r.priceINR == null) continue;
      const key = f.best === 'country' ? r.country : r.specKey || r.title;
      const cur = keep.get(key);
      if (!cur || r.priceINR < cur.priceINR) keep.set(key, r);
    }
    rows = Array.from(keep.values());
  }

  return rows;
}

function sortListings(rows) {
  const { key, dir } = state.sort;
  const mul = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    let x = a[key];
    let y = b[key];
    if (typeof x === 'boolean') x = x ? 1 : 0;
    if (typeof y === 'boolean') y = y ? 1 : 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === 'string') return mul * String(x).localeCompare(String(y));
    return mul * (x - y);
  });
}

// ── Price table ────────────────────────────────────────────────────────────

function renderTable() {
  const rows = sortListings(visibleListings());
  const locked = visibleLocked();
  const body = $('#priceBody');
  const empty = $('#tableEmpty');
  const gpu = isGpu();

  $('#resultCount').textContent =
    `${rows.length} listing${rows.length === 1 ? '' : 's'}` + (locked.length ? ` · ${locked.length} locked` : '');

  if (!rows.length && !locked.length) {
    body.innerHTML = '';
    empty.classList.remove('hidden');
    empty.textContent = state.snapshot
      ? 'Nothing in stock matches these filters. Try widening the country, brand or size selection.'
      : 'No data yet — hit Refresh to pull live prices.';
    return;
  }
  empty.classList.add('hidden');

  // Cheapest per size, so the best deal in each class is obvious.
  const bestBySize = new Map();
  for (const r of rows) {
    if (r.priceINR == null) continue;
    const cur = bestBySize.get(r.memoryGB);
    if (!cur || r.priceINR < cur) bestBySize.set(r.memoryGB, r.priceINR);
  }

  body.innerHTML = rows
    .slice(0, 600)
    .map((r) => {
      const series = (state.history[r.id] || []).map((p) => ({ t: p.t, v: p.r != null ? p.r : p.p }));
      const isBest = r.priceINR != null && bestBySize.get(r.memoryGB) === r.priceINR;
      const flag = (state.countries.find((c) => c.code === r.country) || {}).flag || '';
      const tierCls = r.brandTier === 1 ? 'brand-t1' : r.brandTier === 2 ? 'brand-t2' : '';

      const sizeCell = gpu
        ? `${r.vram}GB`
        : `${r.totalGB}GB${r.modules > 1 ? ` <span class="cell-sub">${r.modules}×${r.moduleGB}</span>` : ''}`;

      const specCells = gpu
        ? `<td class="gpu-only">${escapeHtml(r.modelName || '—')}${r.oc ? ' <span class="cell-sub">OC</span>' : ''}</td>`
        : `<td class="num ram-only">${r.speed || '—'}</td><td class="num ram-only">${r.cas ? 'CL' + r.cas : '—'}</td>`;

      return `<tr>
        <td class="brand-cell ${tierCls}">${escapeHtml(r.brandName)}</td>
        <td><a href="#" class="prod-link" data-url="${escapeHtml(r.url)}" title="${escapeHtml(r.title)}">${escapeHtml(r.title)}</a></td>
        <td class="num">${sizeCell}</td>
        ${specCells}
        <td class="flagcell"><span class="flag">${flag}</span>${escapeHtml(r.countryName)}</td>
        <td>${escapeHtml(r.sourceName)}</td>
        <td class="num local">${fmtLocal(r.price, r.currency)}</td>
        <td class="num inr ${isBest ? 'inr-best' : ''}">${fmtINR(r.priceINR)}${deltaBadge(series)}</td>
        <td class="num">${r.pricePerGBINR ? fmtINR(r.pricePerGBINR) : '—'}</td>
        <td class="num">${window.Charts.sparkline(series)}</td>
      </tr>`;
    })
    .join('') + lockedRowsHtml(locked, gpu);
}

/**
 * Rows for products the server priced but would not locate. There is no URL,
 * retailer or country to render — the API never sent one.
 */
function lockedRowsHtml(locked, gpu) {
  if (!locked.length) return '';

  const sorted = [...locked].sort((a, b) => a.memoryGB - b.memoryGB || a.minPriceINR - b.minPriceINR);

  return sorted
    .slice(0, 400)
    .map((l) => {
      const tierCls = l.brandTier === 1 ? 'brand-t1' : l.brandTier === 2 ? 'brand-t2' : '';
      const sizeCell = gpu ? `${l.vram}GB` : `${l.totalGB}GB${l.modules > 1 ? ` <span class="cell-sub">${l.modules}×${l.moduleGB}</span>` : ''}`;
      const specCells = gpu
        ? `<td class="gpu-only">${escapeHtml(l.modelName || '—')}${l.oc ? ' <span class="cell-sub">OC</span>' : ''}</td>`
        : `<td class="num ram-only">${l.speed || '—'}</td><td class="num ram-only">${l.cas ? 'CL' + l.cas : '—'}</td>`;

      const range =
        l.minPriceINR === l.maxPriceINR
          ? fmtINR(l.minPriceINR)
          : `${fmtINR(l.minPriceINR)} – ${fmtINR(l.maxPriceINR)}`;

      return `<tr class="row-locked">
        <td class="brand-cell ${tierCls}"><span class="lock-ico" aria-hidden="true">🔒</span>${escapeHtml(l.brandName)}</td>
        <td><span class="locked-title">${escapeHtml(l.title)}</span></td>
        <td class="num">${sizeCell}</td>
        ${specCells}
        <td class="locked-cell" colspan="2">
          <button class="link-btn unlock-btn">Unlock ${l.marketCount} market${l.marketCount === 1 ? '' : 's'}</button>
        </td>
        <td class="num cell-empty">—</td>
        <td class="num inr locked-price">${range}</td>
        <td class="num">${l.spreadPct ? l.spreadPct + '%' : '—'}</td>
        <td class="num cell-sub">${l.offerCount} offer${l.offerCount === 1 ? '' : 's'}</td>
      </tr>`;
    })
    .join('');
}

function deltaBadge(series) {
  if (!series || series.length < 2) return '';
  const first = series[0].v;
  const last = series[series.length - 1].v;
  if (!first || first === last) return '';
  const pct = ((last - first) / first) * 100;
  if (Math.abs(pct) < 0.5) return '';
  const cls = pct > 0 ? 'delta-up' : 'delta-down';
  return ` <span class="delta ${cls}">${pct > 0 ? '▲' : '▼'}${Math.abs(pct).toFixed(1)}%</span>`;
}

// ── Country comparison pivot ───────────────────────────────────────────────

function renderCompare() {
  const f = state.filters;
  const saved = f.best;
  f.best = 'all'; // The pivot does its own per-country reduction.
  const rows = visibleListings();
  f.best = saved;

  const codes = state.countries.map((c) => c.code).filter((c) => !f.countries.size || f.countries.has(c));
  const gpu = isGpu();

  const groups = new Map();
  for (const r of rows) {
    if (!r.specKey || r.priceINR == null) continue;
    let g = groups.get(r.specKey);
    if (!g) {
      g = { key: r.specKey, ref: r, byCountry: {} };
      groups.set(r.specKey, g);
    }
    const cur = g.byCountry[r.country];
    if (!cur || r.priceINR < cur.priceINR) g.byCountry[r.country] = r;
  }

  const list = Array.from(groups.values())
    .filter((g) => Object.keys(g.byCountry).length >= (state.compareCompleteOnly ? 3 : 2))
    .sort((a, b) => {
      const am = Math.min(...Object.values(a.byCountry).map((r) => r.priceINR));
      const bm = Math.min(...Object.values(b.byCountry).map((r) => r.priceINR));
      return a.ref.memoryGB - b.ref.memoryGB || a.ref.brandTier - b.ref.brandTier || am - bm;
    });

  $('#compareHead').innerHTML = `<tr>
    <th>${gpu ? 'Board partner' : 'Brand'}</th><th class="col-wide">${gpu ? 'GPU' : 'Kit'}</th>
    ${codes
      .map((c) => {
        const meta = state.countries.find((x) => x.code === c);
        return `<th class="num">${meta.flag} ${escapeHtml(meta.name)}</th>`;
      })
      .join('')}
    <th class="num">Spread</th>
  </tr>`;

  const empty = $('#compareEmpty');
  if (!list.length) {
    $('#compareBody').innerHTML = '';
    empty.classList.remove('hidden');
    empty.textContent = 'No product is currently listed in two or more of the selected markets. Widen the filters or refresh.';
    return;
  }
  empty.classList.add('hidden');

  $('#compareBody').innerHTML = list
    .slice(0, 250)
    .map((g) => {
      const r0 = g.ref;
      const prices = codes.map((c) => (g.byCountry[c] ? g.byCountry[c].priceINR : null)).filter((p) => p != null);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const spread = prices.length > 1 ? ((max - min) / min) * 100 : null;

      const cells = codes
        .map((c) => {
          const r = g.byCountry[c];
          if (!r) return '<td class="num cell-empty">—</td>';
          const best = r.priceINR === min;
          return `<td class="num ${best ? 'cell-best' : ''}">
            <span class="cell-price">${fmtINR(r.priceINR)}</span>
            <span class="cell-sub">${fmtLocal(r.price, r.currency)} · ${escapeHtml(r.sourceName)}</span>
          </td>`;
        })
        .join('');

      const tierCls = r0.brandTier === 1 ? 'brand-t1' : r0.brandTier === 2 ? 'brand-t2' : '';
      const label = gpu
        ? `${r0.modelName} <span class="cell-sub">${r0.vram}GB VRAM${r0.oc ? ' · OC' : ''}</span>`
        : `${escapeHtml(r0.family || '')} <span class="cell-sub">${r0.totalGB}GB${r0.modules > 1 ? ` (${r0.modules}×${r0.moduleGB})` : ''}${r0.speed ? ' · ' + r0.speed : ''}${r0.cas ? ' CL' + r0.cas : ''}${r0.rgb ? ' · RGB' : ''}</span>`;

      return `<tr>
        <td class="brand-cell ${tierCls}">${escapeHtml(r0.brandName)}</td>
        <td>${label}</td>
        ${cells}
        <td class="num">${spread != null ? spread.toFixed(0) + '%' : '—'}</td>
      </tr>`;
    })
    .join('');
}

// ── Charts ─────────────────────────────────────────────────────────────────

function renderCharts() {
  const f = state.filters;
  const saved = f.best;
  f.best = 'all';
  const rows = visibleListings().filter((r) => r.priceINR != null);
  f.best = saved;

  const gpu = isGpu();
  const capSelect = $('#chartCapacity');
  const unit = gpu ? 'GB VRAM' : 'GB kits';

  const sizes = Array.from(new Set(rows.map((r) => r.memoryGB))).sort((a, b) => a - b);
  const sig = state.category + ':' + sizes.join(',');
  if (capSelect.dataset.sig !== sig) {
    capSelect.dataset.sig = sig;
    capSelect.innerHTML = sizes.map((c) => `<option value="${c}">${c} ${unit}</option>`).join('');
    const preferred = gpu ? 32 : 32;
    if (sizes.includes(preferred)) capSelect.value = String(preferred);
  }
  const size = Number(capSelect.value || sizes[0]);

  // 1. Cheapest offer by country for the chosen size.
  const byCountry = new Map();
  for (const r of rows) {
    if (r.memoryGB !== size) continue;
    const cur = byCountry.get(r.country);
    if (!cur || r.priceINR < cur.priceINR) byCountry.set(r.country, r);
  }
  window.Charts.barChart(
    $('#chartCountry'),
    Array.from(byCountry.entries())
      .sort((a, b) => a[1].priceINR - b[1].priceINR)
      .map(([code, r]) => ({
        label: `${(state.countries.find((c) => c.code === code) || {}).flag || ''} ${code}`,
        value: Math.round(r.priceINR),
        sub: gpu ? r.modelName : r.brandName,
        color: COUNTRY_COLORS[code],
        title: `${r.title}\n${r.sourceName} · ${fmtLocal(r.price, r.currency)}`
      })),
    { format: fmtINR, labelWidth: 66, emptyText: `No ${size}${gpu ? 'GB VRAM' : 'GB'} products in the current selection` }
  );

  // 2. Median cost per GB by country — a fair cross-market yardstick.
  const perGB = new Map();
  for (const r of rows) {
    if (!r.pricePerGBINR) continue;
    if (!perGB.has(r.country)) perGB.set(r.country, []);
    perGB.get(r.country).push(r.pricePerGBINR);
  }
  window.Charts.barChart(
    $('#chartPerGB'),
    Array.from(perGB.entries())
      .map(([code, vals]) => ({
        label: `${(state.countries.find((c) => c.code === code) || {}).flag || ''} ${code}`,
        value: Math.round(median(vals)),
        sub: `${vals.length} items`,
        color: COUNTRY_COLORS[code]
      }))
      .sort((a, b) => a.value - b.value),
    { format: fmtINR, labelWidth: 66, emptyText: 'No in-stock listings to compare' }
  );

  // 3. Cheapest ₹/GB per brand (RAM) or per GPU model.
  const byKey = new Map();
  for (const r of rows) {
    if (!r.pricePerGBINR) continue;
    const k = gpu ? r.modelName : r.brandName;
    const cur = byKey.get(k);
    if (!cur || r.pricePerGBINR < cur.pricePerGBINR) byKey.set(k, r);
  }
  window.Charts.barChart(
    $('#chartBrand'),
    Array.from(byKey.entries())
      .sort((a, b) => a[1].pricePerGBINR - b[1].pricePerGBINR)
      .slice(0, 12)
      .map(([label, r]) => ({
        label: label.length > 18 ? label.slice(0, 17) + '…' : label,
        value: Math.round(r.pricePerGBINR),
        sub: `${r.country} · ${r.memoryGB}GB`,
        color: r.brandTier === 1 ? '#ffd479' : r.brandTier === 2 ? '#9fc6ff' : '#6b7688',
        title: `${r.title}\n${r.sourceName} · ${fmtINR(r.priceINR)}`
      })),
    { format: fmtINR, labelWidth: 128, emptyText: 'No in-stock listings to compare' }
  );

  renderHistoryChart(rows);
}

function renderHistoryChart(rows) {
  const mode = $('#chartHistoryMode').value;
  const listingSelect = $('#chartHistoryListing');
  listingSelect.classList.toggle('hidden', mode !== 'listing');

  if (mode === 'listing') {
    const tracked = rows.filter((r) => (state.history[r.id] || []).length >= 2).sort((a, b) => a.priceINR - b.priceINR);

    const sig = state.category + ':' + tracked.length;
    if (listingSelect.dataset.sig !== sig) {
      listingSelect.dataset.sig = sig;
      listingSelect.innerHTML = tracked
        .slice(0, 300)
        .map((r) => `<option value="${r.id}">${escapeHtml(`${r.country} · ${r.brandName} ${r.kitLabel} · ${r.sourceName}`)}</option>`)
        .join('');
    }

    const pick = tracked.find((r) => r.id === listingSelect.value) || tracked[0];
    if (!pick) {
      window.Charts.empty($('#chartHistory'), 'No listing has two or more recorded prices yet');
      $('#historyNote').textContent = 'History builds as the app refreshes — each run appends a point when a price moves.';
      return;
    }
    const points = (state.history[pick.id] || []).map((p) => ({ t: p.t, v: p.r != null ? p.r : p.p }));
    window.Charts.lineChart(
      $('#chartHistory'),
      [{ name: `${pick.brandName} ${pick.kitLabel}`, color: COUNTRY_COLORS[pick.country], points }],
      { format: fmtINR }
    );
    $('#historyNote').textContent = `${pick.title} — ${pick.sourceName} (${pick.countryName}). ${points.length} recorded price points.`;
    return;
  }

  // Market median ₹/GB per country over time.
  const buckets = new Map();
  for (const r of rows) {
    const series = state.history[r.id];
    if (!series || !r.memoryGB) continue;
    for (const p of series) {
      if (p.r == null) continue;
      const hour = Math.floor(p.t / 3600000) * 3600000;
      const key = `${r.country}|${hour}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p.r / r.memoryGB);
    }
  }

  const byCountry = new Map();
  for (const [key, vals] of buckets) {
    const [country, hour] = key.split('|');
    if (!byCountry.has(country)) byCountry.set(country, []);
    byCountry.get(country).push({ t: Number(hour), v: median(vals) });
  }

  const series = Array.from(byCountry.entries()).map(([code, points]) => ({
    name: (state.countries.find((c) => c.code === code) || {}).name || code,
    color: COUNTRY_COLORS[code],
    points: points.sort((a, b) => a.t - b.t)
  }));

  window.Charts.lineChart($('#chartHistory'), series, { format: fmtINR });
  const totalPoints = series.reduce((a, s) => a + s.points.length, 0);
  $('#historyNote').textContent = totalPoints
    ? `Median ₹ per GB across all tracked ${isGpu() ? 'cards' : 'kits'}, by market. ${totalPoints} data points so far — the line lengthens with every refresh.`
    : 'History builds as the app refreshes — each run appends a point when a price moves.';
}

// ── Sources & health ───────────────────────────────────────────────────────

function renderSources() {
  const statuses = (state.snapshot && state.snapshot.sources) || [];
  const list = statuses.length ? statuses : state.sources.map((s) => ({ ...s, ok: null, category: '—' }));

  $('#sourceBody').innerHTML = list
    .map((s) => {
      const flag = (state.countries.find((c) => c.code === s.country) || {}).flag || '';
      const dot = s.ok === null ? '' : `<span class="status-dot ${s.ok ? 'dot-ok' : 'dot-err'}"></span>`;
      const label = s.ok === null ? 'Not run yet' : s.ok ? 'OK' : 'Failed';
      const method = s.viaBrowser || s.kind === 'browser' ? 'Headless Chromium' : `HTTP · ${s.kind}`;
      const cat = (s.category || '').toUpperCase();
      return `<tr>
        <td>${dot}${label}</td>
        <td class="flagcell"><span class="flag">${flag}</span>${escapeHtml(s.country)}</td>
        <td><a href="#" class="prod-link" data-url="${escapeHtml(s.site)}">${escapeHtml(s.name)}</a> <span class="cell-sub">${escapeHtml(cat)}</span></td>
        <td class="method">${escapeHtml(method)}</td>
        <td class="num">${s.rawCount != null ? s.rawCount : '—'}</td>
        <td class="num">${s.count != null ? s.count : '—'}</td>
        <td class="num">${s.ms != null ? (s.ms / 1000).toFixed(1) + 's' : '—'}</td>
        <td>${s.error ? `<span class="err-text">${escapeHtml(s.error)}</span>` : '<span class="cell-empty">—</span>'}</td>
      </tr>`;
    })
    .join('');

  api.stats().then((st) => {
    $('#storeStats').textContent = `Tracking ${st.trackedListings} products · ${st.dataPoints} recorded price points · data file: ${st.file}`;
  });
}

// ── FX strip + status ──────────────────────────────────────────────────────

function renderFx() {
  const fx = state.snapshot && state.snapshot.fx;
  const host = $('#fxStrip');
  if (!fx || fx.error) {
    host.innerHTML = `<span class="fx-meta">${escapeHtml((fx && fx.error) || 'FX rates pending')}</span>`;
    return;
  }
  const order = ['SGD', 'MYR', 'THB', 'VND', 'HKD'];
  host.innerHTML =
    order
      .filter((c) => fx.toINR[c])
      .map((c) => `<span>1 ${c} = <b>₹${fx.toINR[c] >= 1 ? fx.toINR[c].toFixed(2) : fx.toINR[c].toFixed(5)}</b></span>`)
      .join('') + `<span class="fx-meta">via ${escapeHtml(fx.provider)}</span>`;
}

function setStatus(kind, text) {
  const pill = $('#statusPill');
  pill.className = `pill pill-${kind}`;
  pill.textContent = text;
}

// ── Account & paywall (web only) ───────────────────────────────────────────

/** Renders the sign-in / subscription controls. No-op in the desktop app. */
function renderAccount() {
  const host = $('#accountBar');
  if (!host || !state.account) return;
  const a = state.account;

  if (!a.signedIn) {
    host.innerHTML = `<button class="btn btn-primary" id="signInBtn">Sign in with Google</button>`;
    return;
  }


  const days = a.trial ? a.trial.daysLeft : 0;

  const badge =
    a.tier === 'paid'
      ? `<span class="tier-badge tier-paid">${a.admin ? 'Full access' : 'Subscribed'}</span>`
      : a.tier === 'trial'
        ? `<span class="tier-badge tier-trial">Trial · ${days} day${days === 1 ? '' : 's'} left</span>`
        : `<span class="tier-badge tier-free">Free</span>`;

  const action =
    a.tier === 'paid'
      ? a.admin
        ? ''
        : `<button class="link-btn" id="billingBtn">Manage billing</button>`
      : `<button class="btn btn-primary btn-sm" id="upgradeBtn">${
          a.tier === 'trial' ? 'Keep full access' : 'Unlock all'
        } · $${a.priceUSD}/mo</button>`;

  host.innerHTML = `
    <div class="account">
      ${badge}
      <span class="account-email" title="${escapeHtml(a.email)}">${escapeHtml(a.email)}</span>
      ${action}
      <button class="link-btn" id="signOutBtn">Sign out</button>
    </div>`;
}

/** The strip that explains why some rows are locked. */
function renderUpgradeBanner() {
  const host = $('#upgradeBanner');
  if (!host || !state.account) return;

  const a = state.account;
  const max = state.freeMaxGB || 16;

  if (a.tier === 'paid') {
    host.classList.add('hidden');
    return;
  }

  // During the trial nothing is locked, but the clock is worth showing.
  if (a.tier === 'trial') {
    const d = a.trial ? a.trial.daysLeft : 0;
    host.classList.remove('hidden');
    host.classList.add('banner-trial');
    host.innerHTML = `
      <div class="banner-text">
        <strong>Free trial — ${d} day${d === 1 ? '' : 's'} left.</strong>
        You have full access to every market and retailer. After that you keep
        everything up to ${max}GB free.
      </div>
      <button class="btn btn-primary btn-sm" id="bannerUpgrade">Keep full access · $${a.priceUSD}/mo</button>`;
    return;
  }

  host.classList.remove('banner-trial');
  const hidden = (state.snapshot && state.snapshot.lockedCount) || 0;
  if (!hidden) {
    host.classList.add('hidden');
    return;
  }

  host.classList.remove('hidden');
  host.innerHTML = `
    <div class="banner-text">
      <strong>${hidden} listings above ${max}GB are locked.</strong>
      You can see how cheap they get — but not which of the ${state.countries.length} markets has them.
      ${a.signedIn ? '' : `Sign in for a free ${a.trialDays || 7}-day trial with full access.`}
    </div>
    ${
      a.signedIn
        ? `<button class="btn btn-primary btn-sm" id="bannerUpgrade">Unlock all · $${a.priceUSD}/mo</button>`
        : `<button class="btn btn-primary btn-sm" id="bannerSignIn">Start free ${a.trialDays || 7}-day trial</button>`
    }`;
}

function renderAll() {
  renderAccount();
  renderUpgradeBanner();
  renderFx();
  $('#lastUpdated').textContent = state.snapshot ? `updated ${fmtAgo(state.snapshot.fetchedAt)}` : '';
  if (state.tab === 'table') renderTable();
  if (state.tab === 'compare') renderCompare();
  if (state.tab === 'charts') renderCharts();
  if (state.tab === 'sources') renderSources();
}

// ── Filter UI ──────────────────────────────────────────────────────────────

function buildChips() {
  $('#countryChips').innerHTML = state.countries
    .map((c) => `<button class="chip" data-kind="country" data-value="${c.code}">${c.flag} ${escapeHtml(c.name)}</button>`)
    .join('');
  syncCategoryChips();
}

/** Size, brand and model chips all depend on the selected product category. */
function syncCategoryChips() {
  const gpu = isGpu();
  const sizes = gpu ? state.gpuVram : state.ramCapacities;
  const brands = gpu ? state.gpuBrands : state.brands;

  $('#memoryLabel').textContent = gpu ? 'VRAM' : 'Kit size';
  $('#capacityChips').innerHTML = sizes
    .map((c) => `<button class="chip" data-kind="memory" data-value="${c}">${c} GB</button>`)
    .join('');

  $('#brandChips').innerHTML = brands
    .map((b) => `<button class="chip ${b.tier === 1 ? 'tier1' : ''}" data-kind="brand" data-value="${b.id}">${escapeHtml(b.name)}</button>`)
    .join('');

  if (gpu) {
    const vendors = VENDOR_ORDER.filter((v) => state.gpuModels.some((m) => m.vendor === v));
    $('#vendorChips').innerHTML = vendors
      .map((v) => `<button class="chip vendor-chip vendor-${v.toLowerCase()}" data-kind="vendor" data-value="${v}">${escapeHtml(v)}</button>`)
      .join('');

    // The model chip should never suggest a card the current vendor filter hides.
    const models = state.filters.vendors.size ? state.gpuModels.filter((m) => state.filters.vendors.has(m.vendor)) : state.gpuModels;
    $('#modelChips').innerHTML = models
      .map((m) => `<button class="chip ${m.tier === 1 ? 'tier1' : ''}" data-kind="model" data-value="${m.id}" title="${escapeHtml(m.name)} · ${m.vram}GB">${escapeHtml(m.name.replace(/^GeForce |^Radeon /, ''))}</button>`)
      .join('');
  }

  $$('.gpu-only').forEach((el) => el.classList.toggle('hidden', !gpu));
  $$('.ram-only').forEach((el) => el.classList.toggle('hidden', gpu));
  $('#searchInput').placeholder = gpu ? 'e.g. ROG Astral 5090' : 'e.g. Vengeance 6000 CL30';
  $('#thMemory').textContent = gpu ? 'VRAM' : 'Kit';
  $('#compareBlurb').textContent = gpu
    ? "Best available price per country for the same card, converted to INR at today's rate. Green marks the cheapest market."
    : "Best available price per country for the same kit, converted to INR at today's rate. Green marks the cheapest market.";

  syncChips();
}

function setFor(kind) {
  if (kind === 'country') return state.filters.countries;
  if (kind === 'memory') return state.filters.memory;
  if (kind === 'model') return state.filters.models;
  if (kind === 'vendor') return state.filters.vendors;
  return state.filters.brands;
}

function syncChips() {
  $$('.chip').forEach((chip) => {
    const { kind, value } = chip.dataset;
    const v = kind === 'memory' ? Number(value) : value;
    chip.classList.toggle('on', setFor(kind).has(v));
  });
  updateDropdownLabels();
}

/** Dropdown buttons show what's selected instead of forcing the panel open. */
function updateDropdownLabels() {
  const brandBtn = $('#brandDropdownBtn');
  if (brandBtn) {
    const list = isGpu() ? state.gpuBrands : state.brands;
    const n = state.filters.brands.size;
    const one = n === 1 ? list.find((b) => state.filters.brands.has(b.id)) : null;
    brandBtn.textContent = n === 0 ? 'All brands' : one ? one.name : `${n} brands selected`;
    brandBtn.classList.toggle('has-selection', n > 0);
  }
  const modelBtn = $('#modelDropdownBtn');
  if (modelBtn) {
    const n = state.filters.models.size;
    const one = n === 1 ? state.gpuModels.find((m) => state.filters.models.has(m.id)) : null;
    modelBtn.textContent = n === 0 ? 'All models' : one ? one.name : `${n} models selected`;
    modelBtn.classList.toggle('has-selection', n > 0);
  }
}

function closeDropdowns(except) {
  $$('.dropdown-panel').forEach((p) => {
    if (p !== except) p.classList.add('hidden');
  });
}

function toggleChip(kind, rawValue) {
  const set = setFor(kind);
  const value = kind === 'memory' ? Number(rawValue) : rawValue;
  set.has(value) ? set.delete(value) : set.add(value);

  if (kind === 'vendor') {
    // Drop model selections the new vendor filter would hide, then rebuild the model chip list.
    if (state.filters.vendors.size) {
      for (const id of state.filters.models) {
        const m = state.gpuModels.find((x) => x.id === id);
        if (m && !state.filters.vendors.has(m.vendor)) state.filters.models.delete(id);
      }
    }
    syncCategoryChips();
    return renderAll();
  }

  syncChips();
  renderAll();
}

function applyDefaults() {
  const s = state.settings;
  state.filters.countries = new Set(s.countries || state.countries.filter((c) => c.defaultSelected).map((c) => c.code));
  // `?? []` rather than `|| [...]`: an explicitly empty list means "no size
  // filter" and must survive, or saved settings get silently overridden.
  state.filters.memory = new Set(isGpu() ? s.gpuVram ?? [] : s.ramCapacities ?? []);
  state.filters.brands = new Set();
  state.filters.models = new Set();
  state.filters.vendors = new Set();
  state.filters.form = 'DIMM';
  state.filters.best = 'all';
  state.filters.search = '';
  $('#formSelect').value = 'DIMM';
  $('#bestSelect').value = 'all';
  $('#searchInput').value = '';
  syncChips();
}

/** An anonymous visitor must sign in before there is an account to bill. */
async function startCheckout() {
  if (!state.account) return;
  if (!state.account.signedIn) return api.signIn();
  try {
    await api.subscribe();
  } catch (err) {
    setStatus('error', `Could not start checkout: ${err.message}`);
  }
}

async function openBilling() {
  try {
    await api.manageBilling();
  } catch (err) {
    setStatus('error', `Could not open billing: ${err.message}`);
  }
}

/** Never hardcode the market count in copy — it goes stale the moment a market is added or dropped. */
function updateBrandBlurb() {
  const n = state.countries.length;
  const kind = isGpu() ? 'graphics-card' : 'DDR5 memory';
  $('.brand-text p').textContent = `Live ${kind} prices across ${n} market${n === 1 ? '' : 's'} worldwide`;
}

function switchCategory(cat) {
  if (state.category === cat) return;
  state.category = cat;
  closeDropdowns();
  $$('.seg').forEach((b) => b.classList.toggle('seg-on', b.dataset.cat === cat));
  updateBrandBlurb();
  syncCategoryChips();
  applyDefaults();
  syncCategoryChips();
  renderAll();
}

// ── Wiring ─────────────────────────────────────────────────────────────────

function wire() {
  document.addEventListener('click', (e) => {
    const dropdown = e.target.closest('.dropdown');
    const dropdownBtn = e.target.closest('.dropdown-btn');
    if (dropdownBtn) {
      const panel = dropdown.querySelector('.dropdown-panel');
      const wasHidden = panel.classList.contains('hidden');
      closeDropdowns();
      panel.classList.toggle('hidden', !wasHidden);
      return;
    }
    if (!dropdown) closeDropdowns();

    // Account controls exist only on the web build.
    if (e.target.closest('#signInBtn, #bannerSignIn')) return api.signIn();
    if (e.target.closest('#signOutBtn')) return api.signOut();
    if (e.target.closest('#upgradeBtn, #bannerUpgrade, .unlock-btn')) return startCheckout();
    if (e.target.closest('#billingBtn')) return openBilling();

    const seg = e.target.closest('.seg');
    if (seg) return switchCategory(seg.dataset.cat);

    const chip = e.target.closest('.chip');
    if (chip) return toggleChip(chip.dataset.kind, chip.dataset.value);

    const link = e.target.closest('.prod-link');
    if (link) {
      e.preventDefault();
      api.open(link.dataset.url);
      return;
    }

    const tab = e.target.closest('.tab');
    if (tab) {
      state.tab = tab.dataset.tab;
      $$('.tab').forEach((t) => t.classList.toggle('tab-active', t === tab));
      $$('.view').forEach((v) => v.classList.toggle('view-active', v.id === `view-${state.tab}`));
      renderAll();
      return;
    }

    const th = e.target.closest('th.sortable');
    if (th) {
      const key = th.dataset.sort;
      state.sort = state.sort.key === key ? { key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' };
      $$('#priceTable th').forEach((h) => h.classList.remove('sorted-asc', 'sorted-desc'));
      th.classList.add(state.sort.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      renderTable();
    }
  });

  // The static web build has no refresh button — refreshing there is a scheduled job's job.
  const refreshBtn = $('#refreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', () => api.refresh());
  $('#resetBtn').addEventListener('click', () => {
    applyDefaults();
    renderAll();
  });
  $('#formSelect').addEventListener('change', (e) => {
    state.filters.form = e.target.value;
    renderAll();
  });
  $('#bestSelect').addEventListener('change', (e) => {
    state.filters.best = e.target.value;
    renderAll();
  });

  let searchTimer;
  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const v = e.target.value;
    searchTimer = setTimeout(() => {
      state.filters.search = v;
      renderAll();
    }, 180);
  });

  $('#compareCompleteOnly').addEventListener('change', (e) => {
    state.compareCompleteOnly = e.target.checked;
    renderCompare();
  });
  $('#chartCapacity').addEventListener('change', renderCharts);
  $('#chartHistoryMode').addEventListener('change', renderCharts);
  $('#chartHistoryListing').addEventListener('change', renderCharts);

  $('#intervalSelect').addEventListener('change', (e) => {
    api.saveSettings({ autoRefreshMinutes: Number(e.target.value) }).then((s) => {
      state.settings = s;
    });
  });
  $('#launchRefresh').addEventListener('change', (e) => {
    api.saveSettings({ refreshOnLaunch: e.target.checked }).then((s) => {
      state.settings = s;
    });
  });
  $('#revealBtn').addEventListener('click', () => api.revealDataFile());

  window.addEventListener('resize', () => {
    if (state.tab === 'charts') renderCharts();
  });

  api.onSnapshot((snap) => {
    state.snapshot = snap;
    state.history = snap.history || {};
    renderAll();
    const inStock = snap.listings.filter((l) => l.inStock);
    const ram = inStock.filter((l) => l.category === 'ram').length;
    setStatus('live', `Live · ${ram} memory · ${inStock.length - ram} GPU in stock`);
  });

  api.onRefreshState((s) => {
    // Absent on the web build, which cannot scrape and so never refreshes.
    if (refreshBtn) {
      refreshBtn.classList.toggle('busy', s.running);
      refreshBtn.disabled = s.running;
    }
    if (s.running) {
      setStatus('busy', 'Fetching live prices…');
    } else if (s.ok === false) {
      setStatus('error', `Refresh failed: ${s.error || 'unknown error'}`);
      $('.progress-fill').style.width = '0';
    } else {
      $('.progress-fill').style.width = '0';
    }
  });

  api.onProgress((p) => {
    if (!p.total) return;
    $('.progress-fill').style.width = `${Math.round((p.done / p.total) * 100)}%`;
    if (p.name) setStatus('busy', `Fetching… ${p.done}/${p.total} · ${p.name}`);
  });
}

async function init() {
  const boot = await api.bootstrap();
  state.settings = boot.settings;
  state.countries = boot.countries;
  state.brands = boot.brands;
  state.gpuBrands = boot.gpuBrands || [];
  state.gpuModels = boot.gpuModels || [];
  state.ramCapacities = boot.ramCapacities || [16, 24, 32, 48, 64, 96, 128];
  state.gpuVram = boot.gpuVram || [8, 12, 16, 24, 32];
  state.sources = boot.sources;
  state.account = boot.account || null;
  state.freeMaxGB = boot.freeMaxGB || null;

  updateBrandBlurb();
  buildChips();
  applyDefaults();
  syncCategoryChips();
  wire();

  $('#intervalSelect').value = String(boot.settings.autoRefreshMinutes || 0);
  $('#launchRefresh').checked = boot.settings.refreshOnLaunch !== false;

  if (boot.snapshot) {
    state.snapshot = boot.snapshot;
    state.history = boot.snapshot.history || {};
    setStatus('live', `Cached · ${boot.snapshot.listings.length} listings from ${fmtAgo(boot.snapshot.fetchedAt)}`);
  } else {
    setStatus('idle', 'No data yet');
  }

  renderAll();
  setInterval(() => {
    if (state.snapshot) $('#lastUpdated').textContent = `updated ${fmtAgo(state.snapshot.fetchedAt)}`;
  }, 30000);

  api.ready();
}

init();
