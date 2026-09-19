#!/usr/bin/env bash
# RaziOne Eye — GitHub Actions deploy entry point (runs ON RaziOneGCPExperimental).
#
# Installed on the server as ~/deploy-razione-eye.sh and wired as the forced
# command of the deploy key in ~/.ssh/authorized_keys:
#
#   command="/home/fakhru94/deploy-razione-eye.sh",no-port-forwarding,no-agent-forwarding,no-pty,no-X11-forwarding ssh-ed25519 AAAA... github-actions-deploy-razione-eye
#
# So the GitHub Actions runner can do exactly one thing over SSH: bring the
# working tree to origin/main and run the versioned deploy script inside it.
# Nothing else is executable with that key.
#
# Keep this file (almost) frozen: it lives outside the repo so a `git` update
# can never rewrite the script while it is still executing.
set -Eeuo pipefail

APP_DIR="$HOME/razione-eye"
BRANCH="main"
FORCE=0
case "${SSH_ORIGINAL_COMMAND:-}" in
  *force*) FORCE=1 ;;
esac

[ -d "$APP_DIR/.git" ] || { echo "ERROR: $APP_DIR is not a git checkout"; exit 1; }
cd "$APP_DIR"

# One deploy at a time (a second SSH key press or a rerun waits for nothing).
exec 9>/tmp/razione-eye-deploy.lock
flock -n 9 || { echo "another razione-eye deploy is already running — exiting"; exit 1; }

echo "[entry $(date -u +%Y-%m-%dT%H:%M:%SZ)] HEAD=$(git rev-parse --short HEAD) force=$FORCE"
git fetch --prune origin "$BRANCH"
TARGET="$(git rev-parse FETCH_HEAD)"
echo "[entry] origin/$BRANCH=$TARGET"

if ! git merge --ff-only "$TARGET"; then
  if [ "$FORCE" = 1 ]; then
    echo "[entry] fast-forward failed — git reset --hard $TARGET (forced)"
    git reset --hard "$TARGET"
  else
    echo "ERROR: $APP_DIR has local changes or diverged history."
    echo "       Inspect it on the server; re-run with force to reset --hard."
    exit 1
  fi
fi
echo "[entry] tree now at $(git rev-parse --short HEAD)"

DEPLOY_SCRIPT="$APP_DIR/scripts/server-deploy.sh"
if [ ! -f "$DEPLOY_SCRIPT" ]; then
  echo "ERROR: $DEPLOY_SCRIPT not found in the checked-out commit."
  echo "       Push the commit that adds scripts/server-deploy.sh, then re-run."
  exit 1
fi

exec bash "$DEPLOY_SCRIPT"
