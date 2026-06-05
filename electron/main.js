const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

// Start the local Express backend server
try {
  // In development and packaged environments, the server compiled file is at ../server/dist/index.js
  require('../server/dist/index.js');
} catch (error) {
  console.error('[ELECTRON-SERVER] Failed to load Express backend:', error);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'Case Art Organizer',
  });

  // Turn off window menu bar
  win.removeMenu();

  const isDev = !app.isPackaged && process.argv.includes('--dev');
  if (isDev) {
    // In dev mode, load the Vite dev server URL
    win.loadURL('http://localhost:5173');
  } else {
    // In production/simulated mode, load the compiled relative HTML file from the filesystem
    win.loadFile(path.join(__dirname, '../client/dist/index.html'));
  }
}

app.whenReady().then(() => {
  // IPC Handler for native folder selection
  ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Folder',
    });
    if (result.canceled) {
      return null;
    }
    return result.filePaths[0];
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
