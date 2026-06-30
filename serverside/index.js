// monitor-with-logs.js
const ping = require("ping");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const TIMEZONE = "Asia/Jakarta";
const LOG_DIR = path.join(__dirname, "logs");

// ================= WEBSOCKET SERVER =================
const WS_PORT = 10012;
const wss = new WebSocket.Server({ port: WS_PORT });

// pastikan ada folder logs
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// ---------------- Shared flags file (single JSON) ----------------
const SHARED_DIR = path.join(__dirname, "..", "shared");
if (!fs.existsSync(SHARED_DIR)) fs.mkdirSync(SHARED_DIR, { recursive: true });

const GLOBAL_FLAG_FILE = path.join(SHARED_DIR, "needrestart.json");

// load existing flags (if ada)
let globalFlags = {};
if (fs.existsSync(GLOBAL_FLAG_FILE)) {
  try {
    globalFlags = JSON.parse(fs.readFileSync(GLOBAL_FLAG_FILE, "utf8"));
  } catch (e) {
    console.error("Gagal load existing needrestart.json:", e);
    globalFlags = {};
  }
}

// helper untuk menulis file global
function writeGlobalFlagsToDisk() {
  try {
    fs.writeFileSync(GLOBAL_FLAG_FILE, JSON.stringify(globalFlags, null, 2));
    appendLogLine(`GLOBAL FLAG wrote ${GLOBAL_FLAG_FILE}`);
  } catch (e) {
    console.error("Gagal menulis flag global:", e);
  }
}

function updateGlobalFlag(key, value) {
  globalFlags[key] = !!value;
  writeGlobalFlagsToDisk();
}

function sanitizeFlagKey(name) {
  // remove non-alphanumeric, to-lowercase; prefix needrestart
  return "needrestart" + name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ---------------- end shared flags ----------------

const devices = [
  { name: "IOT NODE 001", ip: "172.19.88.17", status: "UNKNOWN" },
  { name: "Printer M#5", ip: "172.19.88.21", status: "UNKNOWN" },
  { name: "DCS MIXING MATERIAL F4", ip: "172.19.88.30", status: "UNKNOWN" },
  { name: "DCS PLAYMAKER F4", ip: "172.19.88.16", status: "UNKNOWN" },
  { name: "DCS QI F4", ip: "172.19.88.19", status: "UNKNOWN" },
  { name: "DCS REPAIR IN LINE F4", ip: "172.19.88.20", status: "UNKNOWN" },
  { name: "DCS POLES F4", ip: "172.19.88.29", status: "UNKNOWN" },
  { name: "DCS TASK FORCE F4", ip: "172.19.88.24", status: "UNKNOWN" },
];

// warna untuk console
const color = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  reset: "\x1b[0m",
};

// helper waktu (Asia/Jakarta)
function nowDateObj() {
  return new Date();
}
function dateStrLocal(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}
function timeStrLocal(date = new Date()) {
  return date.toLocaleTimeString("en-GB", { timeZone: TIMEZONE });
}
function dateTimeLocal(date = new Date()) {
  return `${dateStrLocal(date)} ${timeStrLocal(date)}`;
}

// logging
function logFilePathFor(date = new Date()) {
  const fname = `${dateStrLocal(date)}.log`;
  return path.join(LOG_DIR, fname);
}
function appendLogLine(line, date = new Date()) {
  const file = logFilePathFor(date);
  const final = `[${dateTimeLocal(date)}] ${line}\n`;
  fs.appendFile(file, final, err => {
    if (err) console.error("Gagal menulis log:", err);
  });
}

// snapshot status (JSON) agar ketika restart masih tahu kapan down mulai (optional)
const SNAPSHOT_FILE = path.join(LOG_DIR, "status_snapshot.json");
function saveSnapshot(mapStatus) {
  try {
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(mapStatus, null, 2));
  } catch (e) {
    console.error("Gagal menyimpan snapshot:", e);
  }
}
function loadSnapshot() {
  try {
    if (fs.existsSync(SNAPSHOT_FILE)) {
      const raw = fs.readFileSync(SNAPSHOT_FILE, "utf8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Gagal load snapshot:", e);
  }
  return null;
}

// untuk track perubahan: lastStatus[name] = "UP"/"DOWN"/"UNKNOWN"
// downSince[name] = ISO timestamp string when it went down (in local string)
const lastStatus = {};
const downSince = {};

// restore snapshot if ada
const snap = loadSnapshot();
if (snap && snap.lastStatus) {
  Object.assign(lastStatus, snap.lastStatus);
  Object.assign(downSince, snap.downSince || {});
} else {
  devices.forEach(d => lastStatus[d.name] = d.status || "UNKNOWN");
}

// tabel helper
function line(widths) {
  let out = "+";
  widths.forEach(w => out += "-".repeat(w + 2) + "+");
  return out;
}
function row(cols, widths) {
  let out = "|";
  cols.forEach((c, i) => {
    out += " " + c.toString().padEnd(widths[i]) + " |";
  });
  return out;
}

// fungsi utama
async function checkAll() {
  console.clear();
  console.log(`${color.cyan}=== DEVICE STATUS MONITORING ===${color.reset}`);
  console.log("Last update:", dateTimeLocal());
  console.log("");

  const pingTasks = devices.map(dev =>
    ping.promise.probe(dev.ip, { timeout: 1 })
      .then(res => ({ dev, alive: res.alive }))
      .catch(() => ({ dev, alive: false }))
  );

  const results = await Promise.all(pingTasks);

  // Update status dan cek perubahan
  results.forEach(r => {
    const dev = r.dev;
    const alive = r.alive;
    const newStatus = alive ? "UP" : "DOWN";
    const prev = lastStatus[dev.name] || "UNKNOWN";

    // jika status berubah, catat log
    if (prev !== newStatus) {
      const flagKey = sanitizeFlagKey(dev.name);

      if (newStatus === "DOWN") {
        // mulai downtime
        const since = dateTimeLocal();
        downSince[dev.name] = since;
        appendLogLine(`ALERT: ${dev.name} (${dev.ip}) -> DOWN (started at ${since})`);

        // set global flag true only when previously was UP
        if (prev === "UP") {
          updateGlobalFlag(flagKey, true);
        }

      } else if (newStatus === "UP") {
        // recover dari downtime � catat durasi jika ada
        const since = downSince[dev.name];
        const now = dateTimeLocal();
        let durText = "";
        if (since) {
          try {
            const s = since.replace(" ", "T");
            const e = now.replace(" ", "T");
            const d1 = new Date(s);
            const d2 = new Date(e);
            const diffMs = d2 - d1;
            const sec = Math.floor(diffMs / 1000);
            const hh = Math.floor(sec / 3600);
            const mm = Math.floor((sec % 3600) / 60);
            const ss = sec % 60;
            durText = ` (downtime: ${hh}h ${mm}m ${ss}s)`;
          } catch (err) {
            durText = "";
          }
        }
        appendLogLine(`INFO: ${dev.name} (${dev.ip}) -> UP at ${now}${durText}`);
        // clear downSince
        delete downSince[dev.name];

        // clear flag when recovered
        // updateGlobalFlag(flagKey, false);
      } else {
        appendLogLine(`INFO: ${dev.name} (${dev.ip}) -> ${newStatus}`);
      }
      // update lastStatus
      lastStatus[dev.name] = newStatus;
    }

    // update device object so UI prints current status
    dev.status = newStatus;
  });

  // save snapshot
  saveSnapshot({ lastStatus, downSince });
  // broadcast realtime update ke semua client
broadcast({
  type: "update",
  devices,
  lastStatus,
  downSince,
  timestamp: dateTimeLocal()
});


  // tampil tabel
  const widths = [20, 15, 8];
  console.log(line(widths));
  console.log(row(["DEVICE", "IP ADDRESS", "STATUS"], widths));
  console.log(line(widths));

  devices.forEach(d => {
    const s = d.status === "UP"
      ? `${color.green}${d.status}${color.reset}`
      : `${color.red}${d.status}${color.reset}`;

    console.log(row([d.name, d.ip, s], widths));

    // jika sedang DOWN, tampilkan sejak kapan di console (lebih detail)
    if (d.status === "DOWN" && downSince[d.name]) {
      console.log("  " + color.yellow + `down since: ${downSince[d.name]}` + color.reset);
    }
  });

  console.log(line(widths));
}

console.log("WebSocket running on port", WS_PORT);

wss.on("connection", (ws) => {
  console.log("Client connected");

  // kirim snapshot awal saat connect
  ws.send(JSON.stringify({
    type: "snapshot",
    devices,
    lastStatus,
    downSince
  }));

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

// fungsi broadcast
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// run interval
const INTERVAL_MS = 3000;
const timer = setInterval(checkAll, INTERVAL_MS);
checkAll();

// handle exit: simpan snapshot sebelum exit
function gracefulExit() {
  console.log("\nExiting... saving snapshot.");
  saveSnapshot({ lastStatus, downSince });
  // write flags to disk one last time
  writeGlobalFlagsToDisk();
  process.exit(0);
}
process.on("SIGINT", gracefulExit);
process.on("SIGTERM", gracefulExit);

