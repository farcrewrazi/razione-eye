/**
 * Daily Brief — the two daily briefings (docs/01 §4 module 7).
 *
 * Slot toggle (Morning ☀ / Evening ☾) as a segmented control.
 * Morning: "RAZIONE DAILY" header, ranked numbered priorities with context
 * lines (each links to its opportunity when one matches), counts row.
 * Evening: "DAILY REVIEW" — completed/pending/new stat chips + observation
 * card (accent border) with the recommendation line.
 * Both slots render EmptyState when getBrief errors.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { AlertTriangle, ArrowRight, ListChecks, Moon, Sparkles, Sunrise } from 'lucide-react'
import { getBrief, listOpportunities } from '@/api/provider'
import type { Brief, BriefPriority } from '@/api/types'
import { EmptyState, PageHeader } from '@/components/common'
import { Badge, Button, Card, Skeleton } from '@/components/ui'
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

/* ─── Morning priorities ────────────────────────────────────────────────────── */

/**
 * Match a priority to an opportunity: title mentions the role or company name
 * → link. Mock-mode briefs are text-only, so this is best-effort FE matching;
 * real mode will carry explicit refs (Phase 1).
 */
function findOpportunityUrl(p: BriefPriority, index: { company: string; role: string; id: string }[]): string | null {
  const title = p.title.toLowerCase()
  const hit = index.find(
    ({ company, role }) =>
      (company.length > 3 && title.includes(company.toLowerCase())) ||
      (role.length > 3 && title.includes(role.toLowerCase())),
  )
  return hit?.id ? `/opportunities/${hit.id}` : null
}

function PriorityRow({ p, rank, href }: { p: BriefPriority; rank: number; href: string | null }) {
  const inner = (
    <>
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
        <p className="truncate text-[13px] font-medium text-[var(--color-text)]">{p.title}</p>
        <p className="truncate text-xs text-[var(--color-muted)]">{p.context}</p>
      </div>
      {href && <ArrowRight className="size-3.5 shrink-0 text-[var(--color-accent)]/60" />}
    </>
  )

  return href ? (
    <Link
      to={href}
      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--color-accent)]/[0.06]"
    >
      {inner}
    </Link>
  ) : (
    <div className="flex items-center gap-3 px-4 py-2.5">{inner}</div>
  )
}

/* ─── Counts ────────────────────────────────────────────────────────────────── */

function CountChip({ label, value, tone }: { label: string; value: number; tone: 'green' | 'sky' | 'amber' }) {
  const tones = {
    green: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    sky: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
    amber: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  } as const
  return (
    <Badge variant="outline" className={cn('px-2.5 py-1 font-mono text-[11px] tracking-wider', tones[tone])}>
      <span className="font-semibold tabular-nums">{value}</span>&nbsp;{label}
    </Badge>
  )
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export function DailyBriefPage() {
  const [slot, setSlot] = useState<Slot>('morning')

  const { data: brief, isPending, isError, error, refetch } = useQuery({
    queryKey: ['brief', slot],
    queryFn: () => getBrief(slot),
    placeholderData: (prev) => prev,
  })

  // Pipeline snapshot for linking priorities → opportunities.
  const { data: opportunities } = useQuery({
    queryKey: ['opportunities', { chips: 'brief-links' }],
    queryFn: () => listOpportunities({ limit: 100, sort: '-score' }),
    staleTime: 60_000,
  })
  const linkIndex = (opportunities?.items ?? []).map((o) => ({
    company: o.company?.name ?? '',
    role: o.name ?? o.data.role,
    id: o.id,
  }))

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
      ) : slot === 'morning' ? (
        <MorningView brief={brief} linkIndex={linkIndex} />
      ) : (
        <EveningView brief={brief} />
      )}
    </div>
  )
}

/* ─── Morning view ──────────────────────────────────────────────────────────── */

function MorningView({ brief, linkIndex }: {
  brief: Brief
  linkIndex: { company: string; role: string; id: string }[]
}) {
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
            <PriorityRow
              key={`${p.title}-${i}`}
              p={p}
              rank={i + 1}
              href={findOpportunityUrl(p, linkIndex)}
            />
          ))}
        </Card>
      )}

      {/* Counts row */}
      <div className="flex flex-wrap items-center gap-2">
        <CountChip label="COMPLETED" value={brief.counts.completed} tone="green" />
        <CountChip label="PENDING" value={brief.counts.pending} tone="sky" />
        <CountChip label="NEW" value={brief.counts.new} tone="amber" />
      </div>
    </div>
  )
}

/* ─── Evening view ──────────────────────────────────────────────────────────── */

function EveningView({ brief }: { brief: Brief }) {
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
        <CountChip label="COMPLETED" value={brief.counts.completed} tone="green" />
        <CountChip label="PENDING" value={brief.counts.pending} tone="sky" />
        <CountChip label="NEW" value={brief.counts.new} tone="amber" />
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
              <p className="mt-1 text-sm leading-6 text-[var(--color-accent)]/95">
                {brief.observation_recommendation}
              </p>
            </div>
          </div>
        </div>
      </Card>
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
