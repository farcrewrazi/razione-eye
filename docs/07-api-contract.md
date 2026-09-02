# RaziOne Eye — API Contract (Phase 0 + Wave 2)

> **This is the FE hand-off doc.** The frontend builds against these endpoints and shapes.
> Field names match [02-data-model.md](02-data-model.md) exactly (snake_case). Every write is validated by zod on the server — the schemas in `packages/shared/src/schemas.ts` are the executable source of truth.
> Companion: [06-dev-task-split.md §0](06-dev-task-split.md)
> **Wave 2 additions** (marked **[W2]**): Events/activity log, import pipeline (`/api/import*`), notes append, board payload.

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

`code` is one of: `VALIDATION` (422, zod failure) · `INVALID_STATUS` (422, status not in the pipeline for that opportunity_type) · `BAD_QUERY` (400, bad query param) · `NOT_FOUND` (404) · `INTERNAL` (500).

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
- **OPPORTUNITY (JOB)** `{ role, location?, url?, salary?, salary_min?, salary_max?, match_score?, matching?, contact?, next_action?, problems_detected?, suggested_offer? }`
  - `matching` — **six sub-scores, all 0–100, all optional**: `{ role_match?, company_match?, ai_culture?, location?, salary?, career_upside? }` (supersedes the older 5-key example in doc 02 §2.1). Unknown keys rejected.
  - `next_action` — `{ type: string, due: string }`
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
- `POST /api/agents/:id/run` — **stub** (Phase 0): appends a run entry, sets `last_run`, `last_status: "empty"`. Records an `agent_run` event. → updated Node

### Opportunities
- `GET /api/opportunities?type&status&band&q&limit&offset&sort&board` **[W2: board param]**
  - `type` = opportunity_type · `status` = pipeline stage · `band` = `PRIORITY|APPLY|REVIEW|ARCHIVE` (score-derived) · `q` = substring on name+data · `limit` (default 50, max 200) · `offset` · `sort` = `score|created_at|updated_at|due_at|name`, prefix `-` for DESC (default `-created_at`)
  - → `{ items: (Node & { band })[], total }`
  - **[W2]** `board=true` → grouped-by-status payload for the pipeline board: `{ columns: [{ status, items: (Node & {band})[] }], total }` — one column per JOB status in pipeline order (empty columns included), other query params still apply.
- `GET /api/opportunities/:id` → `Node & { band, edges: Edge[], neighbors: Node[] }` (graph neighbors included)
- `GET /api/opportunities/:id/events` **[W2]** → `{ items: Event[], total }` (activity log for the detail screen)
- `POST /api/opportunities/:id/notes` **[W2]** — body: `{ text }`. Appends a `{text, created_at}` note + records a `note_added` event. → 201 Node
- `POST /api/opportunities` — body: `{ opportunity_type, status?, data, name?, source?, tags?, notes?, due_at?, score? }`. Status defaults to the pipeline's first stage; JOB `data` validated. Records an `opportunity_created` event. → 201 Node
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

---

## 5. Notes for the frontend agent

- **Port `8787`, prefix `/api`.** Proxy `/api` → `http://localhost:8787` in the FE dev server.
- **Never invent status/band values** — use the enums in §3 (also exported from `@razione-eye/shared` as `JOB_STATUSES`, `SCORE_BANDS`, etc.).
- `band` is computed by the server; FE reads it, never derives it.
- Schemas + TS types are importable from `@razione-eye/shared` (workspace package) once the FE is wired into the monorepo — `import { nodeSchema, type Node, JOB_STATUSES } from '@razione-eye/shared'`. **[W2]** also exports `eventSchema`, `importReportSchema`, `EVENT_TYPES`, `IMPORT_FORMATS`, `JOB_SOURCES` and their inferred types.
