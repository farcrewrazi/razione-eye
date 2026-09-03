/**
 * RaziOne Eye — shared zod schemas (the executable API contract).
 *
 * Field names match docs/02-data-model.md EXACTLY (snake_case).
 * Every object: common fields (id/type/created_at/updated_at/source/tags/notes)
 * + a type-specific `data` payload validated per node type.
 *
 * Consumed by the server (validation on every write) and later by web/ (types).
 */
import { z } from 'zod';

// ─── Primitives ──────────────────────────────────────────────────────────────

/** ULID — 26 chars, Crockford base32. */
export const ulidSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'must be a valid ULID');

/** ISO-8601 UTC timestamp string. */
export const isoTimestampSchema = z.string().datetime({ offset: false });

export const scoreSchema = z.number().int().min(0).max(100);

// ─── Enums ───────────────────────────────────────────────────────────────────

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
] as const;
export const nodeTypeSchema = z.enum(NODE_TYPES);

export const OPPORTUNITY_TYPES = ['JOB', 'WEBSITE', 'CONSULTANCY', 'AFFILIATE', 'CRYPTO'] as const;
export const opportunityTypeSchema = z.enum(OPPORTUNITY_TYPES);

// Pipeline statuses (doc 02 §4) — FE never invents values.
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
] as const;
export const jobStatusSchema = z.enum(JOB_STATUSES);

export const BUSINESS_STATUSES = [
  'DISCOVERED_BUSINESS',
  'BUSINESS_ANALYZED',
  'PROBLEM_IDENTIFIED',
  'OPPORTUNITY',
  'TEASER_PROPOSAL',
  'OUTREACH',
  'REPLIED',
  'MEETING',
  'PROPOSAL',
  'WON',
  // terminals
  'LOST',
  'NOT_SUITABLE',
  'DISMISSED',
] as const;
export const businessStatusSchema = z.enum(BUSINESS_STATUSES);

export const AFFILIATE_STATUSES = [
  'IDEAS',
  'RESEARCH',
  'SCRIPT',
  'PRODUCE',
  'PUBLISHED',
  'PERFORMANCE',
] as const;
export const affiliateStatusSchema = z.enum(AFFILIATE_STATUSES);

export const CRYPTO_STATUSES = ['SIGNAL', 'TOKEN', 'QUICK_ANALYSIS', 'ALERT'] as const;
export const cryptoStatusSchema = z.enum(CRYPTO_STATUSES);

export const opportunityStatusSchema = z.union([
  jobStatusSchema,
  businessStatusSchema,
  affiliateStatusSchema,
  cryptoStatusSchema,
]);

/** Valid status per opportunity_type (doc 02 §4). */
export const STATUS_BY_OPPORTUNITY_TYPE: Record<OpportunityType, readonly string[]> = {
  JOB: JOB_STATUSES,
  WEBSITE: BUSINESS_STATUSES,
  CONSULTANCY: BUSINESS_STATUSES,
  AFFILIATE: AFFILIATE_STATUSES,
  CRYPTO: CRYPTO_STATUSES,
};

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
export const taskStatusSchema = z.enum(TASK_STATUSES);

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);

export const SIGNAL_TYPES = [
  'JOB_POSTING',
  'SOCIAL_POST',
  'COMMENT',
  'BUSINESS_DISCOVERY',
  'GEM_CALL',
] as const;
export const signalTypeSchema = z.enum(SIGNAL_TYPES);

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
] as const;
export const signalSourceSchema = z.enum(SIGNAL_SOURCES);

/** Where a job record was discovered / imported from (free-form; common values enumerated for the FE). */
export const JOB_SOURCES = [
  'linkedin',
  'jobstreet',
  'indeed',
  'careers_page',
  'agent',
  'referral',
  'manual',
  'import',
] as const;

export const SIGNAL_DISPOSITIONS = ['NEW', 'PROMOTED', 'DISMISSED', 'DUPLICATE'] as const;
export const signalDispositionSchema = z.enum(SIGNAL_DISPOSITIONS);

export const AGENT_KINDS = ['native', 'adapter'] as const;
export const agentKindSchema = z.enum(AGENT_KINDS);

export const AGENT_CAPABILITIES = [
  'discover',
  'analyze',
  'rank',
  'prepare',
  'draft',
  'suggest',
] as const;
export const agentCapabilitySchema = z.enum(AGENT_CAPABILITIES);

export const AGENT_SCHEDULES = ['on_demand', 'cron'] as const;
export const agentScheduleSchema = z.enum(AGENT_SCHEDULES);

export const AGENT_RUN_STATUSES = ['ok', 'error', 'empty'] as const;
export const agentRunStatusSchema = z.enum(AGENT_RUN_STATUSES);

/** Score bands (doc 02 §6.2) — derived from opportunity score. */
export const SCORE_BANDS = ['PRIORITY', 'APPLY', 'REVIEW', 'ARCHIVE'] as const;
export const scoreBandSchema = z.enum(SCORE_BANDS);

export function bandForScore(score: number | null | undefined): ScoreBand {
  if (score == null) return 'ARCHIVE';
  if (score >= 90) return 'PRIORITY';
  if (score >= 75) return 'APPLY';
  if (score >= 60) return 'REVIEW';
  return 'ARCHIVE';
}

// ─── Edge types (doc 02 §5 — open vocabulary; known types enumerated) ───────

export const EDGE_TYPES = [
  'knows',
  'located_in',
  'hiring',
  'belongs_to',
  'matches',
  'has_problem',
  'solved_by',
  'owns',
  'posted_by',
  'contact_at',
  'requires',
  'uses',
  'related_to',
  'mentions',
  'observed_by',
  'serves',
  // extended catalog from doc 02 §5 (implemented generically)
  'experienced_in',
  'lives_near',
  'recruiter_for',
  'audience_of',
  'wrote',
  'offers',
  'posted',
  'parent_of',
  'offered_by',
  'creates',
  'converts_to',
  'delivers_for',
  'produced',
  'assigned_to',
  'addresses',
  'promotes',
  'performed_by',
  'observes',
  'produces',
  'analyzes',
] as const;
export const edgeTypeSchema = z.enum(EDGE_TYPES);

// ─── Notes ───────────────────────────────────────────────────────────────────

/** Note entries: plain strings or {text, created_at} objects. */
export const noteSchema = z.union([z.string(), z.object({ text: z.string(), created_at: isoTimestampSchema })]);
export const notesSchema = z.array(noteSchema);

/** Normalize any stored note entry to display text (notes may be plain strings or objects). */
export function noteText(note: Note): string {
  return typeof note === 'string' ? note : note.text;
}

// ─── Type-specific data payloads (stored in nodes.data) ─────────────────────

export const personDataSchema = z
  .object({
    full_name: z.string().min(1),
    skills: z.array(z.string()).optional(),
    seniority: z.string().optional(),
    salary_min: z.number().int().nonnegative().optional(), // MYR/month
    salary_max: z.number().int().nonnegative().optional(),
    location: z.string().optional(),
    ai_culture_prefs: z.array(z.string()).optional(),
    role: z.string().optional(), // e.g. "recruiter"
  })
  .passthrough();

export const companyDataSchema = z
  .object({
    industry: z.string().optional(),
    size: z.string().optional(),
    stack: z.array(z.string()).optional(),
    location: z.string().optional(),
    ai_culture_notes: z.array(z.string()).optional(),
    website: z.string().url().optional(),
  })
  .passthrough();

/** JOB matching sub-scores — SIX keys per doc 02 §6.1 (supersedes §2.1's older 5-key example). */
export const matchingSchema = z
  .object({
    role_match: scoreSchema.optional(),
    company_match: scoreSchema.optional(),
    ai_culture: scoreSchema.optional(),
    location: scoreSchema.optional(),
    salary: scoreSchema.optional(),
    career_upside: scoreSchema.optional(),
  })
  .strict();

export const contactSchema = z
  .object({
    recruiter: z.string().optional(),
    linkedin: z.string().optional(),
    email: z.string().optional(),
  })
  .passthrough();

export const nextActionSchema = z.object({
  type: z.string().min(1),
  due: z.string().min(1).nullable(), // ISO date; null = no due date
});

export const jobOpportunityDataSchema = z
  .object({
    role: z.string().min(1),
    location: z.string().optional(),
    url: z.string().url().optional(),
    salary: z.string().optional(),
    salary_min: z.number().int().nonnegative().optional(),
    salary_max: z.number().int().nonnegative().optional(),
    match_score: scoreSchema.optional(),
    matching: matchingSchema.optional(),
    contact: contactSchema.optional(),
    next_action: nextActionSchema.optional(),
    problems_detected: z.array(z.string()).optional(),
    suggested_offer: z.unknown().optional(),
  })
  .passthrough();

/** WEBSITE / CONSULTANCY / AFFILIATE / CRYPTO payloads stay permissive in Phase 0 (Phases 3–5 fill them). */
export const permissiveOpportunityDataSchema = z
  .object({
    next_action: nextActionSchema.optional(),
    problems_detected: z.array(z.string()).optional(),
    suggested_offer: z.unknown().optional(),
  })
  .passthrough();

export const projectDataSchema = z.object({}).passthrough();

export const taskDataSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    opportunity_id: ulidSchema.optional(), // also express as a `serves` edge
    priority: taskPrioritySchema.optional(),
  })
  .passthrough();

export const signalDataSchema = z
  .object({
    signal_type: signalTypeSchema,
    content: z.string().min(1),
    url: z.string().url().optional(),
    observed_at: isoTimestampSchema,
    promoted_to: ulidSchema.optional(), // ref → OPPORTUNITY | CONTENT
  })
  .passthrough();

export const contentDataSchema = z.object({}).passthrough();

export const agentRunSchema = z.object({
  at: isoTimestampSchema,
  status: agentRunStatusSchema,
  summary: z.string().optional(),
});

export const agentDataSchema = z
  .object({
    name: z.string().min(1),
    kind: agentKindSchema,
    capability: agentCapabilitySchema,
    behind_adapter: z.string().nullable().optional(),
    schedule: agentScheduleSchema,
    last_run: isoTimestampSchema.optional(),
    last_status: agentRunStatusSchema.optional(),
    runs: z.array(agentRunSchema), // lightweight run log, capped at last 50
  })
  .passthrough();

export const simpleNodeDataSchema = z.object({ name: z.string().min(1) }).passthrough();

/** data schema per node type (SKILL/LOCATION/PROBLEM/SOLUTION/SOURCE are permissive). */
export const DATA_SCHEMAS: Record<NodeType, z.ZodTypeAny> = {
  PERSON: personDataSchema,
  COMPANY: companyDataSchema,
  OPPORTUNITY: permissiveOpportunityDataSchema, // JOB payloads re-validated via jobOpportunityDataSchema
  PROJECT: projectDataSchema,
  TASK: taskDataSchema,
  SIGNAL: signalDataSchema,
  CONTENT: contentDataSchema,
  AGENT: agentDataSchema,
  SKILL: simpleNodeDataSchema,
  LOCATION: simpleNodeDataSchema,
  PROBLEM: simpleNodeDataSchema,
  SOLUTION: simpleNodeDataSchema,
  SOURCE: simpleNodeDataSchema,
};

// ─── Node (wire shape — what the API returns / accepts) ─────────────────────

export const nodeSchema = z.object({
  id: ulidSchema,
  type: nodeTypeSchema,
  name: z.string().nullable(),
  status: z.string().nullable(),
  opportunity_type: opportunityTypeSchema.nullable(),
  score: scoreSchema.nullable(),
  due_at: isoTimestampSchema.nullable(),
  source: z.string().nullable(),
  tags: z.array(z.string()),
  notes: notesSchema,
  data: z.record(z.unknown()),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export const edgeSchema = z.object({
  id: ulidSchema,
  from_id: ulidSchema,
  to_id: ulidSchema,
  edge_type: edgeTypeSchema,
  data: z.record(z.unknown()).nullable(),
  created_at: isoTimestampSchema,
});

// ─── Events (append-only activity log — Wave 2) ──────────────────────────────

export const EVENT_TYPES = [
  'opportunity_created',
  'opportunity_imported',
  'status_changed',
  'note_added',
  'signal_created',
  'signal_promoted',
  'signal_dismissed',
  'import_run',
  'agent_run',
  'gate_decision',
  'analyzed',
] as const;
export const eventTypeSchema = z.enum(EVENT_TYPES);

export const eventSchema = z.object({
  id: ulidSchema,
  at: isoTimestampSchema,
  type: eventTypeSchema,
  node_id: ulidSchema.nullable(),
  summary: z.string(),
  data: z.record(z.unknown()).nullable(),
});


// ─── Request bodies ──────────────────────────────────────────────────────────

export const createOpportunitySchema = z
  .object({
    opportunity_type: opportunityTypeSchema,
    status: opportunityStatusSchema.optional(),
    data: z.record(z.unknown()),
    name: z.string().optional(),
    source: z.string().optional(),
    tags: z.array(z.string()).optional(),
    notes: notesSchema.optional(),
    due_at: isoTimestampSchema.nullable().optional(),
    score: scoreSchema.nullable().optional(),
    /** T1.1.6-BE (W3): link this manual entry back to a signal — the signal is
     *  created if missing, then marked PROMOTED with promoted_to = the new node. */
    signal_id: ulidSchema.optional(),
  })
  .strict();

export const updateOpportunitySchema = z
  .object({
    opportunity_type: opportunityTypeSchema.optional(),
    status: opportunityStatusSchema.optional(),
    data: z.record(z.unknown()).optional(),
    name: z.string().optional(),
    source: z.string().optional(),
    tags: z.array(z.string()).optional(),
    notes: notesSchema.optional(),
    due_at: isoTimestampSchema.nullable().optional(),
    score: scoreSchema.nullable().optional(),
  })
  .strict();

export const updateOpportunityStatusSchema = z
  .object({
    status: opportunityStatusSchema,
  })
  .strict();

export const createSignalSchema = z
  .object({
    data: signalDataSchema,
    status: signalDispositionSchema.optional(),
    source: signalSourceSchema.optional(),
    name: z.string().optional(),
    tags: z.array(z.string()).optional(),
    notes: notesSchema.optional(),
  })
  .strict();

export const updateSignalSchema = z
  .object({
    status: signalDispositionSchema.optional(),
    data: signalDataSchema.partial().optional(),
    name: z.string().optional(),
    tags: z.array(z.string()).optional(),
    notes: notesSchema.optional(),
  })
  .strict();

export const createTaskSchema = z
  .object({
    data: taskDataSchema,
    status: taskStatusSchema.optional(),
    name: z.string().optional(),
    source: z.string().optional(),
    tags: z.array(z.string()).optional(),
    notes: notesSchema.optional(),
    due_at: isoTimestampSchema.nullable().optional(),
  })
  .strict();

export const updateTaskSchema = z
  .object({
    status: taskStatusSchema.optional(),
    data: taskDataSchema.partial().optional(),
    name: z.string().optional(),
    tags: z.array(z.string()).optional(),
    notes: notesSchema.optional(),
    due_at: isoTimestampSchema.nullable().optional(),
  })
  .strict();

export const updateProfileSchema = personDataSchema
  .partial()
  .extend({
    tags: z.array(z.string()).optional(),
    notes: notesSchema.optional(),
  })
  .strict();

export const createEdgeSchema = z
  .object({
    from_id: ulidSchema,
    to_id: ulidSchema,
    edge_type: edgeTypeSchema,
    data: z.record(z.unknown()).optional(),
  })
  .strict();

// ─── Import pipeline (T1.1/T1.2 — Wave 2) ────────────────────────────────────

export const IMPORT_FORMATS = ['json', 'csv', 'md', 'chat'] as const;
export const importFormatSchema = z.enum(IMPORT_FORMATS);

export const importFileSchema = z
  .object({
    name: z.string().min(1),
    format: importFormatSchema,
    content: z.string(),
  })
  .strict();

export const importRequestSchema = z
  .object({
    files: z.array(importFileSchema).min(1).max(50),
  })
  .strict();

export const importFlaggedSchema = z.object({
  record: z.record(z.unknown()),
  reason: z.string(),
  signal_id: ulidSchema.optional(),
  file: z.string().optional(),
});

export const importDuplicateSchema = z.object({
  kept: z.string().min(1),
  dropped: z.string().min(1),
  file: z.string().optional(),
  /** 'batch' = duplicate within this import run; 'existing' = matched an OPPORTUNITY already in the graph (idempotent re-import). */
  reason: z.enum(['batch', 'existing']).optional(),
});

export const importFileReportSchema = z.object({
  path: z.string(),
  format: importFormatSchema,
  raw_records: z.number().int().nonnegative(),
  normalized: z.number().int().nonnegative(),
  flagged: z.array(importFlaggedSchema),
  duplicates: z.array(importDuplicateSchema),
});

export const importReportSchema = z.object({
  ran_at: isoTimestampSchema,
  files: z.array(importFileReportSchema),
  created: z.object({
    opportunities: z.number().int().nonnegative(),
    companies: z.number().int().nonnegative(),
    edges: z.number().int().nonnegative(),
  }),
  totals: z.object({
    raw_records: z.number().int().nonnegative(),
    normalized: z.number().int().nonnegative(),
    flagged: z.number().int().nonnegative(),
    duplicates: z.number().int().nonnegative(),
  }),
});

// ─── Notes append (activity log) ─────────────────────────────────────────────

export const appendNoteSchema = z
  .object({
    text: z.string().min(1),
  })
  .strict();

// ─── Action Gate (T1.11 — Wave 4) ────────────────────────────────────────────
// Gate mechanics per docs/03-agents-and-gates.md §4: an agent prepares a DRAFT
// action → it sits PENDING on the dashboard → Razi Approves / Edit-then-approves
// / Rejects → only then does the status update execute. Every decision is logged.

/** Action types that require explicit Razi approval (v1: the apply-task flow). */
export const GATE_ACTION_TYPES = ['apply_to_job'] as const;
export const gateActionTypeSchema = z.enum(GATE_ACTION_TYPES);

export const GATE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export const gateStatusSchema = z.enum(GATE_STATUSES);

export const GATE_DECISIONS = ['approved', 'edited_approved', 'rejected'] as const;
export const gateDecisionSchema = z.enum(GATE_DECISIONS);

/** The prepared draft payload for `apply_to_job` — a ready-to-paste application kit. */
export const applyToJobPayloadSchema = z
  .object({
    opportunity_id: ulidSchema,
    task_id: ulidSchema.optional(), // created on approve when omitted
    cover_note: z.string().optional(),
    resume_version: z.string().optional(),
    apply_url: z.string().url().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

/** Submit a draft action to the gate (system prepares → Razi confirms). */
export const createGateActionSchema = z
  .object({
    action_type: gateActionTypeSchema,
    payload: z.record(z.unknown()), // validated per action_type on the server
    opportunity_id: ulidSchema.optional(), // fallback link when payload has none
    task_id: ulidSchema.optional(),
  })
  .strict();

/** Edit-then-approve: replace the draft payload before approving. */
export const updateGateActionSchema = z
  .object({
    payload: z.record(z.unknown()),
  })
  .strict();

export const approveGateActionSchema = z
  .object({
    payload: z.record(z.unknown()).optional(), // edit-then-approve in one call
  })
  .strict();

export const rejectGateActionSchema = z
  .object({
    reason: z.string().min(1),
  })
  .strict();

/** Wire shape for one gate queue entry. */
export const gateActionSchema = z.object({
  id: ulidSchema,
  action_type: gateActionTypeSchema,
  status: gateStatusSchema,
  opportunity_id: ulidSchema.nullable(),
  task_id: ulidSchema.nullable(),
  payload: z.record(z.unknown()),
  summary: z.string(),
  created_at: isoTimestampSchema,
  decided_at: isoTimestampSchema.nullable(),
  decision: gateDecisionSchema.nullable(),
  decision_reason: z.string().nullable(),
  // Enriched on reads (never stored): the linked nodes for the review screen.
  opportunity: nodeSchema.nullable().optional(),
  task: nodeSchema.nullable().optional(),
});


// ─── Error envelope ──────────────────────────────────────────────────────────

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

// ─── Inferred TS types ───────────────────────────────────────────────────────

export type NodeType = z.infer<typeof nodeTypeSchema>;
export type OpportunityType = z.infer<typeof opportunityTypeSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type BusinessStatus = z.infer<typeof businessStatusSchema>;
export type AffiliateStatus = z.infer<typeof affiliateStatusSchema>;
export type CryptoStatus = z.infer<typeof cryptoStatusSchema>;
export type OpportunityStatus = z.infer<typeof opportunityStatusSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type SignalType = z.infer<typeof signalTypeSchema>;
export type SignalSource = z.infer<typeof signalSourceSchema>;
export type SignalDisposition = z.infer<typeof signalDispositionSchema>;
export type AgentKind = z.infer<typeof agentKindSchema>;
export type AgentCapability = z.infer<typeof agentCapabilitySchema>;
export type AgentSchedule = z.infer<typeof agentScheduleSchema>;
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;
export type ScoreBand = z.infer<typeof scoreBandSchema>;
export type EdgeType = z.infer<typeof edgeTypeSchema>;
export type Note = z.infer<typeof noteSchema>;
export type PersonData = z.infer<typeof personDataSchema>;
export type CompanyData = z.infer<typeof companyDataSchema>;
export type Matching = z.infer<typeof matchingSchema>;
/** All six sub-scores present (analyst output — vs Matching, all-optional on storage). */
export interface SubScores {
  role_match: number;
  company_match: number;
  ai_culture: number;
  location: number;
  salary: number;
  career_upside: number;
}
export type NextAction = z.infer<typeof nextActionSchema>;
export type JobOpportunityData = z.infer<typeof jobOpportunityDataSchema>;
export type TaskData = z.infer<typeof taskDataSchema>;
export type SignalData = z.infer<typeof signalDataSchema>;
export type AgentRun = z.infer<typeof agentRunSchema>;
export type AgentData = z.infer<typeof agentDataSchema>;
export type Node = z.infer<typeof nodeSchema>;
export type Edge = z.infer<typeof edgeSchema>;
export type CreateOpportunity = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunity = z.infer<typeof updateOpportunitySchema>;
export type CreateSignal = z.infer<typeof createSignalSchema>;
export type UpdateSignal = z.infer<typeof updateSignalSchema>;
export type CreateTask = z.infer<typeof createTaskSchema>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;
export type CreateEdge = z.infer<typeof createEdgeSchema>;
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
export type EventType = z.infer<typeof eventTypeSchema>;
export type EyeEvent = z.infer<typeof eventSchema>;
export type ImportFormat = z.infer<typeof importFormatSchema>;
export type ImportFile = z.infer<typeof importFileSchema>;
export type ImportRequest = z.infer<typeof importRequestSchema>;
export type ImportFlagged = z.infer<typeof importFlaggedSchema>;
export type ImportDuplicate = z.infer<typeof importDuplicateSchema>;
export type ImportFileReport = z.infer<typeof importFileReportSchema>;
export type ImportReport = z.infer<typeof importReportSchema>;
export type AppendNote = z.infer<typeof appendNoteSchema>;
export type GateActionType = z.infer<typeof gateActionTypeSchema>;
export type GateStatus = z.infer<typeof gateStatusSchema>;
export type GateDecision = z.infer<typeof gateDecisionSchema>;
export type ApplyToJobPayload = z.infer<typeof applyToJobPayloadSchema>;
export type CreateGateAction = z.infer<typeof createGateActionSchema>;
export type UpdateGateAction = z.infer<typeof updateGateActionSchema>;
export type ApproveGateAction = z.infer<typeof approveGateActionSchema>;
export type RejectGateAction = z.infer<typeof rejectGateActionSchema>;
export type GateAction = z.infer<typeof gateActionSchema>;
