// build/make-icon.js — generate icon.png (1024x1024) tanpa dependency (pure Node).
// Logo Stechoq Ops Center: biru-putih, motif "radar/monitor" (titik + 2 cincin) —
// simpel & profesional. electron-builder otomatis bikin .ico/.icns dari file ini.
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const S = 1024;
const C = (S - 1) / 2;
const CORNER = 205;          // radius sudut membulat
const AA = 1.6;             // lebar anti-alias (px)

// palette biru → putih
const BLUE_TOP = [59, 130, 246];  // #3b82f6
const BLUE_BOT = [29, 64, 175];   // #1d40af
const WHITE = [255, 255, 255];

// geometri motif
const DOT = 95;             // titik tengah
const R1 = 205, R2 = 342;   // radius 2 cincin
const RING = 33;            // setengah tebal cincin

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const cov = (edge) => clamp01(edge / AA + 0.5);           // coverage AA dari jarak ke tepi
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function pixel(x, y) {
  // mask sudut membulat (transparan di luar)
  const cxm = Math.min(x, S - 1 - x), cym = Math.min(y, S - 1 - y);
  let maskA = 1;
  if (cxm < CORNER && cym < CORNER) {
    const d = Math.hypot(CORNER - cxm, CORNER - cym);
    maskA = cov(CORNER - d);
  }
  if (maskA <= 0) return [0, 0, 0, 0];

  // background gradient biru (diagonal, kiri-atas lebih terang)
  const t = clamp01((x + y) / (2 * S));
  const bg = lerp(BLUE_TOP, BLUE_BOT, t);

  // motif putih: titik + 2 cincin
  const d = Math.hypot(x - C, y - C);
  let w = cov(DOT - d);
  w = Math.max(w, cov(RING - Math.abs(d - R1)));
  w = Math.max(w, cov(RING - Math.abs(d - R2)));

  const col = lerp(bg, WHITE, w);
  return [Math.round(col[0]), Math.round(col[1]), Math.round(col[2]), Math.round(255 * maskA)];
}

// ---- encode PNG (RGBA) ----
const raw = Buffer.alloc((S * 4 + 1) * S);
let o = 0;
for (let y = 0; y < S; y++) {
  raw[o++] = 0;
  for (let x = 0; x < S; x++) {
    const c = pixel(x, y);
    raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2]; raw[o++] = c[3];
  }
}
const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
]);
fs.writeFileSync(path.join(__dirname, "icon.png"), png);
console.log("wrote build/icon.png", png.length, "bytes");
