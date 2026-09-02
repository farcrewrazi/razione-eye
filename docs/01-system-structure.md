# RaziOne Eye — System Structure

> How the system is organized: the 5 Eyes, the operating loop, the layers, and how everything connects.
> Companion docs: [00-project-summary.md](00-project-summary.md) · [02-data-model.md](02-data-model.md) · [03-agents-and-gates.md](03-agents-and-gates.md)

---

## 1. Bird's-eye view — The 5 Eyes

RaziOne Eye is one system, not five tools. Each "Eye" is a lens on the same underlying graph of People, Companies, Opportunities, Signals and Tasks.

```text
┌─────────────────────────────────────────────────────────────────────┐
│                           RAZIONE EYE                               │
│                Personal Operations Command Center                   │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  OPERATIONS LAYER                                              │  │
│  │                                                               │  │
│  │    CAREER EYE             BUSINESS EYE         GROWTH EYE     │  │
│  │    ───────────            ─────────────        ──────────     │  │
│  │    Job discovery         Website B2B           Affiliate      │  │
│  │    Job analysis          Consultancy agency    marketing      │  │
│  │    Application tracker   Lead pipeline         Content engine │  │
│  └───────────────────────────────┬───────────────────────────────┘  │
│                                  │ consumes                         │
│  ┌───────────────────────────────▼───────────────────────────────┐  │
│  │  INGESTION LAYER — SIGNAL EYE                                  │  │
│  │                                                               │  │
│  │    LinkedIn · Facebook · X · Threads · Company career pages   │  │
│  │    Google results · Business websites · Comment sections ·    │  │
│  │    Ram's Gem calls                                             │  │
│  │    → everything lands here FIRST as a typed SIGNAL             │  │
│  └───────────────────────────────┬───────────────────────────────┘  │
│                                  │ orchestrated by                  │
│  ┌───────────────────────────────▼───────────────────────────────┐  │
│  │  PLATFORM LAYER — CONTROL EYE                                  │  │
│  │                                                               │  │
│  │    Dashboard · Tasks · Agents · Graph · Metrics · Daily Brief │  │
│  │    Answers ONE question: "What should Razi do next?"          │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

**Priority order (locked):**

1. **Career Eye** — active now. ~30 jobs already discovered, none applied. Turn them into a managed pipeline.
2. **Signal Eye** — built incrementally to feed Career Eye (Phase 2), then Business (Phase 3), Growth (Phase 4), Gems (Phase 5).
3. **Control Eye** — the minimum viable version ships in Phase 1 (dashboard + pipeline + next best action); it deepens every phase after.
4. **Business Eye, Growth Eye, Gem Watch** — same Opportunity system, attached later. Never rebuilt separately.

---

## 2. The operating loop

Every feature in RaziOne Eye must fit one stage of this cycle. If it doesn't, it doesn't get built.

```text
   OBSERVE ──► UNDERSTAND ──► CONNECT ──► PRIORITIZE ──► ACT ──► LEARN
      │            │             │            │           │        │
      │            │             │            │           │        │
   watchers     AI analysis   knowledge    scoring     tasks +    outcome
   crawlers     + scoring      graph        + ranking   approval   analytics
   signal       (Job/Biz/     (links       (match      gates      (replies,
   ingestion    Affiliate     between       bands,                conversion,
                Analysts)     everything)   next best             performance)
                                                    action
      ▲                                                              │
      └─────────────────────── feedback closes the loop ────────────┘
```

| Stage | Example in RaziOne Eye |
|---|---|
| OBSERVE | Signal Watcher finds a LinkedIn post: "Our Cyberjaya team is growing" |
| UNDERSTAND | Job Analyst extracts the role, scores it 91/100 vs Razi's profile |
| CONNECT | Graph links the job → company → Node.js → Razi's `knows` edge |
| PRIORITIZE | Opportunity lands in READY TO APPLY with due=today |
| ACT | Task created: "Apply to ABC Technology before Friday" → you approve → apply |
| LEARN | "Companies mentioning AI orchestration replied 2× more" (Phase 6 / bonus) |

---

## 3. System layers

```text
┌──────────────────────────────────────────────────────────────────┐
│  L4 · PRESENTATION — custom web dashboard            (D-001)     │
│  ─ Dashboard · Opportunities · Pipeline boards · Tasks ·         │
│    Signals inbox · Companies · Agent status · Daily Brief        │
└──────────────────────────────┬───────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────┐
│  L3 · INTELLIGENCE — RaziOne Orchestrator + native agents        │
│  ─ Job Scout · Job Analyst · Business Scout · Business Analyst · │
│    Affiliate Analyst · Signal Watcher                            │
│                                                                  │
│         ↕  AGENT ADAPTER LAYER  (D-002)                          │
│    Existing external agents (Hermes & co.) are plugged in via    │
│    thin adapters. The Orchestrator NEVER calls them directly     │
│    and NEVER scrapes anything itself.                            │
└──────────────────────────────┬───────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────┐
│  L2 · KNOWLEDGE — the Graph                                       │
│  ─ Nodes: PERSON · COMPANY · OPPORTUNITY · PROJECT · TASK ·      │
│    SIGNAL · CONTENT · AGENT                                      │
│  ─ Edges: knows · located_in · hiring · has_problem · solved_by ·│
│    matches · posted_by · offered_by · related_to · ...           │
└──────────────────────────────┬───────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────┐
│  L1 · STORAGE — single-user, local-first store                   │
│  ─ Engine choice OPEN until Phase 0 kickoff (see decisions-log)  │
└──────────────────────────────────────────────────────────────────┘
```

### 3.1 Presentation (L4) — custom web app

- **D-001: the UI is a custom web dashboard.** ClickUp may be synchronized later (bonus), but the intelligence system lives in RaziOne Eye.
- Single user (Razi). No auth complexity in v0.x — a local/trusted-network app is enough.
- v0.1 screens: Dashboard, Opportunities, Tasks, Companies, Signals, Agents, Daily Brief.

### 3.2 Intelligence (L3) — Orchestrator, agents, adapter layer

The Orchestrator is the only component that decides *who runs, when*. Its rules:

1. It **delegates** — never scrapes LinkedIn, never analyzes a job itself, never posts anything.
2. It talks to agents through a uniform contract (see [03-agents-and-gates.md](03-agents-and-gates.md)).
3. It enforces the **Signal → Opportunity → Task** rule: every agent output resolves to exactly one of those three, or it is discarded.
4. It runs on a schedule (2–4 discovery cycles/day in steady state) and on demand ("Run Job Scout now").

**Agent Adapter Layer (how existing agents plug in):**

```text
RaziOne Orchestrator
        │  "discover_jobs(signals: hiring, location: Cyberjaya)"
        ▼
┌──────────────────┐     ┌──────────────────────┐
│  ADAPTER (thin)  │ ──► │  EXISTING AGENT      │
│  translate in/   │     │  (e.g. Hermes)       │
│  out, normalize  │ ◄── │  keeps its own brain │
└──────────────────┘     └──────────────────────┘
        │  normalized Signals / raw candidates
        ▼
   SIGNAL EYE → analysts → OPPORTUNITY nodes
```

- Existing agents are **wrapped, not rewritten**. D-002.
- An adapter is: a capability manifest (what the agent can do), an input translator, an output normalizer (must emit typed Signals).
- Native agents (Job Analyst etc.) live inside RaziOne Eye; external agents (scrapers, scouts you already run) sit behind adapters.

### 3.3 Knowledge (L2) — the graph

The graph is not a UI gimmick. It represents **relationships between everything being done**:

```text
Razi ── knows ──► Node.js ◄── uses ──── Company A
  │                                     │
  │                                  hiring
  ├── lives_near ──► Cyberjaya ◄── located_in
  │                                     │
  └──────────── matches ──► Job A ── belongs_to ──┘
```

Payoff queries (built as bonus phase B1, once data exists):

- *"Show me the best 10 companies in Cyberjaya, even if they're not hiring right now."*
- *"Which companies I discovered for jobs could also become consultancy clients?"*
- *"Which content topics relate to technologies companies are currently hiring for?"*

Full node/edge definitions: [02-data-model.md](02-data-model.md).

### 3.4 Storage (L1) — local-first, single user

Requirements (stack decision deferred to Phase 0, D-004):

| Requirement | Why |
|---|---|
| Single-user, runs on Razi's machine or one small box | No multi-tenancy, ever |
| Structured queries + graph traversal | Pipeline boards + relationship queries |
| Cheap import of mixed formats (JSON/CSV/Markdown) | The 30 existing jobs (D-003) |
| Snapshot/backup friendly | Career data is irreplaceable |
| Embedding-friendly (optional later) | Comment clustering, dedup |

---

## 4. Control Eye — the homepage contract

The dashboard's job is **not to show information**. It answers:

> **"What should Razi do next?"**

Contract for the homepage (v0.1):

```text
RAZIONE EYE — Tuesday

TODAY — ⚡ N actions required
────────────────────────
CAREER     12 new jobs · 3 high-match · 5 applications pending · 2 recruiters awaiting reply
BUSINESS   6 businesses discovered · 2 worth approaching · 1 teaser ready
AFFILIATE  3 content opportunities · 1 post scheduled
GEMS       2 tokens detected · 1 passed initial filter
────────────────────────
AGENTS     Job Scout ✓ · Job Analyst ✓ · Business Scout ✓ · ... (last run, next run)
────────────────────────
NEXT BEST ACTION

  Apply: Senior Software Engineer — ABC Technology, Cyberjaya
  Match: 91%

  [Review] [Apply]
```

Two daily artifacts, both generated by Control Eye:

1. **Morning — RAZIONE DAILY**: what changed overnight + today's priorities (top 3–5).
2. **Evening — DAILY REVIEW**: completed/pending/new counts + one AI observation with a recommendation (e.g. *"Discovery outpacing application — pause Job Scout tomorrow"*).

---

## 5. What RaziOne Eye is NOT

- Not five separate AI tools bolted together (agents get managed, they don't manage you).
- Not a scraper collection (scrapers are OBSERVE stage servants behind adapters).
- Not a spam machine (Action Gate — see [03-agents-and-gates.md](03-agents-and-gates.md)).
- Not a dump (nothing enters the pipeline without becoming a Signal, Opportunity, or Task).
- Not an auto-trader (Gem Watch alerts; **you** decide, always).

---

## 6. v0.1 module map

```text
RAZIONE EYE v0.1
│
├── 1. Dashboard          (Control Eye homepage + Next Best Action)
├── 2. Opportunities      (Career only in v0.1)
│     ├── Pipeline board  (DISCOVERED → ... → HIRED, terminals)
│     └── Opportunity detail (scores, matching breakdown, notes)
├── 3. Tasks              (next actions, due dates, done)
├── 4. Companies          (company cards: stack, location, AI culture)
├── 5. Signals            (raw inbox, triage, promote → Opportunity)
├── 6. Agents             (status, last run, run now)
└── 7. Daily Brief        (morning RAZIONE DAILY + evening DAILY REVIEW)
```

Everything beyond this — scrapers, business eye, affiliate, gems, graph intelligence — is phased in by [04-phases-stories-tasks.md](04-phases-stories-tasks.md).
