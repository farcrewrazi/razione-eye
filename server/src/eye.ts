/**
 * Eye scoping helpers (docs/07-api-contract.md §Eye scoping).
 *
 * The Eyes are lenses over the same graph, not separate stores. Every list /
 * aggregation endpoint accepts an optional `?eye=` and scopes its slice:
 *   career → JOB · business → WEBSITE+CONSULTANCY · growth → AFFILIATE ·
 *   signal → CRYPTO · control/all → everything.
 * Omitting `?eye=` is always identical to today's behavior (all data, JOB-first).
 */
import {
  AFFILIATE_STATUSES,
  BUSINESS_STATUSES,
  CRYPTO_STATUSES,
  EYES,
  JOB_STATUSES,
  OPPORTUNITY_TYPES_BY_EYE,
  STATUS_BY_OPPORTUNITY_TYPE,
  eyeSchema,
  type Eye,
  type OpportunityType,
} from '@razione-eye/shared';

export { OPPORTUNITY_TYPES_BY_EYE, SIGNAL_TYPES_BY_EYE } from '@razione-eye/shared';
export { EYES };

/** The legacy board/NBA JOB pipeline (backward compat for no-eye callers). */
export const JOB_PIPELINE_STATUSES: readonly string[] = JOB_STATUSES;

/** Parse a raw ?eye= query value. null = no eye given (caller keeps legacy behavior). */
export function parseEyeQuery(raw: string | undefined): { eye: Eye } | { error: string } {
  if (raw === undefined) return { eye: 'all' };
  if (!eyeSchema.safeParse(raw).success) return { error: `invalid eye: ${raw}` };
  return { eye: raw as Eye };
}

/** OPPORTUNITY types visible in an Eye ('all'/'control' → every type). */
export function opportunityTypesForEye(eye: Eye): readonly OpportunityType[] {
  const types = OPPORTUNITY_TYPES_BY_EYE[eye];
  return types.length > 0 ? types : [...(Object.keys(STATUS_BY_OPPORTUNITY_TYPE) as OpportunityType[])];
}

/**
 * "Actionable" statuses per opportunity type — the stages worth surfacing in
 * NBA / priorities. JOB keeps the existing NBA_STATUSES contract
 * (QUALIFIED/READY_TO_APPLY/ANALYZED); other types are provisional until their
 * phase ships, so every non-terminal status counts as actionable.
 */
const PROVISIONAL_ACTIONABLE = new Set<string>([
  ...BUSINESS_STATUSES.filter((s) => s !== 'LOST' && s !== 'NOT_SUITABLE' && s !== 'DISMISSED'),
  ...AFFILIATE_STATUSES,
  ...CRYPTO_STATUSES,
]);

export function actionableStatusesForType(opportunityType: OpportunityType): ReadonlySet<string> {
  if (opportunityType === 'JOB') return NBA_JOB_STATUSES;
  return PROVISIONAL_ACTIONABLE;
}

/** Existing NBA contract for JOB (dashboard.ts NBA_STATUSES — kept verbatim). */
export const NBA_JOB_STATUSES: ReadonlySet<string> = new Set(['QUALIFIED', 'READY_TO_APPLY', 'ANALYZED']);

/**
 * Board columns per Eye/type: the statuses of every visible opportunity type,
 * in pipeline order, deduplicated. Empty for control/all with no types →
 * callers fall back per their own rules (opportunities board uses JOB_STATUSES
 * for career/all/control for backward compat).
 */
export function boardStatusesForEye(eye: Eye): string[] {
  const types = OPPORTUNITY_TYPES_BY_EYE[eye];
  if (types.length === 0) return [];
  const out: string[] = [];
  for (const t of types) for (const s of STATUS_BY_OPPORTUNITY_TYPE[t]) if (!out.includes(s)) out.push(s);
  return out;
}

/** Board columns for an explicit opportunity type (or the legacy default). */
export function boardStatusesForType(opportunityType: OpportunityType | null): readonly string[] {
  if (opportunityType) return STATUS_BY_OPPORTUNITY_TYPE[opportunityType];
  return JOB_STATUSES; // legacy default — JOB pipeline (backward compat)
}
