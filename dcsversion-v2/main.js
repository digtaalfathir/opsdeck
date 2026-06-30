const { app, BrowserWindow, globalShortcut, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

const { startVncSession } = require("./remote/ssh-session");
const { createBridge } = require("./remote/ws-bridge");
const { openShell } = require("./remote/ssh-shell");
const secureConfig = require("./remote/secure-config");

let mainWindow;

// id mesin -> { session, bridge }  (VNC)
const sessions = new Map();
// id mesin -> shell  (SSH terminal)
const shells = new Map();

ipcMain.on("app-quit", () => {
  app.quit();
});

function registerQuitShortcut() {
  globalShortcut.register("CommandOrControl+Q", () => app.quit());
}

// Saat panel remote (VNC/SSH) terbuka, lepas Ctrl+Q supaya tidak ke-quit gak
// sengaja DAN Ctrl+Q bisa diteruskan ke terminal/remote. Pasang lagi saat ditutup.
ipcMain.on("remote:active", (_event, active) => {
  if (active) globalShortcut.unregister("CommandOrControl+Q");
  else registerQuitShortcut();
});

// Pastikan tunnel SSH bisa dibuka (deteksi AllowTcpForwarding mati), dengan 1x
// retry untuk jaga-jaga x11vnc belum siap listen tepat setelah start.
async function preflightTunnel(session) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const s = await session.connectTunnel();
      try { s.end(); } catch (_) {}
      return;
    } catch (e) {
      if (attempt === 1) throw e;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

// ---------------- Konfigurasi remote ----------------
function resolveTarget(id, fallbackHost) {
  const cfg = secureConfig.loadConfig();
  const d = cfg.defaults || {};
  const m = (cfg.machines || {})[id] || {};
  const host = m.host || fallbackHost;
  if (!host) {
    throw new Error(`Host untuk "${id}" belum dikonfigurasi (isi lewat "Kelola Remote" atau pastikan IP tampil di kotak mesin).`);
  }
  const keyPath = m.privateKeyPath || d.privateKeyPath;
  return {
    host,
    port: m.port || d.port || 22,
    username: m.username || d.username,
    password: secureConfig.resolvePassword(m, d),
    privateKey: keyPath ? fs.readFileSync(keyPath) : undefined,
    vncDisplay: m.vncDisplay || d.vncDisplay || ":0",
    vncPort: m.vncPort || d.vncPort || 5900,
    x11vncCmd: m.x11vncCmd || d.x11vncCmd,
  };
}

// ---------------- IPC: remote ----------------
ipcMain.handle("remote:start-vnc", async (_event, { id, fallbackHost }) => {
  // Sudah ada sesi aktif → pakai ulang bridge yang sama.
  if (sessions.has(id)) {
    return { port: sessions.get(id).bridge.port };
  }

  const target = resolveTarget(id, fallbackHost);
  const session = await startVncSession(target);
  try {
    await preflightTunnel(session); // gagal di sini = forwarding/x11vnc bermasalah
    const bridge = await createBridge(session.connectTunnel);
    sessions.set(id, { session, bridge });
    return { port: bridge.port };
  } catch (e) {
    // tunnel/bridge gagal → matikan x11vnc yang sempat dinyalakan
    try { session.end(); } catch (_) {}
    throw e;
  }
});

ipcMain.handle("remote:stop", async (_event, { id }) => {
  const s = sessions.get(id);
  if (!s) return { ok: true };
  sessions.delete(id);
  try { await s.bridge.close(); } catch (_) {}
  try { s.session.end(); } catch (_) {}
  return { ok: true };
});

ipcMain.handle("remote:list", () => Object.keys(secureConfig.loadConfig().machines || {}));

// Config untuk UI "Kelola Remote" (password diredaksi).
ipcMain.handle("remote:get-config", () => secureConfig.getRedactedConfig());

// Simpan config dari UI (password baru dienkripsi via safeStorage).
ipcMain.handle("remote:save-config", (_event, editable) => secureConfig.saveConfig(editable));

// ---------------- IPC: SSH terminal ----------------
ipcMain.handle("ssh:start", async (event, { id, fallbackHost, cols, rows }) => {
  // tutup shell lama untuk id yang sama (kalau ada)
  if (shells.has(id)) {
    try { shells.get(id).end(); } catch (_) {}
    shells.delete(id);
  }
  const target = resolveTarget(id, fallbackHost);
  const wc = event.sender;
  const shell = await openShell(target, {
    cols,
    rows,
    onData: (data) => { if (!wc.isDestroyed()) wc.send("ssh:data", { id, data }); },
    onClose: () => { if (!wc.isDestroyed()) wc.send("ssh:exit", { id }); shells.delete(id); },
  });
  shells.set(id, shell);
  return { ok: true };
});

ipcMain.on("ssh:write", (_event, { id, data }) => {
  const s = shells.get(id);
  if (s) s.write(data);
});

ipcMain.on("ssh:resize", (_event, { id, cols, rows }) => {
  const s = shells.get(id);
  if (s) s.resize(cols, rows);
});

ipcMain.on("ssh:stop", (_event, { id }) => {
  const s = shells.get(id);
  if (s) { try { s.end(); } catch (_) {} shells.delete(id); }
});

function stopAllSessions() {
  for (const [, s] of sessions) {
    try { s.bridge.close(); } catch (_) {}
    try { s.session.end(); } catch (_) {}
  }
  sessions.clear();
  for (const [, sh] of shells) {
    try { sh.end(); } catch (_) {}
  }
  shells.clear();
}

// ---------------- Window ----------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,
    autoHideMenuBar: true,
    frame: false, // hilangkan border window
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile("index.html");

  // CTRL + Q untuk keluar (dilepas sementara saat panel remote terbuka)
  registerQuitShortcut();

  // v2: DevTools dibiarkan tersedia (Ctrl+Shift+I) untuk debug remote/noVNC.
  globalShortcut.register("CommandOrControl+Shift+I", () => {
    if (mainWindow) mainWindow.webContents.toggleDevTools();
  });
}

app.whenReady().then(() => {
  createWindow();
});

app.on("before-quit", () => {
  stopAllSessions();
});

app.on("window-all-closed", () => {
  app.quit();
});
