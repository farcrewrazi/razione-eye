/**
 * Job Analyst agent (T1.3 / T1.4) — deterministic-first, LLM-ready.
 *
 * v1 is fully deterministic: no API keys, reproducible, testable. The
 * `AnalystPort` interface is the seam for a future LLM-backed implementation —
 * swap the implementation, callers (run service, routes) stay untouched.
 *
 * Pipeline (docs/03-agents-and-gates.md §2.2):
 *   extract signals → compare against profile → six sub-scores →
 *   role/company dimensions → weighted total → band → next_action.
 *
 * Scoring rules live in `rules.ts` (pure functions, unit-tested directly).
 * This file owns: extraction orchestration + `AnalystPort` + the deterministic
 * implementation + the pure persistence plan (`buildPersistedAnalysis`).
 * DB wiring lives in `run-service.ts`.
 */
import {
  bandForScore,
  noteText,
  type CompanyData,
  type NextAction,
  type Node,
  type PersonData,
  type ScoreBand,
  type SubScores,
} from '@razione-eye/shared';
import { nowIso } from '../ulid.ts';
import {
  AI_CULTURE_MARKERS,
  detectAiMarkers,
  detectLocation,
  extractStackTokens,
  inferSeniorityFromTitle,
  parseSalaryToMinMax,
  scoreAiCulture,
  scoreCareerUpside,
  scoreCompanyMatch,
  scoreLocation,
  scoreRoleMatch,
  scoreSalary,
} from './rules.ts';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AnalystInput {
  opportunity: Node; // OPPORTUNITY, opportunity_type JOB
  profile: PersonData | null;
  company: Node | null; // COMPANY node, when linked
}

export interface AnalystDimensions {
  role_dimension: number; // avg(role_match, salary, career_upside)
  company_dimension: number; // avg(company_match, ai_culture, location)
}

export interface AnalysisResult {
  sub_scores: SubScores;
  dimensions: AnalystDimensions;
  total: number; // weighted, rounded — becomes score + data.match_score
  band: ScoreBand;
  next_action: NextAction;
  inferences: string[]; // human-readable "key=value" list of extracted fields
}

/** Seam for a future LLM-backed analyst — implement this, nothing else changes. */
export interface AnalystPort {
  analyze(input: AnalystInput): AnalysisResult;
}

// ─── Extraction (T1.3.1) ─────────────────────────────────────────────────────

/**
 * Infer missing opportunity fields from notes / stack / url / source / role.
 * Never overwrites explicit values — returns only the fields that were absent.
 */
export function extractSignals(opportunity: Node): {
  patch: Record<string, unknown>;
  inferences: string[];
} {
  const data = opportunity.data;
  const stackExplicit = Array.isArray(data['stack']) ? (data['stack'] as unknown[]) : null;
  const corpus = [
    typeof data['role'] === 'string' ? data['role'] : '',
    typeof data['location'] === 'string' ? data['location'] : '',
    typeof data['url'] === 'string' ? data['url'] : '',
    typeof data['source'] === 'string' ? data['source'] : '',
    stackExplicit ? stackExplicit.join(' ') : '',
    ...opportunity.notes.map(noteText),
  ].join('\n');

  const patch: Record<string, unknown> = {};
  const inferences: string[] = [];
  const infer = (key: string, value: unknown) => {
    patch[key] = value;
    inferences.push(`${key}=${String(value)}`);
  };

  if (typeof data['location'] !== 'string' || data['location'] === '') {
    const loc = detectLocation(corpus);
    if (loc) infer('location', loc);
  }
  if (data['salary_min'] === undefined || data['salary_max'] === undefined) {
    const range = parseSalaryToMinMax(
      [typeof data['salary'] === 'string' ? data['salary'] : '', corpus].join('\n'),
    );
    if (range) {
      if (data['salary_min'] === undefined) infer('salary_min', range.min);
      if (data['salary_max'] === undefined) infer('salary_max', range.max);
    }
  }
  if (!stackExplicit || stackExplicit.length === 0) {
    const tokens = extractStackTokens(corpus);
    if (tokens.length > 0) infer('stack', tokens);
  }
  if (data['ai_culture'] === undefined) {
    const markers = detectAiMarkers(corpus);
    if (markers.length > 0) infer('ai_culture', markers);
  }
  return { patch, inferences };
}

// ─── Deterministic analyst ───────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** next_action per band (T1.3.5) — due = today + N days (ISO date). */
export function nextActionForBand(band: ScoreBand, now: Date): NextAction {
  const dueIn = (days: number): string =>
    new Date(now.getTime() + days * DAY_MS).toISOString().slice(0, 10);
  switch (band) {
    case 'PRIORITY':
      return { type: 'apply', due: dueIn(1) };
    case 'APPLY':
      return { type: 'apply', due: dueIn(3) };
    case 'REVIEW':
      return { type: 'review', due: dueIn(7) };
    case 'ARCHIVE':
      return { type: 'archive', due: dueIn(14) }; // archive review
  }
}

/** Total = weighted sub-scores (T1.3.4), rounded to an int. */
export function totalScore(s: SubScores): number {
  return Math.round(
    s.role_match * 0.3 +
      s.company_match * 0.2 +
      s.ai_culture * 0.15 +
      s.location * 0.15 +
      s.salary * 0.1 +
      s.career_upside * 0.1,
  );
}

export class DeterministicAnalyst implements AnalystPort {
  private readonly now: Date;

  constructor(now: Date = new Date()) {
    this.now = now;
  }

  analyze({ opportunity, profile, company }: AnalystInput): AnalysisResult {
    const { patch, inferences } = extractSignals(opportunity);
    // Scoring reads explicit fields first, inferred values as fallback.
    const eff = { ...patch, ...opportunity.data };

    const role = (eff['role'] as string | undefined) ?? opportunity.name ?? '';
    const stack = Array.isArray(eff['stack']) ? (eff['stack'] as string[]) : undefined;
    const explicitAi = Array.isArray(eff['ai_culture']) ? (eff['ai_culture'] as string[]) : [];
    const aiMarkers = [
      ...explicitAi,
      ...detectAiMarkers(opportunity.notes.map(noteText).join('\n')),
      ...detectAiMarkers((company?.data as CompanyData | undefined)?.ai_culture_notes?.join('\n') ?? ''),
    ].filter((m, i, all) => all.indexOf(m) === i); // dedupe
    const companyData = (company?.data ?? {}) as CompanyData;
    const salaryMin = typeof eff['salary_min'] === 'number' ? eff['salary_min'] : null;
    const salaryMax = typeof eff['salary_max'] === 'number' ? eff['salary_max'] : null;

    const sub_scores: SubScores = {
      role_match: scoreRoleMatch(profile ?? null, role, stack),
      company_match: scoreCompanyMatch(companyData, company?.name ?? null, (eff['company'] as string) ?? null),
      ai_culture: scoreAiCulture(aiMarkers),
      location: scoreLocation((eff['location'] as string) ?? null),
      salary: scoreSalary(profile ?? null, salaryMin, salaryMax),
      career_upside: scoreCareerUpside(inferSeniorityFromTitle(role), aiMarkers.length, stack, profile?.skills),
    };

    const total = totalScore(sub_scores);
    return {
      sub_scores,
      dimensions: {
        role_dimension: Math.round((sub_scores.role_match + sub_scores.salary + sub_scores.career_upside) / 3),
        company_dimension: Math.round((sub_scores.company_match + sub_scores.ai_culture + sub_scores.location) / 3),
      },
      total,
      band: bandForScore(total),
      next_action: nextActionForBand(bandForScore(total), this.now),
      inferences,
    };
  }
}

// ─── Persistence plan (pure — DB wiring lives in run-service.ts) ─────────────

/** Analysis note format: "Job Analyst: 87 (PRIORITY) — role 84 · company 91". */
export function analystSummaryNote(result: AnalysisResult): string {
  return `Job Analyst: ${result.total} (${result.band}) — role ${result.dimensions.role_dimension} · company ${result.dimensions.company_dimension}`;
}

const JOB_PIPELINE_ORDER = ['DISCOVERED', 'ANALYZED', 'QUALIFIED', 'READY_TO_APPLY', 'APPLIED', 'RECRUITER_RESPONSE', 'INTERVIEW', 'OFFER', 'HIRED'] as const;

/** DISCOVERED → ANALYZED; anything already further along the pipeline stays. */
export function statusAfterAnalysis(current: string | null): string {
  const idx = current ? JOB_PIPELINE_ORDER.indexOf(current as (typeof JOB_PIPELINE_ORDER)[number]) : -1;
  const analyzedIdx = JOB_PIPELINE_ORDER.indexOf('ANALYZED');
  return idx >= 0 && idx < analyzedIdx ? 'ANALYZED' : (current ?? 'ANALYZED');
}

export interface PersistedAnalysis {
  score: number;
  status: string;
  dataPatch: Record<string, unknown>;
  notes: Node['notes'];
}

/** Merge analysis onto an opportunity: sub-scores, dimensions, next_action, notes. */
export function buildPersistedAnalysis(opportunity: Node, result: AnalysisResult): PersistedAnalysis {
  const { patch } = extractSignals(opportunity);
  const notes = [...opportunity.notes];
  if (result.inferences.length > 0) {
    notes.push({ text: `Job Analyst inferred: ${result.inferences.join(', ')}`, created_at: nowIso() });
  }
  notes.push({ text: analystSummaryNote(result), created_at: nowIso() });
  return {
    score: result.total,
    status: statusAfterAnalysis(opportunity.status),
    dataPatch: {
      ...patch, // never overwrites explicit fields (patch only contains absent keys)
      matching: result.sub_scores,
      dimensions: result.dimensions,
      next_action: result.next_action,
      match_score: result.total,
    },
    notes,
  };
}
