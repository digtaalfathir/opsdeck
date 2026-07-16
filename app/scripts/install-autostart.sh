#!/usr/bin/env bash
# Pasang autostart Opsdeck saat login (Linux — XDG autostart).
#
# Pakai:
#   bash install-autostart.sh "<perintah-jalankan-app>"
# Contoh:
#   bash install-autostart.sh /opt/Opsdeck.AppImage
#   bash install-autostart.sh "sh -c 'cd $HOME/Opsdeck && npm start'"
set -e

APP_EXEC="${1:-}"
if [ -z "$APP_EXEC" ]; then
  echo "Perintah jalankan app belum diisi."
  echo "Contoh (AppImage): bash install-autostart.sh /opt/Opsdeck.AppImage"
  echo "Contoh (dev)     : bash install-autostart.sh \"sh -c 'cd \$HOME/Opsdeck && npm start'\""
  exit 1
fi

DEST="$HOME/.config/autostart"
mkdir -p "$DEST"
cat > "$DEST/opsdeck.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Opsdeck
Comment=Hardware monitoring & remote (internal)
Exec=$APP_EXEC
Icon=opsdeck
Terminal=false
X-GNOME-Autostart-enabled=true
EOF

echo "Autostart terpasang: $DEST/opsdeck.desktop"
echo "Exec = $APP_EXEC"
echo "Hapus autostart: rm \"$DEST/opsdeck.desktop\""
