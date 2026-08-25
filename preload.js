'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ramwatch', {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  ready: () => ipcRenderer.invoke('app:ready'),
  refresh: () => ipcRenderer.invoke('app:refresh'),
  saveSettings: (patch) => ipcRenderer.invoke('app:settings', patch),
  history: (keys) => ipcRenderer.invoke('app:history', keys),
  stats: () => ipcRenderer.invoke('app:stats'),
  open: (url) => ipcRenderer.invoke('app:open', url),
  revealDataFile: () => ipcRenderer.invoke('app:reveal'),

  onSnapshot: (fn) => ipcRenderer.on('data:snapshot', (_e, p) => fn(p)),
  onRefreshState: (fn) => ipcRenderer.on('refresh:state', (_e, p) => fn(p)),
  onProgress: (fn) => ipcRenderer.on('refresh:progress', (_e, p) => fn(p))
});
