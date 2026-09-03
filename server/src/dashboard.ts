/**
 * Next Best Action + Dashboard aggregations (T1.9-BE groundwork, Wave 3).
 *
 * Deterministic reads over the graph — no writes. FE Wave 4 consumes:
 *   GET /api/next-best-action → { opportunity, reason, match_score }
 *   GET /api/dashboard        → { today: {...}, agents: [...], next_best_action }
 * Business/affiliate/gems counters are structurally zero until Phases 3–5.
 */
import {
  bandForScore,
  type Eye,
  type Node,
  type PersonData,
  type ScoreBand,
} from '@razione-eye/shared';
import type { AppContext } from './context.ts';
import { PROFILE_PERSON_NAME } from './seed-service.ts';
import { canonicalStackToken, scoreLocation } from './agents/rules.ts';
import { actionableStatusesForType, opportunityTypesForEye } from './eye.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const NBA_BANDS = new Set<ScoreBand>(['PRIORITY', 'APPLY']);

export interface NbaResult {
  opportunity: (Node & { band: ScoreBand; company: Node | null }) | null;
  reason: string | null;
  match_score: number | null;
}

// ─── NBA ─────────────────────────────────────────────────────────────────────

/** Find the company node linked to an opportunity (belongs_to/hiring/name). */
export function linkedCompany(ctx: AppContext, opportunity: Node): Node | null {
  const { nodes, edges } = ctx;
  for (const e of edges.outgoing(opportunity.id, 'belongs_to')) {
    const n = nodes.getById(e.to_id);
    if (n?.type === 'COMPANY') return n;
  }
  for (const e of edges.incoming(opportunity.id, 'hiring')) {
    const n = nodes.getById(e.from_id);
    if (n?.type === 'COMPANY') return n;
  }
  const name = opportunity.data['company'];
  if (typeof name === 'string' && name.trim() !== '') {
    return nodes.findByTypeAndName('COMPANY', name.trim());
  }
  return null;
}

function parseDue(due: string | null | undefined): number | null {
  if (!due) return null;
  const t = Date.parse(due.length === 10 ? `${due}T00:00:00.000Z` : due);
  return Number.isNaN(t) ? null : t;
}

function duePhrase(nextAction: { type?: string; due?: string | null } | undefined, now: number): string | null {
  const t = parseDue(nextAction?.due);
  if (t === null) return null;
  const days = Math.round((t - now) / DAY_MS);
  if (days <= 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `due in ${days} days`;
}

/** Deterministic NBA reason: "Score 91 (PRIORITY) · Cyberjaya · stack overlap 90% · due tomorrow". */
export function buildNbaReason(
  opportunity: Node,
  band: ScoreBand,
  profileSkills: string[] | undefined,
  now: number,
): string {
  const parts: string[] = [`Score ${opportunity.score ?? 0} (${band})`];

  const location = opportunity.data['location'];
  if (typeof location === 'string' && location.trim() !== '') parts.push(location.trim());

  const roleStack = Array.isArray(opportunity.data['stack']) ? (opportunity.data['stack'] as string[]) : null;
  if (roleStack && roleStack.length > 0 && profileSkills && profileSkills.length > 0) {
    const mine = new Set(profileSkills.map((s) => canonicalStackToken(s).toLowerCase()));
    const required = new Set(roleStack.map((s) => canonicalStackToken(s).toLowerCase()));
    let overlap = 0;
    for (const t of required) if (mine.has(t)) overlap++;
    parts.push(`stack overlap ${Math.round((overlap / required.size) * 100)}%`);
  }

  const due = duePhrase(opportunity.data['next_action'] as { due?: string | null } | undefined, now);
  if (due) parts.push(due);
  return parts.join(' · ');
}

/**
 * Pick the Next Best Action: highest-score opportunity in the eye's slice with
 * an actionable status (JOB: QUALIFIED/READY_TO_APPLY/ANALYZED; provisional for
 * other types) and band PRIORITY/APPLY; ties broken by soonest next_action due.
 * Null when nothing qualifies. No eye (default 'all') = today's JOB-only behavior.
 */
export function nextBestAction(ctx: AppContext, now: Date = new Date(), eye: Eye = 'all'): NbaResult {
  const { nodes } = ctx;
  const profile = nodes.findByTypeAndName('PERSON', PROFILE_PERSON_NAME);
  const profileSkills = (profile?.data as PersonData | undefined)?.skills;

  // Legacy contract: with no eye (or all/control), NBA stays JOB-only — the
  // other eyes' stages aren't defined yet, so they can't outrank a job.
  const types = eye === 'all' || eye === 'control' ? (['JOB'] as const) : opportunityTypesForEye(eye);
  if (types.length === 0) return { opportunity: null, reason: null, match_score: null };

  const { items } = nodes.list({ type: 'OPPORTUNITY', opportunity_types: types, limit: 200, sort: '-score' });
  const candidates = items
    .map((opp) => ({ opp, band: bandForScore(opp.score) }))
    .filter(
      ({ opp, band }) =>
        opp.status !== null &&
        opp.opportunity_type !== null &&
        actionableStatusesForType(opp.opportunity_type).has(opp.status) &&
        NBA_BANDS.has(band),
    );

  if (candidates.length === 0) return { opportunity: null, reason: null, match_score: null };

  candidates.sort((a, b) => {
    const byScore = (b.opp.score ?? -1) - (a.opp.score ?? -1);
    if (byScore !== 0) return byScore;
    const aDue = parseDue((a.opp.data['next_action'] as { due?: string | null } | undefined)?.due) ?? Number.MAX_SAFE_INTEGER;
    const bDue = parseDue((b.opp.data['next_action'] as { due?: string | null } | undefined)?.due) ?? Number.MAX_SAFE_INTEGER;
    return aDue - bDue;
  });

  const { opp, band } = candidates[0]!;
  return {
    opportunity: { ...opp, band, company: linkedCompany(ctx, opp) },
    reason: buildNbaReason(opp, band, profileSkills, now.getTime()),
    match_score: opp.score,
  };
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

function endOfTodayIso(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return d.toISOString();
}

export interface DashboardPayload {
  today: {
    actions_required: number;
    career: {
      new_jobs: number;
      high_match: number;
      pending_applications: number;
      recruiters_awaiting: number;
    };
    business: { discovered: number; worth_approaching: number; teasers_ready: number };
    affiliate: { content_opportunities: number; scheduled: number };
    gems: { tokens_detected: number; passed_filter: number };
  };
  agents: Node[];
  next_best_action: NbaResult | null;
}

/**
 * Deterministic dashboard aggregation, scoped by Eye.
 *   career block: live counts for JOB opportunities when the eye includes
 *   career (career/all/control), structurally zero otherwise.
 *   business / affiliate / gems stay structurally zero until Phases 3–5.
 * actions_required = global open tasks due ≤ today + scoped opps due ≤ today.
 * agents are always global (the registry is not eye-scoped).
 */
export function dashboard(ctx: AppContext, now: Date = new Date(), eye: Eye = 'all'): DashboardPayload {
  const { nodes } = ctx;
  const todayEnd = endOfTodayIso(now);
  const since24h = new Date(now.getTime() - DAY_MS).toISOString();

  // actions_required: open TASKs due ≤ today (global) + eye-scoped opps with next_action.due ≤ today.
  const openTasksDue = nodes
    .list({ type: 'TASK', limit: 200, due_before: todayEnd })
    .items.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS').length;

  const careerVisible = eye === 'career' || eye === 'all' || eye === 'control';
  const oppTypes = opportunityTypesForEye(eye);
  const opps = nodes
    .list({ type: 'OPPORTUNITY', opportunity_types: oppTypes, limit: 200 })
    .items as Array<Node & { opportunity_type: NonNullable<Node['opportunity_type']> }>;
  const jobOpps = careerVisible ? opps.filter((o) => o.opportunity_type === 'JOB') : [];

  const oppsDueToday = opps.filter((opp) => {
    const due = (opp.data['next_action'] as { due?: string | null } | undefined)?.due;
    const t = parseDue(due);
    return t !== null && t <= Date.parse(todayEnd);
  }).length;

  const newJobs = jobOpps.filter((o) => o.created_at >= since24h).length;
  const highMatch = jobOpps.filter((o) => bandForScore(o.score) === 'PRIORITY').length;
  const pendingApplications = jobOpps.filter((o) => o.status === 'APPLIED' || o.status === 'RECRUITER_RESPONSE').length;
  const recruitersAwaiting = jobOpps.filter((o) => o.status === 'RECRUITER_RESPONSE').length;

  const agents = nodes.list({ type: 'AGENT', sort: 'name', limit: 50 }).items;

  const nba = nextBestAction(ctx, now, eye);

  return {
    today: {
      actions_required: openTasksDue + oppsDueToday,
      career: {
        new_jobs: newJobs,
        high_match: highMatch,
        pending_applications: pendingApplications,
        recruiters_awaiting: recruitersAwaiting,
      },
      business: { discovered: 0, worth_approaching: 0, teasers_ready: 0 },
      affiliate: { content_opportunities: 0, scheduled: 0 },
      gems: { tokens_detected: 0, passed_filter: 0 },
    },
    agents,
    next_best_action: nba.opportunity ? nba : null,
  };
}
