/**
 * Pitches (EYE-7) — every prepared pitch draft and its Action Gate state.
 *
 * A read-only status board mirroring the /gate patterns (filters, rows,
 * decision history) scoped to `prepare_pitch` actions: drafts are prepared
 * from /prospects, decisions happen at /gate. Nothing here sends anything —
 * gate drafts remain the only output of the business loop.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  ClipboardList,
  History,
  Presentation,
  ShieldCheck,
  StickyNote,
} from 'lucide-react'
import { listGateActions } from '@/api/provider'
import type { GateAction, GateStatus } from '@/api/types'
import { EmptyState, PageHeader, StatusBadge } from '@/components/common'
import { Badge, Button, Card, Skeleton } from '@/components/ui'
import { useEyeFocus } from '@/hooks/useEyeFocus'
import { opportunityInEye } from '@/lib/eyes'
import { formatDateTime, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

/* ─── prepare_pitch payload helpers (shared with the prospect detail) ──────── */

/** prepare_pitch payloads carry the target opportunity in payload.opportunity_id. */
export function pitchOpportunityId(a: GateAction): string | undefined {
  const v = a.payload.opportunity_id
  return typeof v === 'string' ? v : undefined
}

/** The newest prepare_pitch draft for one prospect, across every gate status. */
export function latestPitchDraft(actions: GateAction[], opportunityId: string): GateAction | null {
  return (
    actions
      .filter(
        (a) =>
          a.action_type === 'prepare_pitch' &&
          (a.opportunity_id === opportunityId || pitchOpportunityId(a) === opportunityId),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  )
}

/* ─── Status filter (same segmented control as /gate) ──────────────────────── */

type StatusFilter = GateStatus | 'ALL'

function StatusFilterTabs({
  value,
  counts,
  onChange,
}: {
  value: StatusFilter
  counts: Record<GateStatus, number>
  onChange: (s: StatusFilter) => void
}) {
  const options: Array<{ value: StatusFilter; label: string }> = [
    { value: 'PENDING', label: `Pending${counts.PENDING > 0 ? ` (${counts.PENDING})` : ''}` },
    { value: 'APPROVED', label: `Approved${counts.APPROVED > 0 ? ` (${counts.APPROVED})` : ''}` },
    { value: 'REJECTED', label: `Rejected${counts.REJECTED > 0 ? ` (${counts.REJECTED})` : ''}` },
    { value: 'ALL', label: 'All' },
  ]
  return (
    <div
      role="tablist"
      aria-label="Filter by gate status"
      className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1"
    >
      {options.map(({ value: v, label }) => {
        const active = value === v
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
              'outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/60',
              active
                ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                : 'text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-text)]',
            )}
          >
            {v === 'PENDING' && <ClipboardList className="size-3.5" />}
            {v === 'ALL' && <History className="size-3.5" />}
            {label}
          </button>
        )
      })}
    </div>
  )
}

/* ─── Draft row (mirrors GateActionRow minus the decision controls) ────────── */

function PitchDraftRow({ action }: { action: GateAction }) {
  const pending = action.status === 'PENDING'
  const o = action.opportunity
  const oppId = action.opportunity_id ?? pitchOpportunityId(action)

  return (
    <div className={cn('flex flex-col gap-1.5 px-4 py-3.5', !pending && 'opacity-75')}>
      {/* Line 1 — summary + status + meta */}
      <div className="flex flex-wrap items-center gap-2">
        <Presentation
          className={cn(
            'size-4 shrink-0',
            action.status === 'PENDING'
              ? 'text-amber-300'
              : action.status === 'APPROVED'
                ? 'text-emerald-300'
                : 'text-red-300',
          )}
        />
        <h3
          className="min-w-0 truncate text-[13px] font-semibold text-[var(--color-text)]"
          title={action.summary}
        >
          {action.summary}
        </h3>
        <span className="ml-auto inline-flex items-center gap-2">
          <StatusBadge status={action.status} />
          {pending && (
            <span className="font-mono text-[10px] tracking-wider text-[var(--color-muted)] tabular-nums">
              WAITING {timeAgo(action.created_at).toUpperCase()}
            </span>
          )}
        </span>
      </div>

      {/* Line 2 — prospect chip + pipeline status */}
      <div className="flex flex-wrap items-center gap-1.5">
        {o ? (
          <Link
            to={`/prospects/${o.id}`}
            className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] text-[var(--color-muted)] transition-colors hover:border-[var(--color-accent)]/50 hover:text-[var(--color-accent)]"
          >
            <ArrowUpRight className="size-3" />
            {o.name ?? oppId ?? 'prospect'}
            {typeof o.data.segment === 'string' && o.data.segment ? ` · ${o.data.segment}` : ''}
          </Link>
        ) : (
          oppId && (
            <span className="font-mono text-[11px] text-[var(--color-muted)]">{oppId}</span>
          )
        )}
        {o?.status && (
          <Badge variant="outline" className="font-mono text-[10px] tracking-wider">
            {o.status}
          </Badge>
        )}
      </div>

      {/* Draft note (prepare_pitch payload) */}
      {typeof action.payload.note === 'string' && action.payload.note && (
        <p className="flex items-start gap-1.5 text-xs leading-5 text-[var(--color-muted)]">
          <StickyNote className="mt-0.5 size-3 shrink-0" />
          {action.payload.note}
        </p>
      )}

      {/* Decision history for decided rows — decisions happen at /gate */}
      {!pending && action.decision && (
        <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] tracking-wide">
          <Badge
            variant="outline"
            className={cn(
              'font-mono text-[10px]',
              action.decision === 'rejected' ? 'text-red-300/90' : 'text-emerald-300/90',
            )}
          >
            {action.decision.toUpperCase()}
          </Badge>
          {action.decided_at && (
            <span className="text-[var(--color-muted)] tabular-nums">
              {formatDateTime(action.decided_at)}
            </span>
          )}
          {action.decision_reason && (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-red-300/80">
              <Ban className="size-3 shrink-0" />
              <span className="truncate" title={action.decision_reason}>
                “{action.decision_reason}”
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */

export default function PitchesPage() {
  const { eye, def, focused } = useEyeFocus()
  const [filter, setFilter] = useState<StatusFilter>('ALL')

  // Same query family as /gate — cache and invalidations are shared.
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['gate-actions', { status: undefined }],
    queryFn: () => listGateActions({ limit: 100 }),
    placeholderData: (prev) => prev,
  })

  // Eye filter (same convention as /gate): drafts inherit the eye of their
  // linked opportunity; drafts without a resolvable opportunity stay visible.
  const inEye = (a: GateAction): boolean => {
    if (!focused) return true
    if (!a.opportunity) return true
    return opportunityInEye(a.opportunity.opportunity_type, eye)
  }
  const drafts = (data?.items ?? []).filter((a) => a.action_type === 'prepare_pitch' && inEye(a))
  const counts: Record<GateStatus, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0 }
  for (const a of drafts) counts[a.status]++
  const items = filter === 'ALL' ? drafts : drafts.filter((a) => a.status === filter)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Pitches"
        subtitle="Prepared pitch drafts and their gate state. Nothing sends — the gate decides."
        actions={
          <Badge
            variant="outline"
            className={cn(
              'px-2.5 py-1 font-mono text-[11px] tracking-wider',
              counts.PENDING > 0
                ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
            )}
          >
            <Presentation className="size-3" />
            {counts.PENDING} PENDING
          </Badge>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusFilterTabs value={filter} counts={counts} onChange={setFilter} />
        <span className="ml-auto font-mono text-[11px] tracking-wider text-[var(--color-muted)] tabular-nums">
          {isPending ? '…' : `${items.length} TOTAL`}
        </span>
      </div>

      {/* Draft board */}
      {isPending ? (
        <Card className="p-3">
          <div className="flex flex-col gap-2.5" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </Card>
      ) : isError ? (
        <EmptyState
          icon={<AlertTriangle />}
          title="Pitch drafts unavailable"
          hint={error?.message ?? 'Gate actions could not be loaded.'}
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck />}
          title={
            drafts.length === 0
              ? 'No pitch drafts yet'
              : focused
                ? `No ${def.shortLabel} Eye ${filter.toLowerCase()} drafts`
                : `No ${filter.toLowerCase()} drafts`
          }
          hint={
            drafts.length === 0
              ? 'Prepare one from the prospects table — drafts queue in the Action Gate.'
              : 'Switch filters to see the rest of the pitch history.'
          }
          action={
            drafts.length === 0 ? (
              <Link to="/prospects">
                <Button variant="outline" size="sm">
                  <ArrowUpRight className="size-3.5" />
                  Open prospects
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Card className="divide-y divide-[var(--color-border)]/50 overflow-hidden">
          {items.map((a) => (
            <PitchDraftRow key={a.id} action={a} />
          ))}
        </Card>
      )}
    </div>
  )
}
