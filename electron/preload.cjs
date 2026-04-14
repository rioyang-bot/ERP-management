const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // We will add DB connection and query methods here later
  ping: () => ipcRenderer.invoke('ping'),
});
