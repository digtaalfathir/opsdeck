#!/usr/bin/env bash
# Pasang autostart Stechoq Ops Center saat login (Linux — XDG autostart).
#
# Pakai:
#   bash install-autostart.sh "<perintah-jalankan-app>"
# Contoh:
#   bash install-autostart.sh /opt/StechoqOpsCenter.AppImage
#   bash install-autostart.sh "sh -c 'cd $HOME/StechoqOpsCenter && npm start'"
set -e

APP_EXEC="${1:-}"
if [ -z "$APP_EXEC" ]; then
  echo "Perintah jalankan app belum diisi."
  echo "Contoh (AppImage): bash install-autostart.sh /opt/StechoqOpsCenter.AppImage"
  echo "Contoh (dev)     : bash install-autostart.sh \"sh -c 'cd \$HOME/StechoqOpsCenter && npm start'\""
  exit 1
fi

DEST="$HOME/.config/autostart"
mkdir -p "$DEST"
cat > "$DEST/stechoq-ops-center.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Stechoq Ops Center
Comment=Hardware monitoring & remote (internal Stechoq)
Exec=$APP_EXEC
Icon=stechoq-ops-center
Terminal=false
X-GNOME-Autostart-enabled=true
EOF

echo "Autostart terpasang: $DEST/stechoq-ops-center.desktop"
echo "Exec = $APP_EXEC"
echo "Hapus autostart: rm \"$DEST/stechoq-ops-center.desktop\""
