# Dashboard v1 (dcsversion)

Aplikasi **Electron** fullscreen-kiosk untuk monitoring status hardware di atas denah pabrik. **Monitoring saja** — untuk fitur remote, lihat [`../dcsversion-v2`](../dcsversion-v2/README.md).

## Fitur
- Denah pabrik per plant; geser kiri/kanan (tombol panah di layar, keyboard ←/→, atau auto-slide tiap 10 detik).
- Tiap mesin = kotak status **UP** (hijau) / **DOWN** (merah berkedip).
- Konek ke beberapa monitor server sekaligus (1 per halaman, via `data-server`/`data-port`).
- Overlay **"SERVER DOWN"** kalau server suatu halaman putus.
- Modal detail mesin (deskripsi + gambar) saat kotak diklik.

## Jalankan
```bash
npm install
npm start
```
Butuh monitor server jalan dulu — lihat [`../serverside`](../serverside/README.md).

## Konfigurasi (semua di `index.html`)
- **Halaman/plant**: `<section class="page" data-server="10.10.1.210" data-port="10011" data-title="...">`.
- **Kotak mesin**: `<div id="DEVICE_ID" class="machine-box" style="top:..; left:..">`. `id` = nama device dari server, karakter non-alfanumerik → `_`.
- **Detail modal**: object `machineDetails` di dalam `<script>`.

## Kontrol
- `Ctrl + Q` — keluar aplikasi.
- Panah `←` / `→` — geser halaman.
- DevTools dinonaktifkan (mode kiosk).

## File
- `main.js` — proses utama Electron (window fullscreen, frameless).
- `preload.js` — expose `electronAPI.quitApp()`.
- `index.html` — UI + logika monitoring (WebSocket, slider, watcher, modal).
