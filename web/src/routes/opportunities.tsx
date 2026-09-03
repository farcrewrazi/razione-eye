/**
 * Opportunities — the pipeline table (docs/01 §6 module 2) + board view (T1.5).
 *
 * Table/Board/Inbox segmented control (persisted in localStorage):
 *   - Table: filterable list, band badges, mono scores, relative timestamps,
 *     limit-50 windowed footer. Row click → /opportunities/:id.
 *   - Board: the 9-stage drag & drop pipeline with terminal zone — see
 *     pipeline.tsx.
 *   - Inbox: signal triage for the focused eye (eyes with signalTypes, e.g.
 *     CAREER) — promote/dismiss without leaving the pipeline. Supports
 *     ?view=inbox as the initial view (redirect target for /signals).
 */

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Kanban,
  Plus,
  Search,
  Table2 as TableViewIcon,
} from 'lucide-react'
import { listOpportunities, listSignals, updateSignalDisposition } from '@/api/provider'
import type { Opportunity, ScoreBand, Signal, SignalDisposition, SignalType } from '@/api/types'
import { JOB_STATUSES, SCORE_BANDS, SIGNAL_DISPOSITIONS, SIGNAL_TYPES } from '@/api/types'
import { BandBadge, EmptyState, PageHeader, StatusBadge } from '@/components/common'
import { NewSignalPanel, PromoteDialog, SignalRow } from '@/components/signals'
import { Button, Card, Input, Select, Skeleton, Table, Td, Th, Thead, Tr, useToast } from '@/components/ui'
import { useEyeFocus } from '@/hooks/useEyeFocus'
import { CONTROL_SIGNAL_TYPES, opportunityInEye } from '@/lib/eyes'
import { salaryLabel, scoreColor, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PipelineBoard } from './pipeline'

const PAGE_SIZE = 50

/** localStorage key for the Table/Board/Inbox view preference. */
const VIEW_PREF_KEY = 'razione-eye:opportunities:view'
type ViewMode = 'table' | 'board' | 'inbox'

function isViewMode(raw: string | null): raw is ViewMode {
  return raw === 'table' || raw === 'board' || raw === 'inbox'
}

/** Initial view: ?view= query param wins (e.g. redirect from /signals), then localStorage. */
function loadViewPref(param: string | null): ViewMode {
  if (isViewMode(param)) return param
  try {
    const raw = localStorage.getItem(VIEW_PREF_KEY)
    return isViewMode(raw) ? raw : 'table'
  } catch {
    return 'table'
  }
}

type StatusFilter = string // '' = All

function ScoreCell({ value }: { value: number | null }) {
  if (value == null) return <span className="font-mono text-[var(--color-muted)]">—</span>
  return (
    <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: scoreColor(value) }}>
      {value}
    </span>
  )
}

function OpportunityRow({ o, onOpen }: { o: Opportunity; onOpen: (id: string) => void }) {
  return (
    <Tr className="cursor-pointer" onClick={() => onOpen(o.id)}>
      <Td className="max-w-64">
        <div className="truncate text-[13px] font-medium text-[var(--color-text)]">{o.name ?? '—'}</div>
        <div className="truncate text-xs text-[var(--color-muted)]">
          {o.company?.name ?? 'Unknown company'}
        </div>
      </Td>
      <Td>
        <BandBadge band={o.band} />
      </Td>
      <Td>
        <ScoreCell value={o.score} />
      </Td>
      <Td>
        <StatusBadge status={o.status} />
      </Td>
      <Td className="max-w-32 truncate text-xs text-[var(--color-muted)]">
        {o.data.location ?? '—'}
      </Td>
      <Td className="text-xs whitespace-nowrap text-[var(--color-muted)]">{salaryLabel(o.data)}</Td>
      <Td className="text-xs whitespace-nowrap text-[var(--color-muted)]">
        {timeAgo(o.updated_at)}
      </Td>
    </Tr>
  )
}

/* ─── Inbox pane (per-eye signal triage) ────────────────────────────────────── */

/**
 * Signal triage embedded in Opportunities — mirrors routes/signals.tsx, scoped
 * to the focused eye. Fetches the wide window and post-filters client-side to
 * the eye's signal types plus the ops types (SOCIAL_POST / COMMENT) that stay
 * visible in every eye; an explicit type selection overrides (server filters).
 */
function SignalsInboxPane() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { eye, def } = useEyeFocus()
  const [disposition, setDisposition] = useState<SignalDisposition | ''>('')
  const [signalType, setSignalType] = useState<SignalType | ''>('')
  const [formOpen, setFormOpen] = useState(false)
  /** Signal queued for the promote dialog (T1.12). */
  const [promoting, setPromoting] = useState<Signal | null>(null)

  const defaultType = def.signalTypes[0] ?? 'JOB_POSTING'
  const eyeTypes = def.signalTypes.length > 0 ? def.signalTypes : null
  const serverType = signalType || (eyeTypes && eyeTypes.length === 1 ? eyeTypes[0] : undefined)

  const params = {
    disposition: disposition || undefined,
    signal_type: serverType,
    limit: 100,
  }
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['signals', params, eye],
    queryFn: () => listSignals(params),
    placeholderData: (prev) => prev,
  })

  const dispositionMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: SignalDisposition }) =>
      updateSignalDisposition(id, next),
    onSuccess: (s) => {
      toast.info(`Signal ${String(s.status).toLowerCase()}`, {
        description: s.name ?? 'Signal updated.',
      })
      void queryClient.invalidateQueries({ queryKey: ['signals'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err) => {
      toast.error('Disposition change failed', { description: err.message })
    },
  })

  const allowed = signalType
    ? null // explicit manual selection — the server already filtered
    : eyeTypes
      ? [...eyeTypes, ...CONTROL_SIGNAL_TYPES]
      : null
  const items = (data?.items ?? []).filter((s) => !allowed || allowed.includes(s.data.signal_type))
  const newCount = items.filter((s) => s.status === 'NEW').length

  const onDisposition = (id: string, next: SignalDisposition): void => {
    if (next === 'PROMOTED') {
      // Open the promote dialog instead of the bare disposition flip (T1.12).
      const target = items.find((s) => s.id === id)
      if (target) setPromoting(target)
      return
    }
    dispositionMutation.mutate({ id, next })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-44"
          value={disposition}
          onChange={(e) => setDisposition(e.target.value as SignalDisposition | '')}
          aria-label="Filter by disposition"
        >
          <option value="">Disposition: All</option>
          {SIGNAL_DISPOSITIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
        <Select
          className="w-44"
          value={signalType}
          onChange={(e) => setSignalType(e.target.value as SignalType | '')}
          aria-label="Filter by signal type"
        >
          <option value="">Type: All</option>
          {SIGNAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <span className="ml-auto font-mono text-[11px] tracking-wider text-[var(--color-muted)] tabular-nums">
          {isPending ? '…' : `${items.length} TOTAL`}
          {!isPending && disposition === 'NEW' ? ` · ${newCount} AWAITING TRIAGE` : ''}
        </span>
      </div>

      <NewSignalPanel open={formOpen} onToggle={() => setFormOpen((o) => !o)} defaultType={defaultType} />

      {/* Inbox */}
      {isPending ? (
        <Card className="p-3">
          <div className="flex flex-col gap-2.5" aria-busy="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </Card>
      ) : isError ? (
        <EmptyState
          icon={<AlertTriangle />}
          title="Signals unavailable"
          hint={error?.message ?? 'Signals could not be loaded.'}
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title={disposition || signalType ? 'No matches' : `No ${def.shortLabel} Eye signals`}
          hint={
            disposition || signalType
              ? 'Nothing matches the current filters — clear them to see the full inbox.'
              : `${def.label} detections land here — promote them into the pipeline or dismiss.`
          }
        />
      ) : (
        <Card className={cn('divide-y divide-[var(--color-border)]/50 overflow-hidden')}>
          {items.map((s) => (
            <SignalRow
              key={s.id}
              s={s}
              onDisposition={onDisposition}
            />
          ))}
        </Card>
      )}

      {/* Promote dialog (T1.12) */}
      {promoting && <PromoteDialog signal={promoting} onClose={() => setPromoting(null)} />}
    </div>
  )
}

export function OpportunitiesPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { eye, def, focused } = useEyeFocus()
  const [view, setView] = useState<ViewMode>(() => loadViewPref(searchParams.get('view')))
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('')
  const [band, setBand] = useState<ScoreBand | ''>('')
  const [page, setPage] = useState(0)

  /*
   * Inbox is per-eye signal triage — only eyes that own signal types (CAREER,
   * BUSINESS, SIGNAL) get the segment. ?view=inbox on a signal-less eye
   * (GROWTH/CONTROL) or under All falls back to the table.
   */
  const inboxAvailable = focused && def.signalTypes.length > 0

  // ?view= applies once as the initial view, then the URL is cleaned so the
  // persisted preference takes back over (no sticky query param).
  const viewParam = searchParams.get('view')
  useEffect(() => {
    if (viewParam === null) return
    if (isViewMode(viewParam) && (viewParam !== 'inbox' || inboxAvailable)) setView(viewParam)
    const next = new URLSearchParams(searchParams)
    next.delete('view')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewParam])

  // Fall back to table when the focused eye has no signals inbox.
  useEffect(() => {
    if (!inboxAvailable && view === 'inbox') setView('table')
  }, [inboxAvailable, view])

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_PREF_KEY, view)
    } catch {
      // Private mode / storage disabled — preference just won't persist.
    }
  }, [view])

  // Reset the paging window whenever the eye focus changes.
  useEffect(() => {
    setPage(0)
  }, [eye])

  // Debounce the search box so typing doesn't thrash the query key.
  const [qInput, setQInput] = useState('')
  const qTimer = useRef<number | undefined>(undefined)
  const onSearchInput = (value: string): void => {
    setQInput(value)
    setPage(0)
    window.clearTimeout(qTimer.current)
    qTimer.current = window.setTimeout(() => setQ(value), 250)
  }

  /*
   * Eye filter (T1.13): single-type eyes pass `type` to the backend (mock and
   * real both honor it today). Multi-type eyes (BUSINESS) and ALL fetch the
   * wide window and post-filter client-side — works identically until/unless
   * a `?eye=` param lands server-side.
   */
  const singleType = focused && def.opportunityTypes.length === 1 ? def.opportunityTypes[0] : undefined
  const postFilter = focused && !singleType
  const params = {
    q: q || undefined,
    status: status || undefined,
    band: band || undefined,
    type: singleType,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sort: '-score',
  }
  const fetchParams = postFilter
    ? { q: params.q, status: params.status, band: params.band, limit: 500, sort: '-score' as const }
    : params

  const { data, isPending, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['opportunities', fetchParams, eye],
    queryFn: () => listOpportunities(fetchParams),
    placeholderData: (prev) => prev,
  })

  const open = (id: string): void => void navigate(`/opportunities/${id}`)
  const filtered = postFilter
    ? (data?.items ?? []).filter((o) => opportunityInEye(o.opportunity_type, eye))
    : (data?.items ?? [])
  const total = postFilter ? filtered.length : (data?.total ?? 0)
  const items = postFilter ? filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : filtered
  const pageStart = total === 0 ? 0 : page * PAGE_SIZE + 1
  const pageEnd = Math.min((page + 1) * PAGE_SIZE, total)
  const hasPrev = page > 0
  const hasNext = (page + 1) * PAGE_SIZE < total

  const subtitle = !focused
    ? 'Career pipeline — every discovered role, ranked by match.'
    : eye === 'CONTROL'
      ? 'Every opportunity across all eyes — Control sees the whole board.'
      : `${def.label} — ${def.opportunityTypes.join(' + ') || 'cross-eye'} opportunities, ranked by score.`

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader
        title="Opportunities"
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-3">
            {view !== 'inbox' && (
              <span className="font-mono text-xs tracking-wider text-[var(--color-muted)] tabular-nums">
                {isPending ? '…' : `${total} TOTAL`}
              </span>
            )}
            <Button size="sm" onClick={() => void navigate('/opportunities/new')}>
              <Plus className="size-3.5" />
              Add Job
            </Button>
            {/* Table / Board / Inbox segmented control (persisted) */}
            <div
              role="group"
              aria-label="View mode"
              className="flex items-center gap-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
            >
              {(
                [
                  ['table', 'Table', TableViewIcon],
                  ['board', 'Board', Kanban],
                  ...(inboxAvailable ? ([['inbox', 'Inbox', Inbox]] as const) : []),
                ] as const
              ).map(([mode, label, Icon]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={view === mode}
                  onClick={() => setView(mode)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-xs transition-colors',
                    view === mode
                      ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                      : 'text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-text)]',
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {view === 'inbox' ? (
        <SignalsInboxPane />
      ) : view === 'board' ? (
        <PipelineBoard />
      ) : (
        <>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[var(--color-muted)]" />
          <Input
            className="pl-8"
            placeholder="Search role, company, location…"
            value={qInput}
            onChange={(e) => onSearchInput(e.target.value)}
            aria-label="Search opportunities"
          />
        </div>
        <Select
          className="w-44"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(0)
          }}
          aria-label="Filter by status"
        >
          <option value="">Status: All</option>
          {JOB_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select
          className="w-36"
          value={band}
          onChange={(e) => {
            setBand(e.target.value as ScoreBand | '')
            setPage(0)
          }}
          aria-label="Filter by band"
        >
          <option value="">Band: All</option>
          {SCORE_BANDS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </Select>
      </div>

      {/* Table */}
      {isPending ? (
        <Card className="p-3">
          <div className="flex flex-col gap-2.5" aria-busy="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </Card>
      ) : isError ? (
        <EmptyState
          icon={<AlertTriangle />}
          title="Pipeline unavailable"
          hint={error?.message ?? 'Opportunities could not be loaded.'}
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        />
      ) : total === 0 ? (
        <EmptyState
          title={q || status || band ? 'No matches' : focused ? `Nothing in ${def.shortLabel} Eye yet` : 'Pipeline is empty'}
          hint={
            q || status || band
              ? 'Nothing matches the current filters — clear them to see the full pipeline.'
              : focused
                ? `${def.label} owns ${def.opportunityTypes.join(' + ') || 'no'} opportunities — reset the focus to All to see the full pipeline.`
                : 'Discovered jobs will appear here once the scouts run.'
          }
        />
      ) : (
        <Card className={cn('overflow-hidden', isFetching && 'opacity-60 transition-opacity')}>
          <Table>
            <Thead>
              <Tr className="hover:bg-transparent">
                <Th>Role</Th>
                <Th>Band</Th>
                <Th>Score</Th>
                <Th>Status</Th>
                <Th>Location</Th>
                <Th>Salary</Th>
                <Th>Updated</Th>
              </Tr>
            </Thead>
            <tbody>
              {items.map((o) => (
                <OpportunityRow key={o.id} o={o} onOpen={open} />
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {/* Footer */}
      {!isPending && !isError && (
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[11px] tracking-wider text-[var(--color-muted)] tabular-nums">
            SHOWING {pageStart}–{pageEnd} OF {total}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              disabled={!hasPrev}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-3.5" />
              Prev
            </Button>
            <span className="px-1 font-mono text-[11px] text-[var(--color-muted)] tabular-nums">
              {page + 1}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next page"
            >
              Next
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  )
}

export default OpportunitiesPage
