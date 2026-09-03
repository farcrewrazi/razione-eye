/**
 * Daily Brief v1 (T1.10-BE) — docs/03-agents-and-gates.md §5.
 *
 * Morning: counts by eye + today's top 3–5 priorities.
 * Evening: completed / pending / new today + ONE deterministic AI observation
 *          + recommendation (the "manager" feature — first LEARN-stage behavior).
 *
 * Fully deterministic reads over the graph + events log; no writes.
 */

import { bandForScore, type Eye, type Node } from '@razione-eye/shared';
import type { AppContext } from './context.ts';
import { linkedCompany, nextBestAction, type NbaResult } from './dashboard.ts';
import { actionableStatusesForType, opportunityTypesForEye } from './eye.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BriefPriority {
  opportunity_id: string;
  role: string | null;
  company: string | null;
  score: number | null;
  band: string;
  next_action: { type: string; due: string | null } | null;
}

export interface MorningBrief {
  kind: 'morning';
  date: string;
  counts: {
    actions_required: number; // open tasks due ≤ today + opps due ≤ today + pending gate approvals
    gate_pending: number;
    overdue_tasks: number;
    career: { new_jobs: number; high_match: number; pending_applications: number; recruiters_awaiting: number };
    business: { discovered: number };
    affiliate: { content_opportunities: number };
    gems: { tokens_detected: number };
  };
  priorities: BriefPriority[]; // top 3–5, ranked by score then soonest due
  next_best_action: NbaResult | null;
}

export interface EveningBrief {
  kind: 'evening';
  date: string;
  completed_today: number; // tasks DONE today (status_changed) + gate-approved apply actions today
  pending: number; // open tasks (any due) + opps still awaiting action
  new_today: { opportunities: number; signals: number };
  gate_decisions_today: number;
  observation: string; // one deterministic AI observation
  recommendation: string; // …and its paired recommendation
}

function endOfTodayIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

function startOfTodayIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function parseDue(due: string | null | undefined): number | null {
  if (!due) return null;
  const t = Date.parse(due.length === 10 ? `${due}T00:00:00.000Z` : due);
  return Number.isNaN(t) ? null : t;
}

function jobOpps(ctx: AppContext, eye: Eye = 'all'): Node[] {
  return ctx.nodes
    .list({ type: 'OPPORTUNITY', opportunity_types: opportunityTypesForEye(eye), limit: 200 })
    .items;
}

/**
 * Morning brief scoped by Eye. Priorities, career counts and the NBA use the
 * eye's opportunity slice; tasks / gate / overdue parts stay global.
 * No eye (default 'all') = today's behavior (JOB-first priorities).
 */
export function morningBrief(ctx: AppContext, now: Date = new Date(), eye: Eye = 'all'): MorningBrief {
  const { nodes, gate } = ctx;
  const todayEnd = endOfTodayIso(now);
  const since24h = new Date(now.getTime() - DAY_MS).toISOString();

  const openTasks = nodes
    .list({ type: 'TASK', limit: 200 })
    .items.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS');
  const overdueTasks = openTasks.filter((t) => t.due_at !== null && t.due_at < startOfTodayIso(now)).length;

  const opps = jobOpps(ctx, eye);
  const oppsDue = opps.filter((o) => {
    const t = parseDue((o.data['next_action'] as { due?: string | null } | undefined)?.due);
    return t !== null && t <= Date.parse(todayEnd);
  });
  const gatePending = gate.pendingCount();

  // Top 3–5 priorities: actionable eye-scoped opps ranked by score, then soonest due.
  const priorities = opps
    .filter(
      (o) =>
        o.status !== null &&
        o.opportunity_type !== null &&
        actionableStatusesForType(o.opportunity_type).has(o.status),
    )
    .map((o) => ({ o, band: bandForScore(o.score) }))
    .filter(({ band }) => band === 'PRIORITY' || band === 'APPLY')
    .sort((a, b) => {
      const byScore = (b.o.score ?? -1) - (a.o.score ?? -1);
      if (byScore !== 0) return byScore;
      const ad = parseDue((a.o.data['next_action'] as { due?: string | null } | undefined)?.due) ?? Number.MAX_SAFE_INTEGER;
      const bd = parseDue((b.o.data['next_action'] as { due?: string | null } | undefined)?.due) ?? Number.MAX_SAFE_INTEGER;
      return ad - bd;
    })
    .slice(0, 5)
    .map(({ o, band }): BriefPriority => {
      const company = linkedCompany(ctx, o);
      const na = o.data['next_action'] as { type: string; due: string | null } | undefined;
      return {
        opportunity_id: o.id,
        role: (o.data['role'] as string | undefined) ?? o.name,
        company: company?.name ?? ((o.data['company'] as string | undefined) ?? null),
        score: o.score,
        band,
        next_action: na ?? null,
      };
    });

  const nba = nextBestAction(ctx, now, eye);

  // Career counters reflect JOB activity when the eye shows career
  // (career/all/control); other eyes see structurally-zero career blocks.
  const careerVisible = eye === 'career' || eye === 'all' || eye === 'control';
  const jobOppsInEye = careerVisible ? opps.filter((o) => o.opportunity_type === 'JOB') : [];

  return {
    kind: 'morning',
    date: now.toISOString().slice(0, 10),
    counts: {
      // Open tasks (global) + eye-scoped opps with a due next_action ≤ today + pending gate approvals.
      actions_required: openTasks.length + oppsDue.length + gatePending,
      gate_pending: gatePending,
      overdue_tasks: overdueTasks,
      career: {
        new_jobs: jobOppsInEye.filter((o) => o.created_at >= since24h).length,
        high_match: jobOppsInEye.filter((o) => bandForScore(o.score) === 'PRIORITY').length,
        pending_applications: jobOppsInEye.filter(
          (o) => o.status === 'APPLIED' || o.status === 'RECRUITER_RESPONSE',
        ).length,
        recruiters_awaiting: jobOppsInEye.filter((o) => o.status === 'RECRUITER_RESPONSE').length,
      },
      business: { discovered: 0 },
      affiliate: { content_opportunities: 0 },
      gems: { tokens_detected: 0 },
    },
    priorities,
    next_best_action: nba.opportunity ? nba : null,
  };
}

/**
 * Evening brief scoped by Eye. Task / gate / new-today parts stay global;
 * the "opportunities awaiting action" count and the observation chain use the
 * eye's opportunity slice.
 */
export function eveningBrief(ctx: AppContext, now: Date = new Date(), eye: Eye = 'all'): EveningBrief {
  const { nodes, events } = ctx;
  const dayStart = startOfTodayIso(now);

  const { items: todaysEvents } = events.list();
  const today = todaysEvents.filter((e) => e.at >= dayStart);

  const statusCompletedToday = today.filter(
    (e) => e.type === 'status_changed' && (e.data as Record<string, unknown> | null)?.['to'] === 'DONE',
  ).length;
  const gateApprovedToday = today.filter(
    (e) => e.type === 'gate_decision' && (e.data as Record<string, unknown> | null)?.['decision'] !== 'rejected',
  ).length;
  const gateDecisionsToday = today.filter((e) => e.type === 'gate_decision').length;
  // Gate-approved apply actions complete a task too — count them alongside plain task completions.
  const completedToday = statusCompletedToday + gateApprovedToday;

  const opps = jobOpps(ctx, eye);
  const openTasks = nodes
    .list({ type: 'TASK', limit: 200 })
    .items.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS').length;
  const oppsAwaiting = opps.filter(
    (o) =>
      o.status !== null &&
      o.opportunity_type !== null &&
      actionableStatusesForType(o.opportunity_type).has(o.status),
  ).length;

  const newOpps = today.filter((e) => e.type === 'opportunity_created' || e.type === 'opportunity_imported').length;
  const newSignals = today.filter((e) => e.type === 'signal_created').length;

  const { observation, recommendation } = observe(ctx, {
    now,
    newOpps,
    completedToday,
    gateDecisionsToday: gateApprovedToday,
    oppsAwaiting,
  }, eye);

  return {
    kind: 'evening',
    date: now.toISOString().slice(0, 10),
    completed_today: completedToday,
    pending: openTasks + oppsAwaiting,
    new_today: { opportunities: newOpps, signals: newSignals },
    gate_decisions_today: gateDecisionsToday,
    observation,
    recommendation,
  };
}

/**
 * The ONE evening observation (doc 03 §5). Deterministic rule chain — first
 * matching rule wins, so the observation is always stable and explainable.
 */
function observe(
  ctx: AppContext,
  s: { now: Date; newOpps: number; completedToday: number; gateDecisionsToday: number; oppsAwaiting: number },
  eye: Eye = 'all',
): { observation: string; recommendation: string } {
  const opps = jobOpps(ctx, eye);
  const discovered = opps.filter((o) => o.status === 'DISCOVERED' || o.status === 'ANALYZED').length;
  const applied = opps.filter((o) => o.status === 'APPLIED').length;
  const awaitingReply = opps.filter((o) => o.status === 'RECRUITER_RESPONSE').length;
  const priority = opps.filter((o) => bandForScore(o.score) === 'PRIORITY').length;

  // 1. Discovery outpacing application — the canonical doc-03 example.
  if (discovered > 0 && applied === 0 && s.gateDecisionsToday === 0) {
    return {
      observation: `Discovery is outpacing application — ${discovered} job(s) sit scored but not a single application has gone out yet.`,
      recommendation:
        priority > 0
          ? `Send the ${priority} PRIORITY application(s) through the Action Gate tomorrow morning before any new discovery.`
          : 'Pick the top APPLY-band job and push it through the Action Gate tomorrow before any new discovery.',
    };
  }
  // 2. Recruiters waiting — follow-ups never slip (T1.8).
  if (awaitingReply > 0) {
    return {
      observation: `${awaitingReply} recruiter conversation(s) are open without a logged reply.`,
      recommendation: 'Log the latest replies and set follow-up reminders before starting new applications.',
    };
  }
  // 3. Strong day — applications actually moved.
  if (s.gateDecisionsToday > 0 || s.completedToday > 0) {
    return {
      observation: `Good execution day — ${s.completedToday + s.gateDecisionsToday} action(s) completed, ${s.oppsAwaiting} opportunity(ies) still awaiting a next step.`,
      recommendation: 'Keep the momentum: tomorrow’s morning brief has the next ranked actions ready.',
    };
  }
  // 4. Quiet day.
  return {
    observation: `Quiet day — ${s.newOpps} new opportunit${s.newOpps === 1 ? 'y' : 'ies'}, nothing completed.`,
    recommendation:
      s.oppsAwaiting > 0
        ? `Clear the queue: ${s.oppsAwaiting} scored job(s) are waiting on an apply decision.`
        : 'Run the Job Analyst over any unanalyzed jobs, then review the ranked pipeline.',
  };
}
