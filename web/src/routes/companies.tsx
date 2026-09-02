/**
 * Companies — the company graph as a responsive card grid (docs/01 §6 module 5).
 *
 * Each card: name, industry + size, stack chips, location, ai_culture_notes
 * as subtle lines, website link. Click → /companies/:id detail.
 */

import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { AlertTriangle, Building2, ExternalLink, MapPin, Search, Sparkles } from 'lucide-react'
import { listCompanies } from '@/api/provider'
import type { Company } from '@/api/types'
import { EmptyState, PageHeader } from '@/components/common'
import { Badge, Button, Card, Input, Skeleton } from '@/components/ui'
import { cn } from '@/lib/utils'

/* ─── Card ──────────────────────────────────────────────────────────────────── */

function CompanyCard({ c, onOpen }: { c: Company; onOpen: (id: string) => void }) {
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

export function CompaniesPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')

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

  const open = (id: string): void => void navigate(`/companies/${id}`)
  const items = data?.items ?? []
  const total = data?.total ?? 0

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Companies"
        subtitle="Companies in the graph with linked opportunities."
        actions={
          <span className="font-mono text-xs tracking-wider text-[var(--color-muted)] tabular-nums">
            {isPending ? '…' : `${total} TOTAL`}
          </span>
        }
      />

      {/* Search */}
      <div className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[var(--color-muted)]" />
        <Input
          className="pl-8"
          placeholder="Search company, industry, location…"
          value={qInput}
          onChange={(e) => onSearchInput(e.target.value)}
          aria-label="Search companies"
        />
      </div>

      {/* Grid */}
      {isPending ? (
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
          title={q ? 'No matches' : 'No companies yet'}
          hint={
            q
              ? 'Nothing matches the search — clear it to see the full graph.'
              : 'Companies appear here once discovered by the scouts.'
          }
        />
      ) : (
        <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3', data?.items !== undefined && 'transition-opacity')}>
          {items.map((c) => (
            <CompanyCard key={c.id} c={c} onOpen={open} />
          ))}
        </div>
      )}
    </div>
  )
}

export default CompaniesPage
