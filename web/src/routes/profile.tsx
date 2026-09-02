/**
 * Razi Profile (T0.8-FE) — the single PERSON node edit form.
 *
 * Reached from the AppShell top-bar "R" avatar button (not a sidebar module).
 * Form (TanStack Query load + mutation): full name, seniority, salary band
 * (RM/month), location, skills + AI culture prefs (chip inputs), Save/Reset,
 * last-saved `updated_at` caption.
 *
 * Side card: "Score target" — a read-only mirror of the profile exactly as
 * the Job Analyst agent sees it when scoring opportunities.
 */

import { useEffect, useState, type KeyboardEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, BrainCircuit, MapPin, RotateCcw, Save, Sparkles, UserRound, Wallet } from 'lucide-react'
import { getProfile, putProfile } from '@/api/provider'
import type { Person } from '@/api/types'
import { EmptyState } from '@/components/common'
import { Badge, Button, Card, Input, Select, Skeleton, useToast } from '@/components/ui'
import { formatDateTime, salaryLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

const SENIORITY_OPTIONS = ['Junior', 'Mid', 'Senior', 'Lead', 'Principal'] as const

/* ─── Form state ───────────────────────────────────────────────────────────── */

interface ProfileForm {
  full_name: string
  seniority: string
  salary_min: string
  salary_max: string
  location: string
  skills: string[]
  ai_culture_prefs: string[]
}

function formFromProfile(p: Person): ProfileForm {
  return {
    full_name: p.data.full_name ?? '',
    seniority: p.data.seniority ?? '',
    salary_min: p.data.salary_min != null ? String(p.data.salary_min) : '',
    salary_max: p.data.salary_max != null ? String(p.data.salary_max) : '',
    location: p.data.location ?? '',
    skills: p.data.skills ?? [],
    ai_culture_prefs: p.data.ai_culture_prefs ?? [],
  }
}

/* ─── Chip input (type + Enter adds; × removes) ────────────────────────────── */

function ChipInput({
  id,
  label,
  values,
  onChange,
  placeholder,
  disabled,
}: {
  id: string
  label: string
  values: string[]
  onChange: (next: string[]) => void
  placeholder: string
  disabled?: boolean
}) {
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
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]">
        {label}
      </label>
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
              disabled={disabled}
              onClick={() => onChange(values.filter((v) => v !== chip))}
              className="rounded-sm text-[var(--color-muted)] transition-colors hover:bg-white/10 hover:text-[var(--color-text)] disabled:opacity-50"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={add}
          placeholder={values.length === 0 ? placeholder : ''}
          disabled={disabled}
          aria-label={`${label} — type and press Enter to add`}
          className="min-w-24 flex-1 bg-transparent text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]/60 disabled:cursor-not-allowed"
        />
      </div>
      <p className="text-[11px] text-[var(--color-muted)]/70">Type and press Enter to add.</p>
    </div>
  )
}

/* ─── Field row wrapper ────────────────────────────────────────────────────── */

function Field({ label, htmlFor, children, hint }: {
  label: string
  htmlFor: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-[var(--color-muted)]/70">{hint}</p>}
    </div>
  )
}

/* ─── Score-target summary card (read-only, as the Job Analyst sees it) ─────── */

function ScoreTargetCard({ profile }: { profile: Person }) {
  const d = profile.data
  const skills = d.skills ?? []
  const prefs = d.ai_culture_prefs ?? []
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <BrainCircuit className="size-4 text-[var(--color-accent)]" strokeWidth={1.75} />
        <h2 className="font-mono text-[10px] font-semibold tracking-[0.25em] text-[var(--color-muted)]">
          SCORE TARGET
        </h2>
      </div>
      <p className="text-xs leading-5 text-[var(--color-muted)]">
        How the Job Analyst sees you when scoring opportunities — read-only view of the saved profile.
      </p>
      <div className="mt-1 flex flex-col gap-2.5 text-sm">
        <div className="flex items-center gap-2">
          <UserRound className="size-3.5 shrink-0 text-[var(--color-muted)]" />
          <span className="text-[var(--color-text)]">{d.full_name || '—'}</span>
          {d.seniority && <Badge variant="accent" className="font-mono text-[10px]">{d.seniority}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Wallet className="size-3.5 shrink-0 text-[var(--color-muted)]" />
          <span className="font-mono text-[13px] text-[var(--color-text)]">
            {salaryLabel({ salary_min: d.salary_min, salary_max: d.salary_max })}
            <span className="text-[var(--color-muted)]"> /month</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="size-3.5 shrink-0 text-[var(--color-muted)]" />
          <span className="text-[var(--color-text)]">{d.location || '—'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 shrink-0 text-[var(--color-muted)]" />
          <span className="text-[var(--color-text)]">
            <span className="font-mono tabular-nums">{skills.length}</span> skill{skills.length === 1 ? '' : 's'}
            <span className="text-[var(--color-muted)]"> · </span>
            <span className="font-mono tabular-nums">{prefs.length}</span> AI-culture pref{prefs.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-[var(--color-border)]/60 pt-3">
          {skills.map((s) => (
            <Badge key={s} variant="muted" className="font-mono text-[10px]">
              {s}
            </Badge>
          ))}
        </div>
      )}
      {prefs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {prefs.map((p) => (
            <Badge key={p} variant="outline" className="text-[10px]">
              {p}
            </Badge>
          ))}
        </div>
      )}
    </Card>
  )
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */

export function ProfilePage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: profile, isPending, isError, error, refetch } = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
  })

  const [form, setForm] = useState<ProfileForm | null>(null)
  // Hydrate form once per loaded profile (id + updated_at → new snapshot).
  useEffect(() => {
    if (profile) setForm(formFromProfile(profile))
  }, [profile])

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!form) throw new Error('Form not ready')
      const min = form.salary_min === '' ? undefined : Number(form.salary_min)
      const max = form.salary_max === '' ? undefined : Number(form.salary_max)
      if (min !== undefined && Number.isNaN(min)) throw new Error('Salary min must be a number')
      if (max !== undefined && Number.isNaN(max)) throw new Error('Salary max must be a number')
      if (min !== undefined && max !== undefined && min > max) {
        throw new Error('Salary min must not exceed salary max')
      }
      return putProfile({
        full_name: form.full_name.trim(),
        seniority: form.seniority || undefined,
        salary_min: min,
        salary_max: max,
        location: form.location.trim() || undefined,
        skills: form.skills,
        ai_culture_prefs: form.ai_culture_prefs,
      })
    },
    onSuccess: (updated) => {
      toast.success('Profile saved', { description: `${updated.data.full_name} — updated just now.` })
      void queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
    onError: (err) => {
      toast.error('Could not save profile', { description: err.message })
    },
  })

  if (isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Skeleton className="h-96 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    )
  }

  if (isError || !profile) {
    return (
      <EmptyState
        icon={<AlertTriangle />}
        title="Profile unavailable"
        hint={error?.message ?? 'Could not load the Razi profile.'}
        action={
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        }
      />
    )
  }

  const dirty = form !== null && JSON.stringify(form) !== JSON.stringify(formFromProfile(profile))
  const set = (patch: Partial<ProfileForm>): void => setForm((f) => (f ? { ...f, ...patch } : f))

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--color-text)]">Razi Profile</h1>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            The PERSON node every matching score is computed against.
            {profile.updated_at && (
              <>
                {' '}Last saved <span className="font-mono text-[11px] tabular-nums">{formatDateTime(profile.updated_at)}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setForm(formFromProfile(profile))}
            disabled={!dirty || saveMutation.isPending}
          >
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending}>
            <Save className="size-3.5" />
            {saveMutation.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        {/* Form */}
        <Card className="flex flex-col gap-5 p-4">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="FULL NAME" htmlFor="profile-full-name">
              <Input
                id="profile-full-name"
                value={form?.full_name ?? ''}
                onChange={(e) => set({ full_name: e.target.value })}
                placeholder="Farcrew Razi"
                disabled={saveMutation.isPending}
              />
            </Field>
            <Field label="SENIORITY" htmlFor="profile-seniority">
              <Select
                id="profile-seniority"
                value={form?.seniority ?? ''}
                onChange={(e) => set({ seniority: e.target.value })}
                disabled={saveMutation.isPending}
              >
                <option value="">—</option>
                {SENIORITY_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="SALARY MIN (RM/MONTH)" htmlFor="profile-salary-min">
              <Input
                id="profile-salary-min"
                type="number"
                min={0}
                step={100}
                inputMode="numeric"
                value={form?.salary_min ?? ''}
                onChange={(e) => set({ salary_min: e.target.value })}
                placeholder="12000"
                disabled={saveMutation.isPending}
              />
            </Field>
            <Field label="SALARY MAX (RM/MONTH)" htmlFor="profile-salary-max">
              <Input
                id="profile-salary-max"
                type="number"
                min={0}
                step={100}
                inputMode="numeric"
                value={form?.salary_max ?? ''}
                onChange={(e) => set({ salary_max: e.target.value })}
                placeholder="16000"
                disabled={saveMutation.isPending}
              />
            </Field>
            <Field label="LOCATION" htmlFor="profile-location">
              <Input
                id="profile-location"
                value={form?.location ?? ''}
                onChange={(e) => set({ location: e.target.value })}
                placeholder="Cyberjaya"
                disabled={saveMutation.isPending}
              />
            </Field>
          </div>
          <ChipInput
            id="profile-skills"
            label="SKILLS"
            values={form?.skills ?? []}
            onChange={(skills) => set({ skills })}
            placeholder="TypeScript, Node.js, …"
            disabled={saveMutation.isPending}
          />
          <ChipInput
            id="profile-ai-prefs"
            label="AI CULTURE PREFERENCES"
            values={form?.ai_culture_prefs ?? []}
            onChange={(ai_culture_prefs) => set({ ai_culture_prefs })}
            placeholder="AI-assisted development, vibe coding, …"
            disabled={saveMutation.isPending}
          />
        </Card>

        {/* Score target (read-only mirror) */}
        <ScoreTargetCard profile={profile} />
      </div>
    </div>
  )
}

export default ProfilePage
