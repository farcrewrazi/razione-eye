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

export const GATE_ACTION_TYPES = ['apply_to_job'] as const
export const GATE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const
export const GATE_DECISIONS = ['approved', 'edited_approved', 'rejected'] as const

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
export type GateActionType = (typeof GATE_ACTION_TYPES)[number]
export type GateStatus = (typeof GATE_STATUSES)[number]
export type GateDecision = (typeof GATE_DECISIONS)[number]

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

/** [W3] company-vs-role split — Job Analyst writes `data.dimensions` (contract §2/§5). */
export interface MatchingDimensions {
  role_dimension?: number
  company_dimension?: number
}
export interface Contact {
  recruiter?: string
  linkedin?: string
  email?: string
}

export interface NextAction {
  type: string
  /** ISO date or timestamp; may be null on hand-written entries (contract §6). */
  due: string | null
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
  /** [W3] role/company dimension split (Job Analyst). Optional — hand-written entries omit it. */
  dimensions?: MatchingDimensions
  contact?: Contact
  next_action?: NextAction
  /** [W4] ISO date (YYYY-MM-DD) — written when the gate approves the apply. */
  applied_date?: string
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

export interface DashboardTodayAggregate {
  /** Open TASKs due ≤ today + JOB opps with next_action.due ≤ today (contract §4). */
  actions_required: number
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

/** NBA wire shape (contract §4 [W3]) — all fields nullable, null object = nothing to do. */
export interface NextBestAction {
  opportunity: Opportunity | null
  reason: string | null
  match_score: number | null
}

// ─── Daily Brief (contract §4 [W4], T1.10) ───────────────────────────────────

/** One ranked morning priority — explicit opportunity ref (no FE text-matching). */
export interface BriefPriority {
  opportunity_id: string
  role: string | null
  company: string | null
  score: number | null
  band: ScoreBand
  next_action: { type: string; due: string | null } | null
}

export interface MorningBriefCounts {
  /** Open tasks due ≤ today + opps due ≤ today + pending gate approvals. */
  actions_required: number
  gate_pending: number
  overdue_tasks: number
  career: DashboardCareerAggregate
  business: { discovered: number }
  affiliate: { content_opportunities: number }
  gems: { tokens_detected: number }
}

export interface MorningBrief {
  kind: 'morning'
  date: string // YYYY-MM-DD
  counts: MorningBriefCounts
  priorities: BriefPriority[] // top 3–5, ranked by score then soonest due
  next_best_action: NextBestAction | null
}

export interface EveningBrief {
  kind: 'evening'
  date: string
  /** Tasks DONE today + gate-approved apply actions today. */
  completed_today: number
  /** Open tasks (any due) + opps still awaiting action. */
  pending: number
  new_today: { opportunities: number; signals: number }
  gate_decisions_today: number
  observation: string
  recommendation: string
}

export type Brief = MorningBrief | EveningBrief

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

/** POST /api/opportunities body (contract §4 — createOpportunitySchema is .strict()). */
export interface CreateOpportunityInput {
  opportunity_type: OpportunityType
  status?: string
  /** JOB payload (contract §2) — re-validated server-side; other types permissive. */
  data: Record<string, unknown>
  name?: string
  source?: string
  tags?: string[]
  notes?: Note[]
  due_at?: string | null
  score?: number | null
  /** T1.1.6-BE (W3) link-back: marks the referenced SIGNAL PROMOTED with promoted_to. */
  signal_id?: string
}

/**
 * FE-facing manual JOB entry (T1.1.6-FE) — `createOpportunity()` input.
 * Company is FE-level: mock mode find-or-creates + links a COMPANY node; real
 * mode sends the contract body (company linking arrives with the real
 * integration — until then the company name rides along as a note).
 */
export interface CreateManualJobInput {
  company: string
  role: string
  location?: string
  salary?: string
  url?: string
  stack?: string[]
  source?: string
  notes?: string
  /** ISO date — mock mode anchors created_at to it. */
  discovered_at?: string
  signal_id?: string
}

/**
 * FE-facing promote payload (T1.12) — `promoteSignal()` input. Mirrors the
 * contract's promote body plus a FE-level `company` (mock find-or-creates +
 * links a COMPANY node; real mode sends it as a note — not in the contract
 * promote body yet, same convention as CreateManualJobInput).
 */
export interface PromoteSignalData {
  company?: string
  role?: string
  location?: string
  salary?: string
  url?: string
  stack?: string[]
  notes?: string
}

/** POST /api/signals/:id/promote response (contract §4 [W3]). */
export interface PromoteSignalResult {
  signal: Signal
  /** Includes computed `band`. */
  opportunity: Opportunity
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

// ─── Action Gate (contract §4 [W4], T1.11) ───────────────────────────────────

/** The prepared draft payload for `apply_to_job` — a ready-to-paste application kit. */
export interface ApplyToJobPayload {
  opportunity_id: string
  /** Created (and set DONE) on approve when omitted. */
  task_id?: string
  cover_note?: string
  resume_version?: string
  apply_url?: string
  notes?: string
  [key: string]: unknown // schema is .passthrough()
}

/** One gate queue entry — decisions are FINAL (409 ALREADY_DECIDED on re-decide). */
export interface GateAction {
  id: string
  action_type: GateActionType
  status: GateStatus
  opportunity_id: string | null
  task_id: string | null
  payload: ApplyToJobPayload
  /** e.g. "Apply to Senior Backend Engineer — NexLabs". */
  summary: string
  created_at: string
  decided_at: string | null
  decision: GateDecision | null
  decision_reason: string | null
  /** Linked nodes, enriched on reads — updated opportunity/task after approve. */
  opportunity: Opportunity | null
  task: Task | null
}

export interface ListGateActionsParams {
  status?: GateStatus
  limit?: number
  offset?: number
}

/** POST /api/gate/actions body (contract §4). */
export interface CreateGateActionInput {
  action_type: GateActionType
  payload: ApplyToJobPayload
  /** Top-level fallbacks when the payload omits them. */
  opportunity_id?: string
  task_id?: string
}

/** POST /api/gate/actions/:id/approve body — payload = edit-then-approve. */
export interface ApproveGateActionInput {
  payload?: Partial<ApplyToJobPayload>
}

/** POST /api/gate/actions/:id/approve response — executed nodes included. */
export type ApproveGateActionResult = GateAction & {
  opportunity: Opportunity
  task: Task
}

/** POST /api/gate/actions/:id/reject body. */
export interface RejectGateActionInput {
  reason: string
}

// ─── Health (contract §4) ────────────────────────────────────────────────────

export interface Health {
  ok: boolean
  version: string
  db: string
}

// ─── Error envelope (contract §0) ────────────────────────────────────────────

export type ApiErrorCode =
  | 'VALIDATION'
  | 'INVALID_STATUS'
  | 'BAD_QUERY'
  | 'NOT_FOUND'
  | 'ALREADY_DECIDED' // [W4] gate action already decided — decisions are final
  | 'INTERNAL'

export interface ErrorEnvelope {
  error: {
    code: string
    message: string
  }
}
