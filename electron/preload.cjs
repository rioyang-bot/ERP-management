const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  dbQuery: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
  namedQuery: (queryName, params) => ipcRenderer.invoke('db:namedQuery', queryName, params),
  authLogin: (username) => ipcRenderer.invoke('auth:login', username),
  getDashboardStats: () => ipcRenderer.invoke('dashboard:stats'),
  saveFile: (fileName, arrayBuffer) => ipcRenderer.invoke('file:save', { fileName, arrayBuffer }),
});
