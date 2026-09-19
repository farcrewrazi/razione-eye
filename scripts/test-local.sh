#!/usr/bin/env bash
# RaziOne Eye — run the test suite safely against the shared server.
#
# The suite TRUNCATEs nodes/edges/events/gate_actions, so it must never point at
# the live database. This wrapper forces both DATABASE_URL and TEST_DATABASE_URL
# to the dedicated test DB (razione_eye_test on the server, reached via the tunnel),
# no matter what the ambient environment says.
#
#   bash scripts/test-local.sh                 # all workspaces
#   bash scripts/test-local.sh server/test/api.test.ts
set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${RAZIONE_EYE_DEV_ENV:-$HOME/.config/razione-eye/dev.env}"
cd "$REPO_DIR"

[ -f "$ENV_FILE" ] || { echo "ERROR: $ENV_FILE missing (see docs/08-local-dev-and-deploy.md)" >&2; exit 1; }

if ! timeout 5 bash -c "</dev/tcp/127.0.0.1/${RAZIONE_EYE_DB_PORT:-5432}" 2>/dev/null; then
  echo "ERROR: no DB tunnel on 127.0.0.1:${RAZIONE_EYE_DB_PORT:-5432} — run: pnpm run db:tunnel start" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

[ -n "${TEST_DATABASE_URL:-}" ] || { echo "ERROR: TEST_DATABASE_URL not set in $ENV_FILE — refusing to run tests" >&2; exit 1; }

# Safety: never let a fallback in test/helpers.ts reach the live DB.
if [ "$TEST_DATABASE_URL" = "${DATABASE_URL:-}" ]; then
  echo "ERROR: TEST_DATABASE_URL equals DATABASE_URL — refusing to run destructive tests against live data" >&2
  exit 1
fi

case "$TEST_DATABASE_URL" in
  */razione_eye_test*) : ;;
  *) echo "ERROR: TEST_DATABASE_URL must point at the .../razione_eye_test database (got a different DB name)" >&2; exit 1 ;;
esac

export DATABASE_URL="$TEST_DATABASE_URL"
echo "[test-local] destructive tests pinned to $(printf '%s' "$TEST_DATABASE_URL" | sed -E 's#//[^@]*@#//***@#')"

# The database is remote (SSH tunnel), so per-query latency is ~10-40x a local
# socket: vitest's default 5s per-test budget trips on the heavier import/agent
# tests. Raise it here instead of in vitest.config.ts so the container/CI runs
# keep their tight budget.
TEST_TIMEOUT="${TEST_TIMEOUT:-90000}"
echo "[test-local] per-test timeout: ${TEST_TIMEOUT}ms (remote DB) $*"

exec pnpm --filter @razione-eye/server exec vitest run --testTimeout="$TEST_TIMEOUT" "$@"
