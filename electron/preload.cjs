const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  dbQuery: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
  namedQuery: (queryName, params) => ipcRenderer.invoke('db:namedQuery', queryName, params),

  // 多步驟交易：整串步驟在單一交易中執行，全成功才提交
  runTransaction: (steps) => ipcRenderer.invoke('db:transaction', steps),

  // 身分驗證：密碼一律交由主行程驗證，password_hash 不會回到畫面層
  authLogin: (username, password) => ipcRenderer.invoke('auth:login', username, password),
  authLogout: () => ipcRenderer.invoke('auth:logout'),
  authMe: () => ipcRenderer.invoke('auth:me'),
  authChangePassword: (currentPassword, newPassword) =>
    ipcRenderer.invoke('auth:changePassword', currentPassword, newPassword),
  authResetPassword: (userId, newPassword) =>
    ipcRenderer.invoke('auth:resetPassword', userId, newPassword),
  authCreateUser: (payload) => ipcRenderer.invoke('auth:createUser', payload),

  getDashboardStats: () => ipcRenderer.invoke('dashboard:stats'),
  saveFile: (fileName, arrayBuffer) => ipcRenderer.invoke('file:save', { fileName, arrayBuffer }),
});
