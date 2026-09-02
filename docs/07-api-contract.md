# RaziOne Eye — API Contract (Phase 0)

> **This is the FE hand-off doc.** The frontend builds against these endpoints and shapes.
> Field names match [02-data-model.md](02-data-model.md) exactly (snake_case). Every write is validated by zod on the server — the schemas in `packages/shared/src/schemas.ts` are the executable source of truth.
> Companion: [06-dev-task-split.md §0](06-dev-task-split.md)

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
- `POST /api/agents/:id/run` — **stub** (Phase 0): appends a run entry, sets `last_run`, `last_status: "empty"`. → updated Node

### Opportunities
- `GET /api/opportunities?type&status&band&q&limit&offset&sort`
  - `type` = opportunity_type · `status` = pipeline stage · `band` = `PRIORITY|APPLY|REVIEW|ARCHIVE` (score-derived) · `q` = substring on name+data · `limit` (default 50, max 200) · `offset` · `sort` = `score|created_at|updated_at|due_at|name`, prefix `-` for DESC (default `-created_at`)
  - → `{ items: (Node & { band })[], total }`
- `GET /api/opportunities/:id` → `Node & { band, edges: Edge[], neighbors: Node[] }` (graph neighbors included)
- `POST /api/opportunities` — body: `{ opportunity_type, status?, data, name?, source?, tags?, notes?, due_at?, score? }`. Status defaults to the pipeline's first stage; JOB `data` validated. → 201 Node
- `PATCH /api/opportunities/:id` — body: any subset of the create fields (data is merged). → Node
- `PATCH /api/opportunities/:id/status` — body: `{ status }` (validated against the pipeline). → Node

### Companies
- `GET /api/companies?q&limit&offset&sort` → `{ items, total }`
- `GET /api/companies/:id` → `Node & { opportunities: (Node & {band})[] }` (its opportunities via `belongs_to`/`hiring` edges)

### Signals
- `GET /api/signals?disposition&signal_type&q&limit&offset` → `{ items, total }`
- `POST /api/signals` — body: `{ data: { signal_type, content, url?, observed_at, promoted_to? }, status?, source?, name?, tags?, notes? }` (status defaults `NEW`). → 201 Node
- `GET /api/signals/:id` → Node
- `PATCH /api/signals/:id` — body: `{ status?, data?, name?, tags?, notes? }` (disposition changes here). → Node

### Tasks
- `GET /api/tasks?status&due_before&overdue&limit&offset&sort` — `status` = `TODO|IN_PROGRESS|DONE|CANCELLED`; `due_before` = ISO; `overdue=true` = due_at < now. → `{ items, total }`
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
- Schemas + TS types are importable from `@razione-eye/shared` (workspace package) once the FE is wired into the monorepo — `import { nodeSchema, type Node, JOB_STATUSES } from '@razione-eye/shared'`.
