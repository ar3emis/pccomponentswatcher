'use strict';

/**
 * Minimal SVG chart toolkit.
 * Hand-rolled so the packaged app ships with zero external chart libraries
 * and renders identically offline.
 */
(function (global) {
  const NS = 'http://www.w3.org/2000/svg';

  const PALETTE = ['#4d9dff', '#35d07f', '#f0b429', '#c084fc', '#ff8a65', '#4dd0e1', '#f06292', '#a3e635'];

  function el(name, attrs, text) {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v !== null && v !== undefined) node.setAttribute(k, String(v));
    }
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function surface(host) {
    host.innerHTML = '';
    const rect = host.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width) || 640);
    const h = Math.max(160, Math.round(rect.height) || 240);
    const svg = el('svg', { width: '100%', height: '100%', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' });
    host.appendChild(svg);
    return { svg, w, h };
  }

  function empty(host, message) {
    const { svg, w, h } = surface(host);
    svg.appendChild(el('text', { x: w / 2, y: h / 2, 'text-anchor': 'middle', class: 'chart-empty' }, message));
  }

  /** "₹12,340" / "₹1.2L" style compaction for axis labels. */
  function compact(v) {
    const n = Math.abs(v);
    if (n >= 1e7) return (v / 1e7).toFixed(1) + 'Cr';
    if (n >= 1e5) return (v / 1e5).toFixed(1) + 'L';
    if (n >= 1e3) return (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'k';
    return String(Math.round(v));
  }

  function niceCeil(v) {
    if (v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const norm = v / mag;
    const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return step * mag;
  }

  /**
   * Horizontal bar chart.
   * data: [{ label, value, sub, color }]
   */
  function barChart(host, data, opts = {}) {
    if (!data || !data.length) return empty(host, opts.emptyText || 'No data for this selection');

    const { svg, w, h } = surface(host);
    const padL = opts.labelWidth || 108;
    const padR = 74;
    const padT = 8;
    const padB = 22;
    const rows = data.length;
    const band = (h - padT - padB) / rows;
    const barH = Math.min(26, Math.max(9, band - 8));
    const max = niceCeil(Math.max(...data.map((d) => d.value)));
    const plotW = w - padL - padR;

    for (let i = 0; i <= 4; i++) {
      const x = padL + (plotW * i) / 4;
      svg.appendChild(el('line', { x1: x, y1: padT, x2: x, y2: h - padB, class: 'grid-line' }));
      svg.appendChild(
        el('text', { x, y: h - padB + 14, 'text-anchor': 'middle', class: 'axis-text' }, compact((max * i) / 4))
      );
    }

    data.forEach((d, i) => {
      const y = padT + i * band + (band - barH) / 2;
      const bw = Math.max(2, (d.value / max) * plotW);
      const color = d.color || PALETTE[i % PALETTE.length];

      svg.appendChild(el('text', { x: padL - 10, y: y + barH / 2 + 4, 'text-anchor': 'end', class: 'axis-text' }, d.label));
      const bar = el('rect', { x: padL, y, width: bw, height: barH, rx: 3, fill: color, opacity: 0.85 });
      if (d.title) bar.appendChild(el('title', {}, d.title));
      svg.appendChild(bar);
      svg.appendChild(
        el('text', { x: padL + bw + 8, y: y + barH / 2 + 4, class: 'bar-label' }, opts.format ? opts.format(d.value) : compact(d.value))
      );
      if (d.sub) {
        svg.appendChild(
          el('text', { x: padL - 10, y: y + barH / 2 + 15, 'text-anchor': 'end', class: 'axis-text', opacity: 0.7 }, d.sub)
        );
      }
    });

    svg.appendChild(el('line', { x1: padL, y1: padT, x2: padL, y2: h - padB, class: 'axis-line' }));
  }

  /**
   * Multi-series time chart.
   * series: [{ name, color, points: [{ t, v }] }]
   */
  function lineChart(host, series, opts = {}) {
    const live = (series || []).filter((s) => s.points && s.points.length);
    if (!live.length) return empty(host, opts.emptyText || 'No history recorded yet');

    const { svg, w, h } = surface(host);
    const padL = 58;
    const padR = 16;
    const padT = 12;
    const padB = 30;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const allT = live.flatMap((s) => s.points.map((p) => p.t));
    const allV = live.flatMap((s) => s.points.map((p) => p.v));
    let tMin = Math.min(...allT);
    let tMax = Math.max(...allT);
    if (tMax - tMin < 60000) {
      // A single capture: give it a visible span instead of a zero-width axis.
      tMin -= 1800000;
      tMax += 1800000;
    }
    const vMax = niceCeil(Math.max(...allV) * 1.05);
    const vMin = 0;

    const x = (t) => padL + ((t - tMin) / (tMax - tMin)) * plotW;
    const y = (v) => padT + plotH - ((v - vMin) / (vMax - vMin || 1)) * plotH;

    for (let i = 0; i <= 4; i++) {
      const gy = padT + (plotH * i) / 4;
      svg.appendChild(el('line', { x1: padL, y1: gy, x2: w - padR, y2: gy, class: 'grid-line' }));
      svg.appendChild(
        el('text', { x: padL - 8, y: gy + 4, 'text-anchor': 'end', class: 'axis-text' }, compact(vMax - (vMax * i) / 4))
      );
    }

    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const t = tMin + ((tMax - tMin) * i) / ticks;
      svg.appendChild(
        el(
          'text',
          { x: x(t), y: h - padB + 16, 'text-anchor': 'middle', class: 'axis-text' },
          new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        )
      );
    }

    live.forEach((s, i) => {
      const color = s.color || PALETTE[i % PALETTE.length];
      const pts = [...s.points].sort((a, b) => a.t - b.t);
      const d = pts.map((p, j) => `${j ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
      svg.appendChild(el('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
      pts.forEach((p) => {
        const dot = el('circle', { cx: x(p.t), cy: y(p.v), r: 2.6, fill: color });
        dot.appendChild(el('title', {}, `${s.name} · ${new Date(p.t).toLocaleString()} · ${opts.format ? opts.format(p.v) : compact(p.v)}`));
        svg.appendChild(dot);
      });
    });

    svg.appendChild(el('line', { x1: padL, y1: h - padB, x2: w - padR, y2: h - padB, class: 'axis-line' }));
    svg.appendChild(el('line', { x1: padL, y1: padT, x2: padL, y2: h - padB, class: 'axis-line' }));

    if (opts.legendHost) {
      opts.legendHost.innerHTML = live
        .map((s, i) => `<span><i style="background:${s.color || PALETTE[i % PALETTE.length]}"></i>${escapeHtml(s.name)}</span>`)
        .join('');
    }
  }

  /** Tiny inline trend line for a table cell. */
  function sparkline(points, width = 92, height = 22) {
    if (!points || points.length < 2) return '<span class="cell-empty">—</span>';
    const vs = points.map((p) => p.v);
    const min = Math.min(...vs);
    const max = Math.max(...vs);
    const span = max - min || 1;
    const stepX = width / (points.length - 1);
    const d = points
      .map((p, i) => `${i ? 'L' : 'M'}${(i * stepX).toFixed(1)},${(height - 3 - ((p.v - min) / span) * (height - 6)).toFixed(1)}`)
      .join(' ');
    const rising = vs[vs.length - 1] > vs[0];
    const flat = vs[vs.length - 1] === vs[0];
    const color = flat ? '#6b7688' : rising ? '#ff6b6b' : '#35d07f';
    return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" />
    </svg>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  global.Charts = { barChart, lineChart, sparkline, PALETTE, compact, empty };
})(window);
