# Monitor Server (serverside)

Server Node yang nge-**ping** daftar device tiap 3 detik dan **broadcast** status UP/DOWN ke dashboard via **WebSocket**. Dijalankan di mesin/server tiap plant.

## Jalankan
Belum ada `package.json`, jadi pasang dependency dulu:
```bash
cd serverside
npm init -y
npm install ping ws
node index.js
# produksi: pm2 start index.js --name monitor
```

## Yang dilakukan
- Ping tiap device di `devices[]` tiap 3 detik (`INTERVAL_MS`).
- Broadcast `{ type, devices, lastStatus, downSince, timestamp }` ke semua client WebSocket.
- Catat perubahan status ke `logs/YYYY-MM-DD.log`.
- Simpan snapshot `logs/status_snapshot.json` (biar tahu sejak kapan DOWN walau server restart).
- Tulis flag ke `../shared/needrestart.json` saat device berubah UP → DOWN.

## Konfigurasi (`index.js`)
- `WS_PORT` — port WebSocket (saat ini **10012**).
- `devices[]` — `{ name, ip }` tiap device. **`name` harus cocok** dengan `id` kotak di dashboard (`index.html`) setelah karakter non-alfanumerik diubah jadi `_`. Contoh: `"DCS QI F4"` → kotak `id="DCS_QI_F4"`.

## ⚠️ Catatan
- **Port mismatch**: dashboard (`index.html`) connect ke `10011`, server ini listen `10012`. Samakan keduanya (`testing/index.js` pakai `10011`).
- Flag `needrestart` di-set `true` saat device DOWN tapi **tidak** otomatis di-clear saat UP lagi (baris clear-nya dikomentari di `index.js`).
- WebSocket terbuka tanpa autentikasi — aman hanya untuk jaringan internal.
