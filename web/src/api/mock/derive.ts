/**
 * RaziOne Eye — FE-owned aggregate derivation (mock mode).
 *
 * These shapes (dashboard aggregate, next best action, daily briefs) are
 * FE-owned views. In mock mode we derive them from the live in-memory dataset
 * so counts stay consistent after mock writes; real mode fetches whatever the
 * server returns for the same endpoints.
 *
 * The rules mirror the server implementations (server/src/dashboard.ts +
 * server/src/daily-brief.ts) so mock and real mode agree: same NBA candidate
 * set, same actions_required composition, same brief rule chain.
 *
 * Derivation anchors to MOCK_NOW so the demo dataset stays deterministic.
 */

import { JOB_STATUSES } from '../types'
import type {
  Agent,
  BriefPriority,
  DashboardAggregate,
  EveningBrief,
  GateAction,
  MorningBrief,
  NextBestAction,
  Opportunity,
  ScoreBand,
  Signal,
  Task,
} from '../types'
import { bandForScore } from './band'
import { MOCK_NOW } from './data'

const NOW = () => new Date(MOCK_NOW)
const DAY_MS = 86_400_000

function bandOf(score: number | null): ScoreBand {
  return bandForScore(score)
}

function parseDue(due: string | null | undefined): number | null {
  if (!due) return null
  const t = Date.parse(due.length === 10 ? `${due}T00:00:00.000Z` : due)
  return Number.isNaN(t) ? null : t
}

function endOfTodayIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
}

function startOfTodayIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
}

/** Job opps only, with the derived band attached. */
function jobOpps(opportunities: Opportunity[]): Opportunity[] {
  return opportunities.filter((o) => o.opportunity_type === 'JOB')
}

/* ─── Next Best Action (mirrors server nextBestAction) ─────────────────────── */

const NBA_STATUSES = new Set(['QUALIFIED', 'READY_TO_APPLY', 'ANALYZED'])
const NBA_BANDS = new Set<ScoreBand>(['PRIORITY', 'APPLY'])

function duePhrase(nextAction: { type?: string; due?: string | null } | undefined, now: number): string | null {
  const t = parseDue(nextAction?.due)
  if (t === null) return null
  const days = Math.round((t - now) / DAY_MS)
  if (days <= 0) return 'due today'
  if (days === 1) return 'due tomorrow'
  return `due in ${days} days`
}

/** Deterministic NBA reason: "Score 91 (PRIORITY) · Cyberjaya · stack overlap 90% · due today". */
function buildNbaReason(o: Opportunity, band: ScoreBand, now: number): string {
  const parts: string[] = [`Score ${o.score ?? 0} (${band})`]
  if (typeof o.data.location === 'string' && o.data.location.trim() !== '') parts.push(o.data.location.trim())

  const roleStack = Array.isArray(o.data.stack) ? (o.data.stack as string[]) : null
  const profileSkills = ['Node.js', 'TypeScript', 'React', 'JavaScript', 'AI orchestration', 'SQL'] // mock profile
  if (roleStack && roleStack.length > 0) {
    const mine = new Set(profileSkills.map((s) => s.toLowerCase()))
    const required = new Set(roleStack.map((s) => s.toLowerCase()))
    let overlap = 0
    for (const t of required) if (mine.has(t)) overlap++
    parts.push(`stack overlap ${Math.round((overlap / required.size) * 100)}%`)
  }

  const due = duePhrase(o.data.next_action, now)
  if (due) parts.push(due)
  return parts.join(' · ')
}

/**
 * Pick the Next Best Action (mock mirrors the server rule): highest-score JOB
 * opportunity in an actionable status (QUALIFIED/READY_TO_APPLY/ANALYZED) and
 * band PRIORITY/APPLY; ties broken by soonest next_action due.
 */
export function deriveNextBestAction(opportunities: Opportunity[], now: Date = NOW()): NextBestAction | null {
  const candidates = jobOpps(opportunities)
    .map((o) => ({ o, band: bandOf(o.score) }))
    .filter(({ o, band }) => o.status !== null && NBA_STATUSES.has(o.status) && NBA_BANDS.has(band))

  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    const byScore = (b.o.score ?? -1) - (a.o.score ?? -1)
    if (byScore !== 0) return byScore
    const aDue = parseDue(a.o.data.next_action?.due) ?? Number.MAX_SAFE_INTEGER
    const bDue = parseDue(b.o.data.next_action?.due) ?? Number.MAX_SAFE_INTEGER
    return aDue - bDue
  })

  const { o, band } = candidates[0]!
  return {
    opportunity: o,
    reason: buildNbaReason(o, band, now.getTime()),
    match_score: o.score,
  }
}

/* ─── Dashboard (mirrors server dashboard()) ────────────────────────────────── */

/** The three "future eyes" keep demo numbers in mock (server returns zeros). */
function futureEyeCounts(signals: Signal[]) {
  const businessSignals = signals.filter((s) => s.data.signal_type === 'BUSINESS_DISCOVERY')
  const gems = signals.filter((s) => s.data.signal_type === 'GEM_CALL')
  return {
    business: {
      discovered: businessSignals.filter((s) => s.status === 'NEW' || s.status === 'PROMOTED').length,
      worth_approaching: businessSignals.filter((s) => s.status === 'PROMOTED').length,
      teasers_ready: 1,
    },
    affiliate: { content_opportunities: 2, scheduled: 1 },
    gems: {
      tokens_detected: gems.length,
      passed_filter: gems.filter((s) => s.status === 'NEW' || s.status === 'PROMOTED').length,
    },
  }
}

export function deriveDashboard(
  agents: Agent[],
  opportunities: Opportunity[],
  tasks: Task[],
  signals: Signal[],
  now: Date = NOW(),
): DashboardAggregate {
  const opps = jobOpps(opportunities)
  const todayEnd = Date.parse(endOfTodayIso(now))
  const since24h = new Date(now.getTime() - DAY_MS).toISOString()

  // actions_required: open TASKs due ≤ today + JOB opps with next_action.due ≤ today.
  const openTasksDue = tasks.filter(
    (t) => (t.status === 'TODO' || t.status === 'IN_PROGRESS') && t.due_at !== null && Date.parse(t.due_at) <= todayEnd,
  ).length
  const oppsDueToday = opps.filter((o) => {
    const t = parseDue(o.data.next_action?.due)
    return t !== null && t <= todayEnd
  }).length

  return {
    today: {
      actions_required: openTasksDue + oppsDueToday,
      career: {
        new_jobs: opps.filter((o) => o.created_at >= since24h).length,
        high_match: opps.filter((o) => bandOf(o.score) === 'PRIORITY').length,
        pending_applications: opps.filter((o) => o.status === 'APPLIED' || o.status === 'RECRUITER_RESPONSE').length,
        recruiters_awaiting: opps.filter((o) => o.status === 'RECRUITER_RESPONSE').length,
      },
      ...futureEyeCounts(signals),
    },
    agents,
    next_best_action: deriveNextBestAction(opportunities, now),
  }
}

/* ─── Daily Brief (mirrors server morningBrief/eveningBrief) ────────────────── */

function briefPriorities(opps: Opportunity[]): BriefPriority[] {
  return opps
    .filter((o) => o.status !== null && ['ANALYZED', 'QUALIFIED', 'READY_TO_APPLY'].includes(o.status))
    .map((o) => ({ o, band: bandOf(o.score) }))
    .filter(({ band }) => band === 'PRIORITY' || band === 'APPLY')
    .sort((a, b) => {
      const byScore = (b.o.score ?? -1) - (a.o.score ?? -1)
      if (byScore !== 0) return byScore
      const ad = parseDue(a.o.data.next_action?.due) ?? Number.MAX_SAFE_INTEGER
      const bd = parseDue(b.o.data.next_action?.due) ?? Number.MAX_SAFE_INTEGER
      return ad - bd
    })
    .slice(0, 5)
    .map(({ o, band }): BriefPriority => ({
      opportunity_id: o.id,
      role: o.data.role ?? o.name,
      company: o.company?.name ?? ((typeof o.data.company === 'string' ? o.data.company : null) ?? null),
      score: o.score,
      band,
      next_action: o.data.next_action ?? null,
    }))
}

export function deriveMorningBrief(
  opportunities: Opportunity[],
  tasks: Task[],
  signals: Signal[],
  gateActions: GateAction[],
  now: Date = NOW(),
): MorningBrief {
  const opps = jobOpps(opportunities)
  const todayEnd = Date.parse(endOfTodayIso(now))
  const since24h = new Date(now.getTime() - DAY_MS).toISOString()

  const openTasks = tasks.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS')
  const overdueTasks = openTasks.filter((t) => t.due_at !== null && t.due_at < startOfTodayIso(now)).length

  const oppsDue = opps.filter((o) => {
    const t = parseDue(o.data.next_action?.due)
    return t !== null && t <= todayEnd
  })
  const gatePending = gateActions.filter((a) => a.status === 'PENDING').length

  return {
    kind: 'morning',
    date: MOCK_NOW.slice(0, 10),
    counts: {
      // Open tasks (due or not) + opps with a due next_action ≤ today + pending gate approvals.
      actions_required: openTasks.length + oppsDue.length + gatePending,
      gate_pending: gatePending,
      overdue_tasks: overdueTasks,
      career: {
        new_jobs: opps.filter((o) => o.created_at >= since24h).length,
        high_match: opps.filter((o) => bandOf(o.score) === 'PRIORITY').length,
        pending_applications: opps.filter((o) => o.status === 'APPLIED' || o.status === 'RECRUITER_RESPONSE').length,
        recruiters_awaiting: opps.filter((o) => o.status === 'RECRUITER_RESPONSE').length,
      },
      business: { discovered: futureEyeCounts(signals).business.discovered },
      affiliate: { content_opportunities: futureEyeCounts(signals).affiliate.content_opportunities },
      gems: { tokens_detected: futureEyeCounts(signals).gems.tokens_detected },
    },
    priorities: briefPriorities(opps),
    next_best_action: deriveNextBestAction(opportunities, now),
  }
}

/** The ONE evening observation (mock mirrors the server's deterministic rule chain). */
function observe(
  s: { newOpps: number; completedToday: number; gateApprovalsToday: number; oppsAwaiting: number },
  opps: Opportunity[],
): { observation: string; recommendation: string } {
  const discovered = opps.filter((o) => o.status === 'DISCOVERED' || o.status === 'ANALYZED').length
  const applied = opps.filter((o) => o.status === 'APPLIED').length
  const awaitingReply = opps.filter((o) => o.status === 'RECRUITER_RESPONSE').length
  const priority = opps.filter((o) => bandOf(o.score) === 'PRIORITY').length

  // 1. Discovery outpacing application — the canonical doc-03 example.
  if (discovered > 0 && applied === 0 && s.gateApprovalsToday === 0) {
    return {
      observation: `Discovery is outpacing application — ${discovered} job(s) sit scored but not a single application has gone out yet.`,
      recommendation:
        priority > 0
          ? `Send the ${priority} PRIORITY application(s) through the Action Gate tomorrow morning before any new discovery.`
          : 'Pick the top APPLY-band job and push it through the Action Gate tomorrow before any new discovery.',
    }
  }
  // 2. Recruiters waiting — follow-ups never slip (T1.8).
  if (awaitingReply > 0) {
    return {
      observation: `${awaitingReply} recruiter conversation(s) are open without a logged reply.`,
      recommendation: 'Log the latest replies and set follow-up reminders before starting new applications.',
    }
  }
  // 3. Strong day — applications actually moved.
  if (s.gateApprovalsToday > 0 || s.completedToday > 0) {
    return {
      observation: `Good execution day — ${s.completedToday + s.gateApprovalsToday} action(s) completed, ${s.oppsAwaiting} opportunity(ies) still awaiting a next step.`,
      recommendation: 'Keep the momentum: tomorrow’s morning brief has the next ranked actions ready.',
    }
  }
  // 4. Quiet day.
  return {
    observation: `Quiet day — ${s.newOpps} new opportunit${s.newOpps === 1 ? 'y' : 'ies'}, nothing completed.`,
    recommendation:
      s.oppsAwaiting > 0
        ? `Clear the queue: ${s.oppsAwaiting} scored job(s) are waiting on an apply decision.`
        : 'Run the Job Analyst over any unanalyzed jobs, then review the ranked pipeline.',
  }
}

export function deriveEveningBrief(
  opportunities: Opportunity[],
  tasks: Task[],
  gateActions: GateAction[],
  now: Date = NOW(),
): EveningBrief {
  const opps = jobOpps(opportunities)
  const dayStart = startOfTodayIso(now)

  // Tasks set DONE today (updated_at is stamped on the mock write).
  const statusCompletedToday = tasks.filter((t) => t.status === 'DONE' && t.updated_at >= dayStart).length
  // Gate-approved (non-rejected) apply actions today.
  const gateApprovalsToday = gateActions.filter(
    (a) => a.decided_at !== null && a.decided_at >= dayStart && a.decision !== 'rejected',
  ).length
  const gateDecisionsToday = gateActions.filter((a) => a.decided_at !== null && a.decided_at >= dayStart).length
  const completedToday = statusCompletedToday + gateApprovalsToday

  const openTasks = tasks.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS').length
  const oppsAwaiting = opps.filter(
    (o) => o.status !== null && ['ANALYZED', 'QUALIFIED', 'READY_TO_APPLY'].includes(o.status),
  ).length

  const newOpps = opps.filter((o) => o.created_at >= dayStart).length
  const newSignals = 0 // seed signals predate the brief day; session-created ones land via real fetches

  const { observation, recommendation } = observe(
    { newOpps, completedToday, gateApprovalsToday, oppsAwaiting },
    opps,
  )

  return {
    kind: 'evening',
    date: MOCK_NOW.slice(0, 10),
    completed_today: completedToday,
    pending: openTasks + oppsAwaiting,
    new_today: { opportunities: newOpps, signals: newSignals },
    gate_decisions_today: gateDecisionsToday,
    observation,
    recommendation,
  }
}

/* ─── Legacy status helpers (kept for parity with the previous derive) ──────── */

const JOB_TERMINALS = ['REJECTED', 'IGNORED', 'NOT_SUITABLE', 'EXPIRED', 'HIRED']

function isTerminalJob(o: Opportunity): boolean {
  return JOB_TERMINALS.includes(o.status ?? '')
}

export function jobStageIndex(o: Opportunity): number {
  return o.status ? JOB_STATUSES.indexOf(o.status as (typeof JOB_STATUSES)[number]) : -1
}

export { isTerminalJob }
