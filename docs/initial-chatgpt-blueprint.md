**RaziOne Eye** is:

> **A personal career + business operations command center that continuously watches opportunities, turns them into actionable tasks, tracks execution, and uses AI agents to research/analyze before you act.**

The mistake would be building “an AI agent for jobs”, “another AI for affiliate”, “another crypto bot”, etc. You’ll end up managing the agents instead of the agents managing your work.

RaziOne Eye should sit **above all of them**.

---

# RaziOne Eye — v0 Blueprint

I’d organize the whole system into **5 Eyes**.

```text
                        RAZIONE EYE
                Personal Operations Command Center
                             │
        ┌────────────────────┼─────────────────────┐
        │                    │                     │
   CAREER EYE          BUSINESS EYE          GROWTH EYE
        │                    │                     │
 Job Hunting          Website B2B            Affiliate
 Job Discovery        Consultancy             Marketing
 Applications         Leads                   Content
        │                    │                     │
        └────────────────────┼─────────────────────┘
                             │
                        SIGNAL EYE
                       Crypto / Gems
                             │
                             │
                        CONTROL EYE
                  Tasks / Agents / Graph
                   Metrics / Daily Brief
```

For now, though, don't build all five equally.

Your **current priority should be Career Eye**.

Everything else can use the same underlying system later.

---

# 1. Control Eye

This is actually the most important part.

This becomes your homepage.

Think:

```text
RAZIONE EYE

Tuesday, 1 Sep

TODAY

⚡ 7 Actions Required
────────────────────────

CAREER
12 new jobs discovered
3 high-match jobs
5 applications pending
2 recruiters awaiting reply

BUSINESS
6 businesses discovered
2 worth approaching
1 teaser site ready

AFFILIATE
3 content opportunities
1 post scheduled

CRYPTO
RAM'S GEM
2 tokens detected
1 passed initial filter

────────────────────────

AI AGENTS

Job Scout           ✓ Running
Job Analyst         ✓ Running
Business Scout      ✓ Running
Affiliate Analyst   ✓ Running
Gem Watcher         ✓ Running

────────────────────────

NEXT BEST ACTION

Apply:
Senior Software Engineer
Cyberjaya
Match: 91%

[Review] [Apply]
```

The system shouldn't primarily show you **information**.

It should answer:

> **"What should Razi do next?"**

That distinction is very important.

---

# 2. Career Eye

This is where I would start immediately.

You already have approximately **30 jobs discovered**.

Do not run more job discovery yet.

First turn those 30 into a structured pipeline.

### Pipeline

```text
DISCOVERED
    ↓
ANALYZED
    ↓
QUALIFIED
    ↓
READY TO APPLY
    ↓
APPLIED
    ↓
RECRUITER RESPONSE
    ↓
INTERVIEW
    ↓
OFFER
    ↓
HIRED
```

And separately:

```text
REJECTED
IGNORED
NOT SUITABLE
EXPIRED
```

Each opportunity becomes an **Opportunity Node**.

Example:

```yaml
company: ABC Technology
role: Senior Software Engineer
location: Cyberjaya
source: LinkedIn
url: ...
salary: RM12k-RM16k

match_score: 91

matching:
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

Now your 30 jobs stop being a list.

They become a **managed pipeline**.

---

# 3. Job discovery should become continuous

This is your:

> Job hunting — Analyze + Blast

You mentioned:

- LinkedIn
- Facebook
- X
- Threads

Don't treat them equally.

The agents should search for **signals**.

For example:

```text
"software engineer Cyberjaya"

"senior software engineer Cyberjaya"

"tech lead Cyberjaya"

"software house Cyberjaya"

"hiring Cyberjaya developer"

"AI engineer Cyberjaya"

"engineering lead Cyberjaya"

"vibe coding"

"AI-assisted development"

"Claude Code"

"Codex"

"multi-agent development"

"AI orchestration"
```

But there's another category I'd add:

### Hidden hiring signals

The agent should also detect posts like:

> "We're expanding our engineering team."

> "Our Cyberjaya office is growing."

> "Looking for talented developers."

> "DM me if you're interested."

> "New engineering team being established."

These may never appear on LinkedIn Jobs.

Those are potentially **better opportunities**.

---

# 4. AI Job Analyst

Every discovered job should go through an analyzer before entering your task queue.

Something like:

```text
JOB FOUND
      │
      ▼
Extract Job Information
      │
      ▼
Compare Against Razi Profile
      │
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
      │
      ├── 90-100 → Priority
      ├── 75-89  → Apply
      ├── 60-74  → Review
      └── <60    → Archive
```

I'd actually score companies separately.

Example:

```text
ROLE MATCH       92
COMPANY MATCH    86
AI CULTURE       95
LOCATION         100
SALARY            75
CAREER UPSIDE     90
────────────────────
TOTAL             90
```

This becomes useful later because you can ask RaziOne Eye:

> "Show me the best 10 companies in Cyberjaya, even if they're not hiring right now."

That is much more powerful than job-board scraping.

---

# 5. Business Eye

Your two activities here are actually related.

### Website B2B

and

### Software Consultancy

So I wouldn't build two systems.

I'd build:

# **Business Opportunity Pipeline**

```text
DISCOVERED BUSINESS
       ↓
BUSINESS ANALYZED
       ↓
PROBLEM IDENTIFIED
       ↓
OPPORTUNITY
       ↓
TEASER / PROPOSAL
       ↓
OUTREACH
       ↓
REPLIED
       ↓
MEETING
       ↓
PROPOSAL
       ↓
WON
```

The AI scout could discover:

```text
Restaurant
Clinic
SME
Training company
Property agent
Manufacturer
Small hotel
Professional service company
Retailer
```

Then analyze:

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

Then RaziOne Eye creates an opportunity:

```text
BUSINESS

XYZ Dental
Cyberjaya

Opportunity Score: 87

Problems detected:
• Outdated website
• No online appointment
• Poor mobile UX
• No WhatsApp CTA

Suggested Offer:
RM3,500 website modernization

AI recommendation:
Create teaser homepage.

[Generate Teaser]
```

That is a very strong workflow.

---

# 6. Consultancy should be problem-first

Don't make your consultancy scanner search only:

> "companies needing software consultant."

Those companies rarely advertise that.

Instead look for **pain signals**.

Examples:

```text
"We're still using Excel"

"manual process"

"looking for software"

"need automation"

"system always down"

"need dashboard"

"inventory issue"

"need CRM"

"WhatsApp orders"

"booking management"

"AI implementation"

"looking to digitize"
```

Then:

```text
Signal
  ↓
Company
  ↓
Business problem
  ↓
Possible solution
  ↓
Consultancy opportunity
```

That fits your **graph engineering** idea especially well.

---

# 7. Affiliate Eye

Affiliate Marketing works slightly differently.

Don't structure this around "products".

Structure it around:

```text
NICHE
  ↓
PROBLEM
  ↓
AUDIENCE
  ↓
PRODUCT
  ↓
CONTENT IDEA
  ↓
CONTENT
  ↓
DISTRIBUTION
  ↓
ENGAGEMENT
  ↓
CONVERSION
```

Your AI can continuously analyze comments.

For example:

```text
Video:
"Best AI coding tools"

Comments:
327

AI clusters:

42 people asking:
"Which one works with WordPress?"

31 people:
"Is Claude better than Cursor?"

18 people:
"How much does this cost?"

12 people:
"Can this generate a website?"
```

RaziOne Eye then produces:

```text
CONTENT OPPORTUNITY

Topic:
Claude Code vs Cursor for WordPress developers

Demand Score: 89

Source:
42 audience questions

Affiliate opportunities:
• Hosting
• AI coding tool
• WordPress plugin

Recommended:
Create short-form video.

[Create Task]
```

You don't need the complete automation now.

Initially, just track:

```text
Ideas
Research
Script
Produce
Published
Performance
```

---

# 8. Crypto Eye

I agree with your instinct:

> **not priority**

Make it deliberately small.

Something like:

```text
SIGNAL
   ↓
TOKEN
   ↓
QUICK ANALYSIS
   ↓
ALERT
```

For example:

```text
RAM'S GEM CALL

Token: ABC
Chain: Solana

Signal source:
Ram's Gem

Liquidity
Market cap
Volume
Holder concentration
Token age
Social activity
Momentum
Risk flags

AI classification:

🟢 Watch
🟡 Speculative
🔴 Avoid
```

I'd avoid automatic trading entirely in v1.

RaziOne Eye should say:

> **"Something worth your attention appeared."**

You make the decision.

---

# 9. The Graph

This is where your idea becomes particularly interesting.

Don't think of Graph Engineering as a fancy UI graph.

It should represent **relationships between everything you're doing**.

Example:

```text
You
 │
 ├── knows → Node.js
 │
 ├── experienced_in → AI orchestration
 │
 ├── lives_near → Cyberjaya
 │
 └── owns → RaziSurf
```

Then:

```text
Company A
 │
 ├── located_in → Cyberjaya
 ├── uses → Node.js
 ├── hiring → Senior Engineer
 └── posted_by → Recruiter X
```

The system can reason:

```text
Razi
 ├── skills → Node.js
 │
 └──────── matches ────────┐
                           ↓
                       Job A
                           │
                       belongs_to
                           ↓
                       Company A
```

Business example:

```text
Company B
   ↓
has_problem
   ↓
Poor Website
   ↓
solved_by
   ↓
Web Modernization
   ↓
offered_by
   ↓
RaziSurf
```

Affiliate:

```text
Audience Problem
   ↓
AI coding difficulty
   ↓
related_to
   ↓
Claude Code
   ↓
affiliate_product
```

Eventually you can ask:

> "What opportunities involve React around Cyberjaya?"

or:

> "Which companies I discovered for jobs could also become consultancy clients?"

or:

> "Which content topics are related to technologies companies are currently hiring for?"

That's where the graph becomes really valuable.

---

# 10. The core objects

Don't create hundreds of database models.

I would start with roughly these.

```text
PERSON
COMPANY
OPPORTUNITY
PROJECT
TASK
SIGNAL
CONTENT
AGENT
```

Then use **types**.

Example:

```text
Opportunity
    type:
      JOB
      WEBSITE
      CONSULTANCY
      AFFILIATE
      CRYPTO
```

Similarly:

```text
Signal
    type:
      JOB_POSTING
      SOCIAL_POST
      COMMENT
      BUSINESS_DISCOVERY
      GEM_CALL
```

This keeps your architecture clean.

---

# 11. Agents

Don't create 30 agents initially.

I'd start with **six**.

```text
RaziOne Orchestrator

        │
        ├── Job Scout
        │
        ├── Job Analyst
        │
        ├── Business Scout
        │
        ├── Business Analyst
        │
        ├── Affiliate Analyst
        │
        └── Signal Watcher
```

Later:

```text
Outreach Agent
Proposal Agent
Resume Agent
Company Research Agent
Content Agent
Social Listener
Crypto Analyst
```

The **Orchestrator should never scrape LinkedIn itself**.

It delegates.

---

# 12. Extremely important: Human approval

I'd introduce a concept called:

# **Action Gate**

AI can:

```text
Discover ✓
Analyze ✓
Rank ✓
Prepare ✓
Draft ✓
Suggest ✓
```

But certain actions require you.

```text
Apply for job        → Approval
Send outreach        → Approval
Publish content      → Approval
Send proposal        → Approval
Buy crypto           → ALWAYS YOU
```

That prevents your system from becoming a spam machine.

---

# 13. Your task system

Every AI output must eventually become one of three things:

```text
SIGNAL
OPPORTUNITY
TASK
```

Example:

```text
LinkedIn post
      ↓
SIGNAL

AI determines:
Hiring Cyberjaya
      ↓
OPPORTUNITY

AI determines:
Very high match
      ↓
TASK

"Apply to XYZ before Friday"
```

This rule will prevent RaziOne Eye from becoming a giant dumping ground.

---

# 14. Daily usage

Ideally you don't manually browse the system very much.

Every morning you receive:

```text
RAZIONE DAILY

CAREER
+ 8 jobs discovered
+ 2 high matches

Apply today:
1. Company A — 93%
2. Company B — 88%

BUSINESS
+ 4 potential leads
+ 1 strong candidate

AFFILIATE
+ 2 content opportunities

CRYPTO
No important signal.

────────────────────

TODAY'S PRIORITIES

1. Apply Company A
2. Apply Company B
3. Review XYZ Dental teaser
4. Record affiliate video
```

Then perhaps evening:

```text
DAILY REVIEW

Completed: 6
Pending: 3
New opportunities: 12

AI observation:

"You are discovering many jobs but
your application conversion is low."

Recommendation:
Pause discovery tomorrow.
Apply existing opportunities.
```

That last part is important.

Your system becomes an actual **manager**.

---

# 15. I would NOT build everything yet

For **RaziOne Eye v0.1**, I'd only build:

```text
RAZIONE EYE

1. Dashboard

2. Opportunities
   ├ Job
   ├ Business
   ├ Affiliate
   └ Crypto

3. Tasks

4. Companies

5. Signals

6. Agents

7. Daily Brief
```

That's enough.

---

# Phase 1 — Start now

Your immediate objective:

### Week 1

Get your **30 existing jobs** inside RaziOne Eye.

Make this work:

```text
30 jobs
   ↓
AI analysis
   ↓
scores
   ↓
ranked pipeline
   ↓
tasks
   ↓
applications
```

And your dashboard should show:

```text
Jobs discovered        30
Qualified              18
Ready to apply         12
Applied                  0
Replies                  0
Interviews               0
```

Then start applying.

---

# Phase 2

Add continuous monitoring.

```text
LinkedIn
Facebook
X
Threads
Company Careers
Google
Job portals
        │
        ↓
      Signals
        ↓
    Job Analyst
        ↓
 Opportunities
```

Run periodically.

Not necessarily every minute.

Something like 2–4 discovery cycles/day is enough.

---

# Phase 3

Add:

```text
Website B2B
Consultancy
```

using the exact same Opportunity system.

---

# Phase 4

Add Affiliate monitoring.

---

# Phase 5

Add Crypto Watch.

---

# Future RaziOne Eye

Later this could become considerably smarter.

For example:

### Opportunity Intelligence

RaziOne Eye notices:

> You applied to 27 Node.js roles but companies using Golang respond 2.4× more often.

Then suggests:

> "Consider positioning yourself as Backend/Platform Engineer rather than Full-stack Engineer."

---

Or:

> "Cyberjaya companies mentioning AI orchestration increased significantly recently."

---

Or:

> "You generated 25 B2B leads but dental clinics have the highest reply rate."

So it tells you:

> **Focus sales efforts on dental clinics this month.**

Now you're no longer simply tracking tasks.

You're building a **personal decision intelligence system**.

---

# One architectural principle I'd lock in now

I would define RaziOne Eye as:

```text
OBSERVE
   ↓
UNDERSTAND
   ↓
CONNECT
   ↓
PRIORITIZE
   ↓
ACT
   ↓
LEARN
```

Every feature must fit somewhere in that cycle.

For example:

```text
LinkedIn crawler
= OBSERVE

Job analyzer
= UNDERSTAND

Knowledge graph
= CONNECT

Opportunity scoring
= PRIORITIZE

Application task
= ACT

Response analytics
= LEARN
```

That becomes your system architecture philosophy.

---

## And as your PM, I'm setting one immediate rule

**Do not build the social scrapers, affiliate automation, business scraper or crypto bot yet.**

Your first deliverable should be:

> **RaziOne Eye can import your existing ~30 jobs, understand them, rank them, track them and tell you what you should apply to next.**

Once that works, we've proven the core architecture.

Then we attach more **Eyes** to it.

Before we move into the technical/data architecture, there are three decisions I want from you because they'll materially affect the blueprint:

1. **Where do you imagine the main RaziOne Eye UI living?** A custom web app, ClickUp as the operational UI, or a combination where RaziOne Eye is the intelligence layer and ClickUp handles tasks?
2. Your existing AI agents — do you want **RaziOne Eye to orchestrate Hermes/other agents you already run**, rather than replacing them?
3. For the 30 jobs you already collected, what form are they currently in — JSON/CSV/database/Markdown/agent conversation?

My initial preference would be **custom RaziOne Eye dashboard + graph/database as the brain, with ClickUp optionally synchronized for execution**, rather than forcing the whole intelligence system into ClickUp.
