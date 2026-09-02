# RaziOne Eye — Decisions Log

> Lightweight ADR-style log. Decisions are cheap to change early, expensive later. When a decision changes, supersede it — don't edit history.
> Started: 2026-09-01
> Owner of record: **Farcrew Razi** (referred to as "Razi" throughout the docs).

---

## D-001 — Custom web app as the main UI

- **Date:** 2026-09-01
- **Status:** ✅ Accepted
- **Context:** RaziOne Eye needs a home. Options: custom web app, ClickUp as operational UI, hybrid (custom intelligence + ClickUp execution).
- **Decision:** **Custom web dashboard + graph/database as the brain.** ClickUp may be synchronized later for execution convenience (see [05-bonus-future.md B5](05-bonus-future.md)), but the intelligence system lives in RaziOne Eye.
- **Consequences:** Full control over the "command center" experience; must build UI ourselves (acceptable — single-user, no design-committee constraints). The homepage contract ("What should Razi do next?") is enforceable in our own UI.

---

## D-002 — Orchestrate existing agents; don't replace them

- **Date:** 2026-09-01
- **Status:** ✅ Accepted
- **Context:** Razi already runs AI agents (e.g. Hermes) that discovered the original ~30 jobs. Build fresh agents inside RaziOne Eye, or wrap the existing ones?
- **Decision:** **RaziOne Eye's Orchestrator delegates to existing agents through a thin Agent Adapter Layer** (capability manifest + input translator + output normalizer emitting typed Signals). Native agents are built only for capabilities that don't already exist externally (e.g. Job Analyst).
- **Consequences:** No rebuild of working discovery machinery; adapter contract adds a small layer of indirection ([01-system-structure.md §3.2](01-system-structure.md)). The orchestrator never scrapes anything itself — delegation only.

---

## D-003 — The ~30 jobs exist in mixed formats

- **Date:** 2026-09-01
- **Status:** ✅ Accepted (fact recorded, shapes Phase 1)
- **Context:** The ~30 discovered jobs live across JSON/CSV/Markdown/agent conversations — no single clean source.
- **Decision:** Phase 1 includes a **normalization-first import pipeline**: per-format importers → unified Opportunity Node schema → dedup pass → manual-entry fallback for stragglers. Incomplete records get flagged, not guessed.
- **Consequences:** Import is slightly more work up front; the pipeline becomes reusable for every future bulk intake. See [04-phases-stories-tasks.md T1.1](04-phases-stories-tasks.md).

---

## D-004 — Tech stack remains open until Phase 0 kickoff

- **Date:** 2026-09-01
- **Status:** ✅ Accepted (deliberately deferred)
- **Context:** Stack choice (storage engine, graph approach, app framework) affects implementation but not the blueprint. Rushing it risks locking into the wrong engine before the data model is exercised.
- **Decision:** Docs record **requirements** ([01-system-structure.md §3.4](01-system-structure.md)): single-user local-first, structured + graph queries, cheap mixed-format import, snapshot-friendly, embedding-friendly later. The engine decision closes as **T0.1** in Phase 0.
- **Consequences:** All docs stay storage-agnostic; the edge list in [02-data-model.md §5](02-data-model.md) is the contract any engine must satisfy.

---

## D-005 — The PM rule: nothing automated before Phase 1 proves out

- **Date:** 2026-09-01
- **Status:** ✅ Accepted
- **Context:** The temptation is to build social scrapers, affiliate automation, business scanners and a crypto bot immediately. That inverts the system: Razi manages agents instead of agents managing work.
- **Decision:** **No social scrapers, affiliate automation, business scanner or crypto bot until Phase 1 exit criteria are met** (30 jobs → scored pipeline → applications flowing through the Action Gate).
- **Consequences:** Slower-feeling start, dramatically higher chance the core architecture is right before complexity compounds. Bonus work stays parked with explicit triggers ([05-bonus-future.md](05-bonus-future.md)).

---

## D-006 — Business Eye operates under RaziSurf

- **Date:** 2026-09-01
- **Status:** ✅ Accepted
- **Context:** The website-B2B and consultancy-agency activities are an actual business, not informal personal gigs. They run under RaziSurf, Farcrew Razi's business entity.
- **Decision:** All Business Eye work — discovery, outreach, teasers, proposals, contracts — is branded and tracked as **RaziSurf** activity. RaziSurf is a first-class `COMPANY` node (`Farcrew Razi ── owns ──► RaziSurf`), and every WEBSITE/CONSULTANCY opportunity carries `offered_by → RaziSurf`. Seeded in Phase 0 (T0.8b).
- **Consequences:** Business opportunities are cleanly attributable to the entity (useful for B2 graph queries and later revenue analytics). Career Eye stays personal; no cross-contamination between "Farcrew Razi the engineer" and "RaziSurf the vendor".

---

## Open questions

| # | Question | Where it lands | Status |
|---|---|---|---|
| Q1 | Storage engine + graph approach (relational + join tables? document? native graph DB?) | Phase 0, task T0.1 | Open |
| Q2 | Where do the 30 jobs physically live right now (files? which agent's history?) | Phase 1, task T1.1 prep | Open |
| Q3 | Deployment host (stays local vs small always-on box) | [05-bonus-future.md B9](05-bonus-future.md) | Open |
| Q4 | Daily Brief delivery channel (Telegram / email / WhatsApp) | [05-bonus-future.md B6](05-bonus-future.md) | Open |
| Q5 | How existing agents (Hermes etc.) are invoked — API, CLI, file-drop? | Phase 2, task T2.1 | Open |

---

## Change protocol

1. New decision → append as `D-00X` with date, status, context, decision, consequences.
2. Changed decision → set old one to `⛔ Superseded by D-00Y`, append the new one. Never rewrite history.
3. Open questions resolved → move to a numbered decision, mark the Q-row `Resolved → D-00X`.
