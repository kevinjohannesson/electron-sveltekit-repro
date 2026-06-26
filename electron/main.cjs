const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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

  // When a renderer beforeunload guard vetoes the close, Electron does nothing by
  // default (window stays, no dialog). Handle it here: show the quit confirmation
  // and call event.preventDefault() to ALLOW the close when the user confirms.
  // Keeps all renderer-side "unsaved changes" guards unchanged.
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Cancel', 'Quit'],
      defaultId: 0,
      cancelId: 0,
      title: 'Quit',
      message: 'Are you sure you want to quit?',
      detail: 'Unsaved changes will be lost.'
    });
    if (choice === 1) {
      event.preventDefault(); // Quit -> allow the close
    } else if (process.platform === 'win32') {
      // Cancel -> window stays open. showMessageBoxSync is itself a native dialog,
      // so it leaves the renderer unfocusable (the same Windows bug). Re-apply the
      // blur+focus fix on the next tick to restore input focus.
      setImmediate(() => {
        win.blur();
        win.focus();
      });
    }
  });
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
