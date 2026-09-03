# RaziOne Eye — API Contract (Phase 0 + Wave 2 + Wave 3)

> **This is the FE hand-off doc.** The frontend builds against these endpoints and shapes.
> Field names match [02-data-model.md](02-data-model.md) exactly (snake_case). Every write is validated by zod on the server — the schemas in `packages/shared/src/schemas.ts` are the executable source of truth.
> Companion: [06-dev-task-split.md §0](06-dev-task-split.md)
> **Wave 2 additions** (marked **[W2]**): Events/activity log, import pipeline (`/api/import*`), notes append, board payload.
> **Wave 3 additions** (marked **[W3]**): Job Analyst agent (`POST /api/agents/:id/run` real for Job Analyst), ranked pipeline (`/api/pipeline/ranking`), Next Best Action + Dashboard (`/api/next-best-action`, `/api/dashboard`), signal promotion (`POST /api/signals/:id/promote`), opportunity `signal_id` link-back, `dimensions` on analyzed jobs, `analyzed` event type.
> **Wave 4 additions** (marked **[W4]**): Action Gate v1 (`/api/gate/*`, T1.11) + Daily Brief v1 (`/api/daily-brief/*`, T1.10). New `gate_actions` table; `gate_decision` events now emitted.

---

## 0. Base URL & conventions

| | |
|---|---|
| **Base URL (dev)** | `http://localhost:8787/api` |
| **FE dev proxy** | Proxy `/api/*` → `http://localhost:8787` (CORS is open to any `localhost`/`127.0.0.1` origin, so a proxy is optional but recommended) |
| **Format** | JSON everywhere. All timestamps ISO-8601 UTC strings. All ids ULIDs (26-char Crockford base32). |
| **Auth** | None (single-user, local-first). |

### Error envelope (all non-2xx)

```json
{ "error": { "code": "VALIDATION", "message": "data.role: Required; ..." } }
```

`code` is one of: `VALIDATION` (422, zod failure) · `INVALID_STATUS` (422, status not in the pipeline for that opportunity_type) · `BAD_QUERY` (400, bad query param) · `NOT_FOUND` (404) · `ALREADY_DECIDED` (409, gate action already decided — decisions are final **[W4]**) · `INTERNAL` (500).

---

## 1. The node envelope (every object)

All 8 objects share one storage/wire shape. The type-specific payload lives in `data`.

```ts
{
  id:               ulid
  type:             'PERSON'|'COMPANY'|'OPPORTUNITY'|'PROJECT'|'TASK'|'SIGNAL'|'CONTENT'|'AGENT'
                    |'SKILL'|'LOCATION'|'PROBLEM'|'SOLUTION'|'SOURCE'
  name:             string | null      // display name/title
  status:           string | null      // pipeline stage / task status / signal disposition
  opportunity_type: 'JOB'|'WEBSITE'|'CONSULTANCY'|'AFFILIATE'|'CRYPTO' | null  // OPPORTUNITY only
  score:            number (0-100) | null
  due_at:           iso | null
  source:           string | null
  tags:             string[]
  notes:            (string | { text: string, created_at: iso })[]
  data:             object             // type-specific payload (Section 2)
  created_at:       iso
  updated_at:       iso
}
```

List endpoints return `{ items: Node[], total: number }`.

### **[W2]** Event shape (activity log)

Append-only `events` table — every status change, note, import run, agent run and gate decision lands here. Feeds the Daily Brief ("what changed") and the detail-screen activity logs.

```ts
{
  id:       ulid
  at:       iso                 // when it happened
  type:     'opportunity_created'|'opportunity_imported'|'status_changed'|'note_added'
            |'signal_created'|'signal_promoted'|'signal_dismissed'
            |'import_run'|'agent_run'|'gate_decision'
            |'analyzed'                                    // [W3] Job Analyst scored one job
  node_id:  ulid | null         // null for run-level events (import_run)
  summary:  string              // one-line human summary
  data:     object | null       // payload; import_run events carry the full ImportReport
}
```

Event list endpoints return `{ items: Event[], total: number }`, newest first.


---

## 2. Type-specific `data` payloads

- **PERSON** `{ full_name, skills?, seniority?, salary_min?, salary_max?, location?, ai_culture_prefs?, role? }` (salary = MYR/month)
- **COMPANY** `{ industry?, size?, stack?, location?, ai_culture_notes?, website? }`
- **OPPORTUNITY (JOB)** `{ role, location?, url?, salary?, salary_min?, salary_max?, match_score?, matching?, contact?, next_action?, applied_date?, problems_detected?, suggested_offer? }`
  - `matching` — **six sub-scores, all 0–100, all optional**: `{ role_match?, company_match?, ai_culture?, location?, salary?, career_upside? }` (supersedes the older 5-key example in doc 02 §2.1). Unknown keys rejected.
  - **[W3]** `dimensions` — `{ role_dimension, company_dimension }` (0–100), written by the Job Analyst: `role_dimension = avg(role_match, salary, career_upside)`, `company_dimension = avg(company_match, ai_culture, location)`. The doc-02 §2.2 "scores companies separately from roles" requirement made visible.
  - `next_action` — `{ type: string, due: string | null }` (ISO date; analyst always sets a date — PRIORITY today+1, APPLY +3, REVIEW +7, ARCHIVE +14)
  - **[W4]** `applied_date` — ISO date (`YYYY-MM-DD`), written when the opportunity reaches `APPLIED` through the Action Gate (T1.8 applied-date tracking).
  - `contact` — `{ recruiter?, linkedin?, email? }`
- **OPPORTUNITY (WEBSITE/CONSULTANCY/AFFILIATE/CRYPTO)** — permissive (`{ next_action?, problems_detected?, suggested_offer?, … }`); Phases 3–5 fill the rest.
- **TASK** `{ title, description?, opportunity_id?, priority? }` (`priority`: `LOW|MEDIUM|HIGH`; `opportunity_id` is also expressed as a `serves` edge automatically)
- **SIGNAL** `{ signal_type, content, url?, observed_at, promoted_to? }` — disposition is the node `status` (`NEW|PROMOTED|DISMISSED|DUPLICATE`); `source` is the node `source` (one of `linkedin|facebook|x|threads|careers_page|google|comments|rams_gem|manual|import|agent`)
- **AGENT** `{ name, kind, capability, behind_adapter?, schedule, last_run?, last_status?, runs: [{at, status, summary?}] }` (`kind`: `native|adapter`; `capability`: `discover|analyze|rank|prepare|draft|suggest`; `schedule`: `on_demand|cron`; run `status`/`last_status`: `ok|error|empty`; `runs` capped at last 50)
- **PROJECT / CONTENT** — permissive in Phase 0.

---

## 3. Pipelines — status enums (never invent values)

`status` on an OPPORTUNITY must belong to its `opportunity_type` pipeline (else `INVALID_STATUS`):

- **JOB**: `DISCOVERED · ANALYZED · QUALIFIED · READY_TO_APPLY · APPLIED · RECRUITER_RESPONSE · INTERVIEW · OFFER · HIRED` + terminals `REJECTED · IGNORED · NOT_SUITABLE · EXPIRED`
- **BUSINESS** (WEBSITE + CONSULTANCY): `DISCOVERED_BUSINESS · BUSINESS_ANALYZED · PROBLEM_IDENTIFIED · OPPORTUNITY · TEASER_PROPOSAL · OUTREACH · REPLIED · MEETING · PROPOSAL · WON` + terminals `LOST · NOT_SUITABLE · DISMISSED`
- **AFFILIATE**: `IDEAS · RESEARCH · SCRIPT · PRODUCE · PUBLISHED · PERFORMANCE`
- **CRYPTO**: `SIGNAL · TOKEN · QUICK_ANALYSIS · ALERT`

**Score bands** (derived server-side from `score`, doc 02 §6.2): `PRIORITY` ≥90 · `APPLY` ≥75 · `REVIEW` ≥60 · `ARCHIVE` <60 (or null score). Returned as a computed `band` field on opportunity reads.

---

## 4. Endpoints

### Health
`GET /api/health` → `{ ok: true, version: "0.1.0", db: "connected" }`

### Profile (the single Farcrew Razi PERSON node)
- `GET /api/profile` → Node (PERSON)
- `PUT /api/profile` — body: partial PERSON data + optional `tags`/`notes`. Merges into `data`; find-or-create by convention. → Node

### Agents
- `GET /api/agents` → `{ items: Node[] (AGENT), total }`
- `GET /api/agents/:id` → Node (AGENT)
- `POST /api/agents/:id/run` — behavior depends on the agent:
  - **Job Analyst [W3]** — real deterministic run over JOB opportunities. Default: only jobs **lacking** `data.matching` (idempotent). `?force=true` re-analyzes all. For each: extract missing fields (notes/stack/url → location/salary/stack/AI-culture, logged as a `Job Analyst inferred: …` note), compute six sub-scores + `dimensions` + weighted total → `score`, `match_score`, `band`, `next_action`, transition `DISCOVERED → ANALYZED` (later stages untouched), ensure the `matches` edge profile→opportunity carries `{score}`, record an `analyzed` event per job + one `agent_run` event. → Node (AGENT) **plus** `report`:
    ```ts
    { ...agentNode,
      report: { analyzed: number,
                bands: { PRIORITY: n, APPLY: n, REVIEW: n, ARCHIVE: n },
                top_5: [{ id, role, company, score }] } }
    ```
    `last_status` is `ok` when ≥1 job was analyzed, `empty` when 0. The run entry in `data.runs[]` embeds the same report.
  - **Other agents** — **stub** (Phase 0): appends a run entry, sets `last_run`, `last_status: "empty"`. Records an `agent_run` event. → updated Node

### Opportunities
- `GET /api/opportunities?type&status&band&q&limit&offset&sort&board` **[W2: board param]**
  - `type` = opportunity_type · `status` = pipeline stage · `band` = `PRIORITY|APPLY|REVIEW|ARCHIVE` (score-derived) · `q` = substring on name+data · `limit` (default 50, max 200) · `offset` · `sort` = `score|created_at|updated_at|due_at|name`, prefix `-` for DESC (default `-created_at`)
  - → `{ items: (Node & { band })[], total }`
  - **[W2]** `board=true` → grouped-by-status payload for the pipeline board: `{ columns: [{ status, items: (Node & {band})[] }], total }` — one column per JOB status in pipeline order (empty columns included), other query params still apply.
- `GET /api/opportunities/:id` → `Node & { band, edges: Edge[], neighbors: Node[] }` (graph neighbors included)
- `GET /api/opportunities/:id/events` **[W2]** → `{ items: Event[], total }` (activity log for the detail screen)
- `POST /api/opportunities/:id/notes` **[W2]** — body: `{ text }`. Appends a `{text, created_at}` note + records a `note_added` event. → 201 Node
- `POST /api/opportunities` — body: `{ opportunity_type, status?, data, name?, source?, tags?, notes?, due_at?, score?, signal_id? }`. Status defaults to the pipeline's first stage; JOB `data` validated. Records an `opportunity_created` event. **[W3]** optional `signal_id` (T1.1.6-BE link-back): the referenced SIGNAL is marked `PROMOTED` with `promoted_to` = the new opportunity + a `signal_promoted` event (422 when the id isn't a SIGNAL). → 201 Node
- `PATCH /api/opportunities/:id` — body: any subset of the create fields (data is merged). → Node
- `PATCH /api/opportunities/:id/status` — body: `{ status }` (validated against the pipeline). Records a `status_changed` event. → Node

### Import **[W2]** (T1.1/T1.2 — D-003 mixed-format intake)
- `POST /api/import` — body: `{ files: [{ name, format: 'json'|'csv'|'md'|'chat', content: string }] }` (1–50 files, all parsed in-memory). Pipeline: parse → normalize → dedup (company+role+source fuzzy) → persist as JOB OPPORTUNITY nodes (status `DISCOVERED`, source `import`, tags `['imported']`) + find-or-create COMPANY nodes + `belongs_to` + `hiring` edges. Incomplete records are **flagged, never guessed** — stored as SIGNAL nodes (`signal_type: JOB_POSTING`, source `import`, tags `['import','flagged','incomplete']`). Duplicates are not persisted; the richest record wins and gets a note listing the dropped alternates. **Re-imports are idempotent (T1.2):** after in-batch dedup, survivors are matched against existing JOB opportunities on normalized company+role (same normalization as the batch dedup; source ignored — a role re-imported from another channel is the same opportunity). Matches are treated exactly like in-batch duplicates: no new node; the existing opportunity gets the provenance note plus any fields it lacks that the new record has (`location, salary, salary_min, salary_max, url, stack, contact`), its `updated_at` is bumped, and a `note_added` event records the merge. → 201 ImportReport:

```ts
{
  ran_at: iso
  files: [{
    path, format, raw_records, normalized,
    flagged:    [{ record, reason, signal_id?, file? }],
    duplicates: [{ kept, dropped, file?, reason? }],   // "Company — Role" descriptions
    // reason: 'batch'    = duplicate within this import run (default)
    //         'existing' = matched an OPPORTUNITY already in the graph (cross-batch
    //                      dedup — skipped + merged into it, never re-created)
  }]
  created: { opportunities, companies, edges }
  totals:  { raw_records, normalized, flagged, duplicates }
}
```
  - Reconciliation invariant: `created.opportunities + totals.duplicates + totals.flagged == totals.raw_records` (holds on every run — cross-batch duplicates count toward `totals.duplicates`).
  - Cross-batch merge note appended to the existing opportunity: `Re-imported duplicate skipped: "<Company — Role>" (from file <name>, format <json|csv|md|chat>)` + ` — merged fields: <field, …>` when fields were merged; the same text is the summary of the recorded `note_added` event.
  - Every imported opportunity records an `opportunity_imported` event; the whole run is stored as an `import_run` event.
- `GET /api/import/report` → most recent ImportReport (from the latest `import_run` event), 404 if no import has run yet.

### Bulk CLI (real files later — Q2)
`node server/src/import/cli.ts [dir]` imports every `.json/.csv/.md/.txt` in `server/fixtures/` (default) or `dir`, prints the report, exits non-zero on reconciliation failure.

### Companies
- `GET /api/companies?q&limit&offset&sort` → `{ items, total }`
- `GET /api/companies/:id` → `Node & { opportunities: (Node & {band})[] }` (its opportunities via `belongs_to`/`hiring` edges)

### Signals
- `GET /api/signals?disposition&signal_type&q&limit&offset` → `{ items, total }`
- `POST /api/signals` — body: `{ data: { signal_type, content, url?, observed_at, promoted_to? }, status?, source?, name?, tags?, notes? }` (status defaults `NEW`). Records a `signal_created` event. → 201 Node
- `GET /api/signals/:id` → Node
- `GET /api/signals/:id/events` **[W2]** → `{ items: Event[], total }`
- `PATCH /api/signals/:id` — body: `{ status?, data?, name?, tags?, notes? }` (disposition changes here; records `signal_promoted`/`signal_dismissed` events). → Node
- `POST /api/signals/:id/promote` **[W3]** (T1.12-BE) — body optional: `{ data?: { role?, location?, salary?, url?, stack?, notes? } }`. Creates a JOB OPPORTUNITY (status `DISCOVERED`, node `source` = the signal's source, content excerpt as first note, `data.source_signal_id` back-link, tags `['promoted']`), sets the signal `PROMOTED` + `promoted_to`, records `opportunity_created` + `signal_promoted` events. Idempotent: an already-promoted signal returns 200 with the linked opportunity instead of creating a duplicate. → 201 `{ signal, opportunity }` (opportunity includes computed `band`)

### Pipeline **[W3]**
- `GET /api/pipeline/ranking` (T1.4) — lightweight ranked projection of all JOB opportunities, score DESC (unscored last). → `{ items: [{ id, role, company, score, band, status, next_action_due }], total }`

### Dashboard & Next Best Action **[W3]** (T1.9-BE groundwork)
- `GET /api/next-best-action` — picks the highest-score JOB opportunity with `status ∈ {QUALIFIED, READY_TO_APPLY, ANALYZED}` and `band ∈ {PRIORITY, APPLY}`; ties broken by soonest `next_action.due`. →
  ```ts
  { opportunity: (Node & { band, company: Node | null }) | null,
    reason: string | null,        // e.g. "Score 79 (APPLY) · Kuala Lumpur · stack overlap 100% · due in 2 days"
    match_score: number | null }
  ```
  `{ opportunity: null, reason: null, match_score: null }` when nothing qualifies.
- `GET /api/dashboard` — deterministic aggregations from the graph:
  ```ts
  { today: {
      actions_required: number,   // open TASKs due ≤ today + JOB opps with next_action.due ≤ today
      career: { new_jobs,               // JOB opportunities created in last 24h
                high_match,             // band PRIORITY count
                pending_applications,   // status APPLIED or RECRUITER_RESPONSE
                recruiters_awaiting },  // status RECRUITER_RESPONSE
      business:  { discovered: 0, worth_approaching: 0, teasers_ready: 0 },   // Phase 3
      affiliate: { content_opportunities: 0, scheduled: 0 },                  // Phase 4
      gems:      { tokens_detected: 0, passed_filter: 0 } },                  // Phase 5
    agents: Node[],               // the 6-agent registry (run state for the Agents widget)
    next_best_action: <NBA shape above> | null }
  ```

### Tasks
- `GET /api/tasks?status&due_before&overdue&limit&offset&sort` — `status` = `TODO|IN_PROGRESS|DONE|CANCELLED`; `due_before` = ISO; `overdue=true` = due_at < now. → `{ items, total }`
- `GET /api/tasks/:id/events` **[W2]** → `{ items: Event[], total }`
- `POST /api/tasks` — body: `{ data: { title, description?, opportunity_id?, priority? }, status?, due_at?, name?, source?, tags?, notes? }`. Auto-creates a `serves` edge when `opportunity_id` is set. → 201 Node
- `PATCH /api/tasks/:id` — body: `{ status?, data?, due_at?, name?, tags?, notes? }`. → Node

### Graph
- `GET /api/graph/neighbors/:id?depth=1` — BFS up to `depth` (1–3, default 1). → `{ node, edges: Edge[], neighbors: Node[] }`

### Edge shape
```ts
{ id, from_id, to_id, edge_type, data: object | null, created_at }
```
Known `edge_type`s (open vocabulary): `knows located_in hiring belongs_to matches has_problem solved_by owns posted_by contact_at requires uses related_to mentions observed_by serves` (+ doc 02 §5 extended set: `experienced_in lives_near recruiter_for audience_of wrote offers posted parent_of offered_by creates converts_to delivers_for produced assigned_to addresses promotes performed_by observes produces analyzes`). `matches` edges carry `data: { score }`.

### Ops
- `POST /api/seed` — idempotent seed (profile, RaziSurf, 6 skills, Cyberjaya location, 6 agent stubs, edges). → `{ created: {nodes, edges}, totals: {nodes, edges}, profile_id, razisurf_id, agent_ids[] }`
- `POST /api/backup` — snapshot via `VACUUM INTO` (keeps last 30). → `{ path, filename, kept, pruned }`

### Action Gate **[W4]** (T1.11 — docs/03 §4: system prepares → Razi confirms → status updates)

The gate queue. `PENDING` items are the dashboard's "actions required". Every decision appends a `gate_decision` event (and a `status_changed` event on approve) — decisions are **final** (409 `ALREADY_DECIDED` on re-decide).

**GateAction wire shape** (returned by all gate endpoints; `opportunity`/`task` are the linked nodes, enriched on read):
```ts
{
  id, action_type: 'apply_to_job',
  status: 'PENDING'|'APPROVED'|'REJECTED',
  opportunity_id: ulid|null, task_id: ulid|null,
  payload: { opportunity_id, task_id?, cover_note?, resume_version?, apply_url?, notes? },
  summary: string,                    // "Apply to Senior Backend Engineer — NexLabs"
  created_at: iso, decided_at: iso|null,
  decision: 'approved'|'edited_approved'|'rejected'|null,
  decision_reason: string|null,       // required on reject
  opportunity: Node|null, task: Node|null   // enriched
}
```

- `GET /api/gate/actions?status&limit&offset` — `status` = `PENDING|APPROVED|REJECTED` (omit = all). → `{ items: GateAction[], total }`, newest first.
- `POST /api/gate/actions` — submit a draft. Body: `{ action_type: 'apply_to_job', payload: { opportunity_id, task_id?, cover_note?, … }, opportunity_id?, task_id? }` (top-level ids are fallbacks; `payload.opportunity_id` must resolve to an OPPORTUNITY, `task_id` to a TASK, else 422). → 201 GateAction (PENDING).
- `GET /api/gate/actions/:id` → GateAction (404 if unknown).
- `PATCH /api/gate/actions/:id` — edit the draft (PENDING only). Body: `{ payload }` — **merged** into the existing payload, re-validated. → GateAction.
- `POST /api/gate/actions/:id/approve` — body optional: `{ payload? }`. With `payload` = **edit-then-approve in one call** (merged, re-validated, decision `edited_approved`). Executes atomically:
  1. Ensures an "Apply to \<role\>" TASK exists (creates one when the draft had none, `source: 'gate'`, `serves` edge to the opportunity) and sets it `DONE` (`data.completed_at`).
  2. Opportunity → `APPLIED` with `data.applied_date` (today, ISO date) + `next_action = { type: 'follow_up', due: today+7 }`. Terminal/`HIRED` opportunities keep their status; an already-`APPLIED` opp just gets `applied_date` backfilled.
  3. Records `status_changed` + `gate_decision` events.
  → 200 `GateAction & { opportunity: Node & { band }, task: Node }`.
- `POST /api/gate/actions/:id/reject` — body: `{ reason }` (**required**, min 1 char — feeds LEARN). No side-effects on the opportunity/task. Records a `gate_decision` event. → 200 GateAction (REJECTED).

### Daily Brief **[W4]** (T1.10 — docs/03 §5 daily rhythm)

Deterministic reads, no writes, safe to poll.

- `GET /api/daily-brief/morning` →
  ```ts
  { kind: 'morning', date: 'YYYY-MM-DD',
    counts: { actions_required,      // open tasks due ≤ today + opps due ≤ today + pending gate approvals
              gate_pending, overdue_tasks,
              career: { new_jobs, high_match, pending_applications, recruiters_awaiting },
              business: { discovered }, affiliate: { content_opportunities }, gems: { tokens_detected } },
    priorities: [{ opportunity_id, role, company, score, band, next_action }],  // top 3–5: ANALYZED/QUALIFIED/READY_TO_APPLY, PRIORITY+APPLY bands, score DESC then soonest due
    next_best_action: <NBA shape> | null }
  ```
- `GET /api/daily-brief/evening` →
  ```ts
  { kind: 'evening', date,
    completed_today,            // tasks set DONE today (status_changed events)
    pending,                    // open tasks + opps awaiting action
    new_today: { opportunities, signals },
    gate_decisions_today,
    observation: string,        // ONE deterministic observation (rule chain, stable)
    recommendation: string }    // its paired next move
  ```

---

## 5. **[W3]** Job Analyst — deterministic scoring rules (T1.3)

v1 is fully deterministic (no API keys, reproducible). The `AnalystPort` interface in `server/src/agents/job-analyst.ts` is the seam for a future LLM-backed implementation — callers never change.

**Extraction (T1.3.1):** for jobs missing fields, infer from notes/stack/url/source — city names → `location`, `RM12k-RM16k` patterns → `salary_min/salary_max`, stack tokens (Node.js, React, TypeScript, Go, Python, Java, Kubernetes, AWS, GCP, …) → `stack`, AI-culture markers (AI-assisted, Claude Code, Cursor, Copilot, multi-agent, vibe coding, AI orchestration, LLM) → `ai_culture`. Explicit values are never overwritten; inferences are logged as a `Job Analyst inferred: key=value, …` note.

**Sub-scores (T1.3.2)** — all 0–100:

| Sub-score | Rule |
|---|---|
| `role_match` | seniority alignment × stack overlap, blended 60/40. Seniority: role Senior/Lead vs profile Senior → 100; Mid → 75; unknown → 60. Stack: overlap/required ×100; role stack unknown → 70 baseline. |
| `company_match` | software house / tech industry → 90 · known brand → 85 · unknown industry → 60 · non-tech → 40 · adjust +5 size 50–500, −10 size >5000 |
| `ai_culture` | each marker found (opportunity notes + company AI notes) → +20, cap 100 · none → 50 · explicit "no AI" → 20 |
| `location` | Cyberjaya → 100 · hybrid Cyberjaya → 95 · nearby (KL, Sepang, Putrajaya, Bangi, Dengkil, Puchong) → 80 · elsewhere in MY → 40 · unknown → 60 |
| `salary` | range midpoint within target band → 100 · ≥10% below band min → 70 · ≥25% below → 40 · above band max → 90 · unknown → 60 |
| `career_upside` | Senior role (profile Senior) → 70 · Lead/Principal → 90 · Mid → 50 · unknown → 60 · +15 AI-culture bonus · +5 new-stack learning · cap 100 |

**Dimensions (T1.3.3):** `role_dimension = avg(role_match, salary, career_upside)` · `company_dimension = avg(company_match, ai_culture, location)` — stored in `data.dimensions` so company-vs-role separation is visible per doc 02 §2.2.

**Total & band (T1.3.4):** `total = round(role_match×0.30 + company_match×0.20 + ai_culture×0.15 + location×0.15 + salary×0.10 + career_upside×0.10)` → `score` + `match_score` + band (≥90 PRIORITY · ≥75 APPLY · ≥60 REVIEW · <60 ARCHIVE).

**next_action (T1.3.5):** PRIORITY `{apply, today+1}` · APPLY `{apply, today+3}` · REVIEW `{review, today+7}` · ARCHIVE `{archive, today+14}`. Status: `DISCOVERED → ANALYZED` (stages past ANALYZED untouched).

**Persisted per job:** `data.matching`, `data.dimensions`, `data.next_action`, `score`, `match_score`, note `Job Analyst: 79 (APPLY) — role 90 · company 63`, `matches` edge profile→opportunity `{score}`, `analyzed` event.

---

## 6. Notes for the frontend agent

- **Port `8787`, prefix `/api`.** Proxy `/api` → `http://localhost:8787` in the FE dev server.
- **Never invent status/band values** — use the enums in §3 (also exported from `@razione-eye/shared` as `JOB_STATUSES`, `SCORE_BANDS`, etc.).
- `band` is computed by the server; FE reads it, never derives it.
- Schemas + TS types are importable from `@razione-eye/shared` (workspace package) once the FE is wired into the monorepo — `import { nodeSchema, type Node, JOB_STATUSES } from '@razione-eye/shared'`. **[W2]** also exports `eventSchema`, `importReportSchema`, `EVENT_TYPES`, `IMPORT_FORMATS`, `JOB_SOURCES` and their inferred types. **[W3]** adds the `analyzed` event type, `SubScores`, `noteText()`, and `next_action.due` may be `null` (the analyst always sets a concrete date, but hand-written entries may omit it). **[W4]** adds the Action Gate + Daily Brief surface: `gateActionSchema`, `createGateActionSchema`, `updateGateActionSchema`, `approveGateActionSchema`, `rejectGateActionSchema`, `applyToJobPayloadSchema`, `GATE_ACTION_TYPES`, `GATE_STATUSES`, `GATE_DECISIONS` and their inferred types (`GateAction`, `GateStatus`, `GateDecision`, `ApplyToJobPayload`, …). Gate decisions are **final** — the FE should hide approve/reject controls once `status !== 'PENDING'` (the server returns 409 `ALREADY_DECIDED` regardless).
