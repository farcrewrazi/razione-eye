/**
 * Manual job entry (T1.1.6-FE) — route /opportunities/new.
 *
 * Form (signals.tsx style): company + role (required), location (datalist),
 * salary, url, stack (chip input), source (select), notes, discovered date.
 * On success → toast + invalidate ['opportunities'] & ['dashboard'] →
 * navigate /opportunities/:newId. `?from_signal=<id>` prefills the notes from
 * the signal content, shows a "Creating job from signal" banner and passes
 * signal_id on submit (BE marks the signal PROMOTED with promoted_to).
 */

import { useEffect, useState, type KeyboardEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, Link2, Plus, TriangleAlert } from 'lucide-react'
import { createManualJob, getSignal } from '@/api/provider'
import { Badge, Button, Card, Input, Select, Textarea, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Sources offered in the manual-entry form. `job_portal` is a form-level
 * convenience beyond SIGNAL_SOURCES — node `source` is a free string.
 */
const MANUAL_SOURCES = [
  'manual',
  'linkedin',
  'facebook',
  'x',
  'threads',
  'careers_page',
  'google',
  'job_portal',
] as const
type ManualSource = (typeof MANUAL_SOURCES)[number]

/** Location datalist suggestions (Klang Valley tech corridor). */
const LOCATION_SUGGESTIONS = ['Cyberjaya', 'Kuala Lumpur', 'Sepang', 'Putrajaya', 'Bangi', 'Puchong']

/** Local YYYY-MM-DD for the discovered-date default. */
function todayLocal(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

interface NewJobForm {
  company: string
  role: string
  location: string
  salary: string
  url: string
  stack: string[]
  source: ManualSource
  notes: string
  discovered: string
}

const EMPTY_FORM: NewJobForm = {
  company: '',
  role: '',
  location: '',
  salary: '',
  url: '',
  stack: [],
  source: 'manual',
  notes: '',
  discovered: todayLocal(),
}

/* ─── Stack chip input (Enter adds, × removes — mirrors profile form) ───────── */

function StackInput({ values, onChange }: { values: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('')

  const add = (): void => {
    const chip = draft.trim()
    if (chip && !values.includes(chip)) onChange([...values, chip])
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
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

/* ─── Field wrapper (inline-error aware) ────────────────────────────────────── */

function Field({
  label,
  htmlFor,
  children,
  error,
  hint,
  required,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
  error?: string
  hint?: string
  required?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]">
        {label}
        {required && <span className="ml-0.5 text-[var(--color-accent)]/70">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[11px] text-red-400">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-[var(--color-muted)]/70">{hint}</p>
      ) : null}
    </div>
  )
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export function OpportunityNewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [searchParams] = useSearchParams()
  const fromSignalId = searchParams.get('from_signal') ?? undefined

  const [form, setForm] = useState<NewJobForm>(EMPTY_FORM)
  const [touched, setTouched] = useState<{ company: boolean; role: boolean; url: boolean }>({
    company: false,
    role: false,
    url: false,
  })

  // ?from_signal — fetch the signal, prefill notes + banner.
  const signalQuery = useQuery({
    queryKey: ['signal', fromSignalId],
    queryFn: () => getSignal(fromSignalId!),
    enabled: Boolean(fromSignalId),
  })
  const signal = signalQuery.data

  // Prefill once per resolved signal (content excerpt + source/url hints).
  useEffect(() => {
    if (!signal) return
    setForm((f) => {
      if (f.notes.trim() !== '' || f.company || f.role) return f // don't clobber edits
      const excerpt =
        signal.data.content.length > 200 ? `${signal.data.content.slice(0, 200)}…` : signal.data.content
      return {
        ...f,
        notes: excerpt,
        url: signal.data.url ?? f.url,
        source: (signal.source as ManualSource | null) ?? f.source,
      }
    })
  }, [signal])

  // ─── Validation ────────────────────────────────────────────────────────────
  // "Flags incomplete instead of blocking" (T1.1.4/T1.1.6): the save button is
  // always pressable; on submit we mark missing fields + toast what's missing
  // so the record is FLAGGED, never silently guessed. Only hard-invalid URL
  // syntax disables submit (it would 422 server-side anyway).
  const companyError =
    touched.company && form.company.trim() === '' ? 'Company is required' : undefined
  const roleError = touched.role && form.role.trim() === '' ? 'Role is required' : undefined
  const urlError =
    form.url.trim() !== '' && !/^https?:\/\/.+/i.test(form.url.trim())
      ? 'URL must start with http:// or https://'
      : undefined
  const missingFields = [
    ...(form.company.trim() === '' ? ['company'] : []),
    ...(form.role.trim() === '' ? ['role'] : []),
    ...(form.location.trim() === '' ? ['location'] : []),
    ...(form.salary.trim() === '' ? ['salary'] : []),
    ...(form.url.trim() === '' ? ['url'] : []),
  ]

  const createMutation = useMutation({
    mutationFn: () =>
      createManualJob({
        company: form.company.trim(),
        role: form.role.trim(),
        location: form.location.trim() || undefined,
        salary: form.salary.trim() || undefined,
        url: form.url.trim() || undefined,
        stack: form.stack.length > 0 ? form.stack : undefined,
        source: form.source,
        // Flag incomplete instead of blocking (T1.1.4/1.1.6): the gaps ride
        // along as a note so the record is visibly incomplete, never guessed.
        notes:
          [
            form.notes.trim() || null,
            missingFields.length > 0 ? `Incomplete entry — missing: ${missingFields.join(', ')}.` : null,
          ]
            .filter((n): n is string => n !== null)
            .join('\n\n') || undefined,
        discovered_at: form.discovered
          ? new Date(`${form.discovered}T00:00:00`).toISOString()
          : undefined,
        signal_id: fromSignalId,
      }),
    onSuccess: (created) => {
      toast.success('Job added to pipeline — DISCOVERED', {
        description:
          missingFields.length > 0
            ? `${created.name ?? form.role} · ${form.company.trim()} — flagged incomplete (${missingFields.join(', ')})`
            : `${created.name ?? form.role} · ${form.company.trim()}`,
      })
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      if (fromSignalId) void queryClient.invalidateQueries({ queryKey: ['signals'] })
      navigate(`/opportunities/${created.id}`)
    },
    onError: (err) => {
      toast.error('Could not add job', { description: err.message })
    },
  })

  const set = (patch: Partial<NewJobForm>): void => setForm((f) => ({ ...f, ...patch }))
  const companyTrim = form.company.trim()
  const roleTrim = form.role.trim()

  const locationDatalistId = 'new-job-locations'
  const submitLabel = createMutation.isPending ? 'Adding…' : 'Add job to pipeline'

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--color-text)]">Add Job</h1>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            Manual JOB entry — lands in the pipeline as{' '}
            <span className="font-mono text-[11px] tracking-wider">DISCOVERED</span>.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void navigate('/opportunities')}>
          <ArrowLeft className="size-3.5" />
          Back to pipeline
        </Button>
      </div>

      {/* From-signal banner */}
      {fromSignalId && (
        <Card className="flex items-center gap-2.5 border-[var(--color-accent)]/30 bg-[var(--color-accent)]/[0.06] px-4 py-3">
          <Link2 className="size-4 shrink-0 text-[var(--color-accent)]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--color-text)]">Creating job from signal</p>
            {signalQuery.isPending ? (
              <p className="text-xs text-[var(--color-muted)]">Loading signal…</p>
            ) : signalQuery.isError ? (
              <p className="text-xs text-red-400">
                Signal could not be loaded — {signalQuery.error?.message ?? 'unknown error'}. The job
                will still be created without the link.
              </p>
            ) : (
              <p className="truncate text-xs text-[var(--color-muted)]">
                {signal?.name ?? fromSignalId} — it will be marked{' '}
                <Badge variant="accent" className="font-mono text-[9px] tracking-wider">
                  PROMOTED
                </Badge>{' '}
                on submit.
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Incomplete flag — the record can still be saved (never blocked, never guessed) */}
      {!fromSignalId && missingFields.length > 0 && (
        <Card className="flex items-start gap-2.5 border-amber-400/30 bg-amber-400/[0.06] px-4 py-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--color-text)]">
              Incomplete entry — missing: <span className="font-mono text-[13px]">{missingFields.join(', ')}</span>
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              You can still save it. The gaps are flagged as a note on the opportunity, never guessed.
            </p>
          </div>
        </Card>
      )}

      {/* Form */}
      <Card className="flex flex-col gap-5 p-4">
        <datalist id={locationDatalistId}>
          {LOCATION_SUGGESTIONS.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="COMPANY" htmlFor="new-job-company" error={companyError} required>
            <Input
              id="new-job-company"
              value={form.company}
              onChange={(e) => set({ company: e.target.value })}
              onBlur={() => setTouched((t) => ({ ...t, company: true }))}
              placeholder="ABC Technology"
              aria-required
              aria-invalid={companyError ? true : undefined}
              className={companyError ? 'border-red-400/60' : undefined}
              disabled={createMutation.isPending}
            />
          </Field>
          <Field label="ROLE" htmlFor="new-job-role" error={roleError} required>
            <Input
              id="new-job-role"
              value={form.role}
              onChange={(e) => set({ role: e.target.value })}
              onBlur={() => setTouched((t) => ({ ...t, role: true }))}
              placeholder="Senior Full-Stack Engineer"
              aria-required
              aria-invalid={roleError ? true : undefined}
              className={roleError ? 'border-red-400/60' : undefined}
              disabled={createMutation.isPending}
            />
          </Field>
          <Field label="LOCATION" htmlFor="new-job-location">
            <Input
              id="new-job-location"
              list={locationDatalistId}
              value={form.location}
              onChange={(e) => set({ location: e.target.value })}
              placeholder="Cyberjaya"
              disabled={createMutation.isPending}
            />
          </Field>
          <Field label="SALARY" htmlFor="new-job-salary">
            <Input
              id="new-job-salary"
              value={form.salary}
              onChange={(e) => set({ salary: e.target.value })}
              placeholder="RM12k-RM16k"
              disabled={createMutation.isPending}
            />
          </Field>
          <Field label="URL" htmlFor="new-job-url" error={urlError}>
            <Input
              id="new-job-url"
              type="url"
              value={form.url}
              onChange={(e) => {
                set({ url: e.target.value })
                setTouched((t) => ({ ...t, url: true }))
              }}
              placeholder="https://…"
              aria-invalid={urlError ? true : undefined}
              className={urlError ? 'border-red-400/60' : undefined}
              disabled={createMutation.isPending}
            />
          </Field>
          <Field label="SOURCE" htmlFor="new-job-source">
            <Select
              id="new-job-source"
              value={form.source}
              onChange={(e) => set({ source: e.target.value as ManualSource })}
              disabled={createMutation.isPending}
            >
              {MANUAL_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="STACK" htmlFor="new-job-stack" hint="Type and press Enter to add.">
          <StackInput values={form.stack} onChange={(stack) => set({ stack })} />
        </Field>

        <Field label="NOTES" htmlFor="new-job-notes">
          <Textarea
            id="new-job-notes"
            rows={4}
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Where you saw it, who to contact, why it's interesting…"
            disabled={createMutation.isPending}
          />
        </Field>

        <Field label="DISCOVERED DATE" htmlFor="new-job-discovered">
          <Input
            id="new-job-discovered"
            type="date"
            value={form.discovered}
            onChange={(e) => set({ discovered: e.target.value })}
            disabled={createMutation.isPending}
          />
        </Field>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)]/60 pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void navigate('/opportunities')}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setTouched({ company: true, role: true, url: true })
              if (companyTrim === '') {
                toast.error('Company required', { description: 'Which company is hiring?' })
                return
              }
              if (roleTrim === '') {
                toast.error('Role required', { description: 'What role is being hired for?' })
                return
              }
              if (urlError) {
                toast.error('Invalid URL', { description: urlError })
                return
              }
              createMutation.mutate()
            }}
            disabled={urlError !== undefined || createMutation.isPending}
          >
            <Plus className="size-3.5" />
            {submitLabel}
          </Button>
        </div>
      </Card>
    </div>
  )
}

export default OpportunityNewPage
