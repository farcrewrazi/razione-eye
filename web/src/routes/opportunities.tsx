/**
 * Opportunities — the pipeline table (docs/01 §6 module 2) + board view (T1.5).
 *
 * Table/Board segmented control (persisted in localStorage):
 *   - Table: filterable list, band badges, mono scores, relative timestamps,
 *     limit-50 windowed footer. Row click → /opportunities/:id.
 *   - Board: the 9-stage drag & drop pipeline with terminal zone — see
 *     pipeline.tsx.
 */

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { AlertTriangle, ChevronLeft, ChevronRight, Kanban, Plus, Search, Table2 as TableViewIcon } from 'lucide-react'
import { listOpportunities } from '@/api/provider'
import type { Opportunity, ScoreBand } from '@/api/types'
import { JOB_STATUSES, SCORE_BANDS } from '@/api/types'
import { BandBadge, EmptyState, PageHeader, StatusBadge } from '@/components/common'
import { Button, Card, Input, Select, Skeleton, Table, Td, Th, Thead, Tr } from '@/components/ui'
import { salaryLabel, scoreColor, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PipelineBoard } from './pipeline'

const PAGE_SIZE = 50

/** localStorage key for the Table/Board view preference. */
const VIEW_PREF_KEY = 'razione-eye:opportunities:view'
type ViewMode = 'table' | 'board'

function loadViewPref(): ViewMode {
  try {
    const raw = localStorage.getItem(VIEW_PREF_KEY)
    return raw === 'board' ? 'board' : 'table'
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

export function OpportunitiesPage() {
  const navigate = useNavigate()
  const [view, setView] = useState<ViewMode>(loadViewPref)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('')
  const [band, setBand] = useState<ScoreBand | ''>('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_PREF_KEY, view)
    } catch {
      // Private mode / storage disabled — preference just won't persist.
    }
  }, [view])

  // Debounce the search box so typing doesn't thrash the query key.
  const [qInput, setQInput] = useState('')
  const qTimer = useRef<number | undefined>(undefined)
  const onSearchInput = (value: string): void => {
    setQInput(value)
    setPage(0)
    window.clearTimeout(qTimer.current)
    qTimer.current = window.setTimeout(() => setQ(value), 250)
  }

  const params = {
    q: q || undefined,
    status: status || undefined,
    band: band || undefined,
    type: 'JOB' as const,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sort: '-score',
  }

  const { data, isPending, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['opportunities', params],
    queryFn: () => listOpportunities(params),
    placeholderData: (prev) => prev,
  })

  const open = (id: string): void => void navigate(`/opportunities/${id}`)
  const total = data?.total ?? 0
  const pageStart = total === 0 ? 0 : page * PAGE_SIZE + 1
  const pageEnd = Math.min((page + 1) * PAGE_SIZE, total)
  const hasPrev = page > 0
  const hasNext = (page + 1) * PAGE_SIZE < total

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader
        title="Opportunities"
        subtitle="Career pipeline — every discovered role, ranked by match."
        actions={
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs tracking-wider text-[var(--color-muted)] tabular-nums">
              {isPending ? '…' : `${total} TOTAL`}
            </span>
            <Button size="sm" onClick={() => void navigate('/opportunities/new')}>
              <Plus className="size-3.5" />
              Add Job
            </Button>
            {/* Table / Board segmented control (persisted) */}
            <div
              role="group"
              aria-label="View mode"
              className="flex items-center gap-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
            >
              {(
                [
                  ['table', 'Table', TableViewIcon],
                  ['board', 'Board', Kanban],
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

      {view === 'board' ? (
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
      ) : data.items.length === 0 ? (
        <EmptyState
          title={q || status || band ? 'No matches' : 'Pipeline is empty'}
          hint={
            q || status || band
              ? 'Nothing matches the current filters — clear them to see the full pipeline.'
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
              {data.items.map((o) => (
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
