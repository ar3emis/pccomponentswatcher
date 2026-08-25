'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Flat-file persistence: current snapshot + per-listing price history.
 * Deliberately dependency-free (no native sqlite) so the packaged app
 * installs cleanly on any Windows machine.
 */
class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'ramwatch-data.json');
    this.tmp = this.file + '.tmp';
    this.data = { version: 1, latest: null, history: {}, meta: {}, settings: {} };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.file)) {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (parsed && typeof parsed === 'object') this.data = { ...this.data, ...parsed };
      }
    } catch (err) {
      // Corrupt file: keep it aside rather than silently losing history.
      try {
        fs.renameSync(this.file, this.file + '.corrupt-' + Date.now());
      } catch (_) {}
    }
    if (!this.data.history) this.data.history = {};
    if (!this.data.settings) this.data.settings = {};
  }

  save() {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.tmp, JSON.stringify(this.data));
    fs.renameSync(this.tmp, this.file);
  }

  getSettings() {
    return this.data.settings || {};
  }

  setSettings(patch) {
    this.data.settings = { ...this.data.settings, ...patch };
    this.save();
  }

  getLatest() {
    return this.data.latest;
  }

  /**
   * Record a refresh. History points are appended only when the local price
   * changed or the last point is older than 6h, keeping the file small while
   * still drawing an honest trend line.
   */
  recordSnapshot(snapshot) {
    const ts = snapshot.fetchedAt;
    const SIX_HOURS = 6 * 3600 * 1000;

    for (const l of snapshot.listings) {
      const key = l.id;
      let series = this.data.history[key];
      if (!series) series = this.data.history[key] = [];
      const last = series[series.length - 1];
      const changed = !last || last.p !== l.price || last.s !== (l.inStock ? 1 : 0);
      const stale = last && ts - last.t > SIX_HOURS;
      if (changed || stale) {
        series.push({ t: ts, p: l.price, r: round(l.priceINR), s: l.inStock ? 1 : 0 });
        if (series.length > 900) series.splice(0, series.length - 900);
      }
    }

    this.data.latest = snapshot;
    this.data.meta.lastRefresh = ts;
    this.pruneHistory();
    this.save();
  }

  /** Drop series that have not been seen for 120 days. */
  pruneHistory() {
    const cutoff = Date.now() - 120 * 24 * 3600 * 1000;
    for (const [k, series] of Object.entries(this.data.history)) {
      if (!series.length || series[series.length - 1].t < cutoff) delete this.data.history[k];
    }
  }

  getHistory(keys) {
    const out = {};
    for (const k of keys) if (this.data.history[k]) out[k] = this.data.history[k];
    return out;
  }

  getAllHistory() {
    return this.data.history;
  }

  stats() {
    const series = Object.values(this.data.history);
    return {
      trackedListings: series.length,
      dataPoints: series.reduce((a, s) => a + s.length, 0),
      lastRefresh: this.data.meta.lastRefresh || null,
      file: this.file
    };
  }
}

function round(n) {
  return typeof n === 'number' ? Math.round(n * 100) / 100 : n;
}

module.exports = { Store };
