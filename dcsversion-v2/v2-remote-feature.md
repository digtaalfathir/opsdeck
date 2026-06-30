---
name: v2-remote-feature
description: MonitoringHardware v2 adds one-click embedded VNC/SSH remote into the Electron monitoring app
metadata: 
  node_type: memory
  type: project
  originSessionId: 52f7378c-5ee1-4955-bcc8-f0908c626bb0
---

User wants v2 of the hardware monitoring app: from the kiosk UI, click a machine → remote into it (most monitored DCS are IPCs). Decided: **embedded noVNC** (in-app, not external RealVNC), **per-machine credentials** (with shared defaults), built in a **separate `dcsversion-v2/` folder** so existing `dcsversion/` is untouched.

Architecture (all inside Electron, no websockify): renderer noVNC (RFB over ws://127.0.0.1) → main-process WS↔TCP bridge → x11vnc on the IPC. Main process SSHes in (ssh2), runs x11vnc, then the bridge does a direct `net.connect` to host:5900 (matches their current RealVNC-direct workflow; SSH-tunnel hardening deferred to Fase 4).

SSH access pattern: user `stechoq`, port `65432`, shared VNC-less x11vnc (`x11vnc` plain, no password). Per-machine host overrides live in `dcsversion-v2/remotes.json` (git-ignored, holds the password — never commit, never put password in memory). Remote button only shows for machine ids configured in remotes.json.

**Status (2026-06-30): Fase 1+2 done.** Fase 1 (embedded VNC) tested working on a real DCS by the user (close returns to monitoring correctly). Fase 2 added `remote/secure-config.js` (safeStorage-encrypted passwords as `passwordEnc`, plaintext `password` still supported as fallback) + "Kelola Remote" UI (header dropdown → modal to add/edit/delete per-machine creds + defaults; Remote button shows only for configured ids) + IPC `remote:get-config`/`save-config`. Config load/merge logic unit-tested (18 checks, electron-absent fallback path). Fase 3 added `remote/ssh-shell.js` (ssh2 PTY shell) + xterm.js terminal (@xterm/xterm + @xterm/addon-fit UMD via `<script>`, streamed over IPC not ws — terminal data is low-bandwidth) + "⌨️ SSH Terminal" button in modal + `#sshPanel`. Auto-slide already pauses on any remote open (stopAutoSlide). Fase 4 done: x11vnc now runs `-localhost` and VNC is pulled through an SSH tunnel (ssh2 `forwardOut` → `connectTunnel` in ssh-session.js; ws-bridge now takes a `connectStream` factory instead of `net.connect`; main `preflightTunnel`s once-with-retry to detect AllowTcpForwarding=no early). Ctrl+Q is unregistered while a remote panel is open (renderer `setRemoteActive` → main `remote:active`) so it can't accidentally quit and passes through to the terminal. **All 4 planned phases complete.** NEW runtime dependency after Fase 4: remote sshd must have AllowTcpForwarding=yes (default) — user should re-verify VNC still appears since the manual flow used a direct connection. Possible future work (from ide.txt): daily report bot, network discovery, log aggregator, fleet/PM2 dashboard.

Caveat to verify: F4 monitoring box→IP mapping in remotes.json (DCS_MIXING_MATERIAL_F4→.202, DCS_QI_F4→.212, DCS_POLES_F4→.203, DCS_REPAIR_IN_LINE_F4→.205) was guessed from the user's SSH script (Karawang) — user must confirm before remoting to avoid controlling the wrong machine.
