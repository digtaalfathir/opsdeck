// scripts/set-remote-pass.js <machineId|defaults> <password plaintext>
// Set password PLAINTEXT untuk satu entry di remotes.json (dan hapus passwordEnc
// lama yang terkunci ke keyring). Pure Node — tidak butuh Electron/keyring.
// Dipakai supaya remotes.json portable saat di-bundle ke installer.
//
// Contoh:
//   node scripts/set-remote-pass.js SERVER_JMP 'passwordku'
//   node scripts/set-remote-pass.js SERVER_SUGITY 'passwordku'
// (Catatan: password akan tercatat di history shell — untuk internal saja.)

const fs = require("fs");
const path = require("path");

const [, , id, ...rest] = process.argv;
const pass = rest.join(" ");
if (!id || !pass) {
  console.error("Pakai: node scripts/set-remote-pass.js <machineId|defaults> <password>");
  process.exit(1);
}

const FILE = path.join(__dirname, "..", "remotes.json");
let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(FILE, "utf8"));
} catch (e) {
  console.error("Gagal baca remotes.json:", e.message);
  process.exit(1);
}

const target =
  id === "defaults"
    ? (cfg.defaults = cfg.defaults || {})
    : cfg.machines && cfg.machines[id];

if (!target) {
  console.error("Tidak ada entry '" + id + "' di remotes.json.");
  console.error("Pilihan:", Object.keys((cfg.machines || {})).join(", ") || "(kosong)");
  process.exit(1);
}

target.password = pass;
delete target.passwordEnc;
fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2));
console.log("OK: '" + id + "' → password plaintext diset (passwordEnc dihapus).");
