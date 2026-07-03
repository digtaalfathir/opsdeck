const { app, BrowserWindow, globalShortcut, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const { startVncSession } = require("./remote/ssh-session");
const { createBridge } = require("./remote/ws-bridge");
const { openShell } = require("./remote/ssh-shell");
const secureConfig = require("./remote/secure-config");
const { checkVpn } = require("./vpn-check");

// Matikan hardware acceleration → hindari error GPU/GBM Chromium
// (gbm_wrapper "Failed to get fd for plane") di sebagian hardware/driver Linux.
app.disableHardwareAcceleration();

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
    vncMode: m.vncMode || d.vncMode || "x11vnc",
    vncPassword: m.vncPassword || d.vncPassword,
    vncViewerCmd: m.vncViewerCmd || d.vncViewerCmd || "vncviewer",
  };
}

// ---------------- IPC: remote ----------------
ipcMain.handle("remote:start-vnc", async (_event, { id, fallbackHost }) => {
  // Sudah ada sesi aktif → pakai ulang bridge yang sama.
  if (sessions.has(id)) {
    const s = sessions.get(id);
    return { port: s.bridge.port, vncMode: s.vncMode, vncPassword: s.vncPassword };
  }

  const target = resolveTarget(id, fallbackHost);
  if (target.vncMode === "none") {
    throw new Error("Mesin ini headless — tidak ada tampilan VNC. Gunakan SSH.");
  }
  if (target.vncMode === "external") {
    throw new Error("Mode VNC 'external' — dibuka via viewer sistem, bukan embedded.");
  }
  const session = await startVncSession(target);
  try {
    await preflightTunnel(session); // gagal di sini = forwarding/VNC bermasalah
    const bridge = await createBridge(session.connectTunnel);
    const vncPassword = target.vncMode === "direct" ? target.vncPassword : undefined;
    sessions.set(id, { session, bridge, vncMode: target.vncMode, vncPassword });
    return { port: bridge.port, vncMode: target.vncMode, vncPassword };
  } catch (e) {
    // tunnel/bridge gagal → bersihkan sesi
    try { session.end(); } catch (_) {}
    throw e;
  }
});

// VNC "external": langsung buka VNC viewer sistem ke IP (mis. RealVNC ke Raspi),
// tanpa SSH/x11vnc/embed — persis alur manual "buka RealVNC, masukin IP".
ipcMain.handle("remote:open-external", (_event, { id, fallbackHost }) => {
  const t = resolveTarget(id, fallbackHost);
  const cmd = t.vncViewerCmd || "vncviewer";
  const addr = t.vncPort && t.vncPort !== 5900 ? `${t.host}::${t.vncPort}` : t.host;
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(cmd, [addr], { detached: true, stdio: "ignore" });
    } catch (e) {
      return reject(new Error(`Gagal menjalankan '${cmd}': ${e.message}`));
    }
    child.on("error", (e) =>
      reject(new Error(`VNC viewer '${cmd}' tidak bisa dijalankan (terinstall & ada di PATH?): ${e.message}`))
    );
    child.on("spawn", () => { try { child.unref(); } catch (_) {} resolve({ ok: true, cmd, addr }); });
  });
});

ipcMain.handle("remote:stop", async (_event, { id }) => {
  const s = sessions.get(id);
  if (!s) return { ok: true };
  sessions.delete(id);
  try { await s.bridge.close(); } catch (_) {}
  try { s.session.end(); } catch (_) {}
  return { ok: true };
});

ipcMain.handle("remote:list", () => {
  const machines = secureConfig.loadConfig().machines || {};
  const out = {};
  for (const [id, cfg] of Object.entries(machines)) {
    out[id] = { vncMode: cfg.vncMode || "x11vnc" };
  }
  return out;
});

// Config untuk UI "Kelola Remote" (password diredaksi).
ipcMain.handle("remote:get-config", () => secureConfig.getRedactedConfig());

// Simpan config dari UI (password baru dienkripsi via safeStorage).
ipcMain.handle("remote:save-config", (_event, editable) => secureConfig.saveConfig(editable));

// ---------------- IPC: layout posisi kotak ----------------
function layoutPath() {
  // Ter-package: folder app read-only → simpan di userData.
  return app.isPackaged
    ? path.join(app.getPath("userData"), "layout.json")
    : path.join(__dirname, "layout.json");
}
ipcMain.handle("layout:load", () => {
  try { return JSON.parse(fs.readFileSync(layoutPath(), "utf8")); } catch (_) { return null; }
});
ipcMain.handle("layout:save", (_event, data) => {
  fs.writeFileSync(layoutPath(), JSON.stringify(data, null, 2));
  return { ok: true };
});

// ---------------- Startup / VPN gate ----------------
ipcMain.handle("vpn:check", () => checkVpn());

let vpnWatch = null;
function startVpnWatch() {
  if (vpnWatch) clearInterval(vpnWatch);
  vpnWatch = setInterval(async () => {
    try {
      const r = await checkVpn();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("vpn:status", r);
    } catch (_) {}
  }, 15000);
}

// Dipanggil startup screen saat VPN OK → masuk aplikasi utama + mulai pantau VPN.
ipcMain.on("app:enter", () => {
  if (mainWindow) mainWindow.loadFile("index.html");
  startVpnWatch();
});

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

  // Mulai dari startup screen (gate cek VPN); masuk index.html setelah VPN OK.
  mainWindow.loadFile("startup.html");

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
