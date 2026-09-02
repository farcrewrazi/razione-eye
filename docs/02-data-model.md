# RaziOne Eye — Data Model

> The 8 core objects, their types, the pipelines they move through, and the graph edges that connect everything.
> Companion docs: [01-system-structure.md](01-system-structure.md) · [03-agents-and-gates.md](03-agents-and-gates.md)

Design rule from the blueprint: **don't create hundreds of models.** Eight objects + a type system. If something doesn't fit, it's probably a Signal that hasn't been understood yet.

---

## 1. The core objects

```text
PERSON        people: Farcrew Razi (the owner), recruiters, founders, creators, KOLs
COMPANY       employers, target B2B businesses, agencies (incl. RaziSurf)
OPPORTUNITY   the unit of pursuit — job, website deal, consultancy, affiliate play, gem
PROJECT       active work: a client build, a teaser site, a content series
TASK          a single actionable step — the only thing Razi executes directly
SIGNAL        raw observed event, pre-understanding; the inbox of the whole system
CONTENT       affiliate/social artifacts: ideas, scripts, posts, videos, metrics
AGENT         the watchers/analysts themselves, with run state
```

Everything is a **node**. Relationships are **edges** on those nodes (Section 5).

### Common fields (all objects)

```yaml
id:           ulid
type:         <object type>
created_at:   timestamp
updated_at:   timestamp
source:       where it came from (import, agent, manual, api)
tags:         [free-form]
notes:        [free-form]
```

---

## 2. OPPORTUNITY — the central object

One object, five types. This is what makes Business Eye reuse Career Eye's entire pipeline machinery in Phase 3 instead of a rebuild.

```yaml
opportunity_type:   JOB | WEBSITE | CONSULTANCY | AFFILIATE | CRYPTO
status:             <pipeline stage, see Section 4>
opportunity_score:  0-100 (see Section 6)
company:            ref → COMPANY
next_action:        { type, due }        # feeds Next Best Action
```

### 2.1 JOB opportunity (Career Eye)

```yaml
company: ABC Technology
role: Senior Software Engineer
location: Cyberjaya
source: LinkedIn
url: ...
salary: RM12k-RM16k

match_score: 91

matching:            # sub-scores, 0-100 each
  location: 100
  seniority: 100
  stack: 90
  ai_environment: 85
  salary: 80

status: qualified

next_action:
  type: apply
  due: today

contact:
  recruiter: John
  linkedin: ...

notes:
  - Uses AI coding agents
  - Hybrid Cyberjaya
  - Node/React preferred
```

### 2.2 WEBSITE opportunity (Business Eye)

> All Business Eye opportunities (WEBSITE + CONSULTANCY) are offered and delivered **under RaziSurf** — Farcrew Razi's business entity. Every opportunity carries `offered_by → RaziSurf (COMPANY)`, and the graph links `Farcrew Razi ── owns ──► RaziSurf`.

```yaml
company: XYZ Dental
location: Cyberjaya
source: Business Scout
offered_by: RaziSurf          # the entity pursuing this work

opportunity_score: 87

problems_detected:
  - Outdated website
  - No online appointment
  - Poor mobile UX
  - No WhatsApp CTA

suggested_offer:
  type: website_modernization
  price_hint: RM3,500

next_action:
  type: generate_teaser     # creates a PROJECT
  due: this_week
```

### 2.3 CONSULTANCY opportunity (Business Eye)

```yaml
company: Acme Logistics
source: Signal Watcher (pain-signal scan)
offered_by: RaziSurf          # consultancy agency work runs under RaziSurf

signal_phrases:            # what triggered discovery
  - "we're still using Excel for inventory"
  - "manual process"

opportunity_score: 74

suspected_problems:
  - Manual inventory process
  - No dashboard visibility

possible_solution:
  type: custom_system
  scope: inventory + dashboard

next_action:
  type: research_company    # deep-dive before outreach
  due: next_week
```

### 2.4 AFFILIATE opportunity (Growth Eye)

```yaml
niche: AI coding tools
audience_problem: "Which AI coding tool works with WordPress?"
demand_score: 89
evidence:
  - 42 audience questions on "Best AI coding tools" video
content_ideas:
  - "Claude Code vs Cursor for WordPress developers"
affiliate_products:
  - Hosting
  - AI coding tool
  - WordPress plugin
next_action:
  type: create_content_task
  due: flexible
```

### 2.5 CRYPTO opportunity (Signal Eye / Gem Watch)

```yaml
token: ABC
chain: Solana
signal_source: Ram's Gem
analysis:
  liquidity: ...
  market_cap: ...
  volume: ...
  holder_concentration: ...
  token_age: ...
  social_activity: ...
  momentum: ...
  risk_flags: [...]
classification: WATCH | SPECULATIVE | AVOID    # 🟢 🟡 🔴
# No auto-trading. Alert only. Razi decides. Always.
```

---

## 3. SIGNAL — the universal inbox

Every observation enters as a Signal first. Signals are cheap, noisy, and disposable. Opportunities are curated and expensive.

```yaml
signal_type:  JOB_POSTING | SOCIAL_POST | COMMENT | BUSINESS_DISCOVERY | GEM_CALL
source:       linkedin | facebook | x | threads | careers_page | google | comments | rams_gem
content:      raw text / snapshot / url
observed_at:  timestamp
disposition:  NEW | PROMOTED | DISMISSED | DUPLICATE
promoted_to:  ref → OPPORTUNITY | CONTENT   # set when promoted
```

Signal volume is expected to be high (dozens to hundreds/day once watchers run). The pipeline rule (Section 7) keeps the system from becoming a dumping ground.

---

## 4. Pipelines (status values)

### 4.1 JOB pipeline

```text
DISCOVERED → ANALYZED → QUALIFIED → READY TO APPLY → APPLIED
           → RECRUITER RESPONSE → INTERVIEW → OFFER → HIRED

Terminal: REJECTED · IGNORED · NOT SUITABLE · EXPIRED
```

### 4.2 BUSINESS pipeline (WEBSITE + CONSULTANCY share it)

```text
DISCOVERED BUSINESS → BUSINESS ANALYZED → PROBLEM IDENTIFIED → OPPORTUNITY
   → TEASER / PROPOSAL → OUTREACH → REPLIED → MEETING → PROPOSAL → WON

Terminal: LOST · NOT SUITABLE · DISMISSED
```

### 4.3 AFFILIATE pipeline (per content piece)

```text
IDEAS → RESEARCH → SCRIPT → PRODUCE → PUBLISHED → PERFORMANCE
```

### 4.4 CRYPTO pipeline (deliberately short)

```text
SIGNAL → TOKEN → QUICK ANALYSIS → ALERT (🟢/🟡/🔴)
```

**Terminal-state rule:** once an Opportunity enters a terminal state it never silently reopens. Reopening requires a new Signal (e.g. a re-posted job) creating a new Opportunity, linked to the old one.

---

## 5. The graph — edges

Edges make RaziOne Eye a relationship engine, not a list manager. Direction matters.

```text
PERSON
  knows               → SKILL
  experienced_in      → SKILL / DOMAIN
  lives_near          → LOCATION
  owns                → COMPANY / PROJECT
  posted_by           → SIGNAL / JOB
  contact_at          → COMPANY
  recruiter_for       → OPPORTUNITY (JOB)
  audience_of         → CONTENT
  wrote               → COMMENT

COMPANY
  located_in          → LOCATION
  uses                → SKILL / TECHNOLOGY
  hiring              → OPPORTUNITY (JOB)
  has_problem         → PROBLEM
  offers              → PRODUCT / SERVICE
  posted              → SIGNAL
  parent_of           → COMPANY

OPPORTUNITY
  belongs_to          → COMPANY
  matches             → PERSON (with score)
  requires            → SKILL
  solved_by           → SOLUTION / SERVICE
  offered_by          → COMPANY (RaziSurf)
  related_to          → OPPORTUNITY
  creates             → PROJECT (e.g. teaser site)
  converts_to         → PROJECT / CONTRACT

SIGNAL
  mentions            → COMPANY / OPPORTUNITY / TOKEN
  observed_by         → AGENT

PROJECT
  delivers_for        → OPPORTUNITY / COMPANY
  produced            → CONTENT
  assigned_to         → PERSON

TASK
  serves              → OPPORTUNITY / PROJECT / CONTENT

CONTENT
  addresses           → PROBLEM / AUDIENCE
  related_to          → TECHNOLOGY
  promotes            → PRODUCT (affiliate)
  performed_by        → METRICS

AGENT
  observes            → SOURCE (platform)
  produces            → SIGNAL
  analyzes            → SIGNAL → OPPORTUNITY
```

### Example sub-graph (Career)

```text
Farcrew Razi (PERSON)
  ├── knows ──────────► Node.js ◄───── uses ─────┐
  │                                              │
  ├── experienced_in ► AI orchestration ◄── uses ─┤
  │                                              │
  └── lives_near ────► Cyberjaya ◄──── located_in │
                                                 │
                           Company A ──── hiring ─┴─► Job A
                               │                        │
                           posted_by                 belongs_to
                               │                        │
                           Recruiter X ─────────────────┘
```

### Example sub-graph (Business)

RaziSurf is a first-class `COMPANY` node in the graph — `Farcrew Razi ── owns ──► RaziSurf` — and is the entity every Business Eye opportunity is offered by:

```text
Farcrew Razi ── owns ──► RaziSurf
                            ▲
Company B (XYZ Dental)
   ↓ has_problem
Poor Website
   ↓ solved_by
Web Modernization
   ↓ offered_by
RaziSurf
```

---

## 6. Scoring model

Scores are hints, not verdicts. The bands decide default behavior; Razi can always override.

### 6.1 Job opportunity score — sub-scores

```text
ROLE MATCH        seniority, stack, responsibilities
COMPANY MATCH     type (software house), size, stability
AI CULTURE        AI-assisted dev, multi-agent orchestration, tooling
LOCATION          Cyberjaya = 100 (hard requirement right now)
SALARY            vs target band
CAREER UPSIDE     growth, learning, positioning
```

Example:

```text
ROLE MATCH       92
COMPANY MATCH    86
AI CULTURE       95
LOCATION         100
SALARY            75
CAREER UPSIDE     90
─────────────────────
TOTAL             90
```

### 6.2 Bands → default action

```text
90–100   PRIORITY     top of Next Best Action, due soon
75–89    APPLY        task created, apply when ready
60–74    REVIEW      visible in pipeline, no task pressure
< 60     ARCHIVE     kept in graph for learning, out of pipeline
```

### 6.3 Business & affiliate scoring

- Business: same band system, sub-scores = { problem severity, budget hint, reachability, fit with RaziSurf offers }
- Affiliate: `demand_score` from audience evidence (comment clusters, questions)
- Crypto: no numeric score — classification only (WATCH / SPECULATIVE / AVOID)

---

## 7. Conversion rule — Signal → Opportunity → Task

Every agent output must resolve to exactly one of three things, or it is discarded:

```text
LinkedIn post ──► SIGNAL
                  │  AI determines: hiring, Cyberjaya
                  ▼
              OPPORTUNITY (JOB)
                  │  AI determines: very high match (91)
                  ▼
              TASK: "Apply to XYZ before Friday"
```

1. **SIGNAL** — observed, not yet understood. Cheap. Disposable.
2. **OPPORTUNITY** — understood, scored, linked to a company. Enters a pipeline.
3. **TASK** — prioritized action with a due date. The only unit Razi executes.

Anything that can't become one of these three (e.g. "interesting but vague" posts) stays a dismissed Signal — queryable in the graph for later LEARN-stage analysis, but never cluttering the pipeline.

---

## 8. AGENT object (run registry)

```yaml
name: Job Analyst
kind: native | adapter                # D-002: adapters wrap existing agents
capability: analyze_job
behind_adapter: null | Hermes         # which external agent, if any
schedule: on_demand | cron
last_run: timestamp
last_status: ok | error | empty
runs: [...]                           # lightweight run log
```

The Agents screen (v0.1 module 6) renders this registry: what's running, what ran, what failed, run-now button.

---

## 9. Storage note

Engine choice is **OPEN** (D-004, Phase 0 kickoff). The model above is deliberately storage-agnostic: it works on a relational schema with join tables, a document store with reference fields, or a real graph DB. The edge list in Section 5 is the contract — the engine just implements it.
