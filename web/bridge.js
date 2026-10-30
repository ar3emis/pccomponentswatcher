'use strict';

/**
 * Web shim for the dashboard.
 *
 * `renderer/app.js` is shared verbatim between the desktop app and this site.
 * On the desktop it talks to the main process over IPC through the preload's
 * `window.ramwatch`; here the same surface is served from a static JSON file
 * that a scheduled job regenerates. Nothing in the UI knows the difference.
 *
 * There are no accounts and nothing is withheld: every visitor gets the whole
 * dataset from the same file.
 */
(function () {
  const DATA_URL = 'data.json';

  let payload = null;

  const load = (async () => {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`could not load prices (HTTP ${res.status})`);
    payload = await res.json();
    return payload;
  })();

  const noop = () => {};

  window.ramwatch = {
    async bootstrap() {
      await load;
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

    // Retailers block cross-origin requests, so a browser cannot scrape them.
    // Refreshing is the scheduled job's responsibility.
    refresh: async () => false,

    // Filter choices are per-visitor and last for the session only.
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
      file: 'prices refresh automatically every 6 hours'
    };
  }
})();
