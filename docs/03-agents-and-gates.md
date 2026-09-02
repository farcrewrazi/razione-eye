# RaziOne Eye — Agents & Action Gates

> Who does the watching and thinking, how they're wired, and the rules that stop the system from becoming a spam machine.
> Companion docs: [01-system-structure.md](01-system-structure.md) · [02-data-model.md](02-data-model.md)

---

## 1. RaziOne Orchestrator — the conductor

The Orchestrator is the only component that decides **who runs, when**. It is deliberately dumb about content and strict about process.

```text
                    ┌──────────────────────────────┐
                    │      RAZIONE ORCHESTRATOR    │
                    │  schedule · dispatch · route │
                    └──────────────┬───────────────┘
                                   │
        ┌──────────┬───────────┬──┴───────┬───────────┬──────────┐
        ▼          ▼           ▼          ▼           ▼          ▼
    Job Scout  Job Analyst  Business  Business   Affiliate  Signal
    (discovery) (scoring)   Scout     Analyst    Analyst     Watcher
```

**Orchestrator rules (non-negotiable):**

1. **Never scrapes.** The Orchestrator never touches LinkedIn, Facebook, X, Threads or any site itself.
2. **Never analyzes.** It doesn't score jobs, doesn't read comment threads.
3. **Routes, doesn't judge.** Output from a scout goes to the matching analyst; output from an analyst is checked against the conversion rule, then routed to a pipeline.
4. **Enforces the conversion rule.** Every agent output resolves to SIGNAL, OPPORTUNITY or TASK — or it's discarded (see [02-data-model.md §7](02-data-model.md)).
5. **Owns the schedule.** 2–4 discovery cycles/day in steady state, plus on-demand runs.
6. **Enforces the Action Gate.** Nothing crosses the gate without approval where required.

**Agent contract (every agent, native or behind an adapter):**

```yaml
name:         string
capability:   discover | analyze | rank | prepare | draft | suggest
input:        typed request (e.g. signal set, source list, criteria)
output:       SIGNAL[] | OPPORTUNITY[] | TASK[]    # nothing else survives
schedule:     cron | on_demand | event
state:        last_run, last_status, runs[]
```

---

## 2. The six starter agents

Six agents, not thirty. Each owns one narrow capability.

| # | Agent | Eye | Capability | Input → Output |
|---|---|---|---|---|
| 1 | **Job Scout** | Career | discover | source list + search phrases → SIGNAL[] (JOB_POSTING, SOCIAL_POST) |
| 2 | **Job Analyst** | Career | analyze + rank | SIGNAL[] → OPPORTUNITY[] (scored, banded) |
| 3 | **Business Scout** | Business | discover | source list + pain-signal phrases → SIGNAL[] (BUSINESS_DISCOVERY) |
| 4 | **Business Analyst** | Business | analyze + rank | SIGNAL[] → OPPORTUNITY[] (problems detected, offer suggested) |
| 5 | **Affiliate Analyst** | Growth | analyze | comments + content metrics → CONTENT[] / OPPORTUNITY[] (AFFILIATE) |
| 6 | **Signal Watcher** | all | discover | platform feeds, gem channels → SIGNAL[] (raw, typed) |

### 2.1 Job Scout

- Searches LinkedIn, Facebook, X, Threads, company career pages, Google, job portals (Phase 2+).
- Search phrase sets (expandable, stored as config not code):
  - Direct: `"software engineer Cyberjaya"`, `"senior software engineer Cyberjaya"`, `"tech lead Cyberjaya"`, `"software house Cyberjaya"`, `"hiring Cyberjaya developer"`, `"AI engineer Cyberjaya"`, `"engineering lead Cyberjaya"`
  - Culture: `"vibe coding"`, `"AI-assisted development"`, `"Claude Code"`, `"Codex"`, `"multi-agent development"`, `"AI orchestration"`
- **Hidden hiring signals** — the high-value category that never hits job boards:
  - *"We're expanding our engineering team."* · *"Our Cyberjaya office is growing."* · *"Looking for talented developers."* · *"DM me if you're interested."* · *"New engineering team being established."*
- Emits typed signals; does not score.

### 2.2 Job Analyst

Runs every discovered job through a structured pipeline before it enters the task queue:

```text
JOB FOUND
    │
    ▼
Extract job information
    │
    ▼
Compare against Razi Profile
    ├── Skills
    ├── Seniority
    ├── Salary
    ├── Location
    ├── Company type
    ├── AI culture
    └── Career upside
    │
    ▼
Opportunity Score
    ├── 90–100 → PRIORITY
    ├── 75–89  → APPLY
    ├── 60–74  → REVIEW
    └── < 60   → ARCHIVE
```

- Scores **companies separately** from roles (role match 92 ≠ company match 86 — both matter).
- Fills the `matching` sub-score block on the JOB opportunity (see [02-data-model.md §2.1](02-data-model.md)).
- Never applies to anything. Drafts, ranks, suggests only.

### 2.3 Business Scout

- Scans for **pain signals**, not for "companies needing software consultant" (they never advertise that):
  - *"We're still using Excel"* · *"manual process"* · *"looking for software"* · *"need automation"* · *"system always down"* · *"need dashboard"* · *"inventory issue"* · *"need CRM"* · *"WhatsApp orders"* · *"booking management"* · *"AI implementation"* · *"looking to digitize"*
- Also discovers businesses with weak digital presence (Restaurant, Clinic, SME, Training company, Property agent, Manufacturer, Small hotel, Professional service, Retailer).
- Emits BUSINESS_DISCOVERY signals with embedded evidence.

### 2.4 Business Analyst

Analysis checklist per discovered business:

```text
Website exists?       No
Website quality?      Poor
Mobile friendly?      No
Google presence?      Weak
Booking system?       No
WhatsApp integration? No
SEO?                  Weak
Automation?           None
```

- Produces the WEBSITE / CONSULTANCY opportunity with problems detected + suggested offer (e.g. RM3,500 modernization) + recommended next step (e.g. "Create teaser homepage").

### 2.5 Affiliate Analyst

- Clusters comment sections and audience questions on existing content:
  - 42 people asking *"Which one works with WordPress?"* → CONTENT opportunity "Claude Code vs Cursor for WordPress developers", demand score 89.
- Maps niche → problem → audience → product → content idea (structure from [05-bonus-future.md](05-bonus-future.md) B3 when fully built; v1 tracks ideas→performance simply).

### 2.6 Signal Watcher

- The always-on eye: platform feeds, gem channels (Ram's Gem), company career-page diffs.
- Routes raw events into the Signal inbox with correct type + source.
- In v0.1 this agent exists only as a stub (manual/simulated signal input) — real sources attach in Phase 2+.

---

## 3. Parked agents (later, on purpose)

Do not build until the core loop is proven (PM rule, D-005):

```text
Outreach Agent        Resume Agent          Company Research Agent
Proposal Agent        Content Agent         Social Listener
Crypto Analyst        Teaser Generator      ...
```

Each gets defined in [05-bonus-future.md](05-bonus-future.md) with its trigger condition.

---

## 4. The Action Gate

AI capabilities that flow freely (no approval):

```text
Discover ✓   Analyze ✓   Rank ✓
Prepare ✓   Draft ✓    Suggest ✓
```

Actions that require explicit Razi approval, every time:

| Action | Gate | Why |
|---|---|---|
| **Apply for job** | Approval required | You are the brand being judged |
| **Send outreach** (B2B) | Approval required | One bad blast = burnt lead |
| **Publish content** | Approval required | Public, permanent, reputation |
| **Send proposal** | Approval required | Pricing + positioning is strategy |
| **Buy crypto** | **ALWAYS RAZI** | Money. Never automated. Full stop. |

Gate mechanics:

1. Agent prepares a **draft action** (e.g. filled application, outreach message, teaser brief).
2. Draft sits in a **pending state** — visible on the dashboard, counted in "N actions required".
3. Razi reviews → **Approve / Edit-then-approve / Reject**.
4. Only after approval does the action execute (or in v0.x, get handed to Razi to execute manually on the platform).
5. Every gate decision is logged (approve/reject/edit + timestamp) — this feeds LEARN later.

> v0.x reality check: in the earliest phases, "execute" mostly means *the system hands you a ready-to-paste application/outreach and marks it done when you confirm*. Full auto-apply is NOT a goal of any current phase.

---

## 5. Daily rhythm

```text
MORNING                              EVENING
RAZIONE DAILY                        DAILY REVIEW
+ overnight discoveries              Completed / Pending / New
+ today's priorities (3-5)           One AI observation + recommendation
"Apply Company A (93%)"              "Discovery outpacing application —
"Review XYZ Dental teaser"            pause Job Scout tomorrow."
```

The evening observation is what turns RaziOne Eye from a tracker into a **manager**. It's the first LEARN-stage feature and ships with the Daily Brief (v0.1 module 7).
