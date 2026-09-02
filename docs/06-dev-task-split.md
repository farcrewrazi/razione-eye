# RaziOne Eye — Dev Task Split (Backend × Frontend)

> Every task from [04-phases-stories-tasks.md](04-phases-stories-tasks.md), split into two dev queues: **BE → backend** and **FE → frontend**. This is the hand-off doc — each side works from its own queue here, in phase order.
> Companion docs: [01-system-structure.md](01-system-structure.md) · [02-data-model.md](02-data-model.md) · [03-agents-and-gates.md](03-agents-and-gates.md)

---

## 0. The contract between the two sides

Before anything else — this is how the backend (BE) and frontend (FE) sides work together without colliding:

1. **API-first.** BE defines and freezes each endpoint's **request/response schema** before building it. FE builds screens against the agreed schema (mocked if BE isn't done yet), then swaps in the real endpoint. Neither waits for the other.
2. **The 8 objects in [02-data-model.md](02-data-model.md) are the shared language.** BE implements them as storage + API resources; FE renders them as screens. Field names in the API match the data-model doc exactly.
3. **Pipelines are pure data on the BE side** (status values per [02-data-model.md §4](02-data-model.md)); boards are pure presentation on the FE side. The FE never invents status values.
4. **Phases are gated** (see 04). Both agents stay inside the current phase — no jumping ahead, per D-005.
5. **Integration checkpoint at each phase exit.** FE wired to real BE before the phase's exit criteria can be checked.

```text
   BACKEND (BE)                          FRONTEND (FE)
   ─────────────                        ────────────
   storage · graph · objects            dashboard · boards · screens
   agents · pipelines · import          forms · widgets · cards
   API schemas · scheduler              rendering · interaction
        │                                    │
        └──────── API contract ──────────────┘
          (schemas frozen in doc 02
           + endpoint list per phase)
```

**Tag legend:** `BE` = backend · `FE` = frontend · `BE+FE` = split task (each side takes its half, listed separately in its queue below).

---

## 1. Backend queue (BE)

### Phase 0 — Foundation

- [ ] T0.1 Decide storage engine + graph approach (close D-004)
- [ ] T0.2-BE Half of scaffold: backend app skeleton, config, seed script, API entry point
- [ ] T0.3 Implement the 8 core objects + common fields
- [ ] T0.4 Implement graph edges (`knows`, `located_in`, `hiring`, `belongs_to`, `matches`, `has_problem`, `solved_by`)
- [ ] T0.5 Implement the OPPORTUNITY type system (JOB / WEBSITE / CONSULTANCY / AFFILIATE / CRYPTO)
- [ ] T0.6 Implement the SIGNAL object + disposition states (NEW / PROMOTED / DISMISSED / DUPLICATE)
- [ ] T0.7 Implement the TASK object with due dates + status
- [ ] T0.8-BE Razi Profile storage: PERSON node (full name, skills, seniority, salary band, location, AI-culture prefs) + read/update API
- [ ] T0.8b Seed RaziSurf COMPANY node + `Farcrew Razi ── owns ──► RaziSurf` edge
- [ ] T0.10 Agent registry (name, capability, kind, schedule, last run) — six stub entries
- [ ] T0.11 Backup/snapshot routine

### Phase 1 — Career Eye MVP

- [ ] T1.1 Import pipeline (whole subtree is BE):
  - [ ] T1.1.1 JSON/CSV importer
  - [ ] T1.1.2 Markdown/notes importer
  - [ ] T1.1.3 Agent-conversation export importer
  - [ ] T1.1.4 Normalization: all formats → unified Opportunity Node; flag, don't guess
  - [ ] T1.1.5 Dedup pass (company+role+source → keep richest, link duplicates)
  - [ ] T1.1.6-BE Endpoint for manual job entry (FE builds the form)
- [ ] T1.2 Import + verify the ~30 jobs (reconcile counts)
- [ ] T1.3 Job Analyst agent:
  - [ ] T1.3.1 Extraction (company, role, location, salary, stack, source, URL, notes)
  - [ ] T1.3.2 Profile comparison — 6 sub-scores
  - [ ] T1.3.3 Separate company score vs role score
  - [ ] T1.3.4 Band assignment (PRIORITY / APPLY / REVIEW / ARCHIVE)
  - [ ] T1.3.5 `next_action` generation with due dates
- [ ] T1.4 Analysis run + ranked-pipeline API
- [ ] T1.8-BE Application tracking backend: status transitions, applied-date, reply/interview logging, follow-up reminder engine
- [ ] T1.10-BE Daily Brief generator: morning counts + priorities, evening review + one AI observation
- [ ] T1.11-BE Action Gate v1 backend: pending-approval queue, approve/reject/edit, decision log

### Phase 2 — Continuous Discovery

- [ ] T2.1 Adapter Layer: capability manifest + adapter contract, output normalizer → typed SIGNALs, first adapter (the agent that found the original 30)
- [ ] T2.2 Source connectors behind adapters: LinkedIn, Facebook, X, Threads, career pages, Google/portals
- [ ] T2.3-BE Search-phrase config storage + API (FE builds the editor)
- [ ] T2.4 Hidden hiring signal classifier (SOCIAL_POST → hiring intent)
- [ ] T2.5 Dedup engine (company+role+recency window)
- [ ] T2.6-BE Orchestrator scheduler: 2–4 cycles/day, backoff, run-now trigger endpoint
- [ ] T2.7-BE Signal triage backend: dismiss/promote endpoints, auto-routing rules for high-confidence signals
- [ ] T2.8-BE Alerting engine: new high-match discovery → Next Best Action + Daily Brief injection

### Phase 3 — Business Eye

- [ ] T3.1 Business Scout agent (local-business discovery, Cyberjaya + surrounding)
- [ ] T3.2 Pain-signal scanner (phrase-set config + classification)
- [ ] T3.3 Business Analyst agent (8-point checklist → problems + suggested offer + score)
- [ ] T3.5.1 PROJECT object activation for teaser builds
- [ ] T3.5.2 Generate-teaser action (AI draft brief; generation manual/assisted)
- [ ] T3.6-BE Outreach drafting backend: AI draft generation + Action Gate queue
- [ ] T3.8 Graph enrichment: `has_problem` / `solved_by` / `offered_by (RaziSurf)` edges

### Phase 4 — Growth Eye

- [ ] T4.1 CONTENT object activation (ideas, scripts, drafts, published, metrics)
- [ ] T4.3 Import existing affiliate blueprint tasks
- [ ] T4.4 Affiliate Analyst agent: comment ingestion → clustering → demand scores
- [ ] T4.6-BE Publish-gate backend: draft → approval queue → publish-assist state machine
- [ ] T4.7-BE Performance tracking backend: metrics per published piece (manual entry endpoints; API later — B4)

### Phase 5 — Gem Watch

- [ ] T5.1 Ram's Gem source adapter (→ GEM_CALL signals)
- [ ] T5.2 Crypto pipeline: SIGNAL → TOKEN → QUICK ANALYSIS → ALERT
- [ ] T5.3-BE Analysis checklist data + classification storage (🟢/🟡/🔴)
- [ ] T5.4-BE Alert routing: Daily Brief section + optional push channel
- [ ] T5.5 Hard rule in code: no trading automation, buy actions not implemented — by design

---

## 2. Frontend queue (FE)

### Phase 0 — Foundation

- [ ] T0.2-FE Half of scaffold: frontend app skeleton, routing, API client, design tokens
- [ ] T0.9 Dashboard shell: navigation for the 7 v0.1 modules (Dashboard, Opportunities, Tasks, Companies, Signals, Agents, Daily Brief)

### Phase 1 — Career Eye MVP

- [ ] T1.1.6-FE Manual-entry form for stragglers (against T1.1.6-BE endpoint)
- [ ] T1.5 Pipeline board UI: drag-between-stages + terminal states
- [ ] T1.6 Opportunity detail view: scores, matching breakdown, notes, contact, activity log
- [ ] T1.7 Companies screen: cards from job imports (stack, location, AI culture)
- [ ] T1.8-FE Application tracking UI: status transitions, applied-date, reply/interview logging, follow-up reminders (against T1.8-BE)
- [ ] T1.9 Next Best Action widget ([Review] [Apply] actions)
- [ ] T1.10.3 Daily Brief screen + agent status rendering (morning priorities + evening review)
- [ ] T1.11-FE Action Gate UI: pending-approval list, approve/reject/edit-then-approve flow
- [ ] T1.12 Signal inbox screen: manual entry + promote-to-opportunity

### Phase 2 — Continuous Discovery

- [ ] T2.3-FE Search-phrase config editor (direct + culture + hidden-signal sets, editable in UI)
- [ ] T2.6-FE Scheduler controls: pause/resume discovery, cycle count, run-now button
- [ ] T2.7-FE Signal triage UI: inbox, dismiss, promote, auto-routed opportunities view
- [ ] T2.8-FE Alert rendering: high-match discoveries in Next Best Action + Daily Brief

### Phase 3 — Business Eye

- [ ] T3.4 Business pipeline board (WEBSITE/CONSULTANCY types on Phase 1 board machinery)
- [ ] T3.5.3 Teaser gallery + attach-to-outreach UI
- [ ] T3.6-FE Outreach drafting UI: AI draft → review → Action Gate approval
- [ ] T3.7 Meeting/proposal tracking UI (MEETING → PROPOSAL → WON/LOST)

### Phase 4 — Growth Eye

- [ ] T4.2 Content pipeline board (Ideas → Research → Script → Produce → Published → Performance)
- [ ] T4.5 Content-opportunity cards: topic, demand score, evidence counts, format, affiliate links
- [ ] T4.6-FE Publish flow UI: draft → approve → publish-assist
- [ ] T4.7-FE Performance tracking view: metrics entry + per-piece display

### Phase 5 — Gem Watch

- [ ] T5.3-FE Analysis card UI: checklist + 🟢/🟡/🔴 classification
- [ ] T5.4-FE Alert views: Gem section in Daily Brief + optional push opt-in

---

## 3. Split-task decomposition (BE+FE tasks → who does what)

| Task | BE (backend) | FE (frontend) |
|---|---|---|
| **T0.2** Scaffold | Backend skeleton, config, seed script, API entry | Frontend skeleton, routing, API client, design tokens |
| **T0.8** Razi Profile | PERSON node storage + read/update API | Profile form + display screen |
| **T1.8** Application tracking | Transitions, logging, reminder engine | Tracking views + forms |
| **T1.10** Daily Brief v1 | Morning/evening generators + AI observation | Daily Brief screen + agent status |
| **T1.11** Action Gate v1 | Pending queue, approve/reject, decision log | Approval list + review flow UI |
| **T2.3** Search-phrase config | Config storage + API | Phrase-set editor UI |
| **T2.6** Scheduler | Cron, backoff, run-now endpoint | Pause/resume/cycle controls |
| **T2.7** Signal triage | Dismiss/promote endpoints, auto-routing | Triage inbox UI |
| **T2.8** Alerting | Alert engine → NBA + Brief injection | Alert rendering |
| **T3.5** Teaser workflow | PROJECT activation, generate-teaser action | Teaser gallery UI |
| **T3.6** Outreach drafting | AI drafts + gate queue | Draft review + approval UI |
| **T4.6** Publish flow | Gate state machine | Publish flow UI |
| **T4.7** Performance tracking | Metrics endpoints | Metrics entry + display |
| **T5.3** Crypto analysis | Checklist data + classification storage | Analysis card UI |
| **T5.4** Alert routing | Routing engine + push channel | Gem alert views |

---

## 4. Work-order summary (per phase, per side)

Quick counts for planning the hand-off:

| Phase | BE tasks | FE tasks |
|---|---|---|
| P0 Foundation | 11 | 2 |
| P1 Career MVP | 18 | 9 |
| P2 Discovery | 8 | 4 |
| P3 Business | 7 | 4 |
| P4 Affiliate | 5 | 4 |
| P5 Gems | 5 | 2 |
| **Total** | **54** | **25** |

> The BE queue is heavier — that's the nature of this system (agents, pipelines, storage, importers). If the FE queue runs dry mid-phase, its next valid work is: (a) polishing existing screens, (b) building the next phase's screens **against mocked schemas**, or (c) a ClickUp-sync UI spike (B5). Never BE work, never next-phase BE planning.
