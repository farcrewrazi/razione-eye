/**
 * Signals — the triage inbox (docs/01 §6 module 4).
 *
 * Inbox-style list: type badge + source chip + observed_at relative +
 * content preview (line-clamped) + disposition StatusBadge.
 * Manual signal entry (T1.12 preview) + promote/dismiss row actions.
 * Promote opens the promote dialog (T1.12) → JOB opportunity (DISCOVERED);
 * PROMOTED rows link to the created opportunity.
 */

import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { AlertTriangle, ArrowUpRight, ChevronDown, Inbox, Plus, X } from 'lucide-react'
import { createSignal, listSignals, promoteSignal, updateSignalDisposition } from '@/api/provider'
import type { PromoteSignalData, Signal, SignalDisposition, SignalSource, SignalType } from '@/api/types'
import { SIGNAL_DISPOSITIONS, SIGNAL_TYPES } from '@/api/types'
import { EmptyState, PageHeader, StatusBadge } from '@/components/common'
import { Badge, Button, Card, Input, Select, Skeleton, Textarea, useToast } from '@/components/ui'
import { useEyeFocus } from '@/hooks/useEyeFocus'
import { CONTROL_SIGNAL_TYPES } from '@/lib/eyes'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Sources offered in the manual-entry form (T1.12 preview). */
const MANUAL_SOURCES: SignalSource[] = [
  'linkedin',
  'facebook',
  'x',
  'threads',
  'careers_page',
  'google',
  'comments',
  'rams_gem',
  'manual',
]

/** Tone per signal type — distinct hues per enum value. */
const typeTone: Record<SignalType, string> = {
  JOB_POSTING: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  SOCIAL_POST: 'border-violet-400/30 bg-violet-400/10 text-violet-300',
  COMMENT: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300',
  BUSINESS_DISCOVERY: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  GEM_CALL: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
}

function SignalTypeBadge({ type }: { type: SignalType }) {
  return (
    <Badge className={cn('border font-mono text-[10px] tracking-wider', typeTone[type])}>{type}</Badge>
  )
}

/* ─── Manual entry form (T1.12 preview) ─────────────────────────────────────── */

interface NewSignalForm {
  signal_type: SignalType
  source: SignalSource
  content: string
  url: string
}

function NewSignalPanel({
  open,
  onToggle,
  defaultType,
}: {
  open: boolean
  onToggle: () => void
  /** Focused-eye default (JOB_POSTING for Career, GEM_CALL for Signal, …). */
  defaultType: SignalType
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [form, setForm] = useState<NewSignalForm>({
    signal_type: defaultType,
    source: 'manual',
    content: '',
    url: '',
  })

  // Track the eye default when the panel is opened under a different focus.
  useEffect(() => {
    if (open) setForm((f) => ({ ...f, signal_type: defaultType }))
  }, [open, defaultType])

  const createMutation = useMutation({
    mutationFn: () =>
      createSignal({
        data: {
          signal_type: form.signal_type,
          content: form.content.trim(),
          url: form.url.trim() || undefined,
          observed_at: new Date().toISOString(),
        },
        status: 'NEW',
        source: form.source,
      }),
    onSuccess: () => {
      toast.success('Signal captured', {
        description: `${form.signal_type} from ${form.source} — awaiting triage.`,
      })
      setForm((f) => ({ ...f, content: '', url: '' }))
      onToggle()
      void queryClient.invalidateQueries({ queryKey: ['signals'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err) => {
      toast.error('Could not capture signal', { description: err.message })
    },
  })

  const submit = (): void => {
    if (!form.content.trim()) {
      toast.error('Content required', { description: 'Paste or describe the signal content.' })
      return
    }
    createMutation.mutate()
  }

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
          <Plus className="size-4 text-[var(--color-accent)]" />
          Manual Signal Entry
        </span>
        <span className="inline-flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[9px] tracking-[0.15em]">
            T1.12 PREVIEW
          </Badge>
          <ChevronDown
            className={cn('size-4 text-[var(--color-muted)] transition-transform', open && 'rotate-180')}
          />
        </span>
      </button>
      {open && (
        <form
          className="flex flex-col gap-3 border-t border-[var(--color-border)]/60 px-4 py-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="grid gap-3 md:grid-cols-[12rem_10rem_1fr]">
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]">TYPE</span>
              <Select
                value={form.signal_type}
                onChange={(e) => setForm((f) => ({ ...f, signal_type: e.target.value as SignalType }))}
                aria-label="Signal type"
              >
                {SIGNAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]">SOURCE</span>
              <Select
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value as SignalSource }))}
                aria-label="Signal source"
              >
                {MANUAL_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]">
                URL (OPTIONAL)
              </span>
              <Input
                type="url"
                placeholder="https://…"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                aria-label="Signal URL"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]">CONTENT</span>
            <Textarea
              rows={3}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="Paste the post, comment, job ad, or what you observed…"
              aria-label="Signal content"
            />
          </label>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onToggle}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Capturing…' : 'Capture signal'}
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

/* ─── Promote dialog (T1.12) ─────────────────────────────────────────────────── */

/** Location datalist suggestions (Klang Valley tech corridor). */
const LOCATION_SUGGESTIONS = ['Cyberjaya', 'Kuala Lumpur', 'Sepang', 'Putrajaya', 'Bangi', 'Puchong']

/** First http(s) URL found anywhere in the content, else ''. */
function firstUrl(content: string): string {
  return content.match(/https?:\/\/[^\s)]+/i)?.[0] ?? ''
}

/**
 * Best-effort company/role extraction from the first content line:
 * "Acme Corp — Senior Engineer" or "Acme Corp  Senior Engineer" splits at the
 * first `—`/`–`/`-`/`|`/double-space; no separator → whole line is the company.
 */
function parseFirstLine(content: string): { company: string; role: string } {
  const firstLine = content.split('\n', 1)[0]?.trim() ?? ''
  if (!firstLine) return { company: '', role: 'Untitled role' }
  const m = firstLine.split(/\s+—\s+|\s+–\s+|\s+-\s+|\s+\|\s+|\s{2,}/)
  const company = (m[0] ?? '').trim()
  const role = m.length > 1 && (m[1] ?? '').trim() ? (m[1] ?? '').trim() : 'Untitled role'
  return { company, role: role || 'Untitled role' }
}

interface PromoteForm {
  company: string
  role: string
  location: string
  salary: string
  url: string
  stack: string[]
  notes: string
}

/** Prefill from the signal content, best-effort. */
function prefilledForm(s: Signal): PromoteForm {
  const { company, role } = parseFirstLine(s.data.content)
  return {
    company,
    role,
    location: '',
    salary: '',
    url: s.data.url ?? firstUrl(s.data.content),
    stack: [],
    notes: s.data.content,
  }
}

/* ─── Stack chip input (Enter adds, × removes — mirrors opportunities-new) ───── */

function StackInput({ values, onChange }: { values: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('')

  const add = (): void => {
    const chip = draft.trim()
    if (chip && !values.includes(chip)) onChange([...values, chip])
    setDraft('')
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      add()
    } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1))
    }
  }

  return (
    <div
      className={cn(
        'flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5',
        'transition-colors focus-within:border-[var(--color-accent)]/60 focus-within:ring-2 focus-within:ring-[var(--color-accent)]/20',
      )}
    >
      {values.map((chip) => (
        <span
          key={chip}
          className="inline-flex items-center gap-1 rounded border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/10 px-1.5 py-0.5 text-xs text-[var(--color-text)]/90"
        >
          {chip}
          <button
            type="button"
            aria-label={`Remove ${chip}`}
            onClick={() => onChange(values.filter((v) => v !== chip))}
            className="rounded-sm text-[var(--color-muted)] transition-colors hover:bg-white/10 hover:text-[var(--color-text)]"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={add}
        placeholder={values.length === 0 ? 'Node.js, TypeScript, …' : ''}
        aria-label="Tech stack — type and press Enter to add"
        className="min-w-24 flex-1 bg-transparent text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]/60"
      />
    </div>
  )
}

/* ─── Field wrapper ──────────────────────────────────────────────────────────── */

function Field({
  label,
  htmlFor,
  children,
  required,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
  required?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]">
        {label}
        {required && <span className="ml-0.5 text-[var(--color-accent)]/70">*</span>}
      </label>
      {children}
    </div>
  )
}

function PromoteDialog({ signal, onClose }: { signal: Signal; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [form, setForm] = useState<PromoteForm>(() => prefilledForm(signal))

  // Escape closes (Cancel button + backdrop click also close).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (patch: Partial<PromoteForm>): void => setForm((f) => ({ ...f, ...patch }))

  const promoteMutation = useMutation({
    mutationFn: () => {
      const data: PromoteSignalData = {
        company: form.company.trim() || undefined,
        role: form.role.trim() || undefined,
        location: form.location.trim() || undefined,
        salary: form.salary.trim() || undefined,
        url: form.url.trim() || undefined,
        stack: form.stack.length > 0 ? form.stack : undefined,
        notes: form.notes.trim() || undefined,
      }
      return promoteSignal(signal.id, data)
    },
    onSuccess: (result) => {
      toast.success('Promoted to opportunity', {
        description: `${result.opportunity.name ?? form.role.trim()} · DISCOVERED`,
      })
      void queryClient.invalidateQueries({ queryKey: ['signals'] })
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
    onError: (err) => {
      toast.error('Promotion failed', { description: err.message })
    },
  })

  const valid = form.company.trim() !== '' && form.role.trim() !== ''
  const locationDatalistId = 'promote-locations'

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="promote-dialog-title"
        className="my-auto w-full max-w-xl px-5 py-5 shadow-xl shadow-black/50"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="promote-dialog-title" className="text-sm font-semibold text-[var(--color-text)]">
              Promote signal → opportunity
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <SignalTypeBadge type={signal.data.signal_type} />
              {signal.source && (
                <Badge variant="outline" className="font-mono text-[10px] tracking-wide">
                  {signal.source}
                </Badge>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid && !promoteMutation.isPending) promoteMutation.mutate()
          }}
        >
          <datalist id={locationDatalistId}>
            {LOCATION_SUGGESTIONS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="COMPANY" htmlFor="promote-company" required>
              <Input
                id="promote-company"
                value={form.company}
                onChange={(e) => set({ company: e.target.value })}
                placeholder="ABC Technology"
                aria-required
                disabled={promoteMutation.isPending}
              />
            </Field>
            <Field label="ROLE" htmlFor="promote-role" required>
              <Input
                id="promote-role"
                value={form.role}
                onChange={(e) => set({ role: e.target.value })}
                placeholder="Senior Full-Stack Engineer"
                aria-required
                disabled={promoteMutation.isPending}
              />
            </Field>
            <Field label="LOCATION" htmlFor="promote-location">
              <Input
                id="promote-location"
                list={locationDatalistId}
                value={form.location}
                onChange={(e) => set({ location: e.target.value })}
                placeholder="Cyberjaya"
                disabled={promoteMutation.isPending}
              />
            </Field>
            <Field label="SALARY" htmlFor="promote-salary">
              <Input
                id="promote-salary"
                value={form.salary}
                onChange={(e) => set({ salary: e.target.value })}
                placeholder="RM12k-RM16k"
                disabled={promoteMutation.isPending}
              />
            </Field>
          </div>

          <Field label="URL" htmlFor="promote-url">
            <Input
              id="promote-url"
              type="url"
              value={form.url}
              onChange={(e) => set({ url: e.target.value })}
              placeholder="https://…"
              disabled={promoteMutation.isPending}
            />
          </Field>

          <Field label="STACK" htmlFor="promote-stack">
            <StackInput values={form.stack} onChange={(stack) => set({ stack })} />
          </Field>

          <Field label="NOTES" htmlFor="promote-notes">
            <Textarea
              id="promote-notes"
              rows={4}
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Context, who to contact, why it's interesting…"
              disabled={promoteMutation.isPending}
            />
          </Field>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)]/60 pt-4">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={promoteMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!valid || promoteMutation.isPending}>
              <ArrowUpRight className="size-3.5" />
              {promoteMutation.isPending ? 'Promoting…' : 'Promote'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

/* ─── Inbox row ─────────────────────────────────────────────────────────────── */

function SignalRow({ s, onDisposition }: {
  s: Signal
  onDisposition: (id: string, disposition: SignalDisposition) => void
}) {
  const isNew = s.status === 'NEW'
  const isPromoted = s.status === 'PROMOTED' && Boolean(s.data.promoted_to)
  const hasUrl = Boolean(s.data.url)

  return (
    <div
      className={cn(
        'flex flex-col gap-2 px-4 py-3 transition-colors',
        isNew ? 'bg-transparent' : 'opacity-70',
        'hover:bg-white/[0.02]',
      )}
    >
      {/* Line 1 — type · source · observed · disposition · actions */}
      <div className="flex flex-wrap items-center gap-2">
        <SignalTypeBadge type={s.data.signal_type} />
        {s.source && (
          <Badge variant="outline" className="font-mono text-[10px] tracking-wide">
            {s.source}
          </Badge>
        )}
        <span className="font-mono text-[11px] tracking-wider text-[var(--color-muted)] tabular-nums">
          {timeAgo(s.data.observed_at)}
        </span>
        <span className="ml-auto inline-flex items-center gap-2">
          <StatusBadge status={s.status} />
          {isNew && (
            <>
              <Button
                variant="outline"
                size="sm"
                title="Promote to opportunity"
                onClick={() => onDisposition(s.id, 'PROMOTED')}
              >
                <ArrowUpRight className="size-3.5" />
                Promote
              </Button>
              <Button
                variant="ghost"
                size="sm"
                title="Dismiss signal"
                onClick={() => onDisposition(s.id, 'DISMISSED')}
              >
                <X className="size-3.5" />
                Dismiss
              </Button>
            </>
          )}
          {isPromoted && (
            <Link
              to={`/opportunities/${s.data.promoted_to}`}
              title="Open the promoted opportunity"
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs whitespace-nowrap',
                'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
                'transition-colors hover:border-emerald-400/60 hover:bg-emerald-400/20',
                'outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/60',
              )}
            >
              <ArrowUpRight className="size-3.5" />
              opportunity
            </Link>
          )}
        </span>
      </div>

      {/* Line 2 — content preview */}
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-[13px] leading-5 text-[var(--color-text)]/90 line-clamp-2">{s.data.content}</p>
        {hasUrl && (
          <a
            href={s.data.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit max-w-full items-center gap-1 truncate font-mono text-[11px] text-[var(--color-accent)]/70 underline decoration-[var(--color-accent)]/30 underline-offset-2 transition-colors hover:text-[var(--color-accent)] hover:decoration-[var(--color-accent)]"
          >
            <span className="truncate">{s.data.url}</span>
          </a>
        )}
      </div>
    </div>
  )
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export function SignalsPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { eye, def, focused } = useEyeFocus()
  const [disposition, setDisposition] = useState<SignalDisposition | ''>('')
  const [signalType, setSignalType] = useState<SignalType | ''>('')
  const [formOpen, setFormOpen] = useState(false)
  /** Signal queued for the promote dialog (T1.12). */
  const [promoting, setPromoting] = useState<Signal | null>(null)

  /*
   * Eye filter (T1.13): eyes with signal types seed the type filter — the
   * backend is asked for them plus the ops types (SOCIAL_POST / COMMENT) that
   * stay visible in every eye. Manual `signal_type` selection overrides.
   */
  const defaultType = focused && def.signalTypes.length > 0 ? def.signalTypes[0] : 'JOB_POSTING'
  const eyeTypes = focused && def.signalTypes.length > 0 ? def.signalTypes : null
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
      <PageHeader
        title="Signals"
        subtitle={
          focused
            ? `${def.label} detections${eyeTypes ? ` — ${eyeTypes.join(' + ')}` : ''} — promote or dismiss.`
            : 'Raw detections awaiting triage — promote or dismiss.'
        }
        actions={
          <Button size="sm" variant={formOpen ? 'outline' : 'default'} onClick={() => setFormOpen((o) => !o)}>
            <Plus className="size-3.5" />
            Capture Signal
          </Button>
        }
      />

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
          title={disposition || signalType ? 'No matches' : focused ? `No ${def.shortLabel} Eye signals` : 'Inbox is clear'}
          hint={
            disposition || signalType
              ? 'Nothing matches the current filters — clear them to see the full inbox.'
              : focused
                ? `${def.label} detections land here — reset the focus to All for the full inbox.`
                : 'New detections from the scouts and manual entries will land here.'
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

export default SignalsPage
