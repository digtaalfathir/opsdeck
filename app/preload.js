const { contextBridge, ipcRenderer, clipboard } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  quitApp: () => ipcRenderer.send("app-quit"),
  // Beri tahu main saat panel remote dibuka/ditutup (untuk lepas/pasang Ctrl+Q).
  setRemoteActive: (active) => ipcRenderer.send("remote:active", active),
  // Clipboard (buat copy/paste di terminal SSH)
  clipboard: {
    read: () => clipboard.readText(),
    write: (t) => clipboard.writeText(t),
  },
  // Startup / VPN gate
  vpn: { check: () => ipcRenderer.invoke("vpn:check") },
  enterApp: () => ipcRenderer.send("app:enter"),
  onVpnStatus: (cb) => {
    const h = (_e, s) => cb(s);
    ipcRenderer.on("vpn:status", h);
    return () => ipcRenderer.removeListener("vpn:status", h);
  },
  remote: {
    // Mulai sesi VNC: SSH + x11vnc + bridge. Balikannya { port } WS lokal.
    startVnc: (id, fallbackHost) =>
      ipcRenderer.invoke("remote:start-vnc", { id, fallbackHost }),
    // Tutup sesi: matikan x11vnc + tutup bridge.
    stop: (id) => ipcRenderer.invoke("remote:stop", { id }),
    // Buka VNC viewer sistem (RealVNC dll) langsung ke IP — untuk vncMode "external".
    openExternal: (id, fallbackHost) => ipcRenderer.invoke("remote:open-external", { id, fallbackHost }),
    // Daftar id mesin yang dikonfigurasi (untuk menampilkan tombol Remote).
    list: () => ipcRenderer.invoke("remote:list"),
    // Kelola Remote: ambil config (password diredaksi) & simpan.
    getConfig: () => ipcRenderer.invoke("remote:get-config"),
    saveConfig: (cfg) => ipcRenderer.invoke("remote:save-config", cfg),
  },
  ssh: {
    // Mulai shell SSH interaktif. cols/rows = ukuran terminal awal.
    start: (id, fallbackHost, cols, rows) =>
      ipcRenderer.invoke("ssh:start", { id, fallbackHost, cols, rows }),
    // Kirim ketikan ke shell.
    write: (id, data) => ipcRenderer.send("ssh:write", { id, data }),
    // Beri tahu shell ukuran terminal berubah.
    resize: (id, cols, rows) => ipcRenderer.send("ssh:resize", { id, cols, rows }),
    // Tutup shell.
    stop: (id) => ipcRenderer.send("ssh:stop", { id }),
    // Subscribe output shell. Mengembalikan fungsi untuk unsubscribe.
    onData: (cb) => {
      const h = (_e, payload) => cb(payload);
      ipcRenderer.on("ssh:data", h);
      return () => ipcRenderer.removeListener("ssh:data", h);
    },
    // Subscribe event sesi berakhir.
    onExit: (cb) => {
      const h = (_e, payload) => cb(payload);
      ipcRenderer.on("ssh:exit", h);
      return () => ipcRenderer.removeListener("ssh:exit", h);
    },
  },
  // Edit Layout: simpan/baca posisi kotak ke layout.json.
  layout: {
    load: () => ipcRenderer.invoke("layout:load"),
    save: (data) => ipcRenderer.invoke("layout:save", data),
  },
});
