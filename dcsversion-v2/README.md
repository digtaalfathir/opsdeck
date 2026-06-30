# Dashboard v2 (dcsversion-v2)

Semua fitur [v1](../dcsversion/README.md) **+ remote langsung dari dashboard**:
- 🖥️ **Remote Desktop (VNC)** embedded — klik mesin → desktop muncul di dalam app (noVNC).
- ⌨️ **SSH Terminal** embedded — terminal interaktif di dalam app (xterm.js).
- ⚙️ **Kelola Remote** — UI atur kredensial per-mesin; password disimpan terenkripsi.

> Versi lama (`../dcsversion`) tidak diubah — v2 ini folder terpisah.

## Cara kerja remote

VNC **tidak** membuka port ke jaringan — semua lewat **SSH tunnel** yang terenkripsi:

```
noVNC (canvas)       ──ws://127.0.0.1──►  [WS bridge]  ──SSH tunnel──►  x11vnc -localhost :0  (di mesin)
SSH terminal (xterm) ──IPC──►  ssh2 PTY shell  ──────────────────────►  shell  (di mesin)
```

Sekali klik **VNC**: app SSH ke mesin → jalankan `x11vnc -localhost` → tarik via tunnel → render di app. Saat ditutup, x11vnc dimatikan.

## Setup
```bash
npm install
npm start
```
Lalu isi kredensial: buka app → klik judul header → **Kelola Remote**, atau edit `remotes.json` langsung.

## `remotes.json` (sudah gitignored — jangan commit)
```json
{
  "defaults": { "port": 65432, "username": "stechoq", "password": "xxxxx", "vncDisplay": ":0", "vncPort": 5900 },
  "machines": {
    "DCS_QI_F4":    { "host": "10.10.1.181" },
    "DCS_POLES_F4": { "host": "10.10.1.203" }
  }
}
```
- `defaults` berlaku ke semua mesin; `machines.<id>` override per-mesin (`id` = id kotak di `index.html`).
- Password yang diisi lewat UI disimpan terenkripsi (`passwordEnc`, via Electron `safeStorage`/keyring OS). `password` plaintext tetap didukung sebagai fallback.
- Tombol Remote **hanya muncul** untuk mesin yang terdaftar di `machines`, dan otomatis **disabled** kalau status mesin sedang DOWN.

## Syarat di mesin remote (DCS/IPC)
- `x11vnc` terinstall, ada X display (default `:0`).
- SSH aktif, dan **`AllowTcpForwarding yes`** (default OpenSSH) — wajib untuk tunnel VNC.

## Kontrol
- `Ctrl + Q` — keluar (otomatis dinonaktifkan selama panel remote terbuka, jadi tidak ke-quit tak sengaja & bisa diteruskan ke terminal).
- `Ctrl + Shift + I` — DevTools (debug).
- Panah `←` / `→` — geser halaman (nonaktif saat panel/modal terbuka atau saat mengetik).

## Struktur
```
main.js              proses utama + IPC remote/ssh + toggle Ctrl+Q
preload.js           electronAPI: remote.*, ssh.*, setRemoteActive
index.html           UI (denah + panel VNC + panel SSH + modal Kelola Remote)
remote/
  ssh-session.js     SSH + jalankan x11vnc -localhost + connectTunnel (forwardOut)
  ws-bridge.js       jembatan WebSocket ⇄ tunnel (pengganti websockify)
  ssh-shell.js       shell SSH interaktif (PTY) untuk terminal
  secure-config.js   load/save remotes.json + enkripsi password
remotes.json         kredensial (gitignored)
```

## Dependency
`electron`, `ssh2`, `ws`, `@novnc/novnc`, `@xterm/xterm`, `@xterm/addon-fit`.

## Troubleshooting
- **VNC blank / "Terputus"** → buka DevTools (`Ctrl+Shift+I`), cek Console.
- **"Gagal buka tunnel VNC (cek AllowTcpForwarding…)"** → set `AllowTcpForwarding yes` di `/etc/ssh/sshd_config` mesin, lalu restart sshd.
- **x11vnc error display** → override command per-mesin via `x11vncCmd` di `remotes.json` (mis. display bukan `:0`).
- **Tombol Remote disabled** → mesin terbaca DOWN di monitoring; pastikan device UP dan nama device ↔ id kotak cocok.
