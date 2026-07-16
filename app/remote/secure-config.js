// remote/secure-config.js
// Load/save remotes.json dengan password terenkripsi (Electron safeStorage).
// - field non-rahasia (host, port, username, vncDisplay...) tetap plaintext & bisa diedit manual
// - password disimpan sebagai `passwordEnc` (base64 dari safeStorage) bila keyring OS tersedia
// - password plaintext lama (`password`) tetap didukung sebagai fallback / hasil migrasi
//
// Kalau keyring tidak tersedia (mis. kiosk tanpa gnome-keyring), enkripsi
// di-skip dan password disimpan apa adanya — UI akan memberi peringatan.

const fs = require("fs");
const path = require("path");
const { safeStorage } = require("electron");

// Lokasi remotes.json: dev = folder app; ter-package = userData (folder app read-only).
function getConfigPath() {
  if (process.env.REMOTES_PATH) return process.env.REMOTES_PATH;
  try {
    const { app } = require("electron");
    if (app && app.isPackaged) return path.join(app.getPath("userData"), "remotes.json");
  } catch (_) {}
  return path.join(__dirname, "..", "remotes.json");
}

// remotes.json bawaan yang ikut di-bundle installer. Dipakai sebagai fallback bila
// userData belum punya remotes.json (mis. PC baru yang belum pernah "Kelola Remote").
function seedConfigPath() {
  return path.join(__dirname, "..", "remotes.json");
}

const NUMERIC_FIELDS = new Set(["port", "vncPort"]);
const COPY_FIELDS = ["host", "port", "username", "vncDisplay", "vncPort", "x11vncCmd", "privateKeyPath", "vncMode", "vncViewerCmd"];

function loadConfig() {
  // 1) config milik user (userData saat ter-package) → 2) fallback seed bawaan bundle
  for (const p of [getConfigPath(), seedConfigPath()]) {
    try {
      const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
      cfg.defaults = cfg.defaults || {};
      cfg.machines = cfg.machines || {};
      return cfg;
    } catch (_) {}
  }
  return { defaults: {}, machines: {} };
}

function encryptionAvailable() {
  try {
    return !!safeStorage && safeStorage.isEncryptionAvailable();
  } catch (_) {
    return false;
  }
}

function encrypt(plain) {
  if (!plain) return null;
  if (!encryptionAvailable()) return null;
  try {
    return safeStorage.encryptString(plain).toString("base64");
  } catch (_) {
    return null;
  }
}

function decrypt(b64) {
  try {
    return safeStorage.decryptString(Buffer.from(b64, "base64"));
  } catch (_) {
    return null;
  }
}

// Password efektif untuk satu entry, fallback ke defaults.
function resolvePassword(entry = {}, defaults = {}) {
  if (entry.passwordEnc) {
    const p = decrypt(entry.passwordEnc);
    if (p != null) return p;
  }
  if (entry.password) return entry.password;
  if (defaults.passwordEnc) {
    const p = decrypt(defaults.passwordEnc);
    if (p != null) return p;
  }
  if (defaults.password) return defaults.password;
  return undefined;
}

function hasPassword(entry = {}) {
  return !!(entry.passwordEnc || entry.password);
}

// Versi aman untuk dikirim ke renderer (tanpa nilai password).
function getRedactedConfig() {
  const cfg = loadConfig();
  const d = cfg.defaults;
  const machines = {};
  for (const [id, m] of Object.entries(cfg.machines)) {
    machines[id] = {
      host: m.host || "",
      port: m.port,
      username: m.username,
      vncDisplay: m.vncDisplay,
      vncPort: m.vncPort,
      x11vncCmd: m.x11vncCmd,
      vncMode: m.vncMode || "x11vnc",
      hasPassword: hasPassword(m),
    };
  }
  return {
    encryptionAvailable: encryptionAvailable(),
    defaults: {
      port: d.port,
      username: d.username,
      vncDisplay: d.vncDisplay,
      vncPort: d.vncPort,
      hasPassword: hasPassword(d),
    },
    machines,
  };
}

// Gabungkan satu entry baru dari renderer dengan yang lama (pertahankan password
// kalau tidak diisi ulang). `incoming.password` = string baru bila diganti.
function buildEntry(incoming = {}, prev = {}) {
  const e = {};
  for (const k of COPY_FIELDS) {
    const v = incoming[k];
    if (v !== undefined && v !== "" && v !== null) {
      e[k] = NUMERIC_FIELDS.has(k) ? Number(v) : v;
    }
  }
  if (incoming.password) {
    const enc = encrypt(incoming.password);
    if (enc) e.passwordEnc = enc;
    else e.password = incoming.password; // fallback: keyring tidak tersedia
  } else {
    // tidak diubah → pertahankan yang lama
    if (prev.passwordEnc) e.passwordEnc = prev.passwordEnc;
    else if (prev.password) e.password = prev.password;
  }
  // Pertahankan field lanjutan yang tidak ada di form Kelola Remote
  for (const k of ["vncMode", "vncPassword", "vncPort", "x11vncCmd", "privateKeyPath", "vncViewerCmd"]) {
    if (e[k] === undefined && prev[k] !== undefined) e[k] = prev[k];
  }
  return e;
}

// Simpan config dari editable {defaults, machines} yang dikirim renderer.
// Mesin yang TIDAK ada di editable.machines dianggap dihapus.
function saveConfig(editable = {}) {
  const current = loadConfig();
  const out = {
    _catatan:
      "Kredensial -> sudah di-gitignore, jangan commit. Password disimpan terenkripsi (passwordEnc) bila keyring OS tersedia; selain itu plaintext. Field lain boleh diedit manual.",
    defaults: buildEntry(editable.defaults || {}, current.defaults || {}),
    machines: {},
  };
  for (const [id, m] of Object.entries(editable.machines || {})) {
    out.machines[id] = buildEntry(m, (current.machines || {})[id] || {});
  }
  fs.writeFileSync(getConfigPath(), JSON.stringify(out, null, 2));
  return { ok: true, count: Object.keys(out.machines).length };
}

module.exports = {
  getConfigPath,
  loadConfig,
  resolvePassword,
  encryptionAvailable,
  getRedactedConfig,
  saveConfig,
};
