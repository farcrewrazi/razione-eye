/**
 * Signals — the triage inbox (docs/01 §6 module 4).
 *
 * Inbox-style list: type badge + source chip + observed_at relative +
 * content preview (line-clamped) + disposition StatusBadge.
 * Manual signal entry (T1.12 preview) + promote/dismiss row actions.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowUpRight, ChevronDown, Inbox, Plus, X } from 'lucide-react'
import { createSignal, listSignals, updateSignalDisposition } from '@/api/provider'
import type { Signal, SignalDisposition, SignalSource, SignalType } from '@/api/types'
import { SIGNAL_DISPOSITIONS, SIGNAL_TYPES } from '@/api/types'
import { EmptyState, PageHeader, StatusBadge } from '@/components/common'
import { Badge, Button, Card, Input, Select, Skeleton, Textarea, useToast } from '@/components/ui'
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

function NewSignalPanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [form, setForm] = useState<NewSignalForm>({
    signal_type: 'JOB_POSTING',
    source: 'manual',
    content: '',
    url: '',
  })

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

/* ─── Inbox row ─────────────────────────────────────────────────────────────── */

function SignalRow({ s, onDisposition }: {
  s: Signal
  onDisposition: (id: string, disposition: SignalDisposition) => void
}) {
  const isNew = s.status === 'NEW'
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
  const [disposition, setDisposition] = useState<SignalDisposition | ''>('')
  const [signalType, setSignalType] = useState<SignalType | ''>('')
  const [formOpen, setFormOpen] = useState(false)

  const params = {
    disposition: disposition || undefined,
    signal_type: signalType || undefined,
    limit: 100,
  }
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['signals', params],
    queryFn: () => listSignals(params),
    placeholderData: (prev) => prev,
  })

  const dispositionMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: SignalDisposition }) =>
      updateSignalDisposition(id, next),
    onSuccess: (s) => {
      if (s.status === 'PROMOTED') {
        toast.success('Promoted to opportunity', {
          description: 'Full promote flow (typed payload + graph edges) arrives in Phase 1.',
        })
      } else {
        toast.info(`Signal ${String(s.status).toLowerCase()}`, {
          description: s.name ?? 'Signal updated.',
        })
      }
      void queryClient.invalidateQueries({ queryKey: ['signals'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err) => {
      toast.error('Disposition change failed', { description: err.message })
    },
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const newCount = items.filter((s) => s.status === 'NEW').length

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Signals"
        subtitle="Raw detections awaiting triage — promote or dismiss."
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
          {isPending ? '…' : `${total} TOTAL`}
          {!isPending && disposition === 'NEW' ? ` · ${newCount} AWAITING TRIAGE` : ''}
        </span>
      </div>

      <NewSignalPanel open={formOpen} onToggle={() => setFormOpen((o) => !o)} />

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
          title={disposition || signalType ? 'No matches' : 'Inbox is clear'}
          hint={
            disposition || signalType
              ? 'Nothing matches the current filters — clear them to see the full inbox.'
              : 'New detections from the scouts and manual entries will land here.'
          }
        />
      ) : (
        <Card className={cn('divide-y divide-[var(--color-border)]/50 overflow-hidden')}>
          {items.map((s) => (
            <SignalRow
              key={s.id}
              s={s}
              onDisposition={(id, next) => dispositionMutation.mutate({ id, next })}
            />
          ))}
        </Card>
      )}
    </div>
  )
}

export default SignalsPage
