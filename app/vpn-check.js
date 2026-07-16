// vpn-check.js — deteksi apakah PC ini sudah berada di jaringan VPN internal.
//
// Pendekatan gabungan (paling reliable untuk enterprise):
//   1) Cek apakah ada IPv4 interface yang berada di SUBNET VPN (mis. 10.10.0.0/23).
//      → cepat, tanpa panggilan jaringan; bukti "sudah dapat IP dari VPN".
//   2) Konfirmasi reachability: TCP connect singkat ke salah satu host internal.
//      → bukti koneksi VPN benar-benar jalan (bukan cuma dapat IP).
// Aplikasi menganggap "connected" bila (1) terpenuhi; (2) dilaporkan sbg `reachable`
// (info tambahan) supaya app tidak gagal hanya karena satu host internal lagi down.

const os = require("os");
const net = require("net");

// ------- Konfigurasi jaringan (sesuaikan bila subnet/host berubah) -------
const VPN_SUBNETS = ["10.10.0.0/23"]; // VPN memberi IP 10.10.x.x (contoh: inet 10.10.1.252/23)
const INTERNAL_PROBES = [
  { host: "10.10.1.210", port: 10011 }, // server monitoring (Sugity) — penanda jaringan internal
];
const PROBE_TIMEOUT = 1500;

function ipToInt(ip) {
  return ip.split(".").reduce((a, o) => ((a << 8) + (parseInt(o, 10) & 255)) >>> 0, 0);
}
function inCidr(ip, cidr) {
  const [base, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr, 10);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(base) & mask);
}

// IPv4 non-loopback yang berada di salah satu subnet VPN.
function findVpnIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const a of ifaces[name] || []) {
      if (a.family === "IPv4" && !a.internal) {
        for (const cidr of VPN_SUBNETS) {
          if (inCidr(a.address, cidr)) return { ip: a.address, iface: name };
        }
      }
    }
  }
  return null;
}

function probe({ host, port }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => { if (done) return; done = true; try { sock.destroy(); } catch (_) {} resolve(ok); };
    const sock = net.connect({ host, port });
    sock.setTimeout(PROBE_TIMEOUT);
    sock.on("connect", () => finish(true));
    sock.on("timeout", () => finish(false));
    sock.on("error", () => finish(false));
  });
}

// { connected, ip, iface, reachable }
async function checkVpn() {
  const vpn = findVpnIp();
  if (!vpn) return { connected: false, reason: "no-vpn-ip" };
  let reachable = false;
  for (const p of INTERNAL_PROBES) {
    if (await probe(p)) { reachable = true; break; }
  }
  return { connected: true, ip: vpn.ip, iface: vpn.iface, reachable };
}

module.exports = { checkVpn, findVpnIp };
