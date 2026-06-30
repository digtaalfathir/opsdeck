// remote/ws-bridge.js
// Jembatan lokal: noVNC (WebSocket) <-> x11vnc (RFB) via SSH tunnel.
// Pengganti `websockify` — cukup Node murni di dalam Electron main process.
// WS server hanya bind ke 127.0.0.1 (port acak). Sisi remote diakses lewat
// SSH tunnel (forwardOut) ke x11vnc yang listen -localhost, jadi RFB tidak
// pernah lewat jaringan dalam bentuk polos.

const { WebSocketServer } = require("ws");

/**
 * @param {() => Promise<import("stream").Duplex>} connectStream  buka stream baru
 *        ke x11vnc lewat SSH tunnel (x11vnc -localhost di remote)
 * @returns {Promise<{port:number, close:Function}>}
 */
function createBridge(connectStream) {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({
      host: "127.0.0.1",
      port: 0, // 0 = OS pilih port bebas
      // noVNC menawarkan subprotocol "binary"; echo balik kalau ada biar kompatibel.
      handleProtocols: (protocols) => (protocols.has("binary") ? "binary" : false),
    });

    wss.on("connection", async (ws) => {
      ws.binaryType = "nodebuffer";

      let tcp;
      try {
        tcp = await connectStream();
      } catch (e) {
        try { ws.close(); } catch (_) {}
        return;
      }

      let closed = false;
      const cleanup = () => {
        if (closed) return;
        closed = true;
        try { tcp.destroy(); } catch (_) {}
        try { ws.close(); } catch (_) {}
      };

      // WS -> TCP
      ws.on("message", (data) => {
        // data berupa Buffer (binaryType nodebuffer)
        if (!tcp.destroyed) tcp.write(data);
      });
      ws.on("close", cleanup);
      ws.on("error", cleanup);

      // TCP -> WS
      tcp.on("data", (chunk) => {
        if (ws.readyState === ws.OPEN) ws.send(chunk);
      });
      tcp.on("close", cleanup);
      tcp.on("error", cleanup);
    });

    wss.on("error", reject);
    wss.on("listening", () => {
      const { port } = wss.address();
      resolve({
        port,
        close: () => new Promise((res) => wss.close(() => res())),
      });
    });
  });
}

module.exports = { createBridge };
