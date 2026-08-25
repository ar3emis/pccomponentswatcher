'use strict';

/**
 * Web shim for the dashboard.
 *
 * `renderer/app.js` is shared verbatim between the desktop app and this site.
 * On the desktop it talks to the main process over IPC through the preload's
 * `window.ramwatch`; here the same surface is backed by the Worker's API.
 *
 * The payload returned by /api/data depends on who is asking. A free visitor
 * receives a blob that never contained the locked prices, so nothing here needs
 * to hide anything — `lockedListings` is simply what the server chose to send.
 */
(function () {
  let payload = null;
  let account = { signedIn: false, tier: 'anon', email: null, priceUSD: 5 };

  const noop = () => {};

  async function getJSON(url, opts) {
    const res = await fetch(url, { credentials: 'same-origin', ...opts });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        detail = (await res.json()).error || detail;
      } catch (_) {}
      throw new Error(detail);
    }
    return res.json();
  }

  const load = (async () => {
    // Identity first: it decides which payload the data call returns.
    try {
      account = await getJSON('/api/me');
    } catch (_) {
      /* Signed out is a normal state, not an error. */
    }
    payload = await getJSON('/api/data');
    return payload;
  })();

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
        appVersion: 'web',
        account,
        freeMaxGB: payload.freeMaxGB
      };
    },

    ready: async () => true,

    // Retailers block cross-origin requests, so the browser cannot scrape.
    // Refreshing is the scheduled job's responsibility.
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
      window.open('/api/data', '_blank', 'noopener,noreferrer');
      return true;
    },

    // ── Account ────────────────────────────────────────────────────────────
    account: () => account,

    signIn() {
      const returnTo = encodeURIComponent(location.pathname + location.search);
      location.href = `/auth/google?returnTo=${returnTo}`;
    },

    signOut() {
      location.href = '/auth/logout';
    },

    /** Sends the visitor to Stripe Checkout. */
    async subscribe() {
      const { url } = await getJSON('/api/checkout', { method: 'POST' });
      location.href = url;
    },

    /** Stripe-hosted page for changing card details or cancelling. */
    async manageBilling() {
      const { url } = await getJSON('/api/portal', { method: 'POST' });
      location.href = url;
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
