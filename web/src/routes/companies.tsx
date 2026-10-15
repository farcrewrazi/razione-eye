/**
 * Companies — the company graph as a responsive card grid (docs/01 §6 module 5).
 *
 * Eye-scoped: Career lists employers linked to JOB opportunities, Business
 * lists pitch targets linked to WEBSITE/CONSULTANCY ones; ALL/CONTROL list
 * every company. Companies carry no eye field, so membership is derived
 * client-side from linked opportunities (`opportunityInEye`).
 *
 * Each card: name, industry + size, stack chips, location, eye-specific stat
 * row (Career: open roles / avg score; Business: opportunities / pitch score
 * + band badge), ai_culture_notes as subtle lines, website link. Click →
 * /companies/:id detail. Sort: most open roles (default) / name / avg score.
 */

import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { AlertTriangle, Building2, ExternalLink, MapPin, Search, Sparkles } from 'lucide-react'
import { listCompanies, listOpportunities } from '@/api/provider'
import { JOB_TERMINAL_STATUSES } from '@/api/types'
import type { Company, Opportunity, ScoreBand } from '@/api/types'
import { BandBadge, EmptyState, PageHeader } from '@/components/common'
import { Badge, Button, Card, Input, Select, Skeleton } from '@/components/ui'
import { useEyeFocus } from '@/hooks/useEyeFocus'
import { opportunityInEye, type EyeId } from '@/lib/eyes'
import { scoreColor } from '@/lib/format'
import { cn } from '@/lib/utils'

/* ─── Per-company stats (derived client-side) ───────────────────────────────── */

interface CompanyStats {
  /** All linked opportunities in the focused eye. */
  total: number
  /** Linked opportunities with non-terminal status. */
  open: number
  /** Mean score across scored opportunities; null when none scored. */
  avgScore: number | null
  /** Best score in the eye — the pitch score; null when none scored. */
  bestScore: number | null
  /** Band of the best-scored opportunity; null when none scored. */
  bestBand: ScoreBand | null
}

/** Pipeline stats per company id, derived from the eye-narrowed opportunities. */
function deriveCompanyStats(opportunities: Opportunity[]): Map<string, CompanyStats> {
  const acc = new Map<
    string,
    {
      total: number
      open: number
      scoreSum: number
      scored: number
      best: { score: number; band: ScoreBand } | null
    }
  >()
  for (const o of opportunities) {
    const companyId = o.data.company_id
    if (typeof companyId !== 'string') continue
    const s = acc.get(companyId) ?? { total: 0, open: 0, scoreSum: 0, scored: 0, best: null }
    s.total += 1
    if (o.status != null && !(JOB_TERMINAL_STATUSES as readonly string[]).includes(o.status)) s.open += 1
    if (o.score != null) {
      s.scoreSum += o.score
      s.scored += 1
      if (s.best === null || o.score > s.best.score) s.best = { score: o.score, band: o.band }
    }
    acc.set(companyId, s)
  }
  const out = new Map<string, CompanyStats>()
  for (const [id, s] of acc) {
    out.set(id, {
      total: s.total,
      open: s.open,
      avgScore: s.scored > 0 ? Math.round(s.scoreSum / s.scored) : null,
      bestScore: s.best?.score ?? null,
      bestBand: s.best?.band ?? null,
    })
  }
  return out
}

/* ─── Card ──────────────────────────────────────────────────────────────────── */

function CompanyCard({
  c,
  stats,
  eye,
  onOpen,
}: {
  c: Company
  stats?: CompanyStats
  eye: EyeId
  onOpen: (id: string) => void
}) {
  const d = c.data
  const meta = [d.industry, d.size].filter(Boolean).join(' · ') || '—'

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onOpen(c.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(c.id)
        }
      }}
      className={cn(
        'group flex cursor-pointer flex-col gap-3 p-4 outline-none transition-colors',
        'hover:border-[var(--color-accent)]/40 hover:bg-white/[0.02]',
        'focus-visible:border-[var(--color-accent)]/60 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
      )}
    >
      {/* Name + industry/size */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-[var(--color-text)] group-hover:text-[var(--color-accent)]">
            {c.name ?? 'Unnamed company'}
          </h3>
          <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">{meta}</p>
        </div>
        <Building2 className="size-4 shrink-0 text-[var(--color-muted)] opacity-60 transition-colors group-hover:text-[var(--color-accent)]" />
      </div>

      {/* Stack chips */}
      {d.stack && d.stack.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {d.stack.map((s) => (
            <Badge key={s} variant="outline" className="font-mono text-[10px] tracking-wide">
              {s}
            </Badge>
          ))}
        </div>
      )}

      {/* Location + website */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
        {d.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            {d.location}
          </span>
        )}
        {d.website && (
          <a
            href={d.website}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[var(--color-accent)]/80 underline decoration-[var(--color-accent)]/30 underline-offset-2 transition-colors hover:text-[var(--color-accent)] hover:decoration-[var(--color-accent)]"
          >
            website
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>

      {/* Stat row — pitch stats under Business, open roles + avg score otherwise */}
      <div className="flex items-center gap-3 border-t border-[var(--color-border)]/50 pt-2.5 text-xs">
        {eye === 'BUSINESS' ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-[var(--color-muted)]">
              <span
                className={cn(
                  'font-mono text-sm font-semibold tabular-nums',
                  stats && stats.total > 0 ? 'text-[var(--color-text)]' : 'text-[var(--color-muted)]/60',
                )}
              >
                {stats ? stats.total : '—'}
              </span>
              opps
            </span>
            <span className="inline-flex items-center gap-1.5 text-[var(--color-muted)]">
              <span
                className="font-mono text-sm font-semibold tabular-nums"
                style={stats?.bestScore != null ? { color: scoreColor(stats.bestScore) } : { color: 'var(--color-muted)' }}
              >
                {stats?.bestScore != null ? stats.bestScore : '—'}
              </span>
              pitch
            </span>
            {stats?.bestBand != null && <BandBadge band={stats.bestBand} className="ml-auto" />}
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5 text-[var(--color-muted)]">
              <span
                className={cn(
                  'font-mono text-sm font-semibold tabular-nums',
                  stats && stats.open > 0 ? 'text-[var(--color-text)]' : 'text-[var(--color-muted)]/60',
                )}
              >
                {stats ? stats.open : '—'}
              </span>
              open
            </span>
            <span className="inline-flex items-center gap-1.5 text-[var(--color-muted)]">
              <span
                className="font-mono text-sm font-semibold tabular-nums"
                style={stats?.avgScore != null ? { color: scoreColor(stats.avgScore) } : { color: 'var(--color-muted)' }}
              >
                {stats?.avgScore != null ? stats.avgScore : '—'}
              </span>
              avg
            </span>
          </>
        )}
      </div>

      {/* AI culture notes — subtle lines */}
      {d.ai_culture_notes && d.ai_culture_notes.length > 0 && (
        <div className="mt-auto flex flex-col gap-1 border-t border-[var(--color-border)]/50 pt-2.5">
          {d.ai_culture_notes.slice(0, 2).map((note) => (
            <p key={note} className="flex items-start gap-1.5 text-[11px] leading-4 text-[var(--color-muted)]">
              <Sparkles className="mt-0.5 size-3 shrink-0 text-[var(--color-accent)]/50" />
              {note}
            </p>
          ))}
        </div>
      )}
    </Card>
  )
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

/** Sort modes — default Most open. Labels adapt to the focused eye. */
type CompanySort = 'open' | 'name' | 'avg'
const SORT_LABELS: Record<CompanySort, string> = {
  open: 'Most open roles',
  name: 'Name (A–Z)',
  avg: 'Highest avg score',
}
const BUSINESS_SORT_LABELS: Record<CompanySort, string> = {
  open: 'Most opportunities',
  name: 'Name (A–Z)',
  avg: 'Highest pitch score',
}

export function CompaniesPage() {
  const navigate = useNavigate()
  const { eye, def, focused } = useEyeFocus()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<CompanySort>('open')

  // Debounced search — same pattern as the pipeline table.
  const [qInput, setQInput] = useState('')
  const qTimer = useRef<number | undefined>(undefined)
  const onSearchInput = (value: string): void => {
    setQInput(value)
    window.clearTimeout(qTimer.current)
    qTimer.current = window.setTimeout(() => setQ(value), 250)
  }

  const params = { q: q || undefined, limit: 200 }
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['companies', params],
    queryFn: () => listCompanies(params),
    placeholderData: (prev) => prev,
  })

  // Opportunities source — per-company stats AND eye membership: companies
  // carry no eye field, so a company belongs to the eyes of its linked
  // opportunities. ALL / CONTROL see every type.
  const { data: jobs, isPending: jobsPending, isError: jobsError } = useQuery({
    queryKey: ['companies-stats', 'jobs'],
    queryFn: () => listOpportunities({ limit: 500 }),
    placeholderData: (prev) => prev,
  })
  const inEye = useMemo(
    () => (jobs?.items ?? []).filter((o) => opportunityInEye(o.opportunity_type, eye)),
    [jobs, eye],
  )
  const stats = useMemo(() => deriveCompanyStats(inEye), [inEye])

  // Eye-scoped membership — null disables filtering (ALL / CONTROL). On stats
  // error the graph falls back to unfiltered rather than a dead page.
  const eyeScoped = focused && eye !== 'CONTROL'
  const eyeCompanyIds = useMemo(() => {
    if (!eyeScoped || jobsError) return null
    const ids = new Set<string>()
    for (const o of inEye) {
      const companyId = o.data.company_id
      if (typeof companyId === 'string') ids.add(companyId)
    }
    return ids
  }, [eyeScoped, jobsError, inEye])

  const business = eye === 'BUSINESS'
  const open = (id: string): void => void navigate(`/companies/${id}`)
  const items = useMemo(() => {
    const list = eyeCompanyIds ? (data?.items ?? []).filter((c) => eyeCompanyIds.has(c.id)) : (data?.items ?? [])
    const sorted = [...list]
    if (sort === 'name') {
      sorted.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    } else if (sort === 'avg') {
      const score = (id: string): number => {
        const s = stats.get(id)
        return business ? (s?.bestScore ?? -1) : (s?.avgScore ?? -1)
      }
      sorted.sort((a, b) => score(b.id) - score(a.id))
    } else {
      const count = (id: string): number => {
        const s = stats.get(id)
        return business ? (s?.total ?? 0) : (s?.open ?? 0)
      }
      sorted.sort((a, b) => count(b.id) - count(a.id))
    }
    return sorted
  }, [data, sort, stats, eyeCompanyIds, business])
  const total = data?.total ?? 0

  // Hold the skeleton while membership is still loading — filtering against an
  // empty set would flash the eye's empty state before opportunities arrive.
  const showPending = isPending || (eyeScoped && jobsPending)

  const subtitle = !eyeScoped
    ? 'Companies in the graph with linked opportunities.'
    : eye === 'CAREER'
      ? 'Career Eye — employers in your job pipeline.'
      : eye === 'BUSINESS'
        ? "Business Eye — pitch targets you're pursuing."
        : `${def.label} — companies with ${def.opportunityTypes.join(' + ')} opportunities.`

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Companies"
        subtitle={subtitle}
        actions={
          <span className="font-mono text-xs tracking-wider text-[var(--color-muted)] tabular-nums">
            {showPending ? '…' : `${eyeScoped ? items.length : total} TOTAL`}
          </span>
        }
      />

      {/* Search + sort */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[var(--color-muted)]" />
          <Input
            className="pl-8"
            placeholder="Search company, industry, location…"
            value={qInput}
            onChange={(e) => onSearchInput(e.target.value)}
            aria-label="Search companies"
          />
        </div>
        <Select
          className="w-44"
          value={sort}
          onChange={(e) => setSort(e.target.value as CompanySort)}
          aria-label="Sort companies"
        >
          {(Object.keys(SORT_LABELS) as CompanySort[]).map((key) => (
            <option key={key} value={key}>
              {(business ? BUSINESS_SORT_LABELS : SORT_LABELS)[key]}
            </option>
          ))}
        </Select>
      </div>

      {/* Grid */}
      {showPending ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={<AlertTriangle />}
          title="Companies unavailable"
          hint={error?.message ?? 'Companies could not be loaded.'}
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title={q ? 'No matches' : eyeScoped ? `No ${def.shortLabel} Eye companies` : 'No companies yet'}
          hint={
            q
              ? 'Nothing matches the search — clear it to see the full graph.'
              : eyeScoped
                ? `${def.label} lists companies with ${def.opportunityTypes.join(' + ')} opportunities — reset the focus to All to see the full graph.`
                : 'Companies appear here once discovered by the scouts.'
          }
        />
      ) : (
        <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3', data?.items !== undefined && 'transition-opacity')}>
          {items.map((c) => (
            <CompanyCard key={c.id} c={c} stats={stats.get(c.id)} eye={eye} onOpen={open} />
          ))}
        </div>
      )}
    </div>
  )
}

export default CompaniesPage
