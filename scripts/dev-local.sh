#!/usr/bin/env bash
# RaziOne Eye — run the local dev stack (API + Vite) against the live DB.
#
#   bash scripts/dev-local.sh          # API :8787 + web :5173
#   bash scripts/dev-local.sh server   # API only
#
# No Docker: the backend connects through the SSH tunnel to the live Postgres on
# RaziOneGCPExperimental. Credentials come from ~/.config/razione-eye/dev.env
# (outside the repo, chmod 600).
set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${RAZIONE_EYE_DEV_ENV:-$HOME/.config/razione-eye/dev.env}"
cd "$REPO_DIR"

[ -f "$ENV_FILE" ] || {
  echo "ERROR: $ENV_FILE missing." >&2
  echo "Create it (chmod 600) with:" >&2
  echo "  DATABASE_URL=postgres://razione:<pw>@127.0.0.1:5432/razione_eye" >&2
  echo "  TEST_DATABASE_URL=postgres://razione:<pw>@127.0.0.1:5432/razione_eye_test" >&2
  exit 1
}

# Tunnel up? (127.0.0.1:5432 must answer)
if ! timeout 5 bash -c "</dev/tcp/127.0.0.1/${RAZIONE_EYE_DB_PORT:-5432}" 2>/dev/null; then
  echo "ERROR: no DB tunnel on 127.0.0.1:${RAZIONE_EYE_DB_PORT:-5432}." >&2
  echo "       fix: bash scripts/db-tunnel.sh start   (or: pnpm run db:tunnel start)" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

case "${1:-stack}" in
  stack|"")
    echo "[dev-local] API :8787 + Vite :5173 -> DB $(printf '%s' "$DATABASE_URL" | sed -E 's#//[^@]*@#//***@#')"
    exec pnpm dev-stack
    ;;
  server)
    echo "[dev-local] API :8787 -> DB $(printf '%s' "$DATABASE_URL" | sed -E 's#//[^@]*@#//***@#')"
    exec pnpm dev
    ;;
  *)
    echo "usage: $0 [stack|server]" >&2
    exit 2
    ;;
esac
