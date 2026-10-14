/**
 * Dashboard — the homepage (docs/01-system-structure.md §4).
 *
 * Its job is not to show information — it answers ONE question:
 * "What should Razi do next?"
 *
 * Eye-scoped (EYE-2): ALL / CONTROL render the four-row overview; a focused
 * eye renders ONLY its own content — its TODAY row, its NBA, career's
 * follow-ups, and the agent grid only where navAllow keeps it in-workflow
 * (SIGNAL). Cross-eye rows and sections are absent from the DOM, not dimmed.
 *
 * Homepage contract:
 *   Header — RAZIONE EYE — {Weekday} + date + ⚡ N actions required chip +
 *            gate badge (N pending approvals → /gate)
 *   NEXT BEST ACTION — hero card (Review → detail · Apply → submits a draft
 *           apply_to_job action to the gate [T1.11])
 *   TODAY — the focused eye's row (overview: all four rows)
 *   AGENTS — the worker grid (overview + eyes whose nav allows /agents)
 */

import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { getDashboard, listGateActions, listOpportunities } from '@/api/provider'
import type { DashboardAggregate, NextBestAction, Opportunity } from '@/api/types'
import { EmptyState, SectionHeader } from '@/components/common'
import { Button, Card, Skeleton } from '@/components/ui'
import {
  AgentsSection,
  DashboardHeader,
  FollowUps,
  NbaHero,
  TodayRow,
  type Metric,
} from '@/components/dashboard'
import { useEyeFocus } from '@/hooks/useEyeFocus'
import { eyeForOpportunityType, type EyeDef, type EyeId } from '@/lib/eyes'

/* ─── TODAY row registry — one source of truth for overview + focused views ── */

type TodayKey = 'career' | 'business' | 'affiliate' | 'gems'

const TODAY_ROWS: ReadonlyArray<{
  eye: string
  eyeId: EyeId
  key: TodayKey
  live?: boolean
  phase?: number
}> = [
  { eye: 'CAREER', eyeId: 'CAREER', key: 'career', live: true },
  { eye: 'BUSINESS', eyeId: 'BUSINESS', key: 'business', phase: 3 },
  { eye: 'AFFILIATE', eyeId: 'GROWTH', key: 'affiliate', phase: 4 },
  { eye: 'GEMS', eyeId: 'SIGNAL', key: 'gems', phase: 5 },
]

function todayMetrics(data: DashboardAggregate, key: TodayKey): Metric[] {
  switch (key) {
    case 'career':
      return [
        { value: data.today.career.new_jobs, label: 'new jobs' },
        { value: data.today.career.high_match, label: 'high-match' },
        { value: data.today.career.pending_applications, label: 'applications pending' },
        { value: data.today.career.recruiters_awaiting, label: 'recruiters awaiting reply' },
      ]
    case 'business':
      return [
        { value: data.today.business.discovered, label: 'businesses discovered' },
        { value: data.today.business.worth_approaching, label: 'worth approaching' },
        { value: data.today.business.teasers_ready, label: 'teasers ready' },
      ]
    case 'affiliate':
      return [
        { value: data.today.affiliate.content_opportunities, label: 'content opportunities' },
        { value: data.today.affiliate.scheduled, label: 'posts scheduled' },
      ]
    case 'gems':
      return [
        { value: data.today.gems.tokens_detected, label: 'tokens detected' },
        { value: data.today.gems.passed_filter, label: 'passed initial filter' },
      ]
  }
}

/** TODAY section chrome, shared by the overview and the focused-eye view. */
function TodaySection({ count, children }: { count: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="TODAY"
        right={
          <span className="font-mono text-[11px] tracking-wider text-[var(--color-muted)] tabular-nums">
            {count > 0 ? 'SEE THE ACTION COUNT ABOVE' : 'NOTHING DUE'}
          </span>
        }
      />
      <Card>
        <div className="divide-y divide-[var(--color-border)]/60">{children}</div>
      </Card>
    </section>
  )
}

/* ─── Overview — ALL / CONTROL: the four-row homepage ───────────────────────── */

function OverviewDashboard({
  data,
  nba,
  gateCount,
  weekday,
  dateLine,
  followUps,
}: {
  data: DashboardAggregate
  nba: NextBestAction | null
  gateCount: number
  weekday: string
  dateLine: string
  followUps: Opportunity[]
}) {
  return (
    <div className="flex flex-col gap-5">
      <DashboardHeader
        weekday={weekday}
        dateLine={dateLine}
        subtitle="CONTROL EYE"
        actionsRequired={data.today.actions_required}
        gatePending={gateCount}
      />
      <NbaHero nba={nba} visible />
      <FollowUps opportunities={followUps} />
      <TodaySection count={data.today.actions_required}>
        {TODAY_ROWS.map((row) => (
          <TodayRow
            key={row.eyeId}
            eye={row.eye}
            live={row.live}
            phase={row.phase}
            metrics={todayMetrics(data, row.key)}
          />
        ))}
      </TodaySection>
      <AgentsSection agents={data.agents} />
    </div>
  )
}

/* ─── Focused eye — only this eye's content (EYE-2) ─────────────────────────── */

function EyeDashboard({
  eye,
  def,
  data,
  nba,
  gateCount,
  weekday,
  dateLine,
  followUps,
}: {
  eye: EyeId
  def: EyeDef
  data: DashboardAggregate
  nba: NextBestAction | null
  gateCount: number
  weekday: string
  dateLine: string
  followUps: Opportunity[]
}) {
  // A foreign-eye NBA must not render — only this eye's own does.
  const nbaEye: EyeId | null = nba?.opportunity ? eyeForOpportunityType(nba.opportunity.opportunity_type) : null
  const row = TODAY_ROWS.find((r) => r.eyeId === eye)
  return (
    <div className="flex flex-col gap-5">
      <DashboardHeader
        weekday={weekday}
        dateLine={dateLine}
        subtitle={def.label.toUpperCase()}
        actionsRequired={data.today.actions_required}
        gatePending={gateCount}
      />
      <NbaHero nba={nba} visible={nbaEye === eye} />
      {/* Follow-ups derive from JOB opportunities — Career-owned surface. */}
      {eye === 'CAREER' && <FollowUps opportunities={followUps} />}
      {row && (
        <TodaySection count={data.today.actions_required}>
          <TodayRow eye={row.eye} live={row.live} phase={row.phase} metrics={todayMetrics(data, row.key)} />
        </TodaySection>
      )}
      {/* Agent registry is control-layer ops — navAllow already encodes which
          eyes keep it in-workflow (SIGNAL yes, CAREER/BUSINESS/GROWTH no). */}
      {def.navAllow.includes('/agents') && <AgentsSection agents={data.agents} />}
    </div>
  )
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export function DashboardPage() {
  const { eye, def } = useEyeFocus()
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
  })

  // Gate queue state — the header badge reads it (the NBA hero subscribes to
  // the same cache for its in-gate check).
  const { data: gatePending } = useQuery({
    queryKey: ['gate-pending'],
    queryFn: () => listGateActions({ status: 'PENDING', limit: 50 }),
    staleTime: 15_000,
  })

  // Follow-up tracker (T1.8) — career-owned JOB opportunities; not fetched
  // for eyes that never render follow-ups.
  const showFollowUps = eye === 'ALL' || eye === 'CAREER' || eye === 'CONTROL'
  const { data: followUpJobs } = useQuery({
    queryKey: ['opportunities', { followups: 'dashboard' }],
    queryFn: () => listOpportunities({ type: 'JOB', limit: 200, sort: '-score' }),
    staleTime: 30_000,
    enabled: showFollowUps,
  })

  const now = new Date()
  const weekday = now.toLocaleDateString(undefined, { weekday: 'long' })
  const dateLine = now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })

  if (isPending) {
    return (
      <div className="flex flex-col gap-5" aria-busy="true">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-44 w-full rounded-lg" />
        <Skeleton className="h-36 w-full rounded-lg" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <EmptyState
        icon={<AlertTriangle />}
        title="Dashboard unavailable"
        hint={error?.message ?? 'The aggregate could not be loaded.'}
        action={
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        }
      />
    )
  }

  const nba = data.next_best_action?.opportunity ? data.next_best_action : null
  const gateCount = gatePending?.total ?? 0

  if (eye === 'ALL' || eye === 'CONTROL') {
    return (
      <OverviewDashboard
        data={data}
        nba={nba}
        gateCount={gateCount}
        weekday={weekday}
        dateLine={dateLine}
        followUps={followUpJobs?.items ?? []}
      />
    )
  }

  return (
    <EyeDashboard
      eye={eye}
      def={def}
      data={data}
      nba={nba}
      gateCount={gateCount}
      weekday={weekday}
      dateLine={dateLine}
      followUps={followUpJobs?.items ?? []}
    />
  )
}

export default DashboardPage
