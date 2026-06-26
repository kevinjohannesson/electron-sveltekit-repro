const { contextBridge, ipcRenderer } = require('electron');

// Exposed to the renderer as window.native.* (contextIsolation is on by default).
contextBridge.exposeInMainWorld('native', {
  // Windows focus-fix: call after any native alert/confirm/prompt to restore
  // input focus. `method` selects the strategy (see main.cjs). No-op off win32.
  refocus: (method) => ipcRenderer.send('focus-fix', method)
});
