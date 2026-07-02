// remote/ssh-session.js
// Buka koneksi SSH ke satu DCS/IPC lalu jalankan x11vnc di sana.
// x11vnc dijalankan dengan -localhost (hanya listen di loopback remote), lalu
// VNC ditarik lewat SSH tunnel (connectTunnel/forwardOut). Jadi port RFB tidak
// pernah terekspos ke jaringan — semua lewat koneksi SSH yang terenkripsi.

const { Client } = require("ssh2");

// Bangun command x11vnc default. Bisa dioverride lewat remotes.json (x11vncCmd).
// -display :0  : SSH exec non-interaktif tidak punya $DISPLAY, jadi wajib eksplisit.
// -auth guess  : cari Xauthority milik sesi yang sedang login.
// -nopw        : tanpa password VNC (sama seperti `x11vnc` polos yang biasa dipakai).
// -forever     : server tetap hidup walau client sempat disconnect/reconnect.
// -bg          : fork ke background; perintah exec langsung selesai begitu siap.
function buildX11vncCmd({ vncDisplay, vncPort, x11vncCmd }) {
  if (x11vncCmd) return x11vncCmd;
  const display = vncDisplay || ":0";
  const port = vncPort || 5900;
  return [
    "x11vnc",
    `-display ${display}`,
    "-auth guess",
    `-rfbport ${port}`,
    "-nopw",
    "-localhost",
    "-forever",
    "-shared",
    "-noxdamage",
    "-bg",
    "-o /tmp/x11vnc-stechoq.log",
  ].join(" ");
}

/**
 * Konek SSH lalu start x11vnc.
 * @returns {Promise<{host:string, vncPort:number, raw:string, end:Function}>}
 */
function startVncSession(opts) {
  const {
    host,
    port = 22,
    username,
    password,
    privateKey,
    vncPort = 5900,
    vncMode = "x11vnc",
    readyTimeout = 20000,
  } = opts;

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      try { conn.end(); } catch (_) {}
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    // Safety: jangan biarkan promise hang selamanya.
    const guard = setTimeout(() => fail(new Error("Timeout membuka sesi VNC")), readyTimeout + 15000);

    conn.on("ready", () => {
      // Mode "direct": VNC server sudah jalan di remote (mis. RealVNC di Raspi),
      // jadi tidak perlu jalanin x11vnc — langsung buka tunnel ke port VNC-nya.
      if (vncMode === "direct") {
        clearTimeout(guard);
        settled = true;
        resolve({ host, vncPort, raw: "", connectTunnel, end });
        return;
      }
      const cmd = buildX11vncCmd(opts);
      conn.exec(cmd, (err, stream) => {
        if (err) return fail(err);

        let out = "";
        stream.on("data", (d) => (out += d.toString()));
        stream.stderr.on("data", (d) => (out += d.toString()));

        stream.on("close", (code) => {
          // -bg membuat exec selesai cepat begitu x11vnc siap di background.
          if (settled) return;
          if (code === 0) {
            clearTimeout(guard);
            settled = true;
            resolve({ host, vncPort, raw: out.trim(), connectTunnel, end });
          } else {
            fail(new Error(`x11vnc gagal (exit ${code}): ${out.trim() || "tidak ada output"}`));
          }
        });
      });
    });

    conn.on("error", (e) => fail(new Error(`SSH error: ${e.message}`)));

    // Tutup sesi. Mode direct cukup tutup SSH; mode x11vnc matikan x11vnc dulu.
    function end() {
      if (vncMode === "direct") { try { conn.end(); } catch (_) {} return; }
      try {
        conn.exec(`pkill -f 'x11vnc.*-rfbport ${vncPort}'`, (err, stream) => {
          const done = () => { try { conn.end(); } catch (_) {} };
          if (err || !stream) return done();
          stream.on("close", done);
          stream.resume();
        });
      } catch (_) {
        try { conn.end(); } catch (__) {}
      }
    }

    // Buka channel TCP ke 127.0.0.1:vncPort di remote lewat koneksi SSH ini.
    // Karena x11vnc -localhost cuma listen di loopback remote, satu-satunya jalan
    // masuk adalah tunnel ini (terenkripsi), bukan port terbuka di jaringan.
    function connectTunnel() {
      return new Promise((res, rej) => {
        conn.forwardOut("127.0.0.1", 0, "127.0.0.1", vncPort, (err, stream) => {
          if (err) {
            rej(new Error("Gagal buka tunnel VNC (cek AllowTcpForwarding di sshd remote): " + err.message));
          } else {
            res(stream);
          }
        });
      });
    }

    const connectCfg = { host, port, username, readyTimeout, keepaliveInterval: 10000 };
    if (privateKey) connectCfg.privateKey = privateKey;
    if (password) connectCfg.password = password;
    conn.connect(connectCfg);
  });
}

module.exports = { startVncSession, buildX11vncCmd };
