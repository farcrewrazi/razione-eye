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

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
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
  MessageSquarePlus,
  Plus,
  Radio,
  ShieldCheck,
  StickyNote,
  Upload,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import {
  appendOpportunityNote,
  createGateAction,
  getOpportunity,
  getOpportunityEvents,
  patchOpportunity,
  patchOpportunityStatus,
} from '@/api/provider'
import type { Event, EventType, Matching, Note, OpportunityDetail } from '@/api/types'
import { JOB_STATUSES, JOB_TERMINAL_STATUSES } from '@/api/types'
import { BandBadge, EmptyState, ScoreBar, ScoreDial, StatusBadge } from '@/components/common'
import { EyeBadge } from '@/components/eye/EyeBadge'
import { Badge, Button, Card, Input, Select, Skeleton, Textarea, useToast } from '@/components/ui'
import { eyeForOpportunityType } from '@/lib/eyes'
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

/* ─── Dimensions — company vs role split (contract §2 [W3], T1.3.3) ─────────── */

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * The Job Analyst scores companies separately from roles (doc 02 §2.2 / §5).
 * `data.dimensions` is optional (hand-written + pre-analysis jobs lack it), so
 * we fall back to averaging the available sub-scores before giving up — the
 * split is still meaningful and the section never blocks on the new field.
 */
function resolveDimensions(o: OpportunityDetail): { role: number | null; company: number | null } {
  const d = num(o.data.dimensions?.role_dimension)
  const c = num(o.data.dimensions?.company_dimension)
  if (d != null || c != null) return { role: d, company: c }

  const m = o.data.matching
  if (!m) return { role: null, company: null }
  const avg = (...values: Array<number | undefined>): number | null => {
    const present = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    return present.length === 0 ? null : Math.round(present.reduce((a, b) => a + b, 0) / present.length)
  }
  return {
    role: avg(m.role_match, m.salary, m.career_upside),
    company: avg(m.company_match, m.ai_culture, m.location),
  }
}

function DimensionBar({
  label,
  hint,
  value,
  accent,
}: {
  label: string
  hint: string
  value: number | null
  accent: string
}) {
  const v = value == null ? null : Math.max(0, Math.min(100, value))
  const color = v == null ? 'var(--color-muted)' : accent
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs tracking-wide text-[var(--color-text)]/85">{label}</span>
        <span className="font-mono text-sm font-semibold tabular-nums" style={{ color }}>
          {v ?? '—'}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-white/5"
        role="meter"
        aria-valuenow={v ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} dimension`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${v ?? 0}%`, backgroundColor: color, opacity: v == null ? 0.3 : 1 }}
        />
      </div>
      <p className="text-[10px] leading-4 text-[var(--color-muted)]/70">{hint}</p>
    </div>
  )
}

function DimensionSplit({ o }: { o: OpportunityDetail }) {
  const { role, company } = resolveDimensions(o)
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <DimensionBar
        label="Role dimension"
        hint="Role match · Salary · Career upside"
        value={role}
        accent="var(--color-accent)"
      />
      <DimensionBar
        label="Company dimension"
        hint="Company match · AI culture · Location"
        value={company}
        accent="#a78bfa"
      />
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
  const due = d.next_action?.due ? dueMeta(d.next_action.due) : null
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
        {/* [W4] applied-date tracking (T1.8) — stamped by the Action Gate on approve. */}
        {d.applied_date && (
          <InfoItem label="APPLIED DATE">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-3.5 text-emerald-300/70" />
              {formatDateOnly(d.applied_date)}
            </span>
          </InfoItem>
        )}
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

/* ─── Application tracking (T1.8-FE) ───────────────────────────────────────── */

/** Date-only local YYYY-MM-DD. */
function toDateInputValue(isoDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return isoDate.slice(0, 10)
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Follow-up windows: reminder chip copy for post-application stages. */
const STAGE_REMINDERS: Array<{ status: string; label: string }> = [
  { status: 'APPLIED', label: 'Follow up if no reply in 7 days' },
  { status: 'RECRUITER_RESPONSE', label: 'Reply within 48h — recruiters go cold fast' },
  { status: 'INTERVIEW', label: 'Prep notes + send a thank-you after each round' },
  { status: 'OFFER', label: 'Respond + negotiate before the deadline' },
]

function ApplicationTrackingCard({ o }: { o: OpportunityDetail }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [appliedDate, setAppliedDate] = useState<string>(() => toDateInputValue(o.data.applied_date ?? ''))
  const [logText, setLogText] = useState('')
  const [logStatus, setLogStatus] = useState<string>(
    o.status === 'APPLIED' ? 'RECRUITER_RESPONSE' : 'INTERVIEW',
  )

  /** Best-effort follow-up due date from next_action (analyst/gate sets it). */
  const followUpDue = o.data.next_action?.due ?? null
  const reminder = STAGE_REMINDERS.find((r) => r.status === o.status)

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['opportunity', o.id] })
    void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    void queryClient.invalidateQueries({ queryKey: ['brief'] })
  }

  // Keep the input in sync when the node changes elsewhere (e.g. gate approve).
  useEffect(() => {
    setAppliedDate(toDateInputValue(o.data.applied_date ?? ''))
  }, [o.data.applied_date])

  /** Applied-date setter — PATCH data.applied_date (W4 field, T1.8). Setting only:
   *  the gate stamps the canonical date on approve; the contract PATCH merges
   *  data, so empty = no change (clearing isn't expressible in the merge). */
  const saveAppliedDate = useMutation({
    mutationFn: () => {
      if (appliedDate === '') throw new Error('Pick a date first')
      return patchOpportunity(o.id, { data: { applied_date: appliedDate } })
    },
    onSuccess: (updated) => {
      toast.success('Applied date saved', {
        description: `${updated.name ?? 'Opportunity'} · ${updated.data.applied_date ?? 'cleared'}.`,
      })
      invalidate()
    },
    onError: (err) => {
      toast.error('Could not save applied date', { description: err.message })
    },
  })

  /**
   * Reply/interview logging (T1.8) — one interaction: transition the stage and
   * append a timestamped note with the summary. Replies → RECRUITER_RESPONSE
   * (when earlier), interviews → INTERVIEW (when earlier).
   */
  const logInteraction = useMutation({
    mutationFn: async () => {
      const text = logText.trim()
      const stamp = new Date().toISOString().slice(0, 10)
      const note = text !== '' ? `${stamp} · ${logStatus === 'RECRUITER_RESPONSE' ? 'Reply' : 'Interview'} — ${text}` : `${stamp} · ${logStatus === 'RECRUITER_RESPONSE' ? 'Recruiter reply logged' : 'Interview logged'}`
      await appendOpportunityNote(o.id, note)
      const stageIdx = (s: string): number => JOB_STATUSES.indexOf(s as (typeof JOB_STATUSES)[number])
      if (
        logStatus === 'RECRUITER_RESPONSE' &&
        (stageIdx(o.status ?? 'DISCOVERED') < stageIdx('RECRUITER_RESPONSE'))
      ) {
        await patchOpportunityStatus(o.id, 'RECRUITER_RESPONSE')
      } else if (
        logStatus === 'INTERVIEW' &&
        stageIdx(o.status ?? 'DISCOVERED') < stageIdx('INTERVIEW')
      ) {
        await patchOpportunityStatus(o.id, 'INTERVIEW')
      }
    },
    onSuccess: () => {
      toast.success('Interaction logged', { description: 'Note added and stage updated.' })
      setLogText('')
      invalidate()
      void queryClient.invalidateQueries({ queryKey: ['opportunity-events', o.id] })
    },
    onError: (err) => {
      toast.error('Could not log interaction', { description: err.message })
    },
  })

  const dateDirty = appliedDate !== '' && appliedDate !== toDateInputValue(o.data.applied_date ?? '')

  return (
    <Card className="flex flex-col gap-3 px-4 pt-4 pb-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[10px] font-semibold tracking-[0.25em] text-[var(--color-muted)]">
          APPLICATION TRACKING
        </h2>
        <Badge variant="outline" className="font-mono text-[9px] tracking-[0.15em]">
          T1.8
        </Badge>
      </div>

      {/* Follow-up reminder — visible whenever the stage has a follow-up norm. */}
      {(reminder || followUpDue) && (
        <div
          className={cn(
            'flex flex-wrap items-center gap-2 rounded-md border px-3 py-2',
            followUpDue && dueMeta(followUpDue).tone === 'overdue'
              ? 'border-red-400/40 bg-red-400/10 text-red-300'
              : 'border-amber-400/30 bg-amber-400/[0.07] text-amber-300',
          )}
        >
          <CalendarClock className="size-3.5 shrink-0" />
          <span className="text-xs leading-5">
            {followUpDue
              ? `${dueMeta(followUpDue).label.replace(/^overdue · /, 'Overdue — ')} · ${reminder?.label ?? 'follow up scheduled'}`
              : (reminder?.label ?? '')}
          </span>
        </div>
      )}

      {/* Applied-date setter */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]">
            APPLIED DATE
          </span>
          <Input
            type="date"
            value={appliedDate}
            onChange={(e) => setAppliedDate(e.target.value)}
            aria-label="Applied date"
            disabled={saveAppliedDate.isPending}
            className="w-44"
          />
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={!dateDirty || saveAppliedDate.isPending}
          onClick={() => saveAppliedDate.mutate()}
          className="mb-0.5"
        >
          <CalendarClock className="size-3.5" />
          {saveAppliedDate.isPending ? 'Saving…' : 'Save date'}
        </Button>
      </div>

      {/* Reply / interview logging */}
      <div className="flex flex-col gap-2 border-t border-[var(--color-border)]/60 pt-3">
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]">
            LOG REPLY / INTERVIEW
          </span>
          <Textarea
            rows={2}
            value={logText}
            onChange={(e) => setLogText(e.target.value)}
            placeholder="e.g. Daniel replied — technical chat Thursday 3pm"
            aria-label="Interaction summary"
            disabled={logInteraction.isPending}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && logText.trim() !== '') {
                logInteraction.mutate()
              }
            }}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={logStatus}
            onChange={(e) => setLogStatus(e.target.value)}
            aria-label="Interaction type"
            className="w-48"
            disabled={logInteraction.isPending}
          >
            <option value="RECRUITER_RESPONSE">Recruiter reply</option>
            <option value="INTERVIEW">Interview</option>
          </Select>
          <Button
            size="sm"
            onClick={() => logInteraction.mutate()}
            disabled={logInteraction.isPending}
          >
            <MessageSquarePlus className="size-3.5" />
            {logInteraction.isPending ? 'Logging…' : 'Log interaction'}
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

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

/** "2026-09-02" → "Sep 2, 2026" (graceful fallback). */
function formatDateOnly(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */

export function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
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

  // Action Gate draft (T1.11) — submit this opportunity's apply action. The
  // gate page is the only place an application is actually approved (T1.9-FE).
  const submitToGate = useMutation({
    mutationFn: () =>
      createGateAction({ action_type: 'apply_to_job', payload: { opportunity_id: id! } }),
    onSuccess: (action) => {
      toast.success('Draft submitted to the Action Gate', {
        description: `${action.summary} — approve or edit it in the gate.`,
      })
      void queryClient.invalidateQueries({ queryKey: ['gate-actions'] })
      void queryClient.invalidateQueries({ queryKey: ['gate-pending'] })
      void queryClient.invalidateQueries({ queryKey: ['brief'] })
      void navigate('/gate')
    },
    onError: (err) => {
      toast.error('Could not submit to the gate', { description: err.message })
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
              {/* Owning eye (T1.13) — deep links always render regardless of focus. */}
              <EyeBadge eye={eyeForOpportunityType(o.opportunity_type)} />
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

      {/* Pipeline stepper + gate hand-off */}
      <Card className="px-4 py-4">
        <StatusStepper
          current={o.status ?? 'DISCOVERED'}
          onChange={(s) => statusMutation.mutate(s)}
          disabled={statusMutation.isPending}
        />
        {/* T1.11 hand-off — the apply action itself only goes out through the gate. */}
        {!JOB_TERMINAL_STATUSES.includes(o.status as (typeof JOB_TERMINAL_STATUSES)[number]) &&
          o.status !== 'APPLIED' && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--color-border)]/60 pt-3">
              <Button
                size="sm"
                variant="outline"
                disabled={submitToGate.isPending}
                onClick={() => submitToGate.mutate()}
              >
                <ShieldCheck className="size-3.5" />
                {submitToGate.isPending ? 'Submitting…' : 'Send to Action Gate'}
              </Button>
              <span className="font-mono text-[10px] tracking-wider text-[var(--color-muted)]/70">
                DRAFTS AN APPLY ACTION — NOTHING SENDS WITHOUT YOUR APPROVAL
              </span>
            </div>
          )}
      </Card>

      {/* Breakdown + info */}
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-4">
          <Card className="px-4 pt-4 pb-4">
            <h2 className="mb-4 font-mono text-[10px] font-semibold tracking-[0.25em] text-[var(--color-muted)]">
              MATCHING BREAKDOWN
            </h2>
            <MatchingBreakdown matching={o.data.matching} />
            {/* Company-vs-role split (doc 02 §2.2) — only when scoring exists. */}
            {(o.data.matching != null || o.data.dimensions != null) && (
              <div className="mt-5 border-t border-[var(--color-border)]/60 pt-4">
                <h3 className="mb-3 font-mono text-[10px] font-semibold tracking-[0.25em] text-[var(--color-muted)]">
                  COMPANY VS ROLE
                </h3>
                <DimensionSplit o={o} />
              </div>
            )}
          </Card>
          <InfoGrid o={o} />
        </div>

        <div className="flex flex-col gap-4">
          <ApplicationTrackingCard o={o} />
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
