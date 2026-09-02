# RaziOne Eye — Bonus & Future

> Everything deliberately **not built yet**. Each item has a trigger — the condition that makes it worth building. Until its trigger fires, it stays here.
> Companion docs: [04-phases-stories-tasks.md](04-phases-stories-tasks.md) · [decisions-log.md](decisions-log.md)

The PM rule (D-005) governs this whole file: **none of this starts before Phase 1 exit criteria are met.** Most of it waits longer.

---

## B1 — Graph Intelligence (the payoff queries)

**Trigger:** Phases 1–3 done. Enough nodes exist that relationship queries return interesting answers, not empty sets.

The graph's whole reason to exist:

- *"Show me the best 10 companies in Cyberjaya, even if they're not hiring right now."* — company scores independent of open roles; targets worth a warm approach.
- *"Which companies I discovered for jobs could also become consultancy clients?"* — cross-eye query: `OPPORTUNITY(JOB).belongs_to` ∩ companies with `has_problem` edges.
- *"Which content topics relate to technologies companies are currently hiring for?"* — Growth Eye × Career Eye: CONTENT.related_to ↔ COMPANY.uses ↔ OPPORTUNITY(JOB).requires.
- *"Which recruiters ghosted me last cycle but posted again?"* — PERSON edges over time.

### Tasks (when triggered)

- [ ] Query builder / natural-language query endpoint over the edge set ([02-data-model.md §5](02-data-model.md))
- [ ] Company leaderboard view (scored even without open roles)
- [ ] Cross-eye insight cards surfaced on the dashboard

---

## B2 — Opportunity Intelligence (the LEARN era)

**Trigger:** ≥ 20–30 acted-on opportunities with outcomes recorded. The system needs history before it can learn.

This is where RaziOne Eye graduates from tracker to **personal decision intelligence system**:

- *"You applied to 27 Node.js roles but companies using Golang respond 2.4× more often."* → suggestion: *"Consider positioning yourself as Backend/Platform Engineer rather than Full-stack Engineer."*
- *"Cyberjaya companies mentioning AI orchestration increased significantly recently."*
- *"You generated 25 B2B leads but dental clinics have the highest reply rate."* → *"Focus sales efforts on dental clinics this month."*

### Tasks (when triggered)

- [ ] Outcome analytics: response rates by stack / role type / company type / channel
- [ ] Positioning recommendations in the evening Daily Review
- [ ] Trend detection on signal volume (topics over time)
- [ ] Action Gate decision-log analysis (which drafts got edited before approval → learn preferences)

---

## B3 — Full Affiliate Automation

**Trigger:** Phase 4 exit criteria met + publishing rhythm is stable (≥ 4 weeks of consistent output).

The full loop the blueprint sketches:

```text
NICHE → PROBLEM → AUDIENCE → PRODUCT → CONTENT IDEA → CONTENT → DISTRIBUTION → ENGAGEMENT → CONVERSION
```

- [ ] Full-chain tracking: niche → conversion attribution
- [ ] Comment auto-analysis at scale (Social Listener feed)
- [ ] Content Agent: draft scripts from demand evidence
- [ ] Distribution scheduling (still gated)
- [ ] Conversion tracking per product

---

## B4 — Parked Agents

**Trigger:** individually specified. Each gets built only when its owner phase is stable.

| Agent | Trigger | Job |
|---|---|---|
| **Outreach Agent** | Phase 3 stable, outreach rhythm proven | Draft B2B outreach from opportunity + teaser context |
| **Proposal Agent** | ≥ 3 MEETING-stage opportunities | Generate proposals from problems-detected + scope notes |
| **Resume Agent** | Phase 1 stable + ≥ 10 applications sent | Tailor CV per job opportunity's stack/AI-culture profile |
| **Company Research Agent** | Phase 2 stable | Deep company dossiers: stack, funding, AI culture, hiring history |
| **Content Agent** | Phase 4 stable | Draft content from demand clusters (gated publish) |
| **Social Listener** | Phase 2 stable | Always-on platform monitoring beyond scheduled cycles |
| **Crypto Analyst** | Phase 5 stable | Deep token analysis beyond the quick checklist |
| **Teaser Generator** | Phase 3 stable + teaser workflow proven | Auto-generate teaser sites from business checklists |

---

## B5 — ClickUp Sync

**Trigger:** Razi wants task execution views outside the custom dashboard (or wants mobile task management now).

- [ ] Two-way task sync (RaziOne Eye remains the source of truth for opportunities/scores/graph)
- [ ] Task status reconciliation rules
- [ ] Field mapping doc (which fields live where)

D-001 stands: the intelligence layer never moves into ClickUp; only execution tasks mirror there.

---

## B6 — Daily Brief Delivery Channels

**Trigger:** Daily Brief content is good enough that reading it *inside* the app feels like friction.

Candidates (decision open — see [decisions-log.md](decisions-log.md)):

- Telegram bot (push, interactive buttons for approve/reject)
- Email digest
- WhatsApp (matches the B2B audience behavior)

---

## B7 — Teaser-Site Factory

**Trigger:** Phase 3 proves teaser-outreach converts better than plain outreach.

> Teaser sites are **RaziSurf** deliverables (D-006) — RaziSurf-branded, offered under the RaziSurf entity.

- [ ] Template system (per business category: clinic, restaurant, hotel…)
- [ ] One-click generate from Business Analyst checklist
- [ ] Hosting + per-lead preview links
- [ ] Engagement tracking on teaser links (did the lead open? how long?)

---

## B8 — Multi-Profile Mode

**Trigger:** Razi targets more than one positioning simultaneously (e.g. "Senior SWE" + "AI Consultant" as distinct pipelines).

- [ ] Multiple Razi Profiles with separate scoring weights
- [ ] Per-profile pipelines and next-best-actions

---

## B9 — Deployment Hardening

**Trigger:** the app leaves Razi's machine / needs uptime beyond "my laptop is on".

- [ ] Small always-on host (single-user still — no multi-tenancy, ever)
- [ ] Watchdog for the Orchestrator + agent runs
- [ ] Alerting when discovery cycles fail silently
- [ ] Automated backups off-machine

---

## Explicit non-goals (never building)

- **Auto-trading** — crypto buys are human decisions. Forever.
- **Auto-apply to jobs** — the Action Gate exists precisely so applications are deliberate.
- **Multi-user / SaaS** — this is Razi's command center, not a product.
- **Spam-scale outreach** — approval-gated, personalized, always.
