# testing (sandbox)

Varian **uji** dari monitor server + halaman dashboard sederhana. **Bukan untuk produksi** — untuk coba-coba lokal.

- `index.js` — sama seperti [`../serverside`](../serverside/README.md), tapi `WS_PORT = 10011` dan device-nya cuma satu (`testing1`). Edit `devices[]` untuk uji.
- `testing.html` — dashboard grid sederhana (tanpa denah), connect ke `ws://<SERVER_IP>:10011`. Ganti konstanta `SERVER_IP` di dalam `<script>`.

## Jalankan
```bash
cd testing
npm install
node index.js
# lalu buka testing.html di browser
```
