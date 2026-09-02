/**
 * Pipeline board (task T1.5) — drag & drop JOB pipeline (docs/02 §4.1).
 *
 * 9 progression columns (DISCOVERED → HIRED) + a visually separated TERMINAL
 * zone on the far right (REJECTED · IGNORED · NOT_SUITABLE · EXPIRED).
 *
 * - Native HTML5 drag & drop — zero new dependencies.
 * - Drop → patchOpportunityStatus with an optimistic move (rollback +
 *   toast.error on failure), then invalidate ['opportunities'] + ['dashboard'].
 * - Terminal drops (and terminal → pipeline reopens) go through a styled
 *   confirm dialog — terminal states never silently reopen (docs/02 §4).
 * - Band chips DIM non-matching cards (board stays complete); search filters.
 * - Cards: role, company, band badge + mono score, location, salary, due chip
 *   (red overdue / amber ≤48h). Click (non-drag) → /opportunities/:id.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { AlertTriangle, Ban, Search } from 'lucide-react'
import { listOpportunities, patchOpportunityStatus } from '@/api/provider'
import type { JobStatus, Opportunity, ScoreBand } from '@/api/types'
import { JOB_STATUSES, JOB_TERMINAL_STATUSES, SCORE_BANDS } from '@/api/types'
import { BandBadge, EmptyState } from '@/components/common'
import { Button, Card, Input, Skeleton, useToast } from '@/components/ui'
import { dueMeta, salaryLabel, scoreColor } from '@/lib/format'
import { cn } from '@/lib/utils'

/* ─── Board vocabulary ─────────────────────────────────────────────────────── */

type BoardStatus = JobStatus
type BoardData = { items: Opportunity[]; total: number }

/** Progression stages in order (terminals excluded). */
const PROGRESSION_STATUSES = JOB_STATUSES.filter(
  (s) => !(JOB_TERMINAL_STATUSES as readonly string[]).includes(s),
)

const BOARD_QUERY_KEY = ['opportunities', 'board'] as const
const BOARD_LIMIT = 200

function isTerminalStatus(s: string): boolean {
  return (JOB_TERMINAL_STATUSES as readonly string[]).includes(s)
}

/** Top-border accent per stage — mirrors StatusBadge tones (blue → cyan → green). */
const STAGE_ACCENT: Record<string, string> = {
  DISCOVERED: 'border-t-sky-400/50',
  ANALYZED: 'border-t-sky-400/50',
  QUALIFIED: 'border-t-cyan-400/50',
  READY_TO_APPLY: 'border-t-cyan-400/50',
  APPLIED: 'border-t-emerald-400/50',
  RECRUITER_RESPONSE: 'border-t-emerald-400/50',
  INTERVIEW: 'border-t-emerald-400/50',
  OFFER: 'border-t-emerald-400/50',
  HIRED: 'border-t-emerald-400/60',
  REJECTED: 'border-t-red-400/40',
  IGNORED: 'border-t-white/20',
  NOT_SUITABLE: 'border-t-white/20',
  EXPIRED: 'border-t-white/20',
}

const dueToneClass: Record<string, string> = {
  overdue: 'border-red-400/40 bg-red-400/10 text-red-300',
  soon: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  normal: 'border-[var(--color-border)] bg-white/[0.03] text-[var(--color-muted)]',
}

/** Active band-chip styles (mirrors BandBadge palette). */
const BAND_CHIP_ACTIVE: Record<ScoreBand, string> = {
  PRIORITY: 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]',
  APPLY: 'bg-emerald-400/15 text-emerald-300',
  REVIEW: 'bg-amber-400/15 text-amber-300',
  ARCHIVE: 'bg-white/10 text-[var(--color-text)]',
}

/* ─── Card ─────────────────────────────────────────────────────────────────── */

interface BoardCardProps {
  o: Opportunity
  dimmed: boolean
  dragging: boolean
  saving: boolean
  onOpen: (id: string) => void
  onCardDragStart: (e: DragEvent<HTMLElement>, o: Opportunity) => void
  onCardDragEnd: () => void
}

function BoardCard({ o, dimmed, dragging, saving, onOpen, onCardDragStart, onCardDragEnd }: BoardCardProps) {
  const due = o.data.next_action ? dueMeta(o.data.next_action.due) : null
  const company = o.company?.name ?? 'Unknown company'
  const role = o.data.role || o.name || 'Untitled role'

  return (
    <article
      draggable
      tabIndex={0}
      role="button"
      aria-label={`${role} at ${company}, score ${o.score ?? 'n/a'}, status ${o.status ?? 'unknown'}`}
      className={cn(
        'cursor-grab rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 text-left',
        'transition-[opacity,border-color] duration-150 outline-none',
        'hover:border-[var(--color-accent)]/40 active:cursor-grabbing',
        'focus-visible:border-[var(--color-accent)]/60 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30',
        dimmed && 'opacity-30 saturate-[0.4]',
        dragging && 'opacity-40',
        saving && 'border-[var(--color-accent)]/60 opacity-80',
      )}
      onDragStart={(e) => onCardDragStart(e, o)}
      onDragEnd={onCardDragEnd}
      onClick={() => onOpen(o.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(o.id)
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="min-w-0 truncate text-[13px] leading-5 font-semibold text-[var(--color-text)]" title={role}>
          {role}
        </h4>
        {o.score != null ? (
          <span
            className="shrink-0 font-mono text-[13px] font-semibold tabular-nums"
            style={{ color: scoreColor(o.score) }}
          >
            {o.score}
          </span>
        ) : (
          <span className="shrink-0 font-mono text-[13px] text-[var(--color-muted)]">—</span>
        )}
      </div>
      <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]" title={company}>
        {company}
      </p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <BandBadge band={o.band} />
        {o.data.location && (
          <span className="min-w-0 truncate text-[11px] text-[var(--color-muted)]">{o.data.location}</span>
        )}
      </div>
      <p className="mt-1 truncate font-mono text-[11px] text-[var(--color-muted)]">{salaryLabel(o.data)}</p>
      {due && (
        <p
          className={cn(
            'mt-1.5 inline-flex w-fit items-center rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wider',
            dueToneClass[due.tone],
          )}
        >
          {due.label}
        </p>
      )}
    </article>
  )
}

/* ─── Column ───────────────────────────────────────────────────────────────── */

interface BoardColumnProps {
  status: BoardStatus
  count: number
  loading: boolean
  slim?: boolean
  dropActive: boolean
  onDragOver: (e: DragEvent<HTMLElement>) => void
  onDragLeave: (e: DragEvent<HTMLElement>) => void
  onDrop: (e: DragEvent<HTMLElement>) => void
  children: ReactNode
}

function BoardColumn({
  status,
  count,
  loading,
  slim,
  dropActive,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: BoardColumnProps) {
  const terminal = isTerminalStatus(status)
  return (
    <section
      aria-label={`${status} column${count === 1 ? ', 1 card' : `, ${count} cards`}`}
      data-status={status}
      className={cn(
        'flex shrink-0 flex-col rounded-lg border border-t-2 border-[var(--color-border)] bg-white/[0.015] transition-colors',
        slim ? 'w-44' : 'w-60',
        STAGE_ACCENT[status] ?? 'border-t-white/20',
        dropActive && !terminal && 'bg-[var(--color-accent)]/[0.06] ring-2 ring-[var(--color-accent)]/50',
        dropActive && terminal && 'bg-red-400/[0.07] ring-2 ring-red-400/50',
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)]/60 px-2.5">
        <span
          className={cn(
            'truncate font-mono text-[10px] font-semibold tracking-[0.12em]',
            status === 'REJECTED'
              ? 'text-red-300/90'
              : terminal
                ? 'text-[var(--color-muted)]'
                : 'text-[var(--color-text)]/80',
          )}
        >
          {status}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-[var(--color-muted)] tabular-nums">
          {loading ? '…' : count}
        </span>
      </header>
      <div className="flex max-h-[calc(100vh-21rem)] min-h-24 flex-col gap-2 overflow-y-auto overscroll-contain p-2">
        {loading ? (
          <div className="flex flex-col gap-2" aria-hidden>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : count === 0 ? (
          <p className="py-6 text-center font-mono text-xs text-[var(--color-muted)]/50 select-none">—</p>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

/* ─── Terminal-confirm dialog ──────────────────────────────────────────────── */

interface PendingMove {
  id: string
  from: string
  to: BoardStatus
}

interface ConfirmMoveDialogProps {
  pending: PendingMove
  roleLabel: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Styled confirm for guarded moves: into a terminal state, or reopening a
 * terminal card back into the pipeline (docs/02 §4 — "never silently reopens").
 */
function ConfirmMoveDialog({ pending, roleLabel, busy, onConfirm, onCancel }: ConfirmMoveDialogProps) {
  const toTerminal = isTerminalStatus(pending.to)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const title = toTerminal ? `Move to ${pending.to}?` : `Reopen as ${pending.to}?`
  const body = toTerminal
    ? "Terminal states don't silently reopen — a new signal would create a new opportunity."
    : `${pending.from} is terminal — it normally stays closed; a new signal would create a new opportunity instead.`

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onMouseDown={onCancel}
    >
      <Card
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-move-title"
        className="w-full max-w-sm px-5 py-5 shadow-xl shadow-black/50"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-amber-400/40 bg-amber-400/10 text-amber-300">
            <Ban className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-move-title" className="text-sm font-semibold text-[var(--color-text)]">
              {title}
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">{body}</p>
            <p className="mt-2 truncate font-mono text-[11px] text-[var(--color-accent)]" title={roleLabel}>
              {roleLabel}
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" autoFocus onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onConfirm}
            className={
              toTerminal
                ? 'border-red-400/50 bg-red-400/10 text-red-300 hover:border-red-400/70 hover:bg-red-400/20'
                : 'border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:border-[var(--color-accent)]/70 hover:bg-[var(--color-accent)]/20'
            }
          >
            {toTerminal ? `Move to ${pending.to}` : `Reopen as ${pending.to}`}
          </Button>
        </div>
      </Card>
    </div>
  )
}

/* ─── Band chip ────────────────────────────────────────────────────────────── */

function BandChip({
  label,
  active,
  activeClass,
  onClick,
}: {
  label: string
  active: boolean
  activeClass?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-7 rounded px-2 font-mono text-[10px] tracking-wider transition-colors',
        active
          ? (activeClass ?? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]')
          : 'text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-text)]',
      )}
    >
      {label}
    </button>
  )
}

/* ─── Board ────────────────────────────────────────────────────────────────── */

interface DragInfo {
  id: string
  from: string
}

export function PipelineBoard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [band, setBand] = useState<ScoreBand | ''>('')
  const [drag, setDrag] = useState<DragInfo | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingMove | null>(null)
  /** Suppresses the click that some browsers fire right after a drag. */
  const suppressClick = useRef(false)

  // Debounced search (mirrors the table view behavior).
  const qTimer = useRef<number | undefined>(undefined)
  const onSearchInput = (value: string): void => {
    setQInput(value)
    window.clearTimeout(qTimer.current)
    qTimer.current = setTimeout(() => setQ(value), 250) as unknown as number
  }

  // Flat list — FE groups by status (mock mirrors current contract; BE board
  // grouping arrives later).
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: BOARD_QUERY_KEY,
    queryFn: () => listOpportunities({ type: 'JOB', limit: BOARD_LIMIT, sort: '-score' }),
  })

  /* ── Status mutation: optimistic move, rollback + toast on failure ── */

  const moveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: BoardStatus }) => patchOpportunityStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: BOARD_QUERY_KEY })
      const prev = queryClient.getQueryData<BoardData>(BOARD_QUERY_KEY)
      if (prev) {
        // Move the card immediately — grouping re-derives from status.
        queryClient.setQueryData<BoardData>(BOARD_QUERY_KEY, {
          ...prev,
          items: prev.items.map((o) => (o.id === id ? { ...o, status } : o)),
        })
      }
      return { prev }
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData<BoardData>(BOARD_QUERY_KEY, ctx.prev)
      toast.error('Move failed — rolled back', { description: err.message })
    },
    onSuccess: (updated) => {
      toast.success(`Moved to ${updated.status}`, { description: updated.name ?? undefined })
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  /* ── Derived: search filter + status grouping ── */

  const items = useMemo(() => data?.items ?? [], [data])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((o) =>
      [o.name, o.company?.name, o.data.role, o.data.location].some(
        (v) => typeof v === 'string' && v.toLowerCase().includes(needle),
      ),
    )
  }, [items, q])

  const grouped = useMemo(() => {
    const map = new Map<string, Opportunity[]>(JOB_STATUSES.map((s) => [s, []]))
    for (const o of visible) {
      const list = map.get(o.status ?? '')
      if (list) list.push(o)
    }
    return map
  }, [visible])

  const countFor = (status: BoardStatus): number => grouped.get(status)?.length ?? 0
  const isDimmed = (o: Opportunity): boolean => band !== '' && o.band !== band

  /* ── Drag & drop (native HTML5) ── */

  const handleCardDragStart = (e: DragEvent<HTMLElement>, o: Opportunity): void => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', o.id)
    setDrag({ id: o.id, from: o.status ?? '' })
  }

  const handleCardDragEnd = (): void => {
    suppressClick.current = true
    window.setTimeout(() => {
      suppressClick.current = false
    }, 100)
    setDrag(null)
    setOver(null)
  }
  const open = (id: string): void => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    void navigate(`/opportunities/${id}`)
  }

  const requestMove = (id: string, to: BoardStatus): void => {
    const o = data?.items.find((it) => it.id === id)
    if (!o) return
    const from = o.status ?? ''
    if (from === to) return
    // Terminal guard (docs/02 §4): confirm into terminals AND reopens out of them.
    if (isTerminalStatus(to) || isTerminalStatus(from)) {
      setPending({ id, from, to })
      return
    }
    moveMutation.mutate({ id, status: to })
  }

  const columnDragOver =
    (status: BoardStatus) =>
    (e: DragEvent<HTMLElement>): void => {
      if (!drag) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setOver((cur) => (cur === status ? cur : status))
    }

  const columnDragLeave =
    (status: BoardStatus) =>
    (e: DragEvent<HTMLElement>): void => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
        setOver((cur) => (cur === status ? null : cur))
      }
    }

  const columnDrop =
    (status: BoardStatus) =>
    (e: DragEvent<HTMLElement>): void => {
      e.preventDefault()
      setOver((cur) => (cur === status ? null : cur))
      const id = drag?.id || e.dataTransfer.getData('text/plain')
      setDrag(null)
      if (id) requestMove(id, status)
    }

  const renderCards = (status: BoardStatus): ReactNode =>
    (grouped.get(status) ?? []).map((o) => (
      <BoardCard
        key={o.id}
        o={o}
        dimmed={isDimmed(o)}
        dragging={drag?.id === o.id}
        saving={moveMutation.isPending && moveMutation.variables?.id === o.id}
        onOpen={open}
        onCardDragStart={handleCardDragStart}
        onCardDragEnd={handleCardDragEnd}
      />
    ))

  const columnNode = (status: BoardStatus, slim = false): ReactNode => (
    <BoardColumn
      key={status}
      status={status}
      count={countFor(status)}
      loading={isPending}
      slim={slim}
      dropActive={drag != null && over === status}
      onDragOver={columnDragOver(status)}
      onDragLeave={columnDragLeave(status)}
      onDrop={columnDrop(status)}
    >
      {renderCards(status)}
    </BoardColumn>
  )

  const pendingOpportunity = pending ? data?.items.find((o) => o.id === pending.id) : undefined

  /* ── Render ── */

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* Controls: search + band chips (dim, never hide) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[var(--color-muted)]" />
          <Input
            className="pl-8"
            placeholder="Search cards (role, company, location)…"
            value={qInput}
            onChange={(e) => onSearchInput(e.target.value)}
            aria-label="Search board cards"
          />
        </div>
        <div
          role="group"
          aria-label="Dim by band"
          className="flex items-center gap-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
        >
          <BandChip label="ALL" active={band === ''} onClick={() => setBand('')} />
          {SCORE_BANDS.map((b) => (
            <BandChip
              key={b}
              label={b}
              active={band === b}
              activeClass={BAND_CHIP_ACTIVE[b]}
              onClick={() => setBand(b)}
            />
          ))}
        </div>
        <span className="ml-auto font-mono text-[11px] tracking-wider text-[var(--color-muted)] tabular-nums">
          {isPending ? '…' : `${visible.length}/${data?.total ?? 0} SHOWN`}
        </span>
      </div>

      {/* Board */}
      {isError ? (
        <EmptyState
          icon={<AlertTriangle />}
          title="Board unavailable"
          hint={error?.message ?? 'Opportunities could not be loaded.'}
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        />
      ) : (
        <div className="min-w-0 overflow-x-auto pb-2">
          <div className="flex items-stretch gap-3">
            {PROGRESSION_STATUSES.map((s) => columnNode(s))}

            {/* Terminal zone — visually separated, drops confirm first */}
            <div className="flex shrink-0 gap-3 border-l-2 border-dashed border-[var(--color-border)] pl-3">
              <div className="flex flex-col gap-2">
                <div
                  className="flex h-9 items-center gap-1.5"
                  title="Terminal states never silently reopen — drops ask first."
                >
                  <Ban className="size-3 text-[var(--color-muted)]" />
                  <span className="font-mono text-[10px] font-semibold tracking-[0.25em] text-[var(--color-muted)]">
                    TERMINAL
                  </span>
                </div>
                <div className="flex gap-3">{JOB_TERMINAL_STATUSES.map((s) => columnNode(s, true))}</div>
              </div>
            </div>
          </div>
          <p className="mt-2 font-mono text-[10px] tracking-wider text-[var(--color-muted)]/60 select-none">
            DRAG CARDS BETWEEN STAGES · TERMINAL DROPS CONFIRM FIRST · CLICK A CARD FOR DETAIL
          </p>
        </div>
      )}

      {/* Terminal / reopen confirm */}
      {pending && (
        <ConfirmMoveDialog
          pending={pending}
          roleLabel={pendingOpportunity ? `${pendingOpportunity.data.role} @ ${pendingOpportunity.company?.name ?? '—'}` : pending.id}
          busy={moveMutation.isPending}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            moveMutation.mutate({ id: pending.id, status: pending.to })
            setPending(null)
          }}
        />
      )}
    </div>
  )
}

export default PipelineBoard
