const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  dbQuery: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
  saveFile: (fileName, arrayBuffer) => ipcRenderer.invoke('file:save', { fileName, arrayBuffer }),
});
