/**
 * RaziOne Eye — mock dataset (mock mode backing store).
 *
 * Mirrors docs/07-api-contract.md EXACTLY: node envelope §1, list envelope
 * {items, total}, enums §3, computed `band` on opportunities.
 *
 * All writes in mock mode mutate this in-memory dataset (no persistence).
 */

import type {
  Agent,
  Company,
  Edge,
  Opportunity,
  OpportunityData,
  Person,
  Signal,
  SignalData,
  Task,
  TaskData,
} from '../types'
import { bandForScore } from './band'

// ─── id / time helpers ────────────────────────────────────────────────────────

let _ulidCounter = 0
/** Deterministic ULID-shaped ids (26 chars, Crockford base32 alphabet). */
export function mockUlid(prefix = ''): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  let time = ''
  let t = 1_700_000_000_000 + _ulidCounter * 1000
  for (let i = 0; i < 10; i++) {
    time = alphabet[t % 32] + time
    t = Math.floor(t / 32)
  }
  let rand = ''
  let r = (_ulidCounter++ * 7919 + 104729) % 32 ** 16
  for (let i = 0; i < 16; i++) {
    rand = alphabet[r % 32] + rand
    r = Math.floor(r / 32)
  }
  return (prefix + time + rand).slice(0, 26)
}

/** "Now" anchor for the mock dataset — 2026-09-02T09:00:00Z (a Wednesday). */
export const MOCK_NOW = '2026-09-02T09:00:00.000Z'

function at(daysOffset: number, hours = 0): string {
  const base = new Date(MOCK_NOW).getTime()
  return new Date(base + daysOffset * 86_400_000 + hours * 3_600_000).toISOString().replace(/\.000Z$/, 'Z')
}

// ─── Profile (single PERSON node) ─────────────────────────────────────────────

export const mockProfile: Person = {
  id: '01JDY2RAZI0000000000PROFILE',
  type: 'PERSON',
  name: 'Farcrew Razi',
  status: null,
  opportunity_type: null,
  score: null,
  due_at: null,
  source: null,
  tags: ['owner', 'profile'],
  notes: [],
  data: {
    full_name: 'Farcrew Razi',
    skills: ['Node.js', 'TypeScript', 'React', 'JavaScript', 'AI orchestration', 'SQL'],
    seniority: 'Senior',
    salary_min: 12000,
    salary_max: 16000,
    location: 'Cyberjaya',
    ai_culture_prefs: [
      'AI-assisted development',
      'multi-agent orchestration',
      'Claude Code / AI coding agents',
      'vibe coding',
    ],
  },
  created_at: at(-120),
  updated_at: at(-3),
}

// ─── Agents (6 stubs per seed) ────────────────────────────────────────────────

export const mockAgents: Agent[] = [
  {
    id: '01JDYAGENT000000000000000A',
    type: 'AGENT',
    name: 'Job Scout',
    status: null,
    opportunity_type: null,
    score: null,
    due_at: null,
    source: 'system',
    tags: ['jobs', 'discovery'],
    notes: [],
    data: {
      name: 'Job Scout',
      kind: 'native',
      capability: 'discover',
      schedule: 'on_demand',
      last_run: at(-1, -4),
      last_status: 'empty',
      runs: [
        { at: at(-1, -4), status: 'ok', summary: 'Scanned 6 career pages, found 3 new postings.' },
        { at: at(-3, -4), status: 'empty', summary: 'No new postings since last run.' },
      ],
    },
    created_at: at(-120),
    updated_at: at(-1, -4),
  },
  {
    id: '01JDYAGENT000000000000000B',
    type: 'AGENT',
    name: 'Job Analyst',
    status: null,
    opportunity_type: null,
    score: null,
    due_at: null,
    source: 'system',
    tags: ['jobs', 'analysis'],
    notes: [],
    data: {
      name: 'Job Analyst',
      kind: 'native',
      capability: 'analyze',
      schedule: 'on_demand',
      last_run: at(-1, -2),
      last_status: 'empty',
      runs: [
        { at: at(-1, -2), status: 'ok', summary: 'Scored 3 postings; 1 crossed PRIORITY threshold.' },
        { at: at(-2, -2), status: 'error', summary: 'Timeout parsing a LinkedIn posting body.' },
      ],
    },
    created_at: at(-120),
    updated_at: at(-1, -2),
  },
  {
    id: '01JDYAGENT000000000000000C',
    type: 'AGENT',
    name: 'Business Scout',
    status: null,
    opportunity_type: null,
    score: null,
    due_at: null,
    source: 'system',
    tags: ['business', 'discovery'],
    notes: [],
    data: {
      name: 'Business Scout',
      kind: 'native',
      capability: 'discover',
      schedule: 'on_demand',
      last_run: at(-4),
      last_status: 'empty',
      runs: [{ at: at(-4), status: 'empty', summary: 'No new businesses matched the ICP this week.' }],
    },
    created_at: at(-120),
    updated_at: at(-4),
  },
  {
    id: '01JDYAGENT000000000000000D',
    type: 'AGENT',
    name: 'Business Analyst',
    status: null,
    opportunity_type: null,
    score: null,
    due_at: null,
    source: 'system',
    tags: ['business', 'analysis'],
    notes: [],
    data: {
      name: 'Business Analyst',
      kind: 'native',
      capability: 'analyze',
      schedule: 'on_demand',
      last_run: at(-2),
      last_status: 'empty',
      runs: [{ at: at(-2), status: 'empty', summary: 'Queue empty — nothing to analyze.' }],
    },
    created_at: at(-120),
    updated_at: at(-2),
  },
  {
    id: '01JDYAGENT000000000000000E',
    type: 'AGENT',
    name: 'Affiliate Analyst',
    status: null,
    opportunity_type: null,
    score: null,
    due_at: null,
    source: 'system',
    tags: ['affiliate', 'analysis'],
    notes: [],
    data: {
      name: 'Affiliate Analyst',
      kind: 'native',
      capability: 'analyze',
      schedule: 'on_demand',
      last_run: at(-6),
      last_status: 'empty',
      runs: [{ at: at(-6), status: 'empty', summary: 'No new affiliate briefs queued.' }],
    },
    created_at: at(-120),
    updated_at: at(-6),
  },
  {
    id: '01JDYAGENT000000000000000F',
    type: 'AGENT',
    name: 'Signal Watcher',
    status: null,
    opportunity_type: null,
    score: null,
    due_at: null,
    source: 'system',
    tags: ['signals', 'watch'],
    notes: [],
    data: {
      name: 'Signal Watcher',
      kind: 'native',
      capability: 'discover',
      schedule: 'on_demand',
      last_run: at(0, -2),
      last_status: 'empty',
      runs: [
        { at: at(0, -2), status: 'ok', summary: 'Observed 4 signals: 2 job postings, 1 comment, 1 gem call.' },
        { at: at(-1, -2), status: 'ok', summary: 'Observed 2 signals.' },
      ],
    },
    created_at: at(-120),
    updated_at: at(0, -2),
  },
]

// ─── Companies (12 Cyberjaya/KL software houses) ──────────────────────────────

export const mockCompanies: Company[] = [
  {
    id: '01JDYCOMPANY0000000000001',
    type: 'COMPANY',
    name: 'ABC Technology',
    status: null,
    opportunity_type: null,
    score: null,
    due_at: null,
    source: 'linkedin',
    tags: ['cyberjaya', 'product'],
    notes: [],
    data: {
      industry: 'Software house / SaaS product',
      size: '50-200',
      stack: ['Node.js', 'TypeScript', 'React', 'AWS'],
      location: 'Cyberjaya',
      ai_culture_notes: ['Uses Claude Code across the engineering team', 'Weekly AI tooling show-and-tell'],
      website: 'https://abctechnology.example.com',
    },
    created_at: at(-90),
    updated_at: at(-2),
  },
  {
    id: '01JDYCOMPANY0000000000002',
    type: 'COMPANY',
    name: 'Nexa Labs',
    status: null,
    opportunity_type: null,
    score: null,
    due_at: null,
    source: 'careers_page',
    tags: ['kuala-lumpur', 'ai'],
    notes: [],
    data: {
      industry: 'AI tooling startup',
      size: '10-50',
      stack: ['TypeScript', 'Node.js', 'PostgreSQL', 'LangChain'],
      location: 'Kuala Lumpur',
      ai_culture_notes: ['Fully AI-native engineering org', 'Ships with agentic CI pipelines'],
      website: 'https://nexalabs.example.com',
    },
    created_at: at(-80),
    updated_at: at(-5),
  },
  {
    id: '01JDYCOMPANY0000000000003',
    type: 'COMPANY',
    name: 'FiberPeak',
    status: null,
    opportunity_type: null,
    score: null,
    due_at: null,
    source: 'google',
    tags: ['cyberjaya', 'telecom'],
    notes: [],
    data: {
      industry: 'Telecom software',
      size: '200-1000',
      stack: ['Java', 'Spring', 'React', 'Kubernetes'],
      location: 'Cyberjaya',
      ai_culture_notes: ['Exploring AI pair-programming pilots'],
      website: 'https://fiberpeak.example.com',
    },
    created_at: at(-75),
    updated_at: at(-10),
  },
  {
    id: '01JDYCOMPANY0000000000004',
    type: 'COMPANY',
    name: 'CyberForge',
    status: null,
    opportunity_type: null,
    score: null,
    due_at: null,
    source: 'linkedin',
    tags: ['cyberjaya', 'fintech'],
    notes: [],
    data: {
      industry: 'Fintech engineering services',
      size: '50-200',
      stack: ['Node.js', 'TypeScript', 'GraphQL', 'GCP'],
      location: 'Cyberjaya',
      ai_culture_notes: ['AI-assisted code review mandatory', 'Uses Cursor + Claude daily'],
      website: 'https://cyberforge.example.com',
    },
    created_at: at(-70),
    updated_at: at(-3),
  },
  {
    id: '01JDYCOMPANY0000000000005',
    type: 'COMPANY',
    name: 'PixelPine',
    status: null,
    opportunity_type: null,
    score: null,
    due_at: null,
    source: 'facebook',
    tags: ['kuala-lumpur', 'agency'],
    notes: [],
    data: {
      industry: 'Digital agency / web builds',
      size: '10-50',
      stack: ['React', 'Next.js', 'Tailwind'],
      location: 'Kuala Lumpur',
      ai_culture_notes: ['Designers use Midjourney; devs warming to AI tools'],
      website: 'https://pixelpine.example.com',
    },
    created_at: at(-60),
    updated_at: at(-12),
  },
  {
    id: '01JDYCOMPANY0000000000006',
    type: 'COMPANY',
    name: 'DataHarbor',
    status: null,
    opportunity_type: null,
    score: null,
    due_at: null,
    source: 'linkedin',
    tags: ['cyberjaya', 'data'],
    notes: [],
    data: {
      industry: 'Data platform & analytics',
      size: '50-200',
      stack: ['Python', 'dbt', 'React', 'Snowflake'],
      location: 'Cyberjaya',
      ai_culture_notes: [
        'Internal LLM platform for analytics copilots',
        'GitHub Copilot seats for all engineers; prompt changes gated by eval suites',
      ],
      website: 'https://dataharbor.example.com',
    },
    created_at: at(-55),
    updated_at: at(-7),
  },
  {
    id: '01JDYCOMPANY0000000000007',
    type: 'COMPANY',
    name: 'Silverline Systems',
    status: null,
    opportunity_type: null,
    score: null,
    due_at: null,
    source: 'google',
    tags: ['kuala-lumpur', 'enterprise'],
    notes: [],
    data: {
      industry: 'Enterprise software solutions',
      size: '200-1000',
      stack: ['.NET', 'Angular', 'Azure'],
      location: 'Kuala Lumpur',
      ai_culture_notes: ['Traditional process; AI usage limited to testing', 'GenAI working group formed; adoption policy under review'],
      website: 'https://silverline.example.com',
    },
    created_at: at(-50),
    updated_at: at(-20),
  },
  {
    id: '01JDYCOMPANY0000000000008',
    type: 'COMPANY',
    name: 'Kiterunner Labs',
    status: null,
    opportunity_type: null,
    score: null,
    due_at: null,
    source: 'x',
    tags: ['cyberjaya', 'startup'],
    notes: [],
    data: {
      industry: 'Logistics SaaS startup',
      size: '10-50',
      stack: ['Node.js', 'TypeScript', 'React', 'PostgreSQL'],
      location: 'Cyberjaya',
      ai_culture_notes: ['Two-day hack weeks with AI agents', 'CTO writes about multi-agent orchestration'],
      website: 'https://kiterunner.example.com',
    },
    created_at: at(-45),
    updated_at: at(-4),
  },
  {
    id: '01JDYCOMPANY0000000000009',
    type: 'COMPANY',
    name: 'Monsoon Interactive',
    status: null,
    opportunity_type: null,
    score: null,
    due_at: null,
    source: 'facebook',
    tags: ['kuala-lumpur', 'agency'],
    notes: [],
    data: {
      industry: 'Digital product studio',
      size: '10-50',
      stack: ['React', 'Next.js', 'Node.js'],
      location: 'Kuala Lumpur',
      ai_culture_notes: ['AI-assisted design-to-code workflow'],
      website: 'https://monsoon.example.com',
    },
    created_at: at(-40),
    updated_at: at(-15),
  },
  {
    id: '01JDYCOMPANY0000000000010',
    type: 'COMPANY',
    name: 'Orbit Edge',
    status: null,
    opportunity_type: null,
    score: null,
    due_at: null,
    source: 'careers_page',
    tags: ['cyberjaya', 'cloud'],
    notes: [],
    data: {
      industry: 'Cloud & edge computing services',
      size: '50-200',
      stack: ['Go', 'TypeScript', 'Terraform', 'AWS'],
      location: 'Cyberjaya',
      ai_culture_notes: ['Uses AI for infra codegen and incident summaries', 'AI-tooling workshop in onboarding week'],
      website: 'https://orbitedge.example.com',
    },
    created_at: at(-35),
    updated_at: at(-8),
  },
  {
    id: '01JDYCOMPANY0000000000011',
    type: 'COMPANY',
    name: 'Lighthouse Digital',
    status: null,
    opportunity_type: null,
    score: null,
    due_at: null,
    source: 'linkedin',
    tags: ['kuala-lumpur', 'ecommerce'],
    notes: [],
    data: {
      industry: 'E-commerce enablement',
      size: '200-1000',
      stack: ['PHP', 'Laravel', 'Vue', 'MySQL'],
      location: 'Kuala Lumpur',
      ai_culture_notes: ['Early AI adoption — product copy and support bots'],
      website: 'https://lighthousedigital.example.com',
    },
    created_at: at(-30),
    updated_at: at(-18),
  },
  {
    id: '01JDYCOMPANY0000000000012',
    type: 'COMPANY',
    name: 'Tigerlime Software',
    status: null,
    opportunity_type: null,
    score: null,
    due_at: null,
    source: 'google',
    tags: ['cyberjaya', 'outsourcing'],
    notes: [],
    data: {
      industry: 'Software outsourcing house',
      size: '50-200',
      stack: ['Node.js', 'React', 'React Native', 'AWS'],
      location: 'Cyberjaya',
      ai_culture_notes: ['Clients demand AI-accelerated delivery; team ramping up'],
      website: 'https://tigerlime.example.com',
    },
    created_at: at(-25),
    updated_at: at(-9),
  },
]

// ─── Job opportunities (12 — every JOB status at least once, all four bands) ──

function job(partial: {
  id: string
  name: string
  status: string
  score: number | null
  companyId: string
  matching: OpportunityData['matching']
  createdDaysAgo: number
  updatedDaysAgo?: number
  location?: string
  salary?: string
  salary_min?: number
  salary_max?: number
  url?: string
  contact?: OpportunityData['contact']
  next_action?: OpportunityData['next_action']
  applied_date?: string
  problems_detected?: string[]
  tags?: string[]
  notes?: string[]
  source?: string
}): Opportunity {
  const company = mockCompanies.find((c) => c.id === partial.companyId)
  // Dimensions mirror the Job Analyst formula (contract §5): role = avg(role_match, salary,
  // career_upside), company = avg(company_match, ai_culture, location). Only for analyzed
  // jobs (matching present) — hand-written/manual entries legitimately omit them.
  const m = partial.matching
  const dimensions =
    m && m.role_match != null && m.salary != null && m.career_upside != null &&
    m.company_match != null && m.ai_culture != null && m.location != null
      ? {
          role_dimension: Math.round((m.role_match + m.salary + m.career_upside) / 3),
          company_dimension: Math.round((m.company_match + m.ai_culture + m.location) / 3),
        }
      : undefined
  return {
    id: partial.id,
    type: 'OPPORTUNITY',
    name: partial.name,
    status: partial.status,
    opportunity_type: 'JOB',
    score: partial.score,
    due_at: null,
    source: partial.source ?? 'careers_page',
    tags: partial.tags ?? ['job'],
    notes: partial.notes ?? [],
    data: {
      role: partial.name,
      location: partial.location ?? company?.data.location ?? 'Cyberjaya',
      url: partial.url ?? `https://jobs.example.com/${partial.id.toLowerCase()}`,
      salary: partial.salary,
      salary_min: partial.salary_min,
      salary_max: partial.salary_max,
      match_score: partial.score ?? undefined,
      matching: partial.matching,
      ...(dimensions ? { dimensions } : {}),
      contact: partial.contact,
      next_action: partial.next_action,
      ...(partial.applied_date ? { applied_date: partial.applied_date } : {}),
      problems_detected: partial.problems_detected,
      company_id: partial.companyId,
    },
    created_at: at(-partial.createdDaysAgo),
    updated_at: at(-(partial.updatedDaysAgo ?? partial.createdDaysAgo)),
    band: bandForScore(partial.score),
    company,
  }
}

export const mockOpportunities: Opportunity[] = [
  // PRIORITY band (≥90) — the 91% ABC Technology apply card (next_best_action)
  job({
    id: '01JDYJOB0000000000000001',
    name: 'Senior Full-Stack Engineer',
    status: 'READY_TO_APPLY',
    score: 91,
    companyId: '01JDYCOMPANY0000000000001',
    matching: { role_match: 95, company_match: 92, ai_culture: 96, location: 85, salary: 88, career_upside: 90 },
    createdDaysAgo: 3,
    updatedDaysAgo: 1,
    salary: 'RM 13,000 – 17,000/month',
    salary_min: 13000,
    salary_max: 17000,
    contact: {
      recruiter: 'Aisyah Rahman',
      linkedin: 'https://www.linkedin.com/in/aisyah-rahman-example',
    },
    next_action: { type: 'apply', due: at(0, 6) },
    notes: ['Stack matches perfectly; they ship Claude Code to every engineer.'],
    tags: ['job', 'priority'],
  }),
  // APPLY band (75–89)
  job({
    id: '01JDYJOB0000000000000002',
    name: 'Lead Node.js Developer',
    status: 'RECRUITER_RESPONSE',
    score: 84,
    companyId: '01JDYCOMPANY0000000000004',
    matching: { role_match: 88, company_match: 82, ai_culture: 85, location: 90, salary: 75, career_upside: 80 },
    createdDaysAgo: 12,
    updatedDaysAgo: 2,
    salary: 'RM 14,000 – 18,000/month',
    salary_min: 14000,
    salary_max: 18000,
    contact: {
      recruiter: 'Daniel Wong',
      linkedin: 'https://www.linkedin.com/in/daniel-wong-example',
      email: 'daniel.wong@cyberforge.example.com',
    },
    next_action: { type: 'reply_to_recruiter', due: at(0, 2) },
    notes: ['Daniel replied Tuesday — needs availability for a technical chat.'],
    tags: ['job', 'applied'],
  }),
  job({
    id: '01JDYJOB0000000000000003',
    name: 'AI Platform Engineer',
    status: 'INTERVIEW',
    score: 87,
    companyId: '01JDYCOMPANY0000000000002',
    matching: { role_match: 90, company_match: 86, ai_culture: 94, location: 70, salary: 80, career_upside: 95 },
    createdDaysAgo: 20,
    updatedDaysAgo: 1,
    salary: 'RM 15,000 – 20,000/month',
    salary_min: 15000,
    salary_max: 20000,
    contact: { recruiter: 'Nadia Iman' },
    next_action: { type: 'interview_round_2', due: at(2) },
    notes: ['Round 1 went well — system design round next.'],
    tags: ['job', 'interviewing'],
  }),
  // REVIEW band (60–74)
  job({
    id: '01JDYJOB0000000000000004',
    name: 'Senior Backend Engineer',
    status: 'QUALIFIED',
    score: 72,
    companyId: '01JDYCOMPANY0000000000006',
    matching: { role_match: 78, company_match: 70, ai_culture: 65, location: 85, salary: 68, career_upside: 66 },
    createdDaysAgo: 6,
    updatedDaysAgo: 2,
    salary: 'RM 11,000 – 15,000/month',
    salary_min: 11000,
    salary_max: 15000,
    tags: ['job'],
  }),
  job({
    id: '01JDYJOB0000000000000005',
    name: 'Full-Stack Developer (React/Node)',
    status: 'ANALYZED',
    score: 67,
    companyId: '01JDYCOMPANY0000000000008',
    matching: { role_match: 72, company_match: 68, ai_culture: 75, location: 88, salary: 60, career_upside: 55 },
    createdDaysAgo: 4,
    updatedDaysAgo: 1,
    salary: 'RM 10,000 – 14,000/month',
    salary_min: 10000,
    salary_max: 14000,
    tags: ['job'],
  }),
  job({
    id: '01JDYJOB0000000000000006',
    name: 'Senior Software Engineer',
    status: 'APPLIED',
    score: 76,
    companyId: '01JDYCOMPANY0000000000010',
    matching: { role_match: 80, company_match: 74, ai_culture: 70, location: 82, salary: 72, career_upside: 78 },
    createdDaysAgo: 15,
    updatedDaysAgo: 9,
    salary: 'RM 12,000 – 16,000/month',
    salary_min: 12000,
    salary_max: 16000,
    contact: { linkedin: 'https://www.linkedin.com/in/orbitedge-hr-example' },
    applied_date: '2026-08-24',
    tags: ['job', 'applied'],
  }),
  // ARCHIVE band (<60)
  job({
    id: '01JDYJOB0000000000000007',
    name: 'React Native Developer',
    status: 'DISCOVERED',
    score: 52,
    companyId: '01JDYCOMPANY0000000000012',
    matching: { role_match: 55, company_match: 50, ai_culture: 45, location: 80, salary: 55, career_upside: 30 },
    createdDaysAgo: 1,
    updatedDaysAgo: 1,
    salary: 'RM 8,000 – 11,000/month',
    salary_min: 8000,
    salary_max: 11000,
    tags: ['job'],
  }),
  job({
    id: '01JDYJOB0000000000000008',
    name: 'Frontend Engineer (Angular)',
    status: 'NOT_SUITABLE',
    score: 48,
    companyId: '01JDYCOMPANY0000000000007',
    matching: { role_match: 40, company_match: 52, ai_culture: 30, location: 75, salary: 62, career_upside: 42 },
    createdDaysAgo: 25,
    updatedDaysAgo: 10,
    salary: 'RM 9,000 – 13,000/month',
    salary_min: 9000,
    salary_max: 13000,
    problems_detected: ['Angular stack — no React/Node overlap', 'On-site 5 days/week'],
    tags: ['job', 'terminal'],
  }),
  job({
    id: '01JDYJOB0000000000000009',
    name: 'Backend Developer (PHP/Laravel)',
    status: 'IGNORED',
    score: 41,
    companyId: '01JDYCOMPANY0000000000011',
    matching: { role_match: 35, company_match: 45, ai_culture: 50, location: 70, salary: 58, career_upside: 25 },
    createdDaysAgo: 30,
    updatedDaysAgo: 14,
    salary: 'RM 7,000 – 10,000/month',
    salary_min: 7000,
    salary_max: 10000,
    tags: ['job', 'terminal'],
  }),
  // Pipeline coverage — remaining stages
  job({
    id: '01JDYJOB0000000000000010',
    name: 'Solutions Engineer (AI Tools)',
    status: 'OFFER',
    score: 93,
    companyId: '01JDYCOMPANY0000000000003',
    matching: { role_match: 92, company_match: 90, ai_culture: 88, location: 92, salary: 94, career_upside: 90 },
    createdDaysAgo: 35,
    updatedDaysAgo: 1,
    salary: 'RM 16,000 – 20,000/month',
    salary_min: 16000,
    salary_max: 20000,
    contact: {
      recruiter: 'Farah Lim',
      email: 'farah.lim@fiberpeak.example.com',
      linkedin: 'https://www.linkedin.com/in/farah-lim-example',
    },
    next_action: { type: 'respond_to_offer', due: at(3) },
    notes: ['Offer received — negotiating start date and remote days.'],
    tags: ['job', 'offer'],
  }),
  job({
    id: '01JDYJOB0000000000000011',
    name: 'Platform Engineer (Node.js)',
    status: 'HIRED',
    score: 89,
    companyId: '01JDYCOMPANY0000000000005',
    matching: { role_match: 85, company_match: 88, ai_culture: 78, location: 65, salary: 90, career_upside: 82 },
    createdDaysAgo: 60,
    updatedDaysAgo: 20,
    salary: 'RM 12,000 – 15,000/month',
    salary_min: 12000,
    salary_max: 15000,
    notes: ['(Historical) Accepted in a previous cycle — kept for context.'],
    tags: ['job', 'terminal', 'hired'],
  }),
  job({
    id: '01JDYJOB0000000000000012',
    name: 'Senior TypeScript Engineer',
    status: 'REJECTED',
    score: 78,
    companyId: '01JDYCOMPANY0000000000009',
    matching: { role_match: 82, company_match: 75, ai_culture: 80, location: 72, salary: 70, career_upside: 68 },
    createdDaysAgo: 40,
    updatedDaysAgo: 12,
    salary: 'RM 12,000 – 16,000/month',
    salary_min: 12000,
    salary_max: 16000,
    problems_detected: ['Position filled internally'],
    tags: ['job', 'terminal'],
  }),
  job({
    id: '01JDYJOB0000000000000013',
    name: 'Data Platform Engineer',
    status: 'EXPIRED',
    score: 63,
    companyId: '01JDYCOMPANY0000000000006',
    matching: { role_match: 65, company_match: 60, ai_culture: 70, location: 85, salary: 60, career_upside: 38 },
    createdDaysAgo: 45,
    updatedDaysAgo: 18,
    salary: 'RM 10,000 – 13,000/month',
    salary_min: 10000,
    salary_max: 13000,
    tags: ['job', 'terminal'],
  }),
]

// ─── Signals (10, mixed types/sources/dispositions) ───────────────────────────

function signal(partial: {
  id: string
  name: string
  disposition: string
  source: string
  data: SignalData
  createdDaysAgo: number
  tags?: string[]
}): Signal {
  return {
    id: partial.id,
    type: 'SIGNAL',
    name: partial.name,
    status: partial.disposition,
    opportunity_type: null,
    score: null,
    due_at: null,
    source: partial.source,
    tags: partial.tags ?? ['signal'],
    notes: [],
    data: partial.data,
    created_at: at(-partial.createdDaysAgo),
    updated_at: at(-partial.createdDaysAgo),
  }
}

export const mockSignals: Signal[] = [
  signal({
    id: '01JDYSIGNAL000000000000001',
    name: 'ABC Technology hiring thread on LinkedIn',
    disposition: 'PROMOTED',
    source: 'linkedin',
    data: {
      signal_type: 'JOB_POSTING',
      content:
        'ABC Technology posted: "We are hiring a Senior Full-Stack Engineer (Node/React) in Cyberjaya — AI-native team, Claude Code everywhere."',
      url: 'https://www.linkedin.com/jobs/view/0000000001',
      observed_at: at(-3, -2),
      promoted_to: '01JDYJOB0000000000000001',
    },
    createdDaysAgo: 3,
    tags: ['signal', 'job-posting', 'promoted'],
  }),
  signal({
    id: '01JDYSIGNAL000000000000002',
    name: 'Nexa Labs CTO post on X',
    disposition: 'NEW',
    source: 'x',
    data: {
      signal_type: 'SOCIAL_POST',
      content:
        'Nexa Labs CTO: "Our agentic CI pipeline now writes and merges 40% of PRs. Looking for engineers who think in systems, not tickets."',
      url: 'https://x.com/nexalabs-example/status/0000000000000000001',
      observed_at: at(-1, -3),
    },
    createdDaysAgo: 1,
    tags: ['signal', 'social'],
  }),
  signal({
    id: '01JDYSIGNAL000000000000003',
    name: 'Founder comment on AI tooling (Facebook group)',
    disposition: 'NEW',
    source: 'facebook',
    data: {
      signal_type: 'COMMENT',
      content:
        'Comment in "KL Tech Founders": "Our dev agency bill went down 30% after we adopted AI coding agents across projects."',
      observed_at: at(-2, -1),
    },
    createdDaysAgo: 2,
    tags: ['signal', 'comment'],
  }),
  signal({
    id: '01JDYSIGNAL000000000000004',
    name: 'Careers page: CyberForge Senior Node.js role',
    disposition: 'PROMOTED',
    source: 'careers_page',
    data: {
      signal_type: 'JOB_POSTING',
      content: 'CyberForge careers page now lists "Lead Node.js Developer" — hybrid Cyberjaya, RM 14-18k.',
      url: 'https://cyberforge.example.com/careers/lead-node-developer',
      observed_at: at(-12, -6),
      promoted_to: '01JDYJOB0000000000000002',
    },
    createdDaysAgo: 12,
    tags: ['signal', 'job-posting', 'promoted'],
  }),
  signal({
    id: '01JDYSIGNAL000000000000005',
    name: 'Business discovery: PixelPine stack gap',
    disposition: 'PROMOTED',
    source: 'google',
    data: {
      signal_type: 'BUSINESS_DISCOVERY',
      content:
        'PixelPine (KL digital agency) ships 20+ client sites/year, all hand-rolled — no automation. Obvious fit for an AI-assisted build pipeline pitch.',
      observed_at: at(-6),
      promoted_to: '01JDYCOMPANY0000000000005',
    },
    createdDaysAgo: 6,
    tags: ['signal', 'business'],
  }),
  signal({
    id: '01JDYSIGNAL000000000000006',
    name: 'RAMS gem call: RAZIS token treasury',
    disposition: 'NEW',
    source: 'rams_gem',
    data: {
      signal_type: 'GEM_CALL',
      content:
        'RAMs_Gem flagged RAZIS: treasury holds 4.2M USDC, contract 0xabc…f00d passed quick-filter (liquidity > 500k, mint revoked).',
      url: 'https://rams-gem.example.com/calls/razis',
      observed_at: at(0, -5),
    },
    createdDaysAgo: 0,
    tags: ['signal', 'gem', 'crypto'],
  }),
  signal({
    id: '01JDYSIGNAL000000000000007',
    name: 'Duplicate: FiberPeak hiring post',
    disposition: 'DUPLICATE',
    source: 'comments',
    data: {
      signal_type: 'COMMENT',
      content: 'Re-share of the FiberPeak Solutions Engineer posting already captured from their careers page.',
      observed_at: at(-30, -2),
    },
    createdDaysAgo: 30,
    tags: ['signal', 'duplicate'],
  }),
  signal({
    id: '01JDYSIGNAL000000000000008',
    name: 'Threads post: vibe coding debate',
    disposition: 'DISMISSED',
    source: 'threads',
    data: {
      signal_type: 'SOCIAL_POST',
      content: 'Long threads argument about vibe coding vs. real engineering — no actionable signal.',
      observed_at: at(-4, -1),
    },
    createdDaysAgo: 4,
    tags: ['signal', 'dismissed'],
  }),
  signal({
    id: '01JDYSIGNAL000000000000009',
    name: 'Business discovery: Monsoon Interactive maintenance pain',
    disposition: 'NEW',
    source: 'linkedin',
    data: {
      signal_type: 'BUSINESS_DISCOVERY',
      content:
        'Monsoon Interactive founder posted asking for help taming client maintenance sprawl — 14 repos, no shared tooling. Consulting angle.',
      observed_at: at(-5, -3),
    },
    createdDaysAgo: 5,
    tags: ['signal', 'business'],
  }),
  signal({
    id: '01JDYSIGNAL000000000000010',
    name: 'Job posting: DataHarbor Analytics Engineer',
    disposition: 'DISMISSED',
    source: 'careers_page',
    data: {
      signal_type: 'JOB_POSTING',
      content: 'DataHarbor posted an Analytics Engineer role — mostly dbt/SQL, weak fit against Node/React core.',
      observed_at: at(-8),
    },
    createdDaysAgo: 8,
    tags: ['signal', 'dismissed'],
  }),
]

// ─── Tasks (8 — TODO/IN_PROGRESS/DONE/CANCELLED, 2 overdue, 2 tied to opportunities) ──

function task(partial: {
  id: string
  title: string
  status: string
  priority: string
  createdDaysAgo: number
  updatedDaysAgo?: number
  dueInDays?: number
  description?: string
  opportunity_id?: string
  tags?: string[]
}): Task {
  const d: TaskData = {
    title: partial.title,
    description: partial.description,
    opportunity_id: partial.opportunity_id,
    priority: partial.priority as TaskData['priority'],
  }
  return {
    id: partial.id,
    type: 'TASK',
    name: partial.title,
    status: partial.status,
    opportunity_type: null,
    score: null,
    due_at: partial.dueInDays !== undefined ? at(partial.dueInDays) : null,
    source: 'manual',
    tags: partial.tags ?? ['task'],
    notes: [],
    data: d,
    created_at: at(-partial.createdDaysAgo),
    updated_at: at(-(partial.updatedDaysAgo ?? partial.createdDaysAgo)),
  }
}

export const mockTasks: Task[] = [
  task({
    id: '01JDYTASK0000000000000001',
    title: 'Apply to ABC Technology — Senior Full-Stack Engineer',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    createdDaysAgo: 2,
    updatedDaysAgo: 0,
    dueInDays: 0,
    description: 'Tailor CV to their Node/React/AWS stack; mention Claude Code workflow.',
    opportunity_id: '01JDYJOB0000000000000001',
    tags: ['task', 'career'],
  }),
  task({
    id: '01JDYTASK0000000000000002',
    title: 'Reply to Daniel Wong (CyberForge) with availability',
    status: 'TODO',
    priority: 'HIGH',
    createdDaysAgo: 1,
    dueInDays: -1, // OVERDUE
    description: 'He asked for technical chat slots this week — propose Thursday 3pm.',
    opportunity_id: '01JDYJOB0000000000000002',
    tags: ['task', 'career'],
  }),
  task({
    id: '01JDYTASK0000000000000003',
    title: 'Prep Nexa Labs round 2 — system design (multi-agent)',
    status: 'TODO',
    priority: 'HIGH',
    createdDaysAgo: 3,
    dueInDays: 1,
    description: 'Sketch an orchestration design: supervisor + tool agents, retry policy, evals.',
    tags: ['task', 'career'],
  }),
  task({
    id: '01JDYTASK0000000000000004',
    title: 'Draft FiberPeak offer response',
    status: 'TODO',
    priority: 'MEDIUM',
    createdDaysAgo: 1,
    dueInDays: 2,
    description: 'Counter: 2 remote days, sign-on to cover lost bonus.',
    tags: ['task', 'career'],
  }),
  task({
    id: '01JDYTASK0000000000000005',
    title: 'Write teaser for PixelPine automation pitch',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    createdDaysAgo: 5,
    updatedDaysAgo: 1,
    dueInDays: -2, // OVERDUE
    description: '3-paragraph teaser: cost per hand-rolled site vs. AI-assisted pipeline.',
    tags: ['task', 'business'],
  }),
  task({
    id: '01JDYTASK0000000000000006',
    title: 'Weekly inbox-zero sweep of DISMISSED signals',
    status: 'DONE',
    priority: 'LOW',
    createdDaysAgo: 7,
    updatedDaysAgo: 6,
    description: 'Reviewed and dismissed 4 low-value signals.',
    tags: ['task', 'hygiene'],
  }),
  task({
    id: '01JDYTASK0000000000000007',
    title: 'Research RAZIS token treasury contract',
    status: 'TODO',
    priority: 'MEDIUM',
    createdDaysAgo: 0,
    dueInDays: 3,
    description: 'Read the treasury module; check withdrawal thresholds and timelock.',
    tags: ['task', 'gems'],
  }),
  task({
    id: '01JDYTASK0000000000000008',
    title: 'Cancel: revisit Lighthouse Digital role',
    status: 'CANCELLED',
    priority: 'LOW',
    createdDaysAgo: 10,
    updatedDaysAgo: 8,
    description: 'PHP stack — decided to skip after all.',
    tags: ['task'],
  }),
  // Created + set DONE by the Action Gate approve (GA3 — Orbit Edge apply).
  {
    id: '01JDYTASK0000000000000009',
    type: 'TASK',
    name: 'Apply to Senior Software Engineer',
    status: 'DONE',
    opportunity_type: null,
    score: null,
    due_at: null,
    source: 'gate',
    tags: ['gate', 'apply'],
    notes: [],
    data: {
      title: 'Apply to Senior Software Engineer',
      description: 'Prepared and approved through the Action Gate',
      opportunity_id: '01JDYJOB0000000000000006',
      priority: 'HIGH',
      completed_at: at(-9, 2),
    },
    created_at: at(-9, 2),
    updated_at: at(-9, 2),
  },
]

// ─── Edges (graph links used by detail views) ─────────────────────────────────

export const mockEdges: Edge[] = mockOpportunities.flatMap((o) => {
  const companyId = (o.data.company_id as string | undefined) ?? null
  if (!companyId) return []
  const edges: Edge[] = [
    {
      id: mockUlid('E'),
      from_id: o.id,
      to_id: companyId,
      edge_type: 'belongs_to',
      data: null,
      created_at: o.created_at,
    },
  ]
  if (o.score != null) {
    edges.push({
      id: mockUlid('E'),
      from_id: mockProfile.id,
      to_id: o.id,
      edge_type: 'matches',
      data: { score: o.score },
      created_at: o.updated_at,
    })
  }
  const taskId = mockTasks.find((t) => t.data.opportunity_id === o.id)?.id
  if (taskId) {
    edges.push({
      id: mockUlid('E'),
      from_id: taskId,
      to_id: o.id,
      edge_type: 'serves',
      data: null,
      created_at: o.created_at,
    })
  }
  return edges
})

