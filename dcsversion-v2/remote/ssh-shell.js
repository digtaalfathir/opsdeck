// remote/ssh-shell.js
// Buka shell SSH interaktif (PTY) ke satu host. Dipakai untuk terminal xterm.js.
// Stream-nya tidak lewat WebSocket — cukup callback onData/onClose yang di main
// process diteruskan ke renderer via webContents.send.

const { Client } = require("ssh2");

/**
 * @param {object} opts  { host, port, username, password, privateKey }
 * @param {object} handlers { cols, rows, onData(buf), onClose() }
 * @returns {Promise<{write, resize, end}>}
 */
function openShell(opts, handlers = {}) {
  const {
    host,
    port = 22,
    username,
    password,
    privateKey,
    readyTimeout = 20000,
  } = opts;
  const { cols = 80, rows = 24, onData, onClose } = handlers;

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;

    const fail = (e) => {
      if (settled) return;
      settled = true;
      try { conn.end(); } catch (_) {}
      reject(e instanceof Error ? e : new Error(String(e)));
    };

    conn.on("ready", () => {
      conn.shell({ term: "xterm-256color", cols, rows }, (err, stream) => {
        if (err) return fail(err);
        settled = true;

        stream.on("data", (d) => onData && onData(d));
        stream.stderr.on("data", (d) => onData && onData(d));
        stream.on("close", () => {
          try { conn.end(); } catch (_) {}
          if (onClose) onClose();
        });

        resolve({
          write: (data) => { try { stream.write(data); } catch (_) {} },
          // ssh2 setWindow(rows, cols, height, width)
          resize: (c, r) => { try { stream.setWindow(r, c, 0, 0); } catch (_) {} },
          end: () => {
            try { stream.end(); } catch (_) {}
            try { conn.end(); } catch (_) {}
          },
        });
      });
    });

    conn.on("error", (e) => fail(new Error("SSH error: " + e.message)));

    const cfg = { host, port, username, readyTimeout, keepaliveInterval: 10000 };
    if (privateKey) cfg.privateKey = privateKey;
    if (password) cfg.password = password;
    conn.connect(cfg);
  });
}

module.exports = { openShell };
