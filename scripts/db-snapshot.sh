#!/usr/bin/env bash
# RaziOne Eye — snapshot the live database from this machine (no local Postgres needed).
#
# Runs pg_dump *inside* the db container on RaziOneGCPExperimental, writing into the
# `razione-eye-pgbackups` volume (same place the app's own backups go, newest 30 kept),
# then optionally copies the dump down here.
#
#   bash scripts/db-snapshot.sh              # snapshot only (stays on the server)
#   bash scripts/db-snapshot.sh --download   # also copy it to ./server/data/backups/
#   bash scripts/db-snapshot.sh --list       # list snapshots in the volume
set -Eeuo pipefail

SSH_HOST="${RAZIONE_EYE_SSH_HOST:-RaziOneGCPExperimental}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="${RAZIONE_EYE_SNAPSHOT_DIR:-$REPO_DIR/server/data/backups}"
MODE="${1:-}"

remote() { ssh -o BatchMode=yes -o ConnectTimeout=20 "$SSH_HOST" "$@"; }

case "$MODE" in
  --list)
    remote 'docker exec razione-eye-db sh -lc "ls -lht /backups/*.dump 2>/dev/null | head -20 || echo \"(no snapshots yet)\""'
    exit 0
    ;;
esac

NAME="$(date -u +%Y%m%d-%H%M%S)"
DUMP="/backups/manual-$NAME.dump"

echo "[db-snapshot] pg_dump -> container razione-eye-db:$DUMP"
remote "docker exec razione-eye-db sh -lc 'pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --format=custom -f $DUMP'"
remote 'docker exec razione-eye-db sh -lc "ls -1t /backups/*.dump 2>/dev/null | tail -n +31 | xargs -r rm -f"'
remote "docker exec razione-eye-db sh -lc 'ls -lh $DUMP'"

if [ "$MODE" = "--download" ]; then
  mkdir -p "$DEST_DIR"
  echo "[db-snapshot] copying down to $DEST_DIR/"
  remote "docker exec razione-eye-db cat $DUMP" > "$DEST_DIR/$(basename "$DUMP")"
  echo "[db-snapshot] local copy: $DEST_DIR/$(basename "$DUMP")"
fi

echo "[db-snapshot] restore (if you ever need it):"
echo "  docker compose stop backend"
echo "  docker exec -i razione-eye-db pg_restore --clean --if-exists -U razione -d razione_eye < $DUMP"
echo "  docker compose start backend"
