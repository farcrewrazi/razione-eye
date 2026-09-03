/**
 * Dashboard — the Control Eye homepage (docs/01-system-structure.md §4).
 *
 * Its job is not to show information — it answers ONE question:
 * "What should Razi do next?"
 *
 * Homepage contract:
 *   Header — RAZIONE EYE — {Weekday} + date + ⚡ N actions required chip +
 *            gate badge (N pending approvals → /gate)
 *   NEXT BEST ACTION — hero card (Review → detail · Apply → submits a draft
 *           apply_to_job action to the gate [T1.11])
 *   TODAY — per-eye rows (Career live; Business/Affiliate/Gems come online in
 *           Phases 3/4/5 and render dimmed with a phase tag)
 *   AGENTS — the six workers with status dot + last run
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { AlertTriangle, CalendarClock, Crosshair, ShieldCheck, Zap } from 'lucide-react'
import { createGateAction, getDashboard, listGateActions, listOpportunities } from '@/api/provider'
import type { NextBestAction, Opportunity } from '@/api/types'
import {
  AgentStatusDot,
  BandBadge,
  EmptyState,
  ScoreDial,
  SectionHeader,
  StatusBadge,
} from '@/components/common'
import { Badge, Button, Card, Skeleton, useToast } from '@/components/ui'
import { dueMeta, salaryLabel, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

/* ─── TODAY row ─────────────────────────────────────────────────────────────── */

interface Metric {
  value: number
  label: string
}

function TodayRow({
  eye,
  metrics,
  phase,
  live,
}: {
  eye: string
  metrics: Metric[]
  /** When set the eye isn't live yet — values render dimmed + phase tag. */
  phase?: number
  live?: boolean
}) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-center gap-3 px-4 py-2.5">
      <span className="font-mono text-[11px] font-medium tracking-[0.18em] text-[var(--color-text)]/80">
        {eye}
      </span>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {metrics.map((m) => (
          <span key={m.label} className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
            <span
              className={cn(
                'font-mono text-sm font-semibold tabular-nums',
                live && m.value > 0 ? 'text-[var(--color-text)]' : 'text-[var(--color-muted)]',
              )}
            >
              {m.value}
            </span>
            <span className="text-xs text-[var(--color-muted)]">{m.label}</span>
          </span>
        ))}
        {phase !== undefined && (
          <Badge variant="outline" className="font-mono text-[9px] tracking-[0.15em]">
            ONLINE IN PHASE {phase}
          </Badge>
        )}
      </div>
    </div>
  )
}

/* ─── NEXT BEST ACTION hero ─────────────────────────────────────────────────── */

function NextBestActionCard({
  nba,
  gatePendingForOpp,
  submitting,
  onSubmitToGate,
}: {
  nba: NextBestAction
  gatePendingForOpp: boolean
  submitting: boolean
  onSubmitToGate: () => void
}) {
  const navigate = useNavigate()
  const o = nba.opportunity
  if (!o) return null
  const meta = [o.data.location, salaryLabel(o.data)].filter(Boolean).join(' · ') || '—'

  return (
    <Card
      className={cn(
        'border-[var(--color-accent)]/25',
        'bg-gradient-to-br from-[var(--color-accent)]/[0.07] via-transparent to-transparent p-5',
      )}
    >
      <div className="flex flex-wrap items-center gap-6">
        <ScoreDial value={nba.match_score ?? o.score} size={112} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] font-semibold tracking-[0.3em] text-[var(--color-accent)]">
              NEXT BEST ACTION
            </span>
            <StatusBadge status={o.status} />
            <BandBadge band={o.band} />
          </div>
          <h2 className="mt-1.5 truncate text-lg font-semibold tracking-tight text-[var(--color-text)]">
            {o.data.role ?? o.name} — {o.company?.name ?? 'Unknown company'}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">{meta}</p>
          <p className="mt-2.5 max-w-2xl text-sm leading-5 text-[var(--color-text)]/90">{nba.reason}</p>
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void navigate(`/opportunities/${o.id}`)}>
              Review
            </Button>
            {gatePendingForOpp ? (
              <Button size="sm" variant="outline" onClick={() => void navigate('/gate')}>
                <ShieldCheck className="size-3.5" />
                In Gate — review
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={submitting} onClick={onSubmitToGate}>
                <ShieldCheck className="size-3.5" />
                {submitting ? 'Submitting…' : 'Apply'}
              </Button>
            )}
          </div>
          <p className="mt-2 font-mono text-[10px] tracking-wider text-[var(--color-muted)]/70">
            APPLY SUBMITS A DRAFT TO THE ACTION GATE — NOTHING SENDS WITHOUT YOUR APPROVAL
          </p>
        </div>
      </div>
    </Card>
  )
}

/* ─── FOLLOW-UPS (T1.8-FE half) ─────────────────────────────────────────────── */

/**
 * Post-application follow-up reminders (T1.8): opportunities in the waiting
 * stages (APPLIED → OFFER) with a due/overdue `next_action` — the "replies and
 * follow-ups never slip" promise, visible on the dashboard.
 */
const FOLLOW_UP_STATUSES = ['APPLIED', 'RECRUITER_RESPONSE', 'INTERVIEW', 'OFFER']

const followUpTone: Record<string, string> = {
  overdue: 'border-red-400/40 bg-red-400/10 text-red-300',
  soon: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  normal: 'border-[var(--color-border)] bg-white/[0.03] text-[var(--color-muted)]',
}

function FollowUpsSection({ opportunities }: { opportunities: Opportunity[] }) {
  const followUps = opportunities
    .filter((o) => o.status != null && FOLLOW_UP_STATUSES.includes(o.status))
    .map((o) => ({ o, due: o.data.next_action?.due ? dueMeta(o.data.next_action.due) : null }))
    // Urgent first: overdue → due soon → everything else; then by company/role for stability.
    .sort((a, b) => {
      const rank = { overdue: 0, soon: 1, normal: 2 } as const
      const ra = a.due ? rank[a.due.tone] : 3
      const rb = b.due ? rank[b.due.tone] : 3
      if (ra !== rb) return ra - rb
      return (a.o.company?.name ?? '').localeCompare(b.o.company?.name ?? '')
    })
    .slice(0, 5)

  if (followUps.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="FOLLOW-UPS"
        subtitle="Applications awaiting a reply or next step"
        right={
          <Badge variant="outline" className="font-mono text-[10px] tracking-wider">
            {followUps.length} TRACKING
          </Badge>
        }
      />
      <Card>
        <div className="divide-y divide-[var(--color-border)]/60">
          {followUps.map(({ o, due }) => (
            <Link
              key={o.id}
              to={`/opportunities/${o.id}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-[var(--color-accent)]/[0.05]"
            >
              <StatusBadge status={o.status} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-text)]">
                {o.data.role ?? o.name}
                {o.company?.name && (
                  <span className="text-[var(--color-muted)]"> — {o.company.name}</span>
                )}
              </span>
              {o.data.applied_date && (
                <span className="font-mono text-[10px] tracking-wider text-[var(--color-muted)] tabular-nums">
                  APPLIED {o.data.applied_date}
                </span>
              )}
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wider whitespace-nowrap',
                  due ? followUpTone[due.tone] : 'border-[var(--color-border)] bg-white/[0.03] text-[var(--color-muted)]',
                )}
              >
                <CalendarClock className="size-3" />
                {due?.label ?? 'no date'}
              </span>
            </Link>
          ))}
        </div>
      </Card>
    </section>
  )
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export function DashboardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
  })

  // Gate queue state — the header badge + NBA [Apply] button both use it.
  const { data: gatePending } = useQuery({
    queryKey: ['gate-pending'],
    queryFn: () => listGateActions({ status: 'PENDING', limit: 50 }),
    staleTime: 15_000,
  })

  // Follow-up tracker (T1.8) — opportunities in the post-application stages.
  const { data: followUpJobs } = useQuery({
    queryKey: ['opportunities', { followups: 'dashboard' }],
    queryFn: () => listOpportunities({ type: 'JOB', limit: 200, sort: '-score' }),
    staleTime: 30_000,
  })

  const submitToGate = useMutation({
    mutationFn: (opportunityId: string) =>
      createGateAction({
        action_type: 'apply_to_job',
        payload: { opportunity_id: opportunityId },
      }),
    onSuccess: (action) => {
      toast.success('Draft submitted to the Action Gate', {
        description: `${action.summary} — approve or edit it in the gate.`,
      })
      void queryClient.invalidateQueries({ queryKey: ['gate-actions'] })
      void queryClient.invalidateQueries({ queryKey: ['gate-pending'] })
      void queryClient.invalidateQueries({ queryKey: ['brief'] })
      void navigate('/gate')
    },
    onError: (err) => {
      toast.error('Could not submit to the gate', { description: err.message })
    },
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

  const count = data.today.actions_required
  const gateCount = gatePending?.total ?? 0
  const nba = data.next_best_action?.opportunity ? data.next_best_action : null
  const nbaInGate =
    nba?.opportunity != null &&
    (gatePending?.items ?? []).some((a) => a.payload.opportunity_id === nba.opportunity?.id)

  return (
    <div className="flex flex-col gap-5">
      {/* Header — homepage contract line 1 */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-bold tracking-tight text-[var(--color-text)]">
            RAZIONE EYE <span className="text-[var(--color-border)]">—</span>{' '}
            <span className="text-[var(--color-accent)]">{weekday.toUpperCase()}</span>
          </h1>
          <p className="mt-1 font-mono text-xs tracking-wider text-[var(--color-muted)]">
            {dateLine} · CONTROL EYE
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            className={cn(
              'gap-1.5 px-2 py-1 font-mono text-[11px] tracking-wider',
              count > 0
                ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
            )}
          >
            <Zap className="size-3" />
            {count} ACTION{count === 1 ? '' : 'S'} REQUIRED
          </Badge>
          <Link to="/gate" className="transition-opacity hover:opacity-80">
            <Badge
              className={cn(
                'gap-1.5 px-2 py-1 font-mono text-[11px] tracking-wider',
                gateCount > 0
                  ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                  : 'border-[var(--color-border)] text-[var(--color-muted)]',
              )}
            >
              <ShieldCheck className="size-3" />
              {gateCount} GATE PENDING
            </Badge>
          </Link>
        </div>
      </header>

      {/* NEXT BEST ACTION — hero */}
      {nba ? (
        <NextBestActionCard
          nba={nba}
          gatePendingForOpp={nbaInGate}
          submitting={submitToGate.isPending}
          onSubmitToGate={() => {
            if (nba.opportunity) submitToGate.mutate(nba.opportunity.id)
          }}
        />
      ) : (
        <EmptyState
          icon={<Crosshair />}
          title="No next best action"
          hint="Nothing actionable right now — the pipeline is clear or fully terminal."
          action={
            <Button variant="outline" size="sm" onClick={() => void navigate('/opportunities')}>
              View pipeline
            </Button>
          }
        />
      )}

      {/* FOLLOW-UPS — applications awaiting replies / next steps (T1.8) */}
      <FollowUpsSection opportunities={followUpJobs?.items ?? []} />

      {/* TODAY */}
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
          <div className="divide-y divide-[var(--color-border)]/60">
            <TodayRow
              eye="CAREER"
              live
              metrics={[
                { value: data.today.career.new_jobs, label: 'new jobs' },
                { value: data.today.career.high_match, label: 'high-match' },
                { value: data.today.career.pending_applications, label: 'applications pending' },
                { value: data.today.career.recruiters_awaiting, label: 'recruiters awaiting reply' },
              ]}
            />
            <TodayRow
              eye="BUSINESS"
              phase={3}
              metrics={[
                { value: data.today.business.discovered, label: 'businesses discovered' },
                { value: data.today.business.worth_approaching, label: 'worth approaching' },
                { value: data.today.business.teasers_ready, label: 'teasers ready' },
              ]}
            />
            <TodayRow
              eye="AFFILIATE"
              phase={4}
              metrics={[
                { value: data.today.affiliate.content_opportunities, label: 'content opportunities' },
                { value: data.today.affiliate.scheduled, label: 'posts scheduled' },
              ]}
            />
            <TodayRow
              eye="GEMS"
              phase={5}
              metrics={[
                { value: data.today.gems.tokens_detected, label: 'tokens detected' },
                { value: data.today.gems.passed_filter, label: 'passed initial filter' },
              ]}
            />
          </div>
        </Card>
      </section>

      {/* AGENTS */}
      <section className="flex flex-col gap-2">
        <SectionHeader
          title="AGENTS"
          subtitle="Discovery & analysis workers — last run"
          right={
            <Badge variant="outline" className="font-mono text-[10px] tracking-wider">
              {data.agents.length} REGISTERED
            </Badge>
          }
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {data.agents.map((a) => (
            <Card key={a.id} className="px-3 py-2.5">
              <div className="flex items-center gap-2">
                <AgentStatusDot status={a.data.last_status} />
                <span className="truncate text-xs font-medium text-[var(--color-text)]">
                  {a.data.name}
                </span>
              </div>
              <p className="mt-1.5 font-mono text-[10px] tracking-wider text-[var(--color-muted)]">
                {a.data.last_run ? `LAST RUN ${timeAgo(a.data.last_run).toUpperCase()}` : 'NEVER RUN'}
                {a.data.kind === 'adapter' ? ' · ADAPTER' : ''}
              </p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}

export default DashboardPage
