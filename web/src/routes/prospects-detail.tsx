/**
 * Prospect detail — EYE-6 stub. Identity + the pitch-relevant payload
 * (score/band/segment/agentic fit, fit reason, sub-scores, source) so a row
 * click lands somewhere real; the full pitch workspace is EYE-7.
 */

import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { AlertTriangle, ArrowLeft, ExternalLink, MapPin, Sparkles } from 'lucide-react'
import { getOpportunity } from '@/api/provider'
import type { ApiNode, CompanyData } from '@/api/types'
import { EmptyState } from '@/components/common'
import { Badge, Button, Card, Skeleton } from '@/components/ui'
import { scoreColor } from '@/lib/format'
import { ProspectBandBadge } from './prospects'

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]">{label}</span>
      <div className="text-sm text-[var(--color-text)]">{children}</div>
    </div>
  )
}

export function ProspectDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: opp, isPending, isError, error, refetch } = useQuery({
    queryKey: ['opportunity', id],
    queryFn: () => getOpportunity(id!),
    enabled: id != null,
  })

  if (!id) {
    return <EmptyState title="Missing prospect id" hint="Navigate from the prospects table." />
  }

  if (isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    )
  }

  if (isError || !opp) {
    return (
      <EmptyState
        icon={<AlertTriangle />}
        title="Prospect unavailable"
        hint={error?.message ?? `No prospect with id ${id}.`}
        action={
          <div className="flex items-center gap-2">
            <Link to="/prospects">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="size-3.5" />
                Back to prospects
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

  const d = opp.data
  // The linked COMPANY node rides along as a graph neighbor (belongs_to edge).
  const company = opp.neighbors.find((n): n is ApiNode<CompanyData> => n.type === 'COMPANY')

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link
          to="/prospects"
          className="inline-flex w-fit items-center gap-1.5 font-mono text-[11px] tracking-wider text-[var(--color-muted)] transition-colors hover:text-[var(--color-accent)]"
        >
          <ArrowLeft className="size-3" />
          PROSPECTS
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider">
                {opp.opportunity_type ?? '—'}
              </Badge>
              {d.band && <ProspectBandBadge band={d.band} />}
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider">
                {opp.status ?? '—'}
              </Badge>
            </div>
            <h1 className="mt-2 truncate text-xl font-semibold tracking-tight text-[var(--color-text)]">
              {(d.company as string | undefined) ?? opp.name ?? 'Unnamed prospect'}
            </h1>
            <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
              <MapPin className="size-3 shrink-0" />
              {[company?.data.location, d.segment].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
          {opp.score != null && (
            <span
              className="font-mono text-2xl font-semibold tabular-nums"
              style={{ color: scoreColor(opp.score) }}
              title="Opportunity score"
            >
              {opp.score}
            </span>
          )}
        </div>
      </div>

      {/* Pitch payload */}
      <Card className="grid grid-cols-1 gap-x-6 divide-y divide-[var(--color-border)]/60 sm:grid-cols-2 sm:divide-y-0">
        <div className="divide-y divide-[var(--color-border)]/60">
          <InfoItem label="SEGMENT">{d.segment ?? '—'}</InfoItem>
          <InfoItem label="AGENTIC FIT">
            <span className="font-mono tabular-nums">{d.agentic_fit ?? '—'}</span>
          </InfoItem>
          <InfoItem label="SUB-SCORES">
            {d.sub_scores ? (
              <span className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs tabular-nums">
                {Object.entries(d.sub_scores).map(([k, v]) => (
                  <span key={k}>
                    <span className="text-[var(--color-muted)]">{k.replace(/_/g, ' ')}</span> {v ?? '—'}
                  </span>
                ))}
              </span>
            ) : (
              '—'
            )}
          </InfoItem>
        </div>
        <div className="divide-y divide-[var(--color-border)]/60">
          <InfoItem label="SOURCE">
            {d.source_url ? (
              <a
                href={d.source_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[var(--color-accent)] underline decoration-[var(--color-accent)]/30 underline-offset-2 hover:decoration-[var(--color-accent)]"
              >
                <span className="max-w-56 truncate">{d.source_url}</span>
                <ExternalLink className="size-3 shrink-0" />
              </a>
            ) : (
              '—'
            )}
          </InfoItem>
          <InfoItem label="SUGGESTED AGENTIC OFFER">{d.suggested_agentic_offer ?? '—'}</InfoItem>
          <InfoItem label="WEBSITE">
            {company?.data.website ? (
              <a
                href={company.data.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[var(--color-accent)] underline decoration-[var(--color-accent)]/30 underline-offset-2 hover:decoration-[var(--color-accent)]"
              >
                <span className="max-w-56 truncate">{company.data.website}</span>
                <ExternalLink className="size-3 shrink-0" />
              </a>
            ) : (
              '—'
            )}
          </InfoItem>
        </div>
      </Card>

      {/* Fit reason */}
      <div className="flex flex-col gap-2">
        <h2 className="font-mono text-[10px] font-semibold tracking-[0.25em] text-[var(--color-muted)]">
          WHY THIS PROSPECT
        </h2>
        <Card className="px-4 py-3 text-sm leading-6 text-[var(--color-text)]/90">
          {d.fit_reason ?? 'No fit reason recorded.'}
        </Card>
      </div>

      <Card
        className="flex items-center gap-2 border-[var(--color-accent)]/30 bg-[var(--color-accent)]/[0.04] px-4 py-3"
      >
        <Sparkles className="size-3.5 shrink-0 text-[var(--color-accent)]" />
        <p className="text-xs text-[var(--color-muted)]">
          Pitch workspace — teaser drafting, outreach preparation, reply tracking — lands here in EYE-7.
        </p>
      </Card>
    </div>
  )
}

export default ProspectDetailPage
