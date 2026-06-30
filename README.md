# Stechoq Hardware Monitoring

Dashboard monitoring status hardware (DCS/IPC, IoT node, printer, nutrunner, dll) di beberapa plant, ditampilkan di atas denah pabrik. **v2** menambah kemampuan **remote** (VNC & SSH) langsung dari dashboard.

## Cara kerja (garis besar)

```
[ Device di pabrik ]  ◄── ping tiap 3s ──  [ Monitor Server (Node + WebSocket) ]
                                                     │  broadcast status UP/DOWN
                                                     ▼
                                           [ Dashboard Electron (kiosk) ]
                                           denah pabrik + titik status hijau/merah
                                           (v2: klik mesin → Remote VNC / SSH)
```

- **Monitor server** nge-ping daftar device tiap 3 detik, lalu broadcast UP/DOWN ke semua dashboard via WebSocket.
- **Dashboard** (Electron, fullscreen kiosk) nampilin tiap device sebagai kotak di atas gambar denah — hijau (UP) / merah (DOWN). Bisa geser antar halaman/plant.

## Struktur repo

| Path | Isi | Keterangan |
|---|---|---|
| `dcsversion/` | **Dashboard v1** (Electron) | Versi produksi — monitoring saja |
| `dcsversion-v2/` | **Dashboard v2** (Electron) | v1 + **Remote VNC & SSH** + Kelola Remote + tema gelap/terang |
| `serverside/` | **Monitor server** | Node WebSocket ping monitor |
| `shared/` | `needrestart.json` | File flag antar-proses dari server |
| `ide.txt` | Catatan ide | Rencana fitur (v3, dll) |

Tiap folder dashboard self-contained (punya gambar denah & mesin sendiri).

README detail per folder: [dcsversion](dcsversion/README.md) · [dcsversion-v2](dcsversion-v2/README.md) · [serverside](serverside/README.md)

## Quick start

1. **Monitor server** (di server plant):
   ```bash
   cd serverside
   npm init -y && npm install ping ws    # serverside belum punya package.json
   node index.js
   ```
2. **Dashboard** (di PC operator):
   ```bash
   cd dcsversion-v2      # atau dcsversion untuk v1
   npm install
   npm start
   ```

## Konfigurasi singkat

- **Daftar device** (yang di-ping): array `devices` di `serverside/index.js`.
- **Halaman & posisi kotak**: di `dcsversion-v2/index.html` (atau `dcsversion/index.html` untuk v1) — tiap `<section class="page" data-server="IP" data-port="PORT">` = 1 plant, tiap `.machine-box` = 1 device. `id` kotak **harus** = nama device yang disanitasi (`[^a-zA-Z0-9]` → `_`). Di v2 posisi kotak bisa diatur lewat **Edit Layout** (drag & simpan ke `layout.json`).
- **Remote (v2)**: per-mesin di `dcsversion-v2/remotes.json` atau lewat UI **Kelola Remote**.

## ⚠️ Catatan / known issues

- **Port server**: `serverside/index.js` pakai `10012`, tapi dashboard connect ke `10011`. Samakan port server dengan `data-port` di dashboard.
- Kotak `DCS_REPAIR_OUT_LINE_F4` di denah belum punya device sumber → selalu tampil DOWN.
- Flag `needrestart` di server tidak otomatis di-clear saat device pulih.
- `index.html` ada **2 salinan** (`dcsversion/`, `dcsversion-v2/`) — perubahan logika yang sama perlu disinkronkan ke keduanya.
