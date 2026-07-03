# Stechoq Ops Center — Deployment & Distribution Guide

Panduan menyiapkan, mem-*package*, dan mendistribusikan **Stechoq Ops Center** (Electron) untuk Windows, Linux, dan macOS di lingkungan internal Stechoq (via VPN).

- **Product name:** Stechoq Ops Center
- **App id:** `com.stechoq.opscenter`
- **Company:** Stechoq · **License:** Internal use only
- Target: **1) Windows (utama) · 2) Linux · 3) macOS**

---

## 1. Build & Packaging (electron-builder)

Sekali pasang dependency:

```bash
cd dcsversion-v2
npm install            # termasuk electron-builder (devDependency)
npm run make:icon      # bikin build/icon.png placeholder (skip kalau sudah ada logo asli)
```

Build:

```bash
npm run dist:win       # Windows  -> dist/StechoqOpsCenter-Setup-<versi>.exe (installer NSIS)
npm run dist:linux     # Linux    -> dist/StechoqOpsCenter-<versi>.AppImage + .deb
npm run dist:mac       # macOS    -> dist/*.dmg  (harus di-build di macOS)
npm run pack           # build cepat tanpa installer (folder dist/*-unpacked) untuk tes
```

Hasil installer: **fresh Windows → install `.exe` → langsung jalan.** Semua dependency (Electron + Node runtime + ssh2/ws/noVNC/xterm) sudah dibundle. **Tidak perlu Node/npm** di mesin user.

### Prasyarat build
- **Build di OS target** = paling mulus (Windows di Windows, dst).
- Bikin `.exe` dari Linux **bisa** tapi butuh `wine`; lebih aman build Windows di mesin Windows.
- macOS `.dmg` **wajib** di-build di macOS (butuh toolchain Apple).
- Butuh internet saat build pertama (electron-builder unduh Electron + tooling).

### Build `.exe` dari Linux (Zorin/Ubuntu) — Wine atau Docker

Zorin berbasis Ubuntu, jadi bisa produksi installer Windows dari sini. **`.exe` hasilnya tetap jalan di semua PC Windows** (build sekali, sebar ke semua user).

**Cara A — Docker (paling andal, tanpa oprek Wine di host):**
```bash
cd dcsversion-v2
docker run --rm -ti -v "$PWD":/project -w /project \
  electronuserland/builder:wine \
  /bin/bash -c "npm install && npm run dist:win"
# hasil: dist/StechoqOpsCenter-Setup-2.0.0.exe
```
Image itu sudah berisi Wine + tooling yang cocok — paling minim masalah.

**Cara B — Wine native di Zorin:**
```bash
sudo dpkg --add-architecture i386
sudo apt update
sudo apt install -y wine64 wine32
wine --version            # sekaligus init prefix Wine pertama kali

cd dcsversion-v2
npm install
npm run make:icon         # atau taruh logo asli di build/icon.png
npm run dist:win          # electron-builder pakai Wine utk rcedit (icon+metadata exe) + NSIS
```
Kalau macet di langkah `rcedit`/NSIS: jalankan `wineboot -u` sekali lalu ulangi, atau pindah ke **Cara A (Docker)**.

> Catatan: **code signing** paling gampang di Windows/CI. Lewat Wine bisa tapi ribet — untuk internal (via VPN) umumnya installer tanpa sign sudah cukup (user tinggal "Run anyway" di SmartScreen sekali).

### Catatan `asar`
Saat ini `asar: false` (paling aman karena renderer me-*load* `node_modules/@novnc` & `@xterm` via `file://`). Kalau mau `asar: true` untuk startup lebih cepat, tambahkan:
```json
"asar": true,
"asarUnpack": ["node_modules/@novnc/**", "node_modules/@xterm/**"]
```

---

## 2. Branding & Metadata

Sudah diset di `package.json` (`productName`, `author`, `copyright`, `build.appId`, dll). Yang perlu kamu lengkapi:

| Item | Lokasi | Status |
|---|---|---|
| **Product Name** | `Stechoq Ops Center` | ✅ |
| **Company** | `Stechoq` | ✅ |
| **Version** | `package.json` → `version` (SemVer, mis. `2.0.0`) | ✅ (naikkan tiap rilis) |
| **Copyright** | `package.json` → `copyright` | ✅ |
| **App icon** | `build/icon.png` (1024²) → auto jadi .ico/.icns | ⚠️ **placeholder**, ganti logo asli |
| **Installer icon / shortcut** | dari `build/icon.png` (NSIS) | ✅ otomatis |
| **Splash / Loading** | `startup.html` (startup screen + cek VPN) | ✅ |
| **About dialog** | (opsional) tambah menu About yang baca `app.getVersion()` | ➖ nanti |
| **Logo vektor** | `build/logo.svg` (starter) | ⚠️ serahkan ke desainer |

**Versioning:** pakai SemVer `MAJOR.MINOR.PATCH`. Naikkan `version` di `package.json` sebelum tiap build rilis — dipakai nama installer & (nanti) auto-update.

---

## 3. Deteksi VPN — metode & rekomendasi

App **tidak** menyambungkan VPN (itu tetap manual pakai app VPN perusahaan). App hanya **mengecek** apakah user sudah di jaringan VPN sebelum dipakai.

| Metode | Cara | Kelebihan | Kekurangan |
|---|---|---|---|
| Nama interface (`vpn_vpn`) | cek nama NIC | simpel | nama beda per OS/driver, gampang berubah, **tidak** bukti konektif |
| **IP di subnet VPN** | `os.networkInterfaces()` cek IP ∈ `10.10.0.0/23` | cepat, tanpa network call, bukti "dapat IP VPN" | tak bukti reachable; subnet bisa bentrok |
| Cek route | baca routing table | akurat soal jalur | parsing per-OS, ribet, rapuh |
| Ping host internal | ICMP ping | bukti reachable | ICMP sering diblok, butuh privilege, lambat |
| **TCP connect host:port internal** | `net.connect` ke service internal | bukti reachable ke service nyata, tanpa privilege | perlu host:port yang pasti hidup |
| API internal (HTTP) | fetch endpoint internal | bukti sampai layer aplikasi | butuh API + auth |

**Rekomendasi (dipakai di [`vpn-check.js`](vpn-check.js)):** kombinasi **IP subnet VPN** + **TCP probe** ke host internal.
1. Cek ada IPv4 di `VPN_SUBNETS` (`10.10.0.0/23`) → penanda utama "connected".
2. TCP connect singkat ke `INTERNAL_PROBES` (mis. `10.10.1.210:10011`) → konfirmasi `reachable`.

App menganggap **connected = punya IP VPN** (tidak keras mensyaratkan probe, biar tidak *false-negative* kalau satu host internal kebetulan down). Ubah subnet/probe di bagian atas `vpn-check.js`. Lebih andal daripada mengandalkan nama `vpn_vpn` saja, dan portable ke Windows/Linux/macOS.

---

## 4. Startup Experience

- App load **`startup.html`** dulu (bukan langsung dashboard).
- **VPN belum aktif:** tampil peringatan + tombol **Periksa Lagi**.
- **VPN aktif:** tampil ✓ + IP VPN → "Memulai Stechoq Ops Center…" → otomatis masuk dashboard (`app:enter` → load `index.html`).
- **VPN putus di tengah pakai:** main process memantau tiap 15 dtk (`startVpnWatch`) dan kirim `vpn:status`; dashboard menampilkan **overlay "VPN Stechoq terputus"**, hilang otomatis begitu VPN balik.

---

## 5. Lokasi File per-OS

App menulis data user (bukan di folder install yang read-only) ke **`userData`**:

| Data | Windows | Linux | macOS |
|---|---|---|---|
| Base `userData` | `%APPDATA%\Stechoq Ops Center` | `~/.config/Stechoq Ops Center` | `~/Library/Application Support/Stechoq Ops Center` |
| Kredensial remote | `userData\remotes.json` | sda | sda |
| Layout kotak | `userData\layout.json` | sda | sda |
| Cache | `userData\Cache`, `GPUCache` (otomatis Electron) | sda | sda |
| Logs | `userData\logs\` (bila logging diaktifkan) | sda | sda |
| Temp | OS temp (`os.tmpdir()`) | sda | sda |

> Di **dev** (`npm start`), `remotes.json`/`layout.json` tetap di folder app. Di **build ter-package** otomatis pindah ke `userData` (folder app read-only). `remotes.json` **tidak** ikut dibundle ke installer — tiap instalasi mengatur kredensialnya sendiri lewat **Kelola Remote**.

Belum ada database lokal; kalau nanti perlu, taruh di `userData` juga.

---

## 6. Auto-Update

| Opsi | Cocok untuk | Catatan |
|---|---|---|
| **Manual (installer replacement)** | fleet kecil, mulai cepat | bagikan `.exe` baru via share/email; user install ulang |
| **electron-updater + server internal** | fleet menengah, internal LAN | provider `generic` → HTTP statis internal (nginx) berisi installer + `latest.yml` |
| **Network share** | ada file server | provider `generic` pakai path share |
| **GitHub Releases (private)** | kalau pakai GitHub | butuh token; kurang pas kalau full-internal/offline |

**Rekomendasi:** mulai **Manual** (paling simpel, langsung jalan). Saat fleet bertambah, naik ke **electron-updater + server statis internal**:
- host `dist/` di HTTP internal (mis. `http://update.internal/opscenter/`),
- `build.publish = { provider: "generic", url: "http://update.internal/opscenter/" }`,
- app cek `latest.yml` saat start → notifikasi "Update tersedia".

Karena app **internal-only via VPN**, update server cukup di dalam VPN. Jangan auto-update paksa saat jam operasi — kasih tombol/menu "Update sekarang".

---

## 7. Keamanan & Ketahanan Koneksi

- **Validasi VPN:** gate di startup (Bagian 4). App tidak masuk dashboard tanpa VPN.
- **Timeout koneksi:** probe VPN 1.5 dtk; SSH `readyTimeout` 20 dtk; WS reconnect 3 dtk (sudah ada).
- **Reconnect:** WebSocket monitoring auto-reconnect; VPN watchdog re-cek tiap 15 dtk → overlay hilang sendiri saat pulih.
- **VPN putus saat jalan:** overlay peringatan + monitoring otomatis "SERVER DOWN"; sesi remote (VNC/SSH) akan terputus dan bisa dibuka ulang setelah VPN balik.
- **Retry:** startup punya **Periksa Lagi**; watchdog retry otomatis.
- **Kredensial:** `remotes.json` di `userData`, password di-enkripsi via OS keyring (`safeStorage`) bila tersedia, dan **tidak** ikut ke installer.
- **Electron hardening:** `contextIsolation: true`, tanpa `nodeIntegration` di renderer, `preload` sebagai jembatan IPC (sudah diterapkan).

---

## 8. Autostart & Service (Linux)

**Autostart saat login (XDG):**
```bash
bash scripts/install-autostart.sh /opt/StechoqOpsCenter.AppImage
# atau dev: bash scripts/install-autostart.sh "sh -c 'cd $HOME/dcsversion-v2 && npm start'"
```
**Sebagai service (opsional, auto-restart bila crash):** lihat [`scripts/stechoq-ops-center.service`](scripts/stechoq-ops-center.service) (systemd user unit).

Windows: shortcut Startup / Task Scheduler (installer sudah bikin shortcut Desktop & Start Menu).

---

## 9. Release Checklist

- [ ] **Versioning** — naikkan `version` (SemVer) di `package.json`
- [ ] **Branding** — `build/icon.png` = logo asli (bukan placeholder)
- [ ] **Build** — `npm run dist:win` (+ linux) sukses, tanpa error icon/asar
- [ ] **Metadata** — productName/company/copyright benar di installer & Properties exe
- [ ] **Testing** — install di Windows *fresh* (tanpa Node): startup VPN gate, monitoring live, VNC (x11vnc/direct/external), SSH, Kelola Remote, Edit Layout, tema
- [ ] **VPN** — tes: VPN off → gate menahan; VPN on → masuk; putus di tengah → overlay
- [ ] **Config location** — `remotes.json`/`layout.json` tersimpan di `userData` (bukan folder install)
- [ ] **Code signing** (opsional, hilangkan warning SmartScreen) — sertifikat code-signing Windows (`win.certificateFile` + `certificatePassword`/env)
- [ ] **Logging & error** — aktifkan log ke `userData/logs` bila perlu audit
- [ ] **Backup config** — dokumentasikan cara backup/restore `remotes.json`
- [ ] **Distribution** — taruh installer di share/HTTP internal + catat changelog
- [ ] **Update strategy** — manual sekarang; siapkan server update internal bila fleet tumbuh

---

## 10. Best Practice (Electron enterprise internal)

- **Performa:** kompres aset (denah sudah), hindari kerja berat di main thread, matikan DevTools di produksi (biarkan shortcut manual saja).
- **Keamanan:** `contextIsolation` on, `nodeIntegration` off, validasi input IPC, jangan bundle kredensial, batasi remote ke jaringan VPN.
- **Maintainability:** pisah modul (`remote/`, `vpn-check.js`), config di `userData`, hindari duplikasi (dulu ada 3 `index.html` → sekarang v2 fokus).
- **Deployment:** installer 1-klik, autostart tersedia, path data di `userData`.
- **UX:** startup gate jelas, status LIVE + last-update, indikator halaman, mode gelap/terang, pesan error yang actionable.
- **Struktur scalable:**
  ```
  dcsversion-v2/
  ├── main.js            proses utama (window, IPC, VPN gate)
  ├── preload.js         jembatan contextBridge
  ├── startup.html       startup / VPN gate
  ├── index.html         dashboard
  ├── vpn-check.js       deteksi VPN
  ├── remote/            ssh-session · ws-bridge · ssh-shell · secure-config
  ├── build/             icon & resource build (buildResources)
  ├── scripts/           autostart Linux
  ├── remotes.json       kredensial (dev; produksi → userData, gitignored)
  └── dist/              output installer (electron-builder)
  ```

---

## Ringkas: dari nol ke installer

```bash
cd dcsversion-v2
npm install
npm run make:icon                 # atau ganti build/icon.png dgn logo asli
npm run dist:win                  # -> dist/StechoqOpsCenter-Setup-2.0.0.exe
# distribusikan .exe ke user Windows → install → jalan (butuh VPN aktif)
```
