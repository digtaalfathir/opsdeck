const { app, BrowserWindow, globalShortcut } = require("electron");
const path = require("path");

let mainWindow;

function createWindow() {

  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,
    autoHideMenuBar: true,
    frame: false, // hilangkan border window
    webPreferences: {
      contextIsolation: true
    }
  });

  mainWindow.loadFile("index.html");

  // Disable DevTools
  mainWindow.webContents.on("devtools-opened", () => {
    mainWindow.webContents.closeDevTools();
  });

  // CTRL + Q untuk keluar
  globalShortcut.register("CommandOrControl+Q", () => {
    app.quit();
  });
}

app.whenReady().then(() => {
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});
