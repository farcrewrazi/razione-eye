/**
 * Opportunity detail (docs/01 §6 module 2 · docs/02 §2.1).
 *
 * Header (role @ company, badges, score dial, back link) over:
 *   - Pipeline stepper (9 JOB stages + terminals) with a status Select
 *     wired to patchOpportunityStatus → toast + invalidate.
 *   - Matching breakdown — the six sub-scores as labeled bars ("—" when missing).
 *   - Info grid — location, salary, source, url, next action (due highlighted),
 *     contact.
 *   - Notes — both `string` and `{text, created_at}` forms + inline "Add note"
 *     (POST /notes [W2]) with optimistic append.
 *   - Activity log — timeline (vertical line, dots) of events from
 *     GET /opportunities/:id/events [W2], icon per event type, relative
 *     timestamps, newest first, capped at 20 with "show all" toggle.
 *   - Graph neighbors — edges as chips, COMPANY neighbors link to /companies/:id.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  CalendarClock,
  Download,
  ExternalLink,
  FilePlus2,
  Mail,
  MapPin,
  Plus,
  Radio,
  ShieldCheck,
  StickyNote,
  Upload,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { appendOpportunityNote, getOpportunity, getOpportunityEvents, patchOpportunityStatus } from '@/api/provider'
import type { Event, EventType, Matching, Note, OpportunityDetail } from '@/api/types'
import { JOB_STATUSES, JOB_TERMINAL_STATUSES } from '@/api/types'
import { BandBadge, EmptyState, ScoreBar, ScoreDial, StatusBadge } from '@/components/common'
import { Badge, Button, Card, Select, Skeleton, Textarea, useToast } from '@/components/ui'
import { dueMeta, formatDateTime, humanizeToken, salaryLabel, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

/* ─── Pipeline stepper ─────────────────────────────────────────────────────── */

function StatusStepper({ current, onChange, disabled }: {
  current: string
  onChange: (status: string) => void
  disabled?: boolean
}) {
  const stages = JOB_STATUSES.filter((s) => !(JOB_TERMINAL_STATUSES as readonly string[]).includes(s))
  const currentIndex = stages.indexOf(current as (typeof stages)[number])
  const terminal = JOB_TERMINAL_STATUSES.includes(current as (typeof JOB_TERMINAL_STATUSES)[number])
    ? current
    : null

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex items-center gap-1 overflow-x-auto pb-1"
        role="progressbar"
        aria-valuenow={currentIndex + 1}
        aria-valuemin={1}
        aria-valuemax={stages.length}
        aria-label="Pipeline stage"
      >
        {stages.map((s, i) => {
          const done = !terminal && i < currentIndex
          const active = !terminal && i === currentIndex
          return (
            <div key={s} className="flex shrink-0 items-center">
              {i > 0 && (
                <span
                  className={cn(
                    'h-px w-4',
                    !terminal && i <= currentIndex ? 'bg-[var(--color-accent)]/50' : 'bg-[var(--color-border)]',
                  )}
                />
              )}
              <span
                className={cn(
                  'rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wider whitespace-nowrap transition-colors',
                  active && 'border-[var(--color-accent)]/60 bg-[var(--color-accent)]/15 text-[var(--color-accent)]',
                  done && 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300/90',
                  !active && !done && 'border-[var(--color-border)] bg-white/[0.03] text-[var(--color-muted)]',
                )}
                aria-current={active ? 'step' : undefined}
              >
                {done ? '✓ ' : ''}
                {s}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]" htmlFor="status-select">
          MOVE TO
        </label>
        <Select
          id="status-select"
          className="w-52"
          value={current}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          <optgroup label="Pipeline">
            {stages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </optgroup>
          <optgroup label="Terminal">
            {JOB_TERMINAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </optgroup>
        </Select>
        {terminal && (
          <Badge variant="danger" className="font-mono text-[10px] tracking-wider">
            TERMINAL — {terminal}
          </Badge>
        )}
      </div>
    </div>
  )
}

/* ─── Matching breakdown ───────────────────────────────────────────────────── */

const MATCHING_LABELS: Array<[keyof Matching, string]> = [
  ['role_match', 'Role match'],
  ['company_match', 'Company match'],
  ['ai_culture', 'AI culture'],
  ['location', 'Location'],
  ['salary', 'Salary'],
  ['career_upside', 'Career upside'],
]

function MatchingBreakdown({ matching }: { matching?: Matching }) {
  return (
    <div className="flex flex-col gap-4">
      {MATCHING_LABELS.map(([key, label]) => (
        <ScoreBar key={key} label={label} value={matching?.[key] ?? null} />
      ))}
    </div>
  )
}

/* ─── Info grid ────────────────────────────────────────────────────────────── */

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]">{label}</span>
      <div className="text-sm text-[var(--color-text)]">{children}</div>
    </div>
  )
}

const dueToneClass: Record<string, string> = {
  overdue: 'text-red-300 border-red-400/40 bg-red-400/10',
  soon: 'text-amber-300 border-amber-400/40 bg-amber-400/10',
  normal: 'text-[var(--color-text)]',
}

function InfoGrid({ o }: { o: OpportunityDetail }) {
  const d = o.data
  const due = d.next_action ? dueMeta(d.next_action.due) : null
  return (
    <Card className="grid grid-cols-1 gap-x-6 divide-y divide-[var(--color-border)]/60 sm:grid-cols-2 sm:divide-y-0">
      <div className="divide-y divide-[var(--color-border)]/60">
        <InfoItem label="LOCATION">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5 text-[var(--color-muted)]" />
            {d.location ?? '—'}
          </span>
        </InfoItem>
        <InfoItem label="SALARY">
          <span className="inline-flex items-center gap-1.5 font-mono text-[13px]">
            <Wallet className="size-3.5 text-[var(--color-muted)]" />
            {salaryLabel(d)}
          </span>
        </InfoItem>
        <InfoItem label="SOURCE">
          <span className="font-mono text-xs">{o.source ?? '—'}</span>
        </InfoItem>
        <InfoItem label="URL">
          {d.url ? (
            <a
              href={d.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[var(--color-accent)] underline decoration-[var(--color-accent)]/30 underline-offset-2 hover:decoration-[var(--color-accent)]"
            >
              <span className="max-w-56 truncate">{d.url}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
          ) : (
            '—'
          )}
        </InfoItem>
      </div>
      <div className="divide-y divide-[var(--color-border)]/60">
        <InfoItem label="NEXT ACTION">
          {d.next_action ? (
            <div className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="size-3.5 text-[var(--color-muted)]" />
                {humanizeToken(d.next_action.type)}
              </span>
              <span
                className={cn(
                  'inline-flex w-fit items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[11px] tracking-wider',
                  dueToneClass[due?.tone ?? 'normal'],
                )}
              >
                {due?.label ?? '—'}
              </span>
            </div>
          ) : (
            '—'
          )}
        </InfoItem>
        <InfoItem label="CONTACT">
          {d.contact ? (
            <div className="flex flex-col gap-1">
              {d.contact.recruiter && (
                <span className="inline-flex items-center gap-1.5">
                  <UserRound className="size-3.5 text-[var(--color-muted)]" />
                  {d.contact.recruiter}
                </span>
              )}
              {d.contact.linkedin && (
                <a
                  href={d.contact.linkedin}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[var(--color-accent)] underline decoration-[var(--color-accent)]/30 underline-offset-2 hover:decoration-[var(--color-accent)]"
                >
                  <span className="max-w-56 truncate">{d.contact.linkedin}</span>
                  <ExternalLink className="size-3 shrink-0" />
                </a>
              )}
              {d.contact.email && (
                <a
                  href={`mailto:${d.contact.email}`}
                  className="inline-flex items-center gap-1.5 text-[var(--color-accent)] underline decoration-[var(--color-accent)]/30 underline-offset-2 hover:decoration-[var(--color-accent)]"
                >
                  <Mail className="size-3.5 shrink-0" />
                  {d.contact.email}
                </a>
              )}
              {!d.contact.recruiter && !d.contact.linkedin && !d.contact.email && '—'}
            </div>
          ) : (
            '—'
          )}
        </InfoItem>
        <InfoItem label="DISCOVERED">
          <span className="font-mono text-xs">{formatDateTime(o.created_at)}</span>
        </InfoItem>
        <InfoItem label="LAST UPDATE">
          <span className="font-mono text-xs">{formatDateTime(o.updated_at)}</span>
        </InfoItem>
      </div>
    </Card>
  )
}

/* ─── Notes ────────────────────────────────────────────────────────────────── */

function NoteItem({ note }: { note: Note }) {
  const text = typeof note === 'string' ? note : note.text
  const at = typeof note === 'string' ? null : note.created_at
  return (
    <li className="flex items-baseline gap-2.5 py-1.5 text-sm leading-5 text-[var(--color-text)]/90">
      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--color-accent)]/60" aria-hidden />
      <span className="min-w-0 flex-1">{text}</span>
      {at && (
        <span className="shrink-0 font-mono text-[10px] text-[var(--color-muted)] tabular-nums">
          {formatDateTime(at)}
        </span>
      )}
    </li>
  )
}

/* ─── Notes (list + inline add [W2]) ──────────────────────────────────────── */

function NotesCard({ o }: { o: OpportunityDetail }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [draft, setDraft] = useState('')

  const addNoteMutation = useMutation({
    mutationFn: (text: string) => appendOpportunityNote(o.id, text),
    onSuccess: () => {
      setDraft('')
      void queryClient.invalidateQueries({ queryKey: ['opportunity', o.id] })
      void queryClient.invalidateQueries({ queryKey: ['opportunity-events', o.id] })
    },
    onError: (err) => {
      toast.error('Could not add note', { description: err.message })
    },
  })

  const submit = (): void => {
    const text = draft.trim()
    if (!text) {
      toast.error('Note text required', { description: 'Write something before adding.' })
      return
    }
    addNoteMutation.mutate(text)
  }

  return (
    <Card className="flex flex-col gap-3 px-4 pt-4 pb-4">
      <h2 className="font-mono text-[10px] font-semibold tracking-[0.25em] text-[var(--color-muted)]">
        NOTES
      </h2>
      {o.notes.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)]">No notes yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]/40">
          {o.notes.map((note, i) => (
            <NoteItem key={i} note={note} />
          ))}
        </ul>
      )}
      {/* Inline add (optimistic via invalidate on success) */}
      <div className="flex flex-col gap-2 border-t border-[var(--color-border)]/60 pt-3">
        <Textarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note…"
          aria-label="New note"
          disabled={addNoteMutation.isPending}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-[var(--color-muted)]/70">⌘/Ctrl + Enter</span>
          <Button size="sm" onClick={submit} disabled={addNoteMutation.isPending || draft.trim() === ''}>
            {addNoteMutation.isPending ? 'Adding…' : 'Add note'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

/* ─── Activity log timeline [W2] ──────────────────────────────────────────── */

const EVENT_META: Record<string, { icon: LucideIcon; label: string }> = {
  opportunity_imported: { icon: Download, label: 'Imported' },
  opportunity_created: { icon: Plus, label: 'Created' },
  status_changed: { icon: ArrowRight, label: 'Status' },
  note_added: { icon: StickyNote, label: 'Note' },
  signal_created: { icon: Radio, label: 'Signal' },
  signal_promoted: { icon: Radio, label: 'Promoted' },
  signal_dismissed: { icon: Radio, label: 'Dismissed' },
  agent_run: { icon: Bot, label: 'Agent run' },
  import_run: { icon: Upload, label: 'Import' },
  gate_decision: { icon: ShieldCheck, label: 'Gate' },
}

function EventIcon({ type }: { type: EventType | string }) {
  const meta = EVENT_META[type] ?? { icon: FilePlus2, label: 'Event' }
  const Icon = meta.icon
  const accent =
    type === 'status_changed'
      ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
      : type === 'note_added'
        ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
        : type === 'opportunity_imported' || type === 'import_run'
          ? 'border-sky-400/30 bg-sky-400/10 text-sky-300'
          : 'border-[var(--color-border)] bg-white/[0.04] text-[var(--color-muted)]'
  return (
    <span
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-full border',
        accent,
      )}
      title={meta.label}
      aria-hidden
    >
      <Icon className="size-3" strokeWidth={2} />
    </span>
  )
}

function ActivityLog({ id }: { id: string }) {
  const [showAll, setShowAll] = useState(false)
  const { data, isPending, isError } = useQuery({
    queryKey: ['opportunity-events', id],
    queryFn: () => getOpportunityEvents(id),
  })

  if (isPending) {
    return (
      <Card className="flex flex-col gap-3 px-4 pt-4 pb-4" aria-busy="true">
        <h2 className="font-mono text-[10px] font-semibold tracking-[0.25em] text-[var(--color-muted)]">
          ACTIVITY LOG
        </h2>
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </Card>
    )
  }

  if (isError || !data) {
    return (
      <Card className="px-4 pt-4 pb-4">
        <h2 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.25em] text-[var(--color-muted)]">
          ACTIVITY LOG
        </h2>
        <p className="text-xs text-[var(--color-muted)]">Activity unavailable right now.</p>
      </Card>
    )
  }

  const events: Event[] = data.items
  const CAP = 20
  const visible = showAll ? events : events.slice(0, CAP)

  return (
    <Card className="flex flex-col gap-3 px-4 pt-4 pb-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[10px] font-semibold tracking-[0.25em] text-[var(--color-muted)]">
          ACTIVITY LOG
        </h2>
        <Badge variant="outline" className="font-mono text-[9px] tracking-[0.15em]">
          {data.total} EVENT{data.total === 1 ? '' : 'S'}
        </Badge>
      </div>
      {events.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)]">No recorded activity yet.</p>
      ) : (
        <ol className="relative flex flex-col">
          {/* vertical line */}
          <span
            aria-hidden
            className="absolute top-3 bottom-3 left-3 w-px -translate-x-1/2 bg-[var(--color-border)]/80"
          />
          {visible.map((event) => (
            <li key={event.id} className="relative flex items-start gap-3 py-1.5">
              <EventIcon type={event.type} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-sm leading-5 text-[var(--color-text)]/90">{event.summary}</p>
                <p className="font-mono text-[10px] tracking-wider text-[var(--color-muted)] tabular-nums">
                  {event.type} · {timeAgo(event.at)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {events.length > CAP && (
        <Button variant="ghost" size="sm" className="w-fit" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show recent only' : `Show all ${events.length} events`}
        </Button>
      )}
    </Card>
  )
}

/* ─── Graph neighbors ──────────────────────────────────────────────────────── */

function NeighborChips({ o }: { o: OpportunityDetail }) {
  const byId = new Map(o.neighbors.map((n) => [n.id, n]))
  const chips = o.edges
    .map((e) => {
      const other = e.from_id === o.id ? e.to_id : e.from_id
      return { edge: e, node: byId.get(other) }
    })
    .filter((c): c is { edge: OpportunityDetail['edges'][number]; node: OpportunityDetail['neighbors'][number] } =>
      Boolean(c.node),
    )

  if (chips.length === 0) {
    return <p className="px-4 pb-4 text-xs text-[var(--color-muted)]">No linked nodes in the graph yet.</p>
  }

  return (
    <div className="flex flex-wrap gap-1.5 px-4 pb-4">
      {chips.map(({ edge, node }) => {
        const companyHref =
          node.type === 'COMPANY' && edge.edge_type === 'belongs_to' ? `/companies/${node.id}` : null
        const label = (
          <>
            <span className="text-[var(--color-accent)]/80">{edge.edge_type}</span>
            <span className="text-[var(--color-border)]">→</span>
            <span className="text-[var(--color-text)]/85">{node.name ?? node.id}</span>
            {node.type === 'TASK' && node.due_at && (
              <span className="text-[var(--color-muted)]">· due {formatDateTime(node.due_at)}</span>
            )}
          </>
        )
        return companyHref ? (
          <Link
            key={edge.id}
            to={companyHref}
            className="inline-flex items-center gap-1.5 rounded border border-[var(--color-border)] bg-white/[0.03] px-2 py-1 font-mono text-[11px] transition-colors hover:border-[var(--color-accent)]/50 hover:bg-[var(--color-accent)]/10"
          >
            {label}
          </Link>
        ) : (
          <span
            key={edge.id}
            className="inline-flex items-center gap-1.5 rounded border border-[var(--color-border)] bg-white/[0.03] px-2 py-1 font-mono text-[11px]"
          >
            {label}
          </span>
        )
      })}
    </div>
  )
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */

export function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: o, isPending, isError, error, refetch } = useQuery({
    queryKey: ['opportunity', id],
    queryFn: () => getOpportunity(id!),
    enabled: id != null,
  })

  const statusMutation = useMutation({
    mutationFn: (status: string) => patchOpportunityStatus(id!, status),
    onSuccess: (updated) => {
      toast.success(`Status → ${updated.status}`, { description: `${updated.name ?? 'Opportunity'} updated.` })
      void queryClient.invalidateQueries({ queryKey: ['opportunity', id] })
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err) => {
      toast.error('Status change failed', { description: err.message })
    },
  })

  if (!id) {
    return <EmptyState title="Missing opportunity id" hint="Navigate from the pipeline table." />
  }

  if (isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-36 w-full rounded-lg" />
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    )
  }

  if (isError || !o) {
    return (
      <EmptyState
        icon={<AlertTriangle />}
        title="Opportunity unavailable"
        hint={error?.message ?? `No opportunity with id ${id}.`}
        action={
          <div className="flex items-center gap-2">
            <Link to="/opportunities">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="size-3.5" />
                Back to pipeline
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link
          to="/opportunities"
          className="inline-flex w-fit items-center gap-1.5 font-mono text-[11px] tracking-wider text-[var(--color-muted)] transition-colors hover:text-[var(--color-accent)]"
        >
          <ArrowLeft className="size-3" />
          PIPELINE
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={o.status} />
              <BandBadge band={o.band} />
              {o.opportunity_type && (
                <Badge variant="outline" className="font-mono text-[10px] tracking-wider">
                  {o.opportunity_type}
                </Badge>
              )}
            </div>
            <h1 className="mt-2 truncate text-xl font-semibold tracking-tight text-[var(--color-text)]">
              {o.data.role ?? o.name}
              <span className="text-[var(--color-muted)]"> @ </span>
              <Link
                to={`/companies/${o.company?.id ?? ''}`}
                className="text-[var(--color-accent)] decoration-[var(--color-accent)]/30 underline-offset-4 hover:underline"
              >
                {o.company?.name ?? 'Unknown company'}
              </Link>
            </h1>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              {[o.data.location, salaryLabel(o.data)].filter((v) => v && v !== '—').join(' · ') || '—'}
            </p>
          </div>
          <ScoreDial value={o.score} size={96} />
        </div>
      </div>

      {/* Pipeline stepper */}
      <Card className="px-4 py-4">
        <StatusStepper
          current={o.status ?? 'DISCOVERED'}
          onChange={(s) => statusMutation.mutate(s)}
          disabled={statusMutation.isPending}
        />
      </Card>

      {/* Breakdown + info */}
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-4">
          <Card className="px-4 pt-4 pb-4">
            <h2 className="mb-4 font-mono text-[10px] font-semibold tracking-[0.25em] text-[var(--color-muted)]">
              MATCHING BREAKDOWN
            </h2>
            <MatchingBreakdown matching={o.data.matching} />
          </Card>
          <InfoGrid o={o} />
        </div>

        <div className="flex flex-col gap-4">
          <NotesCard o={o} />
          <ActivityLog id={o.id} />
          <Card className="pt-4">
            <h2 className="mb-2 px-4 font-mono text-[10px] font-semibold tracking-[0.25em] text-[var(--color-muted)]">
              GRAPH
            </h2>
            <NeighborChips o={o} />
          </Card>
        </div>
      </div>
    </div>
  )
}

export default OpportunityDetailPage
