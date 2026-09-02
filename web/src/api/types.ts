/**
 * RaziOne Eye — FE API types.
 *
 * Mirrors docs/07-api-contract.md EXACTLY (the frozen contract) and the zod
 * schemas in packages/shared/src/schemas.ts (the executable source of truth).
 *
 * web/ stays self-contained for now — enums below are duplicated from
 * @razione-eye/shared and must be kept in sync.
 * source of truth: @razione-eye/shared
 */

// ─── Enums (duplicated — source of truth: @razione-eye/shared) ───────────────

export const NODE_TYPES = [
  'PERSON',
  'COMPANY',
  'OPPORTUNITY',
  'PROJECT',
  'TASK',
  'SIGNAL',
  'CONTENT',
  'AGENT',
  'SKILL',
  'LOCATION',
  'PROBLEM',
  'SOLUTION',
  'SOURCE',
] as const

export const OPPORTUNITY_TYPES = ['JOB', 'WEBSITE', 'CONSULTANCY', 'AFFILIATE', 'CRYPTO'] as const

export const JOB_STATUSES = [
  'DISCOVERED',
  'ANALYZED',
  'QUALIFIED',
  'READY_TO_APPLY',
  'APPLIED',
  'RECRUITER_RESPONSE',
  'INTERVIEW',
  'OFFER',
  'HIRED',
  // terminals
  'REJECTED',
  'IGNORED',
  'NOT_SUITABLE',
  'EXPIRED',
] as const

export const JOB_TERMINAL_STATUSES = ['REJECTED', 'IGNORED', 'NOT_SUITABLE', 'EXPIRED'] as const

export const SCORE_BANDS = ['PRIORITY', 'APPLY', 'REVIEW', 'ARCHIVE'] as const

/** Band thresholds — band is derived server-side (doc 02 §6.2); FE reads, never derives. */
export const BAND_RULES = [
  { band: 'PRIORITY', min: 90, description: 'score ≥ 90' },
  { band: 'APPLY', min: 75, description: 'score 75–89' },
  { band: 'REVIEW', min: 60, description: 'score 60–74' },
  { band: 'ARCHIVE', min: 0, description: 'score < 60 (or null score)' },
] as const

export const SIGNAL_TYPES = ['JOB_POSTING', 'SOCIAL_POST', 'COMMENT', 'BUSINESS_DISCOVERY', 'GEM_CALL'] as const

export const SIGNAL_SOURCES = [
  'linkedin',
  'facebook',
  'x',
  'threads',
  'careers_page',
  'google',
  'comments',
  'rams_gem',
  'manual',
  'import',
  'agent',
] as const

export const SIGNAL_DISPOSITIONS = ['NEW', 'PROMOTED', 'DISMISSED', 'DUPLICATE'] as const

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const

export const AGENT_KINDS = ['native', 'adapter'] as const
export const AGENT_CAPABILITIES = ['discover', 'analyze', 'rank', 'prepare', 'draft', 'suggest'] as const
export const AGENT_SCHEDULES = ['on_demand', 'cron'] as const
export const AGENT_RUN_STATUSES = ['ok', 'error', 'empty'] as const

export type NodeType =
  | 'PERSON'
  | 'COMPANY'
  | 'OPPORTUNITY'
  | 'PROJECT'
  | 'TASK'
  | 'SIGNAL'
  | 'CONTENT'
  | 'AGENT'
  | 'SKILL'
  | 'LOCATION'
  | 'PROBLEM'
  | 'SOLUTION'
  | 'SOURCE'

export type OpportunityType = 'JOB' | 'WEBSITE' | 'CONSULTANCY' | 'AFFILIATE' | 'CRYPTO'
export type JobStatus = (typeof JOB_STATUSES)[number]
export type JobTerminalStatus = (typeof JOB_TERMINAL_STATUSES)[number]
export type ScoreBand = (typeof SCORE_BANDS)[number]
export type SignalType = (typeof SIGNAL_TYPES)[number]
export type SignalSource = (typeof SIGNAL_SOURCES)[number]
export type SignalDisposition = (typeof SIGNAL_DISPOSITIONS)[number]
export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskPriority = (typeof TASK_PRIORITIES)[number]
export type AgentKind = (typeof AGENT_KINDS)[number]
export type AgentCapability = (typeof AGENT_CAPABILITIES)[number]
export type AgentSchedule = (typeof AGENT_SCHEDULES)[number]
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number]

// ─── Shared primitives ───────────────────────────────────────────────────────

export type Note = string | { text: string; created_at: string }

// ─── Type-specific data payloads (contract §2) ──────────────────────────────

export interface PersonData {
  full_name: string
  skills?: string[]
  seniority?: string
  salary_min?: number // MYR/month
  salary_max?: number
  location?: string
  ai_culture_prefs?: string[]
  role?: string // e.g. "recruiter"
  [key: string]: unknown // schema is .passthrough()
}

export interface CompanyData {
  industry?: string
  size?: string
  stack?: string[]
  location?: string
  ai_culture_notes?: string[]
  website?: string
  [key: string]: unknown // schema is .passthrough()
}

/** Six sub-scores, all 0–100, all optional (doc 02 §6.1). */
export interface Matching {
  role_match?: number
  company_match?: number
  ai_culture?: number
  location?: number
  salary?: number
  career_upside?: number
}
export interface Contact {
  recruiter?: string
  linkedin?: string
  email?: string
}

export interface NextAction {
  type: string
  due: string
}

export interface OpportunityData {
  // JOB payload (contract §2); other opportunity types are permissive in Phase 0
  role: string
  location?: string
  url?: string
  salary?: string
  salary_min?: number
  salary_max?: number
  match_score?: number
  matching?: Matching
  contact?: Contact
  next_action?: NextAction
  problems_detected?: string[]
  suggested_offer?: unknown
  [key: string]: unknown // permissive for WEBSITE/CONSULTANCY/AFFILIATE/CRYPTO
}

export interface TaskData {
  title: string
  description?: string
  opportunity_id?: string // also expressed as a `serves` edge
  priority?: TaskPriority
  [key: string]: unknown
}

export interface SignalData {
  signal_type: SignalType
  content: string
  url?: string
  observed_at: string
  promoted_to?: string // ref → OPPORTUNITY | CONTENT
  [key: string]: unknown
}

export interface AgentRun {
  at: string
  status: AgentRunStatus
  summary?: string
}

export interface AgentData {
  name: string
  kind: AgentKind
  capability: AgentCapability
  behind_adapter?: string | null
  schedule: AgentSchedule
  last_run?: string
  last_status?: AgentRunStatus
  runs: AgentRun[] // lightweight run log, capped at last 50
  [key: string]: unknown // schema is .passthrough()
}

// ─── Node envelope (contract §1) ─────────────────────────────────────────────

/**
 * Every object shares one storage/wire shape; the type-specific payload lives
 * in `data`. Generic parameter narrows `data` (and keeps envelope fields).
 */
export interface ApiNode<D = Record<string, unknown>> {
  id: string
  type: NodeType
  name: string | null
  status: string | null
  opportunity_type: OpportunityType | null
  score: number | null
  due_at: string | null
  source: string | null
  tags: string[]
  notes: Note[]
  data: D
  created_at: string
  updated_at: string
}

/** List envelope (contract §1). */
export interface ListEnvelope<T> {
  items: T[]
  total: number
}

// ─── Edge (contract §4) ──────────────────────────────────────────────────────

export interface Edge {
  id: string
  from_id: string
  to_id: string
  edge_type: string // open vocabulary; `matches` edges carry data: { score }
  data: Record<string, unknown> | null
  created_at: string
}

// ─── Events / activity log (contract §1 [W2]) ─────────────────────────────────

export const EVENT_TYPES = [
  'opportunity_imported',
  'opportunity_created',
  'status_changed',
  'note_added',
  'signal_created',
  'signal_promoted',
  'signal_dismissed',
  'agent_run',
  'import_run',
  'gate_decision',
] as const

export type EventType = (typeof EVENT_TYPES)[number]

/** Append-only activity-log row (contract §1 [W2]). */
export interface Event {
  id: string
  at: string
  type: EventType
  /** null for run-level events (e.g. import_run). */
  node_id: string | null
  summary: string
  /** payload; import_run events carry the full ImportReport. */
  data: Record<string, unknown> | null
}

export interface ListEventsParams {
  limit?: number
  offset?: number
}

// ─── Opportunities (computed `band` on reads) ─────────────────────────────────

/** Opportunity read shape — ApiNode with computed band + resolved company. */
export type Opportunity = ApiNode<OpportunityData> & {
  band: ScoreBand
  /** Company node when resolvable via belongs_to/hiring edge (FE convenience). */
  company?: ApiNode<CompanyData> | null
}

/** GET /api/opportunities/:id — graph neighbors included. */
export type OpportunityDetail = Opportunity & {
  edges: Edge[]
  neighbors: ApiNode[]
}

export interface ListOpportunitiesParams {
  type?: OpportunityType
  status?: string
  band?: ScoreBand
  q?: string
  limit?: number
  offset?: number
  sort?: string // score|created_at|updated_at|due_at|name, prefix `-` for DESC
}

// ─── Company detail (contract §4) ─────────────────────────────────────────────

export type CompanyDetail = ApiNode<CompanyData> & {
  opportunities: Opportunity[]
}

// ─── FE-owned aggregates (dashboard / next best action / briefs) ──────────────

export interface DashboardCareerAggregate {
  new_jobs: number
  high_match: number
  pending_applications: number
  recruiters_awaiting: number
}

export interface DashboardBusinessAggregate {
  discovered: number
  worth_approaching: number
  teasers_ready: number
}

export interface DashboardAffiliateAggregate {
  content_opportunities: number
  scheduled: number
}

export interface DashboardGemsAggregate {
  tokens_detected: number
  passed_filter: number
}

export interface DashboardActionsRequiredAggregate {
  overdue_tasks: number
  stale_opportunities: number
  unanswered_recruiters: number
}

export interface DashboardTodayAggregate {
  actions_required: DashboardActionsRequiredAggregate
  career: DashboardCareerAggregate
  business: DashboardBusinessAggregate
  affiliate: DashboardAffiliateAggregate
  gems: DashboardGemsAggregate
}

export interface DashboardAggregate {
  today: DashboardTodayAggregate
  agents: Agent[]
  next_best_action: NextBestAction | null
}

export interface NextBestAction {
  opportunity: Opportunity
  reason: string
  match_score: number
}

export interface BriefPriority {
  title: string
  context: string
}

export interface BriefCounts {
  completed: number
  pending: number
  new: number
}

export interface Brief {
  slot: 'morning' | 'evening'
  date: string // ISO date (YYYY-MM-DD)
  priorities: BriefPriority[]
  counts: BriefCounts
  observation: string
  observation_recommendation: string
}

// ─── Convenience aliases (typed node views) ───────────────────────────────────

export type Person = ApiNode<PersonData>
export type Company = ApiNode<CompanyData>
export type Signal = ApiNode<SignalData>
export type Task = ApiNode<TaskData>
export type Agent = ApiNode<AgentData>

// ─── Request bodies (contract §4) ────────────────────────────────────────────

export interface UpdateProfileInput {
  // partial PERSON data
  full_name?: string
  skills?: string[]
  seniority?: string
  salary_min?: number
  salary_max?: number
  location?: string
  ai_culture_prefs?: string[]
  role?: string
  tags?: string[]
  notes?: Note[]
}

export interface CreateSignalInput {
  data: {
    signal_type: SignalType
    content: string
    url?: string
    observed_at: string
    promoted_to?: string
  }
  status?: SignalDisposition
  source?: SignalSource
  name?: string
  tags?: string[]
  notes?: Note[]
}

export interface CreateTaskInput {
  data: {
    title: string
    description?: string
    opportunity_id?: string
    priority?: TaskPriority
  }
  status?: TaskStatus
  due_at?: string | null
  name?: string
  source?: string
  tags?: string[]
  notes?: Note[]
}

export interface PatchTaskInput {
  status?: TaskStatus
  data?: Partial<TaskData>
  due_at?: string | null
  name?: string
  tags?: string[]
  notes?: Note[]
}

export interface ListCompaniesParams {
  q?: string
  limit?: number
  offset?: number
  sort?: string
}

export interface ListSignalsParams {
  disposition?: SignalDisposition
  signal_type?: SignalType
  q?: string
  limit?: number
  offset?: number
}

export interface ListTasksParams {
  status?: TaskStatus
  due_before?: string
  overdue?: boolean
  limit?: number
  offset?: number
  sort?: string
}

// ─── Health (contract §4) ────────────────────────────────────────────────────

export interface Health {
  ok: boolean
  version: string
  db: string
}

// ─── Error envelope (contract §0) ────────────────────────────────────────────

export type ApiErrorCode = 'VALIDATION' | 'INVALID_STATUS' | 'BAD_QUERY' | 'NOT_FOUND' | 'INTERNAL'

export interface ErrorEnvelope {
  error: {
    code: string
    message: string
  }
}
