# 08 — Local development & deploy (no local Docker)

RaziOne Eye is developed **on this laptop** and runs **on RaziOneGCPExperimental**
(`34.143.217.207`, GCP free tier — ⚠️ expires **2026-12-14**; both `eye.razione.space`
and `poc.razione.space` die with it).

The local machine never runs Docker and never runs its own Postgres. Everything talks
to the **live** database on the server over an SSH tunnel, and a push to `main`
deploys.

```
                    ┌──────────────────────── this laptop ───────────────────────┐
  pnpm run dev-local│  API :8787 (node src/dev.ts)   Vite :5173 ──/api──▶ :8787   │
                    └───────────┬───────────────────────────────────────────────┘
                                │ 127.0.0.1:5432
                    ┌───────────▼─────────────┐        SSH tunnel (systemd user unit
                    │ ssh -L → RaziOneGCP...  │        razione-eye-db-tunnel.service)
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼──────────────────────── RaziOneGCPExperimental ──┐
                    │ docker compose `razione-eye`:                                │
                    │   frontend (nginx) 127.0.0.1:8082 ──/api──▶ backend :8787    │
                    │   db postgres:17-alpine 127.0.0.1:5432 ── volume pgdata      │
                    │   host nginx :443 ──▶ 8082   →  https://eye.razione.space    │
                    └──────────────────────────────────────────────────────────────┘
```

## 1. Toolchain (one time)

```bash
mise use -g node@latest pnpm@latest    # pnpm is NOT preinstalled on this machine
cd ~/Projects/OtherProj/razione-eye
pnpm install --frozen-lockfile         # never let install rewrite the lockfile
```

`pnpm build` emits `packages/shared` declarations first (the server's tsconfig uses
project references, so a fresh clone fails with `TS6305` otherwise). The Dockerfile
does the same thing — keep both in sync.

## 2. The database tunnel

```bash
pnpm run db:tunnel install     # writes ~/.config/systemd/user/razione-eye-db-tunnel.service, enables + starts
pnpm run db:tunnel check       # TCP test of 127.0.0.1:5432
pnpm run db:tunnel status      # systemctl --user status
pnpm run db:tunnel logs        # journalctl --user -u ...
pnpm run db:tunnel restart     # after the server reboots or the tunnel goes stale
```

- Enabled at login **and** after reboot (user linger is on).
- The server only publishes Postgres on its own loopback, so this tunnel is the only
  way in — the database is never exposed to the internet.
- If `check` fails: `systemctl --user restart razione-eye-db-tunnel.service`; a stale
  tunnel after a network change is the usual cause.

## 3. Local secrets — outside the repo

`~/.config/razione-eye/dev.env` (mode 600, **never** committed, never copied into docs):

```ini
DATABASE_URL=postgres://razione:<password>@127.0.0.1:5432/razione_eye        # LIVE
TEST_DATABASE_URL=postgres://razione:<password>@127.0.0.1:5432/razione_eye_test
PGPOOL_MAX=5
VITE_API_MODE=real
```

To regenerate it from the server's `.env` (used to create it the first time):

```bash
ssh RaziOneGCPExperimental 'cat ~/razione-eye/.env' > /tmp/eye.env
# then rewrite the host of DATABASE_URL to 127.0.0.1:5432 and add TEST_DATABASE_URL;
# keep the result at ~/.config/razione-eye/dev.env with chmod 600 and delete /tmp/eye.env
```

## 4. Daily commands

| Command | What it does |
|---|---|
| `pnpm run db:tunnel check` | Is the tunnel up? |
| `pnpm run dev-local` | API `:8787` + Vite `:5173` against the **live** DB |
| `pnpm run dev-local server` | API only |
| `pnpm run build` | Typecheck all workspaces (shared emit + `pnpm -r build`) |
| `pnpm run test-local` | vitest, pinned to `razione_eye_test` — the safe way to test |
| `pnpm run db:snapshot` | `pg_dump` of the live DB into the `pgbackups` volume on the server |
| `pnpm run db:snapshot -- --download` | …and copy it to `server/data/backups/` |
| `pnpm run db:snapshot -- --list` | List snapshots in the volume |

Web dev defaults to mock data; `VITE_API_MODE=real` in `dev.env` makes Vite call
`/api` → `localhost:8787`. `web/.env.local` (gitignored) works too if you prefer.

## 5. Database rules (read before touching schema)

- **There is one database.** `DATABASE_URL` is the production database. Local edits to
  `server/src/schema.sql` are applied by `initDb()` the next time the API boots —
  locally **and** in the container. Additive, idempotent DDL only.
- **Snapshot before any schema change:** `pnpm run db:snapshot` (also runs automatically
  before every deploy). Snapshots live in the `razione-eye-pgbackups` volume, newest 30 kept.
- **Never run the test suite with `DATABASE_URL` pointing at `razione_eye`.** It `TRUNCATE`s
  `nodes, edges, events, gate_actions`. `pnpm run test-local` pins `DATABASE_URL` to
  `razione_eye_test` and refuses to run if `TEST_DATABASE_URL` is missing or names another DB.
- Destructive SQL (`DROP`, `TRUNCATE`, `DELETE` without `WHERE`) against the live DB is out
  of bounds — `opencode.json` denies those patterns for the coding agent.
- Restore a snapshot:

```bash
ssh RaziOneGCPExperimental
cd ~/razione-eye && docker compose stop backend
docker exec -i razione-eye-db pg_restore --clean --if-exists -U razione -d razione_eye \
  < <(docker exec razione-eye-db cat /backups/<snapshot>.dump)
docker compose start backend
```

## 6. Push-to-deploy

```
git push origin main
      │
      ▼
GitHub Actions  .github/workflows/deploy.yml      (ubuntu-latest, no build on the runner)
      │  ssh -i deploy_key  (key is locked to a forced command)
      ▼
RaziOneGCPExperimental  ~/deploy-razione-eye.sh
      ├── 1. git fetch + ff-only merge to origin/main   (aborts if the server tree is dirty)
      ├── 2. pg_dump snapshot → /backups/predeploy-<ts>.dump
      ├── 3. docker compose up -d --build --remove-orphans     (pgdata volume untouched)
      ├── 4. wait for http://127.0.0.1:8082/api/health  (backend applies schema.sql + seed on boot)
      └── 5. prune dangling images, print `docker compose ps`
```

**One-time GitHub setup (only Farcrew Razi can do this — the CLI here is not logged in
to GitHub):** Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | `34.143.217.207` |
| `DEPLOY_USER` | `fakhru94` |
| `DEPLOY_SSH_KEY` | contents of `~/.ssh/deploy_keys/razione-eye-gha` on this laptop |
| `DEPLOY_SSH_PORT` | optional, `22` |
| `DEPLOY_KNOWN_HOSTS` | optional but recommended: `ssh-keyscan -H 34.143.217.207` output |

The key pair is `~/.ssh/deploy_keys/razione-eye-gha[.pub]`; the public half is already in
`~/.ssh/authorized_keys` on the server as:

```
command="/home/fakhru94/deploy-razione-eye.sh",restrict ssh-ed25519 … github-actions-deploy-razione-eye
```

so that key can **only** run the deploy script — no shell, no port forwarding, no PTY
(verified: a supplied remote command is ignored).

Manual redeploy (also what the Action does under the hood):

```bash
ssh -i ~/.ssh/deploy_keys/razione-eye-gha -o IdentitiesOnly=yes RaziOneGCPExperimental
# a server-side operator can force past a dirty working tree:
ssh RaziOneGCPExperimental 'SSH_ORIGINAL_COMMAND=force ~/deploy-razione-eye.sh'
```

### Rollback

1. Code: `git revert <bad-commit> && git push` → the pipeline redeploys the previous state.
2. Data: restore the `predeploy-*` snapshot taken minutes earlier (command in §5).

### Troubleshooting

| Symptom | Cause → fix |
|---|---|
| Action fails at "Install deploy key" | `DEPLOY_SSH_KEY`/`DEPLOY_HOST`/`DEPLOY_USER` secrets missing or malformed |
| `Permission denied (publickey)` | public key missing from the server's `authorized_keys` (§6 block) |
| `another razione-eye deploy is already running` | a deploy is still going (flock); wait for it |
| `~/razione-eye has local changes or diverged history` | someone edited the server tree → inspect, then re-run with `force` |
| Deploy succeeds but the site is stale | browser/CDN cache; check `docker compose ps` and `curl -s http://127.0.0.1:8082/api/health` |
| `health check never passed` | backend logs are printed by the script; usually a bad schema or missing env in `~/razione-eye/.env` |

## 7. Where things live

| Thing | Path |
|---|---|
| Repo (this laptop) | `~/Projects/OtherProj/razione-eye` |
| Repo (server) | `~/razione-eye` (never edit by hand) |
| Deploy wrapper (server) | `~/deploy-razione-eye.sh` (outside the repo so `git` can't rewrite it mid-run) |
| Deploy key (laptop) | `~/.ssh/deploy_keys/razione-eye-gha` |
| Local secrets | `~/.config/razione-eye/dev.env` |
| Tunnel unit | `~/.config/systemd/user/razione-eye-db-tunnel.service` |
| Server `.env` | `~/razione-eye/.env` |
| DB data / snapshots | docker volumes `razione-eye-pgdata`, `razione-eye-pgbackups` |
