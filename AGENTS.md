# RaziOne Eye — agent instructions (OpenCode)

Single-user, local-first career + business operations command center for Farcrew Razi.
Monorepo, `pnpm` workspaces: `server/` (Hono API + PostgreSQL 17 via `pg`), `web/` (React 19 + Vite SPA),
`packages/shared` (zod schemas + types). Full design docs live in `docs/00`–`docs/07`.

## Model policy (non-negotiable)

- Provider: `zai-coding-plan`, model: **`zai-coding-plan/glm-5.3-flash`** for every session and subagent.
- Do not switch provider/model mid-task. If the model errors, report it — don't silently fall back.
- Note the provider id uses **hyphens** (`zai-coding-plan`), never underscores.

## Local development — no Docker on this machine

Docker is **not** used locally. The local backend and tests talk straight to the live
PostgreSQL on `RaziOneGCPExperimental` through an SSH tunnel:

```
local 127.0.0.1:5432 ──(ssh -L, systemd user unit razione-eye-db-tunnel.service)──▶ server 127.0.0.1:5432
                                                                                     └─ container razione-eye-db (postgres:17-alpine)
```

- Tunnel lifecycle: `pnpm run db:tunnel status|start|stop|restart|check` (unit is enabled at login/boot).
- Secrets live in `~/.config/razione-eye/dev.env` (chmod 600, **outside the repo**) and hold
  `DATABASE_URL` (→ live `razione_eye`) and `TEST_DATABASE_URL` (→ `razione_eye_test`).
  Never write those values into repo files, docs, commits, or chat.
- Start the stack: `pnpm run dev-local` (loads `dev.env`, then API `:8787` + Vite `:5173`, `/api` proxied to the backend).
- Tests: `pnpm run test-local` (pins `DATABASE_URL` to the test DB so nothing can touch live data).

## Database rules (the live DB is the only DB)

`DATABASE_URL` points at the **live** database that serves eye.razione.space. There is no local Postgres.

- Schema changes are migrations: `server/src/schema.sql` is applied idempotently by `initDb()` at boot
  (backend container *and* local dev). Editing it and booting the API therefore changes production schema.
  Take a snapshot first: `pnpm run db:snapshot` (pg_dump into the `pgbackups` volume on the server).
- The test suite `TRUNCATE`s `nodes, edges, events, gate_actions`. It must always run with
  `TEST_DATABASE_URL` set (`pnpm run test-local` does this). **Never** run the suite with `DATABASE_URL`
  pointing at `razione_eye` — that is live data loss.
- Do not run destructive SQL (`DROP`, `TRUNCATE`, `DELETE` without a `WHERE`) against `DATABASE_URL`.
  Denied in `opencode.json` permissions on purpose.
- Keep `server/src/schema.sql` idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
  No numbered migration files yet — additive, idempotent DDL only.
- Data is precious and small (single user). If a change could lose rows, say so and stop for a human decision.

## Deploy — pushing is deploying

- `git push` to `main` triggers `.github/workflows/deploy.yml` → SSH to `RaziOneGCPExperimental`
  → forced command `~/deploy-razione-eye.sh` → fast-forward to `origin/main` → pg_dump snapshot
  → `docker compose up -d --build --remove-orphans` → wait for `/api/health` on `127.0.0.1:8082`.
- So: **never push without Farcrew Razi's explicit go-ahead**, and never force-push or rewrite `main` history.
- Server tree must stay clean; do not edit files in `~/razione-eye` on the server by hand.
- Deploy secrets (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`) are repo-side; the key is locked to the
  deploy script by a forced command in `authorized_keys` — it cannot run anything else.
- Local dev does not need the pipeline: commit locally, run the checks, and only push when told to.

## Before you call a task done

Run, in this order, and paste the real output in your report:

```bash
pnpm run build      # typecheck all workspaces
pnpm run test-local # vitest against razione_eye_test (needs the tunnel up)
```

- A task is not done if typecheck or tests fail. Do not summarise failures as success.
- Do not invent API responses, metrics, job/company data, or "it works" claims. If you could not verify
  something, say exactly what you could not verify.
- UI work: run `pnpm --filter @razione-eye/web dev` and check the real page, or state that you only typechecked.

## Conventions

- TypeScript strict, ESM, explicit `.ts` extensions in relative imports.
- Hono route modules per domain (`server/src/<domain>.ts`), zod schemas in `packages/shared`.
- Keep the domain layering: routes → services → `db.ts` pool. No raw SQL outside the storage/import layer
  unless the file already does so.
- Every opportunity-ish record must resolve to SIGNAL, OPPORTUNITY, or TASK (see `docs/00-project-summary.md`).
- Follow the existing UI tokens/components in `web/src/components` — no new UI libraries, no whole-app restyles.
- External side effects (outreach, publishing, sending) always require explicit human approval: prepare,
  don't execute.

## Subagents (`.opencode/agents/*.md`)

`orchestrator` (primary) routes work; `backend`, `frontend`, `devops`, `designer` are the lane specialists.
All are pinned to `zai-coding-plan/glm-5.3-flash`. Respect the scope tables in each agent file:
never hand `web/` paths to `@backend` or `server/` paths to `@frontend`.

When the task arrives as a labelled prompt, use the template in
`docs/09-opencode-task-prompts.md` (GOAL / SCOPE / CONTEXT / ACCEPTANCE CRITERIA / VERIFICATION / NOTES)
and honour the house rules it lists.
