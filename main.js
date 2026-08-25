'use strict';

const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');

const { Store } = require('./src/core/store');
const { refreshAll } = require('./src/core/refresh');
const { SOURCES, COUNTRIES, CATEGORIES } = require('./src/core/sources');
const { BRANDS } = require('./src/core/brands');
const { GPU_MODELS, AIB_BRANDS } = require('./src/core/gpu');
const { RAM_CAPACITIES, GPU_VRAM } = require('./src/core/normalize');

/**
 * Empty size lists mean "no size filter", which is what a first run should do.
 *
 * These used to default to [16, 32] / [16, 32, 48, 64], which silently hid
 * every tracked product of any other capacity — a 96GB RTX PRO 6000 or a 24GB
 * kit was filtered out before the user ever saw it, and looked like a scraping
 * failure rather than a filter.
 */
const DEFAULT_SETTINGS = {
  autoRefreshMinutes: 30,
  refreshOnLaunch: true,
  countries: COUNTRIES.map((c) => c.code),
  ramCapacities: [],
  gpuVram: []
};

let mainWindow = null;
let store = null;
let refreshTimer = null;
let refreshInFlight = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#0d1117',
    show: false,
    title: 'PCComponentsWatcher',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Product links belong in the user's real browser, not in the dashboard.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

/** One refresh at a time; concurrent callers join the in-flight run. */
function runRefresh(reason) {
  if (refreshInFlight) return refreshInFlight;

  send('refresh:state', { running: true, reason });

  refreshInFlight = refreshAll({
    deps: { BrowserWindow },
    onProgress: (p) => send('refresh:progress', p)
  })
    .then((snapshot) => {
      store.recordSnapshot(snapshot);
      send('refresh:state', { running: false, reason, ok: true });
      send('data:snapshot', withHistory(snapshot));
      return snapshot;
    })
    .catch((err) => {
      send('refresh:state', { running: false, reason, ok: false, error: String(err && err.message) });
      return null;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

/** Attaches the recorded price series for whatever the snapshot contains. */
function withHistory(snapshot) {
  if (!snapshot) return null;
  const keys = snapshot.listings.map((l) => l.id);
  return { ...snapshot, history: store.getHistory(keys) };
}

function scheduleAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  const minutes = Number(store.getSettings().autoRefreshMinutes || 0);
  if (!minutes) return;
  refreshTimer = setInterval(() => runRefresh('scheduled'), Math.max(5, minutes) * 60 * 1000);
}

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  if (!Object.keys(store.getSettings()).length) store.setSettings(DEFAULT_SETTINGS);

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'PCComponentsWatcher',
        submenu: [
          { label: 'Refresh prices', accelerator: 'CmdOrCtrl+R', click: () => runRefresh('menu') },
          { type: 'separator' },
          { role: 'toggleDevTools' },
          { role: 'reload', visible: false },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] }
    ])
  );

  createWindow();
  scheduleAutoRefresh();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC ────────────────────────────────────────────────────────────────────

ipcMain.handle('app:bootstrap', () => {
  const settings = { ...DEFAULT_SETTINGS, ...store.getSettings() };
  const latest = store.getLatest();
  return {
    settings,
    countries: COUNTRIES,
    categories: CATEGORIES,
    brands: BRANDS.map(({ id, name, tier }) => ({ id, name, tier })),
    gpuBrands: AIB_BRANDS.map(({ id, name }) => ({ id, name, tier: 2 })),
    gpuModels: GPU_MODELS.map(({ id, name, vendor, vram, tier }) => ({ id, name, vendor, vram, tier })),
    ramCapacities: RAM_CAPACITIES,
    gpuVram: GPU_VRAM,
    sources: SOURCES.map(({ id, name, country, site, kind }) => ({ id, name, country, site, kind })),
    stats: store.stats(),
    snapshot: latest ? withHistory(latest) : null,
    refreshing: !!refreshInFlight,
    appVersion: app.getVersion()
  };
});

ipcMain.handle('app:refresh', () => {
  runRefresh('manual');
  return true;
});

ipcMain.handle('app:settings', (_e, patch) => {
  store.setSettings(patch || {});
  scheduleAutoRefresh();
  return { ...DEFAULT_SETTINGS, ...store.getSettings() };
});

ipcMain.handle('app:history', (_e, keys) => store.getHistory(Array.isArray(keys) ? keys : []));

ipcMain.handle('app:stats', () => store.stats());

ipcMain.handle('app:open', (_e, url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  return true;
});

ipcMain.handle('app:reveal', () => {
  shell.showItemInFolder(store.stats().file);
  return true;
});

// Kick off the first refresh once the window is listening.
ipcMain.handle('app:ready', () => {
  const settings = { ...DEFAULT_SETTINGS, ...store.getSettings() };
  if (settings.refreshOnLaunch) setTimeout(() => runRefresh('launch'), 400);
  return true;
});
