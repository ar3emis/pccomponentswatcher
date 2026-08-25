'use strict';

/**
 * Static-site shim for the dashboard.
 *
 * `renderer/app.js` is shared verbatim between the desktop app and this site.
 * On the desktop it talks to the main process over IPC through the preload's
 * `window.ramwatch`; here the same surface is served from a JSON file that a
 * scheduled job regenerates. Nothing in the UI needs to know the difference.
 */
(function () {
  const DATA_URL = 'data.json?v=' + Date.now();

  let payload = null;
  const load = fetch(DATA_URL).then((r) => {
    if (!r.ok) throw new Error(`could not load data.json (HTTP ${r.status})`);
    return r.json();
  });

  const noop = () => {};

  window.ramwatch = {
    async bootstrap() {
      payload = await load;
      return {
        settings: payload.settings,
        countries: payload.countries,
        categories: payload.categories,
        brands: payload.brands,
        gpuBrands: payload.gpuBrands,
        gpuModels: payload.gpuModels,
        ramCapacities: payload.ramCapacities,
        gpuVram: payload.gpuVram,
        sources: payload.sources,
        snapshot: payload.snapshot,
        stats: stats(),
        refreshing: false,
        appVersion: 'web'
      };
    },

    ready: async () => true,

    // The site cannot scrape from the browser: retailers block cross-origin
    // requests. Refreshing is the scheduled job's responsibility.
    refresh: async () => false,

    // Filter choices are per-visitor and per-session only.
    saveSettings: async (patch) => ({ ...payload.settings, ...patch }),

    async history(keys) {
      const all = (payload && payload.snapshot.history) || {};
      const out = {};
      for (const k of keys || []) if (all[k]) out[k] = all[k];
      return out;
    },

    stats: async () => stats(),
    open: async (url) => {
      if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    },
    revealDataFile: async () => {
      window.open(DATA_URL, '_blank', 'noopener,noreferrer');
      return true;
    },

    onSnapshot: noop,
    onRefreshState: noop,
    onProgress: noop
  };

  function stats() {
    const h = (payload && payload.snapshot.history) || {};
    const series = Object.values(h);
    return {
      trackedListings: series.length,
      dataPoints: series.reduce((a, s) => a + s.length, 0),
      lastRefresh: payload ? payload.generatedAt : null,
      file: 'data.json — regenerated automatically every 6 hours'
    };
  }
})();
