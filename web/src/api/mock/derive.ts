/**
 * RaziOne Eye — FE-owned aggregate derivation (mock mode).
 *
 * These shapes (dashboard aggregate, next best action, briefs) are FE-owned
 * views over the dataset. In mock mode we derive them from the live in-memory
 * dataset so counts stay consistent after mock writes. Real mode fetches
 * whatever the server returns for these view endpoints.
 *
 * Derivation anchors to MOCK_NOW so the demo dataset stays deterministic
 * (matches the overdue logic in provider.ts).
 */

import { JOB_STATUSES } from '../types'
import type {
  Agent,
  Brief,
  DashboardAggregate,
  NextBestAction,
  Opportunity,
  Signal,
  Task,
} from '../types'
import { MOCK_NOW } from './data'

const NOW = () => new Date(MOCK_NOW)

function daysSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / 86_400_000
}

const JOB_TERMINALS = ['REJECTED', 'IGNORED', 'NOT_SUITABLE', 'EXPIRED', 'HIRED']

function isTerminalJob(o: Opportunity): boolean {
  return JOB_TERMINALS.includes(o.status ?? '')
}

function jobStageIndex(o: Opportunity): number {
  return o.status ? JOB_STATUSES.indexOf(o.status as (typeof JOB_STATUSES)[number]) : -1
}

/** Non-terminal job stuck without updates for >7 days (up to APPLIED). */
function isStale(o: Opportunity, now: Date): boolean {
  if (isTerminalJob(o)) return false
  const stage = jobStageIndex(o)
  if (stage < 0 || stage > JOB_STATUSES.indexOf('APPLIED')) return false
  return daysSince(o.updated_at, now) > 7
}

export function deriveDashboard(
  agents: Agent[],
  opportunities: Opportunity[],
  tasks: Task[],
  signals: Signal[],
  now: Date = NOW(),
): DashboardAggregate {
  const jobs = opportunities.filter((o) => o.opportunity_type === 'JOB')
  const active = jobs.filter((o) => !isTerminalJob(o))
  const newJobs = jobs.filter((o) => daysSince(o.created_at, now) <= 7)
  const highMatch = active.filter((o) => o.band === 'PRIORITY' || o.band === 'APPLY')
  const pendingApplications = active.filter((o) => jobStageIndex(o) >= JOB_STATUSES.indexOf('APPLIED'))
  const recruitersAwaiting = active.filter((o) => o.status === 'RECRUITER_RESPONSE')
  const staleOpportunities = active.filter((o) => isStale(o, now))

  const businessSignals = signals.filter((s) => s.data.signal_type === 'BUSINESS_DISCOVERY')
  const gems = signals.filter((s) => s.data.signal_type === 'GEM_CALL')

  const openTasks = tasks.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS')
  const overdueTasks = openTasks.filter((t) => t.due_at !== null && new Date(t.due_at).getTime() < now.getTime())

  return {
    today: {
      actions_required: {
        overdue_tasks: overdueTasks.length,
        stale_opportunities: staleOpportunities.length,
        unanswered_recruiters: recruitersAwaiting.length,
      },
      career: {
        new_jobs: newJobs.length,
        high_match: highMatch.length,
        pending_applications: pendingApplications.length,
        recruiters_awaiting: recruitersAwaiting.length,
      },
      business: {
        discovered: businessSignals.filter((s) => s.status === 'NEW' || s.status === 'PROMOTED').length,
        worth_approaching: businessSignals.filter((s) => s.status === 'PROMOTED').length,
        teasers_ready: 1,
      },
      affiliate: {
        content_opportunities: 2,
        scheduled: 1,
      },
      gems: {
        tokens_detected: gems.length,
        passed_filter: gems.filter((s) => s.status === 'NEW' || s.status === 'PROMOTED').length,
      },
    },
    agents,
    next_best_action: deriveNextBestAction(opportunities, now),
  }
}

/** Stage urgency — act inside the apply window first, then chase live threads. */
const STAGE_URGENCY: Record<string, number> = {
  READY_TO_APPLY: 0,
  RECRUITER_RESPONSE: 1,
  QUALIFIED: 2,
  ANALYZED: 3,
  DISCOVERED: 4,
  INTERVIEW: 5,
  OFFER: 6,
}

/**
 * Pick the best actionable opportunity. Ranked by stage urgency first (an
 * unpulled trigger beats polishing an offer), then by score. With the shipped
 * dataset this yields the 91% ABC Technology READY_TO_APPLY card.
 */
export function deriveNextBestAction(
  opportunities: Opportunity[],
  now: Date = NOW(),
): NextBestAction | null {
  const candidates = opportunities.filter((o) => {
    if (o.opportunity_type !== 'JOB' || o.score == null || isTerminalJob(o)) return false
    return o.status != null && o.status in STAGE_URGENCY
  })
  if (candidates.length === 0) return null

  const best = candidates.reduce((a, b) => {
    const ua = STAGE_URGENCY[a.status ?? ''] ?? 99
    const ub = STAGE_URGENCY[b.status ?? ''] ?? 99
    if (ua !== ub) return ua < ub ? a : b
    return (b.score ?? 0) > (a.score ?? 0) ? b : a
  })

  const ageDays = Math.max(0, Math.floor(daysSince(best.created_at, now)))
  const company = best.company?.name ?? 'the company'
  const reason =
    best.status === 'RECRUITER_RESPONSE'
      ? `${best.score}% match — ${company}'s recruiter replied and is waiting on you. Respond today.`
      : best.status === 'OFFER'
        ? `${best.score}% match — ${company} made an offer. Respond and negotiate while it is warm.`
        : `${best.score}% match — role, stack and AI culture all align. Posting is ${ageDays} day${ageDays === 1 ? '' : 's'} old. Apply today.`
  return { opportunity: best, reason, match_score: best.score ?? 0 }
}

export function deriveBriefs(tasks: Task[], _opportunities: Opportunity[], date = '2026-09-02'): Brief[] {
  const now = NOW()
  const open = tasks.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS')
  const done = tasks.filter((t) => t.status === 'DONE').length
  const overdue = open.filter((t) => t.due_at && new Date(t.due_at).getTime() < now.getTime())

  const morningSeeds = [
    { title: 'Apply to ABC Technology', context: 'Senior Full-Stack Engineer · 91% match · recruiter active' },
    { title: 'Reply to Daniel Wong', context: 'CyberForge lead — overdue since yesterday' },
    { title: 'Prep Nexa Labs system design', context: 'Round 2 interview in 2 days — multi-agent orchestration' },
  ]
  const eveningSeeds = [
    { title: 'Finish PixelPine teaser draft', context: 'Overdue by 2 days — 3-paragraph automation pitch' },
    { title: 'Check Signal Watcher digest', context: 'New signals today incl. 1 gem call (RAZIS)' },
    { title: 'Confirm FiberPeak offer counter', context: 'Respond by Friday — counter for 2 remote days' },
  ]

  const taskEntries = open.map((t) => ({
    title: t.data.title,
    context: t.due_at ? `Due ${t.due_at.slice(0, 10)}` : 'No due date',
  }))
  const overdueEntries = overdue.map((t) => ({
    title: t.data.title,
    context: `Overdue — was due ${t.due_at?.slice(0, 10)}`,
  }))

  const dedupe = (entries: { title: string; context: string }[]) =>
    entries.filter((p, i, arr) => arr.findIndex((q) => q.title === p.title) === i).slice(0, 5)

  const counts = { completed: done, pending: open.length, new: 3 }

  return [
    {
      slot: 'morning',
      date,
      priorities: dedupe([...morningSeeds, ...taskEntries, ...overdueEntries]),
      counts,
      observation:
        'The ABC Technology posting is 3 days old with a 91% match — the strongest card this week, and its window is closing.',
      observation_recommendation: 'Block 60 minutes this morning to apply before the recruiter pipeline fills.',
    },
    {
      slot: 'evening',
      date,
      priorities: dedupe([...eveningSeeds, ...overdueEntries, ...taskEntries]),
      counts,
      observation:
        'One business teaser is slipping (PixelPine, 2 days overdue) while the affiliate queue stays light — worth clearing tonight.',
      observation_recommendation:
        'Spend 30 minutes tonight finishing the PixelPine teaser and schedule it for tomorrow.',
    },
  ]
}
