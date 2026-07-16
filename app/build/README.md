# Build resources — Opsdeck

Folder ini dipakai `electron-builder` sebagai `buildResources` (tidak ikut ter-bundle ke dalam aplikasi).

## Icon
- **`icon.png`** (1024×1024) = sumber icon. electron-builder otomatis membuat:
  - `.ico` untuk Windows (installer + exe)
  - `.icns` untuk macOS
  - resolusi PNG untuk Linux
- Saat ini `icon.png` masih **placeholder** (dihasilkan `make-icon.js`). Ganti dengan logo asli sebelum rilis.

### Cara bikin icon dari logo asli
1. Siapkan PNG persegi min **1024×1024** (transparan lebih baik).
2. Timpa `build/icon.png` dengan file itu.
3. (Opsional, hasil lebih tajam) buat `.ico`/`.icns` sendiri pakai:
   ```bash
   npm i -g electron-icon-builder
   electron-icon-builder --input=build/icon.png --output=build --flatten
   ```
   Lalu taruh `icon.ico` / `icon.icns` di `build/`.
- Regenerate placeholder: `npm run make:icon`
- `logo.svg` = logo starter (vektor) — serahkan ke desainer untuk logo final.

## Aset branding lain (opsional, taruh di sini bila dipakai)
- `installerIcon.ico`, `installerHeaderIcon.ico` — icon NSIS installer
- `background.png` — background installer/DMG
