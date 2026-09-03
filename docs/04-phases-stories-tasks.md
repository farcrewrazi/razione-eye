# RaziOne Eye — Phases, Stories & Tasks

> The build roadmap. Each phase: goal → user stories → tasks → exit criteria. Bonus/future work lives in [05-bonus-future.md](05-bonus-future.md).
> Companion docs: [01-system-structure.md](01-system-structure.md) · [02-data-model.md](02-data-model.md) · [03-agents-and-gates.md](03-agents-and-gates.md)

**Ground rules (apply to every phase):**

- Timeline is deliberately absent. Priority order is fixed: each phase starts only when the previous one's exit criteria are met.
- Every phase must respect the Action Gate ([03-agents-and-gates.md §4](03-agents-and-gates.md)) — no exceptions, no "just this once".
- The PM rule (D-005) holds until Phase 1 exits: **no scrapers, no affiliate automation, no business scanner, no crypto bot.**

**Dev tags** (per D-007 — full split in [06-dev-task-split.md](06-dev-task-split.md)):
`[BE]` → **backend** (storage, graph, agents, pipelines, APIs) · `[FE]` → **frontend** (dashboard, boards, screens, widgets) · `[BE+FE]` → split task — each side takes its half from the split doc.

---

## Phase 0 — Foundation

**Goal:** a running skeleton: repo, storage, the 8 objects, a dashboard shell you can open.

### Stories

- **S0.1** — As Razi, I want a running app shell, so I have something to click instead of a spec.
- **S0.2** — As Razi, I want the data model implemented, so every later phase writes into it instead of reinventing storage.
- **S0.3** — As Razi, I want a place to keep my profile (skills, seniority, target salary, target location), so the Job Analyst has something to score against.

### Tasks

- [x] T0.1 `[BE]` Decide storage engine + graph approach (close D-004; options in [01-system-structure.md §3.4](01-system-structure.md)) — SQLite property graph
- [x] T0.2 `[BE+FE]` Scaffold repo: app skeleton, config, seed script
- [x] T0.3 `[BE]` Implement the 8 core objects + common fields ([02-data-model.md §1](02-data-model.md))
- [x] T0.4 `[BE]` Implement graph edges — at minimum: `knows`, `located_in`, `hiring`, `belongs_to`, `matches`, `has_problem`, `solved_by` ([02-data-model.md §5](02-data-model.md))
- [x] T0.5 `[BE]` Implement the OPPORTUNITY type system (JOB / WEBSITE / CONSULTANCY / AFFILIATE / CRYPTO)
- [x] T0.6 `[BE]` Implement the SIGNAL object + disposition states (NEW / PROMOTED / DISMISSED / DUPLICATE)
- [x] T0.7 `[BE]` Implement the TASK object with due dates + status
- [x] T0.8 `[BE+FE]` Razi Profile (the Farcrew Razi `PERSON` node): full name, skills, seniority, salary band, location (Cyberjaya), AI-culture preferences
- [x] T0.8b `[BE]` Seed **RaziSurf** as a `COMPANY` node + `Farcrew Razi ── owns ──► RaziSurf` edge — the business entity behind all Business Eye work ([02-data-model.md §5](02-data-model.md))
- [x] T0.9 `[FE]` Dashboard shell: navigation for the 7 v0.1 modules ([01-system-structure.md §6](01-system-structure.md))
- [x] T0.10 `[BE]` Agent registry (name, capability, kind, schedule, last run) — stub entries for the six starter agents
- [x] T0.11 `[BE]` Backup/snapshot routine (career data is irreplaceable)

### Exit criteria

```text
□ App runs; all 7 module screens exist (even if mostly empty)
□ Objects + edges persist and are queryable
□ Razi Profile is entered
□ Six agent stubs appear in the registry
```

---

## Phase 1 — Career Eye MVP ⭐ (prove the architecture)

**Goal:** the first real deliverable. **Your ~30 existing jobs get imported, analyzed, scored, ranked, and the system tells you what to apply to next.** No new discovery runs. This phase proves the whole architecture works before anything else gets built.

### Stories

- **S1.1** — As Razi, I want my ~30 existing jobs imported regardless of their format (JSON, CSV, Markdown, agent-chat exports — D-003), so nothing gets re-typed.
- **S1.2** — As Razi, I want each imported job normalized into a JOB Opportunity Node ([02-data-model.md §2.1](02-data-model.md)), so they become one managed pipeline instead of a list.
- **S1.3** — As Razi, I want the Job Analyst to score every job against my profile with sub-scores, so I trust the ranking.
- **S1.4** — As Razi, I want a pipeline board (DISCOVERED → … → HIRED + terminals), so I always know where every job stands.
- **S1.5** — As Razi, I want application + response tracking (applied date, recruiter replies, interviews), so follow-ups never slip.
- **S1.6** — As Razi, I want a Next Best Action card on the dashboard, so I never wonder what to do next.
- **S1.7** — As Razi, I want a daily brief (morning priorities + evening review), so the system behaves like a manager.
- **S1.8** — As Razi, I want manual signal entry (paste a post/link), so I can feed the system things I notice myself.

### Tasks

- [x] T1.1 `[BE]` Build the **import pipeline** for mixed formats (D-003):
  - [x] T1.1.1 `[BE]` JSON/CSV importer (mapping to Opportunity Node schema)
  - [x] T1.1.2 `[BE]` Markdown/notes importer (semi-structured parsing)
  - [x] T1.1.3 `[BE]` Agent-conversation export importer (extract job entries from chat logs)
  - [x] T1.1.4 `[BE]` **Normalization step**: all formats → unified Opportunity Node; flag incomplete records instead of guessing
  - [x] T1.1.5 `[BE]` Dedup pass (same company+role+source → keep richest, link duplicates)
  - [x] T1.1.6 `[FE]` Manual-entry form as the fallback for stragglers
- [x] T1.2 `[BE]` Import + verify the ~30 jobs (pipeline proven with a 45-record corpus across JSON/CSV/MD/chat → 34 imported · 6 deduped · 5 flagged; swap in the real ~30 job files when ready)
- [x] T1.3 `[BE]` Job Analyst agent (native):
  - [x] T1.3.1 `[BE]` Extraction: company, role, location, salary, stack, source, URL, notes
  - [x] T1.3.2 `[BE]` Profile comparison across the 6 sub-scores ([02-data-model.md §6.1](02-data-model.md))
  - [x] T1.3.3 `[BE]` Separate company score vs role score
  - [x] T1.3.4 `[BE]` Band assignment (90–100 PRIORITY / 75–89 APPLY / 60–74 REVIEW / <60 ARCHIVE)
  - [x] T1.3.5 `[BE]` `next_action` generation with due dates
- [x] T1.4 `[BE]` Run analysis over all imported jobs → ranked pipeline (end-to-end test: import → analyze → ranked output)
- [x] T1.5 `[FE]` Pipeline board UI with drag-between-stages + terminal states
- [x] T1.6 `[FE]` Opportunity detail view: scores, matching breakdown, notes, contact, activity log
- [x] T1.7 `[FE]` Companies screen: auto-created from job imports (stack, location, AI culture notes)
- [x] T1.8 `[BE+FE]` Application tracking: status transitions, applied-date, reply/interview logging, follow-up reminders
- [x] T1.9 `[FE]` Next Best Action widget (top-priority task with [Review] [Apply])
- [x] T1.10 `[BE+FE]` Daily Brief v1:
  - [x] T1.10.1 `[BE]` Morning: counts by eye + top 3–5 priorities
  - [x] T1.10.2 `[BE]` Evening: completed/pending/new + one AI observation + recommendation
  - [x] T1.10.3 `[FE]` Daily Brief screen + agent status rendering
- [x] T1.11 `[BE+FE]` Action Gate v1: apply-task flow = system prepares → Razi confirms → status updates (see [03-agents-and-gates.md §4](03-agents-and-gates.md))
- [x] T1.12 `[FE]` Signal inbox screen with manual entry + promote-to-opportunity action

### Exit criteria

```text
□ 30 jobs live in the pipeline (deduped, scored, ranked)
□ Dashboard shows: discovered 30 · qualified N · ready-to-apply N · applied 0→N · replies · interviews
□ Next Best Action correctly surfaces the top job every morning
□ At least 5 real applications tracked through the Action Gate
□ Daily Brief (morning + evening) generated without manual poking
□ Architecture proven: Signal → Opportunity → Task ran end-to-end
```

> **Only after this box is ticked does any scraper/automation work begin.** — the PM rule (D-005)

---

## Phase 2 — Continuous Discovery (Signal Eye comes online)

**Goal:** discovery stops being a one-time import and becomes a heartbeat. 2–4 cycles/day across LinkedIn, Facebook, X, Threads + career pages.

### Stories

- **S2.1** — As Razi, I want the Job Scout + Signal Watcher running on a schedule, so new opportunities find me while I work.
- **S2.2** — As Razi, I want hidden hiring signals detected (not just formal postings), so I reach companies before the crowd.
- **S2.3** — As Razi, I want new discoveries deduped against my existing pipeline, so nothing double-counts or spams me.
- **S2.4** — As Razi, I want discovery volume I control (pause/resume, cycle count), so applying always outranks discovering.

### Tasks

- [ ] T2.1 `[BE]` Adapter Layer implementation (D-002) — wrap existing discovery agents:
  - [ ] T2.1.1 `[BE]` Capability manifest format + adapter contract ([01-system-structure.md §3.2](01-system-structure.md))
  - [ ] T2.1.2 `[BE]` Output normalizer: external agent output → typed SIGNALs
  - [ ] T2.1.3 `[BE]` First adapter: the agent that found the original 30 jobs
- [ ] T2.2 `[BE]` Source connectors (via adapters — orchestrator still never scrapes):
  - [ ] T2.2.1 `[BE]` LinkedIn (posts + jobs)
  - [ ] T2.2.2 `[BE]` Facebook
  - [ ] T2.2.3 `[BE]` X
  - [ ] T2.2.4 `[BE]` Threads
  - [ ] T2.2.5 `[BE]` Company career pages (watched-company list)
  - [ ] T2.2.6 `[BE]` Google results + job portals
- [ ] T2.3 `[BE+FE]` Search-phrase config (direct + culture + hidden-signal sets from [03-agents-and-gates.md §2.1](03-agents-and-gates.md)) — editable in UI, not code
- [ ] T2.4 `[BE]` Hidden hiring signal classifier (SOCIAL_POST → hiring-intent detection)
- [ ] T2.5 `[BE]` Dedup engine: new signal vs existing opportunities (company+role+recency window)
- [ ] T2.6 `[BE+FE]` Orchestrator scheduler: 2–4 cycles/day, backoff on errors, run-now button
- [ ] T2.7 `[BE+FE]` Signal triage UI: inbox, dismiss, promote; "AI determines → Opportunity" auto-routing for high-confidence signals
- [ ] T2.8 `[BE+FE]` Alerting: new high-match discovery surfaces in Next Best Action + Daily Brief

### Exit criteria

```text
□ Discovery runs unattended for 3+ consecutive days
□ New jobs flow: signal → analyst → scored opportunity → task, without manual steps
□ Duplicate rate on new discoveries < 10%
□ Razi can pause discovery in one click
```

---

## Phase 3 — Business Eye (B2B Website + Consultancy)

**Goal:** the same Opportunity system starts hunting business. Websites for local businesses + consultancy leads, one pipeline, zero rebuilds.

> **Entity note:** all Business Eye work is conducted under **RaziSurf** (Farcrew Razi's business entity). Outreach, teasers, proposals and won contracts are all RaziSurf-branded; opportunities carry `offered_by → RaziSurf` in the graph.

### Stories

- **S3.1** — As Razi, I want Business Scout to discover local businesses with weak digital presence, so my website service has a lead list.
- **S3.2** — As Razi, I want pain-signal scanning ("still using Excel", "manual process"), so consultancy leads find me too.
- **S3.3** — As Razi, I want the Business Analyst's checklist (website? mobile? booking? WhatsApp? SEO?) scored per business, so I know who to approach first.
- **S3.4** — As Razi, I want a teaser-site workflow (generate → review → attach to outreach), so my pitch arrives as a demo, not a promise.
- **S3.5** — As Razi, I want outreach through the Action Gate, so every message is deliberate.

### Tasks

- [ ] T3.1 `[BE]` Business Scout agent: local-business discovery (Cyberjaya + surrounding), categories from [03-agents-and-gates.md §2.3](03-agents-and-gates.md)
- [ ] T3.2 `[BE]` Pain-signal scanner: phrase set config + SOCIAL_POST/BUSINESS_DISCOVERY classification
- [ ] T3.3 `[BE]` Business Analyst agent: 8-point checklist → problems detected + suggested offer + opportunity score
- [ ] T3.4 `[FE]` Business pipeline board (DISCOVERED BUSINESS → … → WON) — reuses Phase 1 machinery with WEBSITE/CONSULTANCY types
- [ ] T3.5 `[BE+FE]` Teaser-site workflow:
  - [ ] T3.5.1 `[BE]` PROJECT object activation for teaser builds
  - [ ] T3.5.2 `[BE]` Generate-teaser action (draft brief via AI; actual generation can be manual/assisted in this phase)
  - [ ] T3.5.3 `[FE]` Teaser gallery + attach-to-outreach
- [ ] T3.6 `[BE+FE]` Outreach drafting (AI writes it, Action Gate approves it, Razi sends it)
- [ ] T3.7 `[FE]` Meeting/proposal tracking (MEETING → PROPOSAL → WON/LOST states)
- [ ] T3.8 `[BE]` Graph enrichment: `has_problem` / `solved_by` / `offered_by (RaziSurf)` edges populated

### Exit criteria

```text
□ ≥ 20 businesses analyzed in the pipeline
□ ≥ 1 teaser site produced and attached to outreach
□ First outreach sequence sent through the Action Gate
□ Zero new architecture: business opportunities rode the exact Phase 1 rails
```

---

## Phase 4 — Growth Eye (Affiliate)

**Goal:** affiliate marketing gets tracked first, automated second. Comments get analyzed; content opportunities surface with evidence.

### Stories

- **S4.1** — As Razi, I want my existing affiliate blueprint tracked as a pipeline (Ideas → Research → Script → Produce → Published → Performance), so execution stops depending on memory.
- **S4.2** — As Razi, I want the Affiliate Analyst to cluster comments on my content, so content ideas come from proven demand.
- **S4.3** — As Razi, I want content-opportunity cards (topic + demand score + evidence + affiliate products), so I know what to make next and why.
- **S4.4** — As Razi, I want publishing gated, so nothing goes out without my approval.

### Tasks

- [ ] T4.1 `[BE]` CONTENT object activation: ideas, scripts, drafts, published, metrics
- [ ] T4.2 `[FE]` Content pipeline board (per [02-data-model.md §4.3](02-data-model.md))
- [ ] T4.3 `[BE]` Import existing affiliate blueprint tasks into the pipeline
- [ ] T4.4 `[BE]` Affiliate Analyst agent: comment ingestion → clustering → demand scores
- [ ] T4.5 `[FE]` Content-opportunity cards: topic, demand score, evidence counts, suggested format, affiliate-product links
- [ ] T4.6 `[BE+FE]` Publish flow behind the Action Gate (draft → approve → publish-assist)
- [ ] T4.7 `[BE+FE]` Performance tracking: metrics per published piece (manual entry OK in this phase; API later — B4)

### Exit criteria

```text
□ Affiliate blueprint fully tracked (no work lives outside the system)
□ ≥ 3 content opportunities generated from real comment evidence
□ ≥ 1 piece published through the gated flow
```

---

## Phase 5 — Gem Watch (Crypto, deliberately small)

**Goal:** alerts, not trading. Ram's Gem calls get watched, quickly analyzed, and surfaced with a classification. Razi decides everything.

### Stories

- **S5.1** — As Razi, I want Ram's Gem calls detected and turned into CRYPTO signals, so I don't miss them.
- **S5.2** — As Razi, I want a quick analysis card per token (liquidity, mcap, volume, holder concentration, age, social, momentum, risk flags), so my own review is fast.
- **S5.3** — As Razi, I want 🟢 WATCH / 🟡 SPECULATIVE / 🔴 AVOID classification, so noise stays out of my day.
- **S5.4** — As Razi, I want to opt in to alerts only for 🟢/🟡, so crypto never becomes a priority.

### Tasks

- [ ] T5.1 `[BE]` Ram's Gem source adapter (channel ingestion → GEM_CALL signals)
- [ ] T5.2 `[BE]` Crypto pipeline: SIGNAL → TOKEN → QUICK ANALYSIS → ALERT ([02-data-model.md §4.4](02-data-model.md))
- [ ] T5.3 `[BE+FE]` Analysis checklist data + classification UI (🟢/🟡/🔴)
- [ ] T5.4 `[BE+FE]` Alert routing: Daily Brief section + optional push (delivery channel decided in B6/open questions)
- [ ] T5.5 `[BE]` Hard rule enshrined in code: **no trading automation exists in any phase** — buy actions are not implemented, by design

### Exit criteria

```text
□ Gem calls flow in without manual checking
□ Each token gets an analysis card + classification within one discovery cycle
□ Zero trading automation anywhere in the codebase
```

---

## Phase map (recap)

```text
P0 Foundation ──► P1 Career MVP ──► P2 Discovery ──► P3 Business ──► P4 Affiliate ──► P5 Gems
   skeleton        prove it         heartbeat        second eye      third eye       smallest eye
                     │
                     └── GATE: nothing automated until P1 exit criteria are met
```

After Phase 5, the roadmap continues in [05-bonus-future.md](05-bonus-future.md) — graph intelligence, LEARN-stage analytics, more agents, and the decisions-intelligence era.
