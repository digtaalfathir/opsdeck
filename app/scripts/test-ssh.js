// scripts/test-ssh.js [id ...]
// Tes koneksi + autentikasi SSH ke server di remotes.json (pakai kredensial &
// resolvePassword yang sama dgn app). Menampilkan ✓/✗ saja, BUKAN passwordnya.
// Host 10.10.x butuh VPN aktif. Contoh:
//   node scripts/test-ssh.js SERVER_JMP SERVER_SUGITY

const { Client } = require("ssh2");
const secure = require("../remote/secure-config");

const cfg = secure.loadConfig();
const d = cfg.defaults || {};
const asked = process.argv.slice(2);
const ids = (asked.length ? asked : Object.keys(cfg.machines || {})).filter(
  (id) => (cfg.machines || {})[id]
);

if (!ids.length) {
  console.error("Tidak ada mesin. Pilihan:", Object.keys(cfg.machines || {}).join(", "));
  process.exit(1);
}

function test(id) {
  return new Promise((resolve) => {
    const m = cfg.machines[id] || {};
    const host = m.host;
    const port = m.port || d.port || 22;
    const username = m.username || d.username;
    const password = secure.resolvePassword(m, d);
    const c = new Client();
    let done = false;
    const fin = (ok, msg) => {
      if (done) return;
      done = true;
      try { c.end(); } catch (_) {}
      console.log((ok ? "✓" : "✗") + " " + id + " (" + username + "@" + host + ":" + port + ") - " + msg);
      resolve();
    };
    c.on("ready", () => fin(true, "auth OK"));
    c.on("error", (e) => fin(false, e.message));
    const t = setTimeout(() => fin(false, "timeout 8s (VPN mati / host off?)"), 8000);
    t.unref && t.unref();
    try {
      c.connect({ host, port, username, password, readyTimeout: 8000 });
    } catch (e) {
      fin(false, e.message);
    }
  });
}

(async () => {
  for (const id of ids) await test(id);
  process.exit(0);
})();
