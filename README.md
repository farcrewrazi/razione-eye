# RaziOne Eye

Single-user, local-first career + business operations command center.
Monorepo (`pnpm` workspaces): `server/` (Hono API + SQLite), `web/` (React + Vite SPA), `packages/shared` (schemas/types).

## Quick start (local dev)

```bash
pnpm install
pnpm dev-stack        # API :8787 + web :5173 (Vite proxies /api → backend)

# Web defaults to VITE_API_MODE=mock (no backend needed).
# For real API mode: echo 'VITE_API_MODE=real' > web/.env.local, then restart vite.
```

## Docker (production) — overview

Separate containers behind one origin (no CORS issues for app traffic):

```
browser ──https──▶ Nginx (host :443, Certbot TLS) ──▶ frontend 127.0.0.1:8080 (nginx)
                                                        ├── /  → SPA (dist/)
                                                        └── /api/ → proxy_pass backend:8787
                     backend data ◀── volume `razione-data` ── backend container
```

| Piece | Source | Notes |
|---|---|---|
| `backend` | `server/Dockerfile` | Node 22, `node src/dev.ts`, seeds idempotently, `:8787`, healthcheck `GET /api/health` |
| `frontend` | `web/Dockerfile` + `web/nginx.conf` | Vite build (`VITE_API_MODE=real`) + nginx, SPA fallback, `/api/` proxy, `:80` in container |
| Orchestration | `docker-compose.yml` | Named volume `razione-data` for SQLite |
| Public TLS | `nginx-vps.example.conf` | Host-level Nginx → `127.0.0.1:8080`, certificates via Certbot |

## VPS deployment guideline

### 0. Prerequisites

- VPS (1 vCPU / 1 GB RAM is enough) with Ubuntu 22.04/24.04.
- DNS `A` record: `eye.example.com` → your VPS IP.
- Ports `80` + `443` reachable; SSH hardened (key auth, `ufw allow 22,80,443/tcp` + `ufw enable`).

```bash
# On the VPS — install Docker Engine + Compose plugin, Nginx, and Certbot:
# https://docs.docker.com/engine/install/ubuntu/
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
docker --version && docker compose version && nginx -v && certbot --version
```

### 1. First deploy

```bash
git clone <your-repo-url> razione-eye
cd razione-eye

cp .env.example .env
nano .env   # set CORS_ORIGIN=https://eye.example.com (your real domain)

docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:8080/api/health   # {"ok":true,"version":"0.1.0","db":"connected"}
```

### 2. Attach HTTPS (Nginx + Certbot on host)

```bash
sudo cp nginx-vps.example.conf /etc/nginx/sites-available/razione-eye
sudo nano /etc/nginx/sites-available/razione-eye   # replace eye.example.com with your domain
sudo ln -s /etc/nginx/sites-available/razione-eye /etc/nginx/sites-enabled/razione-eye
sudo nginx -t && sudo systemctl reload nginx

# Obtain + install the certificate (certbot edits the site file to add the 443 block):
sudo certbot --nginx -d eye.example.com
sudo certbot renew --dry-run   # confirm auto-renewal works

# Then verify from your laptop:
curl -fsS https://eye.example.com/api/health
# Open https://eye.example.com — app loads, /api/* calls return 200 (real data, not mock).
```

Why Nginx on the host instead of in compose: TLS certificates live naturally with the host web server, Certbot's `--nginx` plugin configures + renews them automatically (systemd timer), and the compose file stays simple. The frontend is bound to `127.0.0.1:8080` so it is not directly reachable from the internet — only through Nginx.

### 3. Updates (data is preserved)

SQLite lives in the named volume `razione-data`, so rebuilds/upgrades never wipe it:

```bash
git pull
docker compose up -d --build
docker compose logs -f --tail=100
```

To start over with a fresh DB (destructive):

```bash
docker compose down
docker volume rm razione-data
docker compose up -d --build
```

### 4. Backup & restore

Fastest — copy the SQLite file out of the volume:

```bash
# Backup
docker run --rm -v razione-data:/data -v "$PWD":/backup alpine \
  cp /data/razione-eye.db "/backup/razione-eye-$(date +%F).db"

# Restore (stop backend first)
docker compose stop backend
docker run --rm -v razione-data:/data -v "$PWD":/backup alpine \
  cp /backup/razione-eye-YYYY-MM-DD.db /data/razione-eye.db
docker compose start backend
```

There is also an in-app endpoint (`POST /api/backup`, see `server/src/backup-service.ts`) that writes timestamped copies under `server/data/backups/` (same volume).

### 5. Configuration reference

`.env` (see `.env.example`):

| Var | Required | Default | Meaning |
|---|---|---|---|
| `CORS_ORIGIN` | yes (prod) | — | Public origin(s), comma-separated, e.g. `https://eye.example.com`. Backend allows these + localhost. |
| `VITE_API_MODE` | no | `real` | Baked into the frontend at build time. Keep `real` in prod; changing it needs `docker compose up -d --build frontend`. |
| `FRONTEND_PORT` | no | `127.0.0.1:8080` | Host binding for nginx. Keep the `127.0.0.1:` prefix. |

### 6. Troubleshooting

```bash
docker compose ps
docker compose logs -f backend     # API errors, seed output, CORS rejections
docker compose logs -f frontend    # nginx /api proxy errors (502 = backend down)
docker inspect razione-eye-backend --format '{{.State.Health.Status}}'
```

| Symptom | Likely cause → fix |
|---|---|
| App loads but API calls fail with CORS errors | `CORS_ORIGIN` in `.env` doesn't match the browser URL → fix (no trailing slash), `docker compose up -d backend` |
| `/api/*` → 502 from nginx | Backend unhealthy/down → `docker compose logs backend`, check volume perms |
| Frontend still shows mock data | Built with `VITE_API_MODE=mock` → set `VITE_API_MODE=real` in `.env`, rebuild: `docker compose up -d --build frontend` |
| Fresh VPS shows empty data | Expected — seed runs once on first boot; your volume persists after that |
| Cert errors | Certbot can't reach the challenge — DNS A record + ports 80/443 must be open; check `sudo nginx -t`, `systemctl status nginx`, and `sudo certbot renew --dry-run` |

### 7. Security notes

- `ufw allow 22,80,443/tcp`, everything else closed; frontend bound to loopback only.
- `.env` is gitignored — never commit it; rotate `CORS_ORIGIN` if the domain changes.
- This app has no auth (single-user design) — don't expose it publicly without a layer in front (Nginx `auth_basic`, Tailscale, or Cloudflare Access) if the data is sensitive.

## Repo scripts

```bash
pnpm build   # typecheck all workspaces
pnpm test    # backend vitest suite
pnpm seed    # idempotent seed (local)
pnpm backup  # local backup helper
```
