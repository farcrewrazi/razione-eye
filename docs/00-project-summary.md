# RaziOne Eye — Project Summary

> The one doc to read to understand the whole project. Everything else is detail.
> Source material: [initial-chatgpt-blueprint.md](initial-chatgpt-blueprint.md) (v0 vision, 2026-09-01)

---

## What RaziOne Eye is

> **A personal career + business operations command center that continuously watches opportunities, turns them into actionable tasks, tracks execution, and uses AI agents to research and analyze before Razi acts.**

One system sitting **above** all the work streams — not "an AI agent for jobs" plus "another AI for affiliate" plus "a crypto bot". The agents manage the work; Razi never ends up managing the agents.

**Owner:** Razi (single user, forever — this is not a SaaS).
**Current focus:** job hunting — Senior Software Engineer / Team Lead roles, software houses, **Cyberjaya**, multi-AI-orchestration environments.

---

## The 5 Eyes

| Eye | Domain | Ships |
|---|---|---|
| **Career** | Job discovery → analysis → application tracking | Phase 1–2 ⭐ |
| **Business** | Website B2B + consultancy agency leads | Phase 3 |
| **Growth** | Affiliate marketing + content engine | Phase 4 |
| **Signal** | Raw ingestion: LinkedIn/FB/X/Threads, business sites, comments, Ram's Gem | grows with each phase |
| **Control** | Dashboard, tasks, agents, graph, metrics, daily brief | v0.1 core |

Priority is locked: **Career Eye first.** Everything else reuses its machinery.

---

## The three laws of RaziOne Eye

1. **The conversion rule.** Every AI output resolves to exactly one of: **SIGNAL** → **OPPORTUNITY** → **TASK**. Anything else is discarded. This prevents the dumping-ground failure mode.
2. **The Action Gate.** AI may discover, analyze, rank, prepare, draft, suggest. Applying, outreach, publishing, proposals require explicit approval. Crypto buys are **always human**. This prevents the spam-machine failure mode.
3. **"What should Razi do next?"** The system's primary output is not information — it's the next best action. Every screen serves that question.

Plus one architectural philosophy every feature must obey:

```text
OBSERVE → UNDERSTAND → CONNECT → PRIORITIZE → ACT → LEARN
```

---

## v0.1 scope (the first shippable)

```text
1. Dashboard        5. Signals
2. Opportunities    6. Agents
3. Tasks            7. Daily Brief
4. Companies
```

The first deliverable — the one that proves the architecture — is:

> **Import the ~30 already-discovered jobs, understand them, rank them, track them, and tell Razi what to apply to next.**

---

## Roadmap at a glance

```text
P0 Foundation → P1 Career MVP ⭐ → P2 Continuous Discovery → P3 Business → P4 Affiliate → P5 Gem Watch
                   │
                   └── HARD GATE: no scrapers/automation before P1 exit criteria met
```

- **P1** — 30 jobs in, scored pipeline out, next-best-action on the dashboard, daily brief running.
- **P2** — discovery becomes a heartbeat (2–4 cycles/day, all 4 social sources, hidden hiring signals, dedup).
- **P3** — business opportunities ride the exact same rails (pain-signal scan → checklist analysis → teaser → gated outreach).
- **P4** — affiliate tracked first, automated second (comment clustering → content opportunity cards).
- **P5** — Gem Watch: deliberately small. Alerts + 🟢/🟡/🔴 classification only. No trading, ever.

Bonus & future (graph intelligence queries, opportunity intelligence, 8 parked agents, ClickUp sync, teaser factory, delivery channels): [05-bonus-future.md](05-bonus-future.md) — each with an explicit trigger.

---

## Success criteria (project-level)

```text
□ The 30 jobs become a managed, scored pipeline — and applications start flowing
□ New opportunities arrive without Razi hunting for them
□ Every morning answers "what do I do next?" before Razi asks
□ Business + affiliate + gems all ride the SAME opportunity system
□ The graph answers cross-domain questions ("best companies in Cyberjaya",
  "which job companies could be consultancy clients")
□ Eventually: the system notices patterns and repositions Razi's strategy (LEARN)
```

---

## Key decisions (summary — full log in [decisions-log.md](decisions-log.md))

| ID | Decision |
|---|---|
| D-001 | Custom web app as the UI — not ClickUp-as-brain |
| D-002 | Orchestrate existing agents via adapters — don't replace them |
| D-003 | Import pipeline handles mixed formats (JSON/CSV/Markdown/chat exports) |
| D-004 | Tech stack stays open until Phase 0 kickoff |
| D-005 | PM rule: nothing automated until Phase 1 proves the core loop |

---

## Documentation index

| Doc | What's inside |
|---|---|
| [initial-chatgpt-blueprint.md](initial-chatgpt-blueprint.md) | Original v0 vision (source material — read-only reference) |
| [01-system-structure.md](01-system-structure.md) | 5 Eyes, operating loop, system layers, adapter layer, homepage contract |
| [02-data-model.md](02-data-model.md) | 8 core objects, opportunity types, pipelines, graph edges, scoring |
| [03-agents-and-gates.md](03-agents-and-gates.md) | Orchestrator, 6 starter agents, Action Gate approval matrix |
| [04-phases-stories-tasks.md](04-phases-stories-tasks.md) | Phases 0–5: stories, tasks, exit criteria — the build plan |
| [05-bonus-future.md](05-bonus-future.md) | Bonus phases B1–B9, parked agents, explicit non-goals |
| [decisions-log.md](decisions-log.md) | Decision log + open questions |

---

## What RaziOne Eye is NOT

- Not five AI tools bolted together
- Not a scraper collection
- Not a spam machine
- Not a dumping ground
- Not an auto-trader
- Not multi-user SaaS — ever
