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
  due: z.string().min(1),
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
