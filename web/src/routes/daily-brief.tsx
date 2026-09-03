/**
 * Daily Brief — the two daily briefings (docs/01 §4 module 7, T1.10.3).
 *
 * Wired to the Wave-4 endpoints: GET /api/daily-brief/morning + /evening
 * (mock mode derives the same shapes from the in-memory dataset).
 *
 * Slot toggle (Morning ☀ / Evening ☾) as a segmented control.
 * Morning: "RAZIONE DAILY" header, ranked numbered priorities (explicit
 * opportunity refs → direct links), gate-pending count chip → /gate, counts
 * row, compact Next Best Action card.
 * Evening: "DAILY REVIEW" — completed/pending/new stat chips + observation
 * card (accent border) with the paired recommendation line.
 * Both slots render EmptyState when the brief errors.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { AlertTriangle, ArrowRight, Bot, ListChecks, Moon, Sparkles, Sunrise } from 'lucide-react'
import { getEveningBrief, getMorningBrief, listAgents } from '@/api/provider'
import type { Agent, EveningBrief, MorningBrief, NextBestAction } from '@/api/types'
import { AgentStatusDot, BandBadge, EmptyState, PageHeader, StatusBadge } from '@/components/common'
import { Badge, Button, Card, Skeleton } from '@/components/ui'
import { dueMeta, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

type Slot = 'morning' | 'evening'

/* ─── Slot toggle (segmented control) ───────────────────────────────────────── */

function SlotToggle({ slot, onChange }: { slot: Slot; onChange: (s: Slot) => void }) {
  const options: Array<{ value: Slot; label: string; icon: typeof Sunrise }> = [
    { value: 'morning', label: 'Morning', icon: Sunrise },
    { value: 'evening', label: 'Evening', icon: Moon },
  ]
  return (
    <div
      role="tablist"
      aria-label="Brief slot"
      className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1"
    >
      {options.map(({ value, label, icon: Icon }) => {
        const active = slot === value
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(value)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
              'outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/60',
              active
                ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                : 'text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-text)]',
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        )
      })}
    </div>
  )
}

/* ─── Counts ────────────────────────────────────────────────────────────────── */

function CountChip({
  label,
  value,
  tone,
  to,
}: {
  label: string
  value: number
  tone: 'green' | 'sky' | 'amber' | 'red' | 'slate'
  /** Optional route — the chip becomes a link (e.g. gate pending → /gate). */
  to?: string
}) {
  const tones = {
    green: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    sky: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
    amber: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    red: 'border-red-400/30 bg-red-400/10 text-red-300',
    slate: 'border-[var(--color-border)] bg-white/[0.03] text-[var(--color-muted)]',
  } as const
  const chip = (
    <Badge variant="outline" className={cn('px-2.5 py-1 font-mono text-[11px] tracking-wider', tones[tone])}>
      <span className="font-semibold tabular-nums">{value}</span>&nbsp;{label}
    </Badge>
  )
  return to ? (
    <Link to={to} className="transition-opacity hover:opacity-80">
      {chip}
    </Link>
  ) : (
    chip
  )
}

/* ─── Morning priorities ────────────────────────────────────────────────────── */

function PriorityRow({
  p,
  rank,
}: {
  p: MorningBrief['priorities'][number]
  rank: number
}) {
  const due = p.next_action?.due ? dueMeta(p.next_action.due) : null
  const dueTone: Record<string, string> = {
    overdue: 'border-red-400/40 bg-red-400/10 text-red-300',
    soon: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
    normal: 'border-[var(--color-border)] bg-white/[0.03] text-[var(--color-muted)]',
  }

  return (
    <Link
      to={`/opportunities/${p.opportunity_id}`}
      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--color-accent)]/[0.06]"
    >
      <span
        className={cn(
          'grid size-6 shrink-0 place-items-center rounded-md border font-mono text-[11px] font-bold tabular-nums',
          rank === 1
            ? 'border-[var(--color-accent)]/60 bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
            : 'border-[var(--color-border)] bg-white/[0.03] text-[var(--color-muted)]',
        )}
      >
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[var(--color-text)]">
          {p.role ?? p.opportunity_id}
          {p.company && <span className="text-[var(--color-muted)]"> — {p.company}</span>}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <BandBadge band={p.band} />
          {p.score != null && (
            <span className="font-mono text-[11px] tabular-nums text-[var(--color-muted)]">{p.score}</span>
          )}
          {p.next_action && (
            <span className="font-mono text-[11px] tracking-wider text-[var(--color-muted)]">
              {p.next_action.type}
            </span>
          )}
        </div>
      </div>
      {due && (
        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wider',
            dueTone[due.tone],
          )}
        >
          {due.label}
        </span>
      )}
      <ArrowRight className="size-3.5 shrink-0 text-[var(--color-accent)]/60" />
    </Link>
  )
}

/* ─── Morning ───────────────────────────────────────────────────────────────── */

function MorningView({ brief }: { brief: MorningBrief }) {
  const nba: NextBestAction | null = brief.next_best_action?.opportunity ? brief.next_best_action : null
  const c = brief.counts

  return (
    <div className="flex flex-col gap-4">
      {/* Date header */}
      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-semibold tracking-[0.3em] text-[var(--color-accent)]">
              RAZIONE DAILY
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--color-text)]">
              {formatDate(brief.date)}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              Ranked priorities for today — work top to bottom.
            </p>
          </div>
          <Sunrise className="size-6 text-[var(--color-accent)]/70" />
        </div>
      </Card>

      {/* Counts row */}
      <div className="flex flex-wrap items-center gap-2">
        <CountChip label="ACTIONS REQUIRED" value={c.actions_required} tone={c.actions_required > 0 ? 'amber' : 'green'} />
        <CountChip
          label="GATE PENDING"
          value={c.gate_pending}
          tone={c.gate_pending > 0 ? 'amber' : 'slate'}
          to="/gate"
        />
        <CountChip label="OVERDUE TASKS" value={c.overdue_tasks} tone={c.overdue_tasks > 0 ? 'red' : 'slate'} />
        <CountChip label="NEW JOBS" value={c.career.new_jobs} tone="green" />
        <CountChip label="HIGH-MATCH" value={c.career.high_match} tone="green" />
        <CountChip label="APPLICATIONS PENDING" value={c.career.pending_applications} tone="sky" />
        <CountChip label="RECRUITERS AWAITING" value={c.career.recruiters_awaiting} tone="sky" />
      </div>

      {/* Priorities */}
      {brief.priorities.length === 0 ? (
        <EmptyState
          icon={<ListChecks />}
          title="No priorities"
          hint="Nothing ranked for today — the pipeline is clear."
        />
      ) : (
        <Card className="divide-y divide-[var(--color-border)]/60 overflow-hidden">
          {brief.priorities.map((p, i) => (
            <PriorityRow key={p.opportunity_id} p={p} rank={i + 1} />
          ))}
        </Card>
      )}

      {/* Next Best Action — compact hero */}
      {nba && (
        <Card className="border-[var(--color-accent)]/25 bg-gradient-to-br from-[var(--color-accent)]/[0.06] via-transparent to-transparent px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] font-semibold tracking-[0.25em] text-[var(--color-accent)]">
                NEXT BEST ACTION
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-[var(--color-text)]">
                {nba.opportunity?.data.role ?? nba.opportunity?.name}
                {nba.opportunity?.company?.name && (
                  <span className="text-[var(--color-muted)]"> — {nba.opportunity.company.name}</span>
                )}
              </p>
              <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">{nba.reason}</p>
            </div>
            <Link to={`/opportunities/${nba.opportunity?.id}`}>
              <Button size="sm">Review</Button>
            </Link>
            <Link to="/gate">
              <Button size="sm" variant="outline">
                Action Gate
              </Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ─── Evening ───────────────────────────────────────────────────────────────── */

function EveningView({ brief }: { brief: EveningBrief }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Date header */}
      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-semibold tracking-[0.3em] text-[var(--color-accent)]">
              DAILY REVIEW
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--color-text)]">
              {formatDate(brief.date)}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              What moved today, and what to watch tomorrow.
            </p>
          </div>
          <Moon className="size-6 text-[var(--color-accent)]/70" />
        </div>
      </Card>

      {/* Stat chips */}
      <div className="flex flex-wrap items-center gap-2">
        <CountChip label="COMPLETED TODAY" value={brief.completed_today} tone={brief.completed_today > 0 ? 'green' : 'slate'} />
        <CountChip label="PENDING" value={brief.pending} tone="sky" />
        <CountChip label="NEW OPPORTUNITIES" value={brief.new_today.opportunities} tone={brief.new_today.opportunities > 0 ? 'amber' : 'slate'} />
        <CountChip label="NEW SIGNALS" value={brief.new_today.signals} tone={brief.new_today.signals > 0 ? 'amber' : 'slate'} />
        <CountChip
          label="GATE DECISIONS"
          value={brief.gate_decisions_today}
          tone={brief.gate_decisions_today > 0 ? 'green' : 'slate'}
          to="/gate"
        />
      </div>

      {/* Observation card — accent border */}
      <Card className="border-[var(--color-accent)]/30 bg-gradient-to-br from-[var(--color-accent)]/[0.06] via-transparent to-transparent px-5 py-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-[var(--color-accent)]" />
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold tracking-[0.25em] text-[var(--color-muted)]">
              OBSERVATION
            </p>
            <p className="mt-1.5 text-sm leading-6 text-[var(--color-text)]/95">{brief.observation}</p>
            <div className="mt-3 border-t border-[var(--color-accent)]/20 pt-3">
              <p className="font-mono text-[10px] font-semibold tracking-[0.25em] text-[var(--color-muted)]">
                RECOMMENDATION
              </p>
              <p className="mt-1 text-sm leading-6 text-[var(--color-accent)]/95">{brief.recommendation}</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

/* ─── Agent status (T1.10.3 — the six workers, wired to GET /api/agents) ────── */

function AgentStatusRow({ agent }: { agent: Agent }) {
  const d = agent.data
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
      <AgentStatusDot status={d.last_status} />
      <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-text)]">{d.name}</span>
      <span className="font-mono text-[10px] tracking-wider text-[var(--color-muted)]">
        {d.capability}
        {d.kind === 'adapter' ? ' · ADAPTER' : ''}
      </span>
      <StatusBadge status={d.last_status ?? 'empty'} />
      <span className="w-28 text-right font-mono text-[10px] tracking-wider text-[var(--color-muted)] tabular-nums">
        {d.last_run ? timeAgo(d.last_run).toUpperCase() : 'NEVER'}
      </span>
    </div>
  )
}

function AgentStatusCard({ agents, isPending }: { agents: Agent[]; isPending: boolean }) {
  const stale = agents.filter((a) => a.data.last_status === 'error').length
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-border)]/60 px-4 py-2.5">
        <h2 className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[0.25em] text-[var(--color-muted)]">
          <Bot className="size-3.5" />
          AGENT STATUS
        </h2>
        <Badge
          variant="outline"
          className={cn(
            'font-mono text-[9px] tracking-[0.15em]',
            stale > 0 ? 'border-red-400/40 text-red-300' : undefined,
          )}
        >
          {stale > 0 ? `${stale} ERRORING` : `${agents.length} REGISTERED`}
        </Badge>
      </div>
      {isPending ? (
        <div className="flex flex-col gap-2.5 p-4" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <p className="px-4 py-3 text-xs text-[var(--color-muted)]">No agents registered.</p>
      ) : (
        <div className="divide-y divide-[var(--color-border)]/60">
          {agents.map((a) => (
            <AgentStatusRow key={a.id} agent={a} />
          ))}
        </div>
      )}
    </Card>
  )
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export function DailyBriefPage() {
  const [slot, setSlot] = useState<Slot>('morning')

  const { data: brief, isPending, isError, error, refetch } = useQuery<MorningBrief | EveningBrief>({
    queryKey: ['brief', slot],
    queryFn: () => (slot === 'morning' ? getMorningBrief() : getEveningBrief()),
    placeholderData: (prev) => prev,
  })

  // Agent status rendering (T1.10.3) — same registry as the dashboard/agents screens.
  const { data: agentsData, isPending: agentsPending } = useQuery({
    queryKey: ['agents'],
    queryFn: listAgents,
    staleTime: 60_000,
  })

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Daily Brief"
        subtitle="Auto-generated daily by Control Eye."
        actions={<SlotToggle slot={slot} onChange={setSlot} />}
      />

      {isPending ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-56 w-full rounded-lg" />
        </div>
      ) : isError || !brief ? (
        <EmptyState
          icon={<AlertTriangle />}
          title={`${slot === 'morning' ? 'Morning' : 'Evening'} brief unavailable`}
          hint={error?.message ?? 'The brief for this slot could not be generated.'}
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        />
      ) : slot === 'morning' && brief.kind === 'morning' ? (
        <div className="flex flex-col gap-4">
          <MorningView brief={brief} />
          <AgentStatusCard agents={agentsData?.items ?? []} isPending={agentsPending} />
        </div>
      ) : brief.kind === 'evening' ? (
        <div className="flex flex-col gap-4">
          <EveningView brief={brief} />
          <AgentStatusCard agents={agentsData?.items ?? []} isPending={agentsPending} />
        </div>
      ) : null}
    </div>
  )
}

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

/** "2026-09-02" → "Wednesday, September 2, 2026" (graceful fallback). */
function formatDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export default DailyBriefPage
