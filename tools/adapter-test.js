'use strict';

/**
 * Dev harness: runs the real browser adapter inside Electron so its behaviour
 * can be reproduced exactly as the app sees it.
 *
 * Usage: electron tools/adapter-test.js <sourceId> <category>
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const { jobsFor } = require('../src/core/sources');
const { fetchBrowser } = require('../src/core/adapters/browser');

const OUT = process.env.PROBE_OUT || path.join(__dirname, '..', '.probe', 'adapter.json');
const wantId = process.argv[2];
const wantCat = process.argv[3] || 'ram';

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const job = jobsFor([wantCat]).find((j) => j.id === wantId);
  const report = (o) => {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(o, null, 2));
  };

  if (!job) {
    report({ error: `no job for ${wantId}:${wantCat}` });
    return app.quit();
  }

  try {
    const items = await fetchBrowser(job, { BrowserWindow });
    report({
      ok: true,
      count: items.length,
      paths: job.paths,
      selectors: job.selectors,
      sample: items.slice(0, 8)
    });
  } catch (err) {
    report({ error: String((err && err.message) || err), paths: job.paths, selectors: job.selectors });
  }
  app.quit();
});
