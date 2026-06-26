const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

// Electron loads the SvelteKit dev server. Override with DEV_URL if you change the port.
const DEV_URL = process.env.DEV_URL || 'http://127.0.0.1:5173';

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  win.loadURL(DEV_URL);
}

// --- Windows focus-fix workaround -------------------------------------------
// After a native alert()/confirm()/prompt() on Windows, the renderer loses
// keyboard focus and inputs become unfocusable until the window is re-activated.
// Three strategies, lowest-impact first — use the harness to find the minimum
// that actually fixes it for your app:
//   webContentsFocus  -> no flash, sometimes insufficient (try first)
//   relayout          -> no flash, also nudges a relayout like DevTools does
//   blurFocus         -> flashes (titlebar inactive->active), most reliable
ipcMain.on('focus-fix', (event, method = 'blurFocus') => {
  if (process.platform !== 'win32') return;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;

  switch (method) {
    case 'webContentsFocus':
      win.webContents.focus();
      break;

    case 'relayout': {
      win.webContents.focus();
      // No-op zoom round-trip forces a relayout/compositor pass without a flash.
      const z = win.webContents.getZoomFactor();
      win.webContents.setZoomFactor(z === 1 ? 1.0001 : 1);
      win.webContents.setZoomFactor(z);
      break;
    }

    case 'blurFocus':
    default:
      win.blur();
      win.focus();
      break;
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
