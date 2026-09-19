#!/usr/bin/env bash
# RaziOne Eye — server-side deploy. Runs ON RaziOneGCPExperimental, from the repo.
#
# Entry points:
#   - ~/deploy-razione-eye.sh  (forced command for the GitHub Actions deploy key)
#   - by hand:  bash ~/razione-eye/scripts/server-deploy.sh
#
# What it does, in order:
#   1. pg_dump the live DB into the `pgbackups` volume (pre-migration safety net)
#   2. docker compose up -d --build --remove-orphans  (pgdata volume is untouched)
#   3. wait for /api/health to answer through the frontend container
#   4. prune dangling images, print container status
#
# The backend applies server/src/schema.sql on boot (see src/db.ts initDb()), so a
# deploy that changes schema.sql migrates the live database. Step 1 is why.
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
log() { printf '[deploy %s] %s\n' "$STAMP" "$*"; }
die() { log "FAILED: $*"; exit 1; }

ENV_FILE="$APP_DIR/.env"
[ -f "$ENV_FILE" ] || die ".env missing at $ENV_FILE (copy .env.example and fill it)"

# FRONTEND_PORT is like "127.0.0.1:8082" in prod; the frontend nginx proxies /api/.
FRONTEND_PORT="$(sed -n 's/^FRONTEND_PORT=//p' "$ENV_FILE" | tail -1)"
FRONTEND_PORT="${FRONTEND_PORT:-127.0.0.1:8080}"
HEALTH_URL="http://${FRONTEND_PORT}/api/health"

# ── 1. Pre-deploy snapshot ────────────────────────────────────────────────────
if docker ps --format '{{.Names}}' | grep -qx razione-eye-db; then
  DUMP="/backups/predeploy-$(date -u +%Y%m%d-%H%M%S).dump"
  if docker exec razione-eye-db sh -lc "pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --format=custom -f $DUMP"; then
    log "db snapshot written: $DUMP"
    # Keep the newest 30 snapshots in the pgbackups volume.
    docker exec razione-eye-db sh -lc 'ls -1t /backups/*.dump 2>/dev/null | tail -n +31 | xargs -r rm -f' || true
  else
    log "WARNING: pre-deploy pg_dump failed — continuing (previous snapshots still in razione-eye-pgbackups)"
  fi
else
  log "db container not running — skipping pre-deploy snapshot (cold start?)"
fi

# ── 2. Rebuild + restart ─────────────────────────────────────────────────────
log "rebuilding from HEAD $(git rev-parse --short HEAD) ($(git log -1 --pretty=%s))"
docker compose up -d --build --remove-orphans || die "docker compose up failed"

# ── 3. Health gate ───────────────────────────────────────────────────────────
log "waiting for $HEALTH_URL"
healthy=0
for i in $(seq 1 45); do
  if body="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null)"; then
    log "health OK after ${i} attempt(s): $body"
    healthy=1
    break
  fi
  sleep 4
done
if [ "$healthy" != 1 ]; then
  docker compose logs --tail=80 backend || true
  die "health check never passed — stack left as-is for inspection"
fi

# ── 4. Housekeeping + summary ────────────────────────────────────────────────
docker image prune -f >/dev/null 2>&1 || true
log "containers:"
docker compose ps
log "done"
