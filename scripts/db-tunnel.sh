#!/usr/bin/env bash
# RaziOne Eye — local dev DB tunnel.
#
# Forwards 127.0.0.1:5432 on this machine to the live Postgres on
# RaziOneGCPExperimental (RaziOneGCPExperimental only publishes 5432 on its own
# loopback, so an SSH tunnel is the supported way in — nothing is exposed publicly).
#
# Managed as a systemd *user* unit (linger is enabled, so it also comes back
# after a reboot even when no shell is open):
#   razione-eye-db-tunnel.service
#
# Usage: bash scripts/db-tunnel.sh {install|uninstall|start|stop|restart|status|check|logs}
set -Eeuo pipefail

SSH_HOST="${RAZIONE_EYE_SSH_HOST:-RaziOneGCPExperimental}"
LOCAL_PORT="${RAZIONE_EYE_DB_PORT:-5432}"
REMOTE_PORT="${RAZIONE_EYE_DB_REMOTE_PORT:-5432}"
UNIT="razione-eye-db-tunnel.service"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT_PATH="$UNIT_DIR/$UNIT"
SSH_BIN="${SSH_BIN:-/usr/bin/ssh}"

log() { printf '[db-tunnel] %s\n' "$*"; }
die() { printf '[db-tunnel] ERROR: %s\n' "$*" >&2; exit 1; }

unit_body() {
  cat <<EOF
[Unit]
Description=RaziOne Eye — SSH tunnel to $SSH_HOST Postgres (127.0.0.1:$LOCAL_PORT)
Documentation=file://$HOME/Projects/OtherProj/razione-eye/docs/08-local-dev-and-deploy.md
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
# -NT: no shell, no command. ExitOnForwardFailure: fail loudly if :$LOCAL_PORT is taken.
ExecStart=$SSH_BIN -NT \\
  -o BatchMode=yes \\
  -o ExitOnForwardFailure=yes \\
  -o ServerAliveInterval=30 \\
  -o ServerAliveCountMax=3 \\
  -o ConnectTimeout=20 \\
  -L 127.0.0.1:$LOCAL_PORT:127.0.0.1:$REMOTE_PORT \\
  $SSH_HOST
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
}

require_systemd() {
  command -v systemctl >/dev/null || die "systemctl not found"
  systemctl --user is-system-running >/dev/null 2>&1 || true
  [ -n "${XDG_RUNTIME_DIR:-}" ] || die "no XDG_RUNTIME_DIR — not a user systemd session"
}

cmd_install() {
  require_systemd
  mkdir -p "$UNIT_DIR"
  unit_body > "$UNIT_PATH"
  systemctl --user daemon-reload
  systemctl --user enable --now "$UNIT"
  log "installed + started $UNIT"
  cmd_check
}

cmd_uninstall() {
  systemctl --user disable --now "$UNIT" 2>/dev/null || true
  rm -f "$UNIT_PATH"
  systemctl --user daemon-reload
  log "removed $UNIT"
}

cmd_start()   { systemctl --user start "$UNIT"; log "started"; cmd_check; }
cmd_stop()    { systemctl --user stop "$UNIT"; log "stopped"; }
cmd_restart() { systemctl --user restart "$UNIT"; sleep 1; cmd_check; }
cmd_status()  { systemctl --user status "$UNIT" --no-pager || true; }
cmd_logs()    { journalctl --user -u "$UNIT" -n 50 --no-pager; }

# TCP reachability check without needing psql/nc on this machine.
cmd_check() {
  if timeout 5 bash -c "</dev/tcp/127.0.0.1/$LOCAL_PORT" 2>/dev/null; then
    log "127.0.0.1:$LOCAL_PORT reachable (tunnel up -> $SSH_HOST:$REMOTE_PORT)"
  else
    log "127.0.0.1:$LOCAL_PORT NOT reachable — run: bash scripts/db-tunnel.sh start, then status"
    return 1
  fi
}

case "${1:-status}" in
  install)   cmd_install ;;
  uninstall) cmd_uninstall ;;
  start)     cmd_start ;;
  stop)      cmd_stop ;;
  restart)   cmd_restart ;;
  status)    cmd_status ;;
  check)     cmd_check ;;
  logs)      cmd_logs ;;
  *) echo "usage: $0 {install|uninstall|start|stop|restart|status|check|logs}" >&2; exit 2 ;;
esac
