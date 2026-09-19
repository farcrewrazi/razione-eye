# 09 — Handing work to OpenCode (GLM 5.3 Flash)

Development of this repo is done by **OpenCode** on `zai-coding-plan/glm-5.3-flash`
(see `opencode.json` and `AGENTS.md`). Eye Agent does not drive OpenCode directly:
it produces the task prompt below, Farcrew Razi pastes it into OpenCode, and the
result comes back for review.

## How to run it

```bash
cd ~/Projects/OtherProj/razione-eye
opencode                       # TUI, agent "orchestrator" routes to @backend/@frontend/@devops/@designer
# or one-shot:
opencode run --agent orchestrator "$(cat task.md)"
```

Preconditions (all handled by `docs/08`): tunnel up (`pnpm run db:tunnel check`),
deps installed (`pnpm install --frozen-lockfile`), `~/.config/razione-eye/dev.env` present.

## The prompt template

Keep every prompt in this shape — the lane agents are written to expect labelled tasks,
and a labelled task is what makes the result reviewable.

```md
TASK <ID>: <one-line outcome>

GOAL
<what must be true when this is done, in the user's terms>

SCOPE
- own (write): <paths>
- read-only:  <paths>
- do not touch: <paths>

CONTEXT
- <relevant facts, doc references (docs/0X-*.md §), existing behaviour>
- <what is already known to be broken / off-limits>

ACCEPTANCE CRITERIA
1. <observable, testable>
2. <observable, testable>

VERIFICATION (run these, paste real output)
- pnpm run build
- pnpm run test-local            # NEVER plain `pnpm test` — see AGENTS.md
- <any specific route/UI check>

NOTES
- DB: live Postgres via tunnel; <say "no schema change" or "schema.sql change + snapshot taken">
- Do not push. Commit locally only, and report the commit hash.
```

## House rules to repeat in every prompt

1. **Model:** `zai-coding-plan/glm-5.3-flash` — never switch provider/model mid-task.
2. **No local Docker.** The DB is the live server DB over the tunnel. Tests go through
   `pnpm run test-local` (pinned to `razione_eye_test`).
3. **Schema changes** need `pnpm run db:snapshot` first and additive idempotent DDL only.
4. **No push.** Pushing `main` is a production deploy; only Farcrew Razi approves that.
5. **No invented results.** Paste real command output; if something couldn't be verified, say so.
6. **External side effects** (outreach, publishing, sending) are out of scope: prepare only.

## Worked examples

### A. Feature — quick capture of a signal

```md
TASK T3.4: capture a raw signal from the Signal Eye screen in one action

GOAL
From /signals a user can paste a raw observation and save it as a SIGNAL node without
leaving the page; it appears at the top of the list with source and timestamp.

SCOPE
- own (write): web/src/routes/signals.tsx, web/src/components/eye/**, web/src/api/types.ts
- read-only: docs/07-api-contract.md §3, docs/02-data-model.md §4, server/src/signals.ts
- do not touch: server/**, docker-compose.yml, web/src/index.css tokens

CONTEXT
- POST /api/signals already exists and validates with the shared zod schema.
- The list is a react-query query keyed ['signals']; invalidate on success.

ACCEPTANCE CRITERIA
1. Paste + save creates a signal and the list refreshes without a manual reload.
2. Empty/whitespace input is rejected with an inline message.
3. Failure path shows the API error text, not a blank toast.

VERIFICATION
- pnpm run build
- pnpm run test-local
- pnpm --filter @razione-eye/web dev + manual check of /signals (report what you saw)

NOTES
- No schema change. No push; report the commit hash.
```

### B. Bug fix — daily brief shows stale counts

```md
TASK B2: /api/daily-brief counts events from before the last status change

GOAL
The daily brief's "what changed" counts only events at or after the last
status transition of each node, and the numbers match the events table.

SCOPE
- own (write): server/src/daily-brief.ts, server/test/daily-brief.test.ts
- read-only: server/src/events.ts, server/src/schema.sql, docs/02-data-model.md §6

CONTEXT
- Reproduce first: write the failing test, then fix (report the RED output).
- Events are append-only; `at` is TIMESTAMPTZ UTC.

ACCEPTANCE CRITERIA
1. Failing test reproduced before the fix (paste the failure).
2. Test passes after the fix; no other suite regressions.
3. No schema change.

VERIFICATION
- pnpm run test-local server/test/daily-brief.test.ts
- pnpm run test-local
- pnpm run build

NOTES
- No push. Report the commit hash and the before/after output.
```

### C. Schema change (touches the live DB)

```md
TASK D1: add `source_url` to SIGNAL node data + surface it in the signal detail

GOAL
Signals can carry their originating URL; the detail view links it in a new tab.

SCOPE
- own (write): server/src/schema.sql (additive only), packages/shared/src/schemas.ts,
  server/src/signals.ts, web/src/routes/signals-detail.tsx, server/test/signals.test.ts
- do not touch: docker-compose.yml, deploy scripts

CONTEXT
- `data` is JSONB, so prefer storing source_url there unless a column is genuinely needed.
- Snapshot already taken by Farcrew Razi before this task (do not run db:snapshot yourself).
- schema.sql must stay idempotent (CREATE ... IF NOT EXISTS) — the live DB is migrated on boot.

ACCEPTANCE CRITERIA
1. Old signals without the field still render.
2. New/updated signals persist and read back the URL.
3. pnpm run test-local exercises both cases against razione_eye_test.

VERIFICATION
- pnpm run build
- pnpm run test-local

NOTES
- Reminder: applying this locally migrates the LIVE database on next API boot — say clearly
  in your report what DDL will run. No push.
```

## What comes back to Eye Agent

When OpenCode is done, hand back: the commit hash, the changed files, the pasted
verification output, and anything it could not verify. Eye Agent then checks the diff,
the tests and the health of the live stack, and decides whether it is push-worthy.
