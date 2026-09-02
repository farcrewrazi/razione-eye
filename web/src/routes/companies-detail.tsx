/**
 * Company detail — header + info grid + the company's opportunities
 * as a compact table (role · score · band · status), each row linking
 * to the opportunity detail page.
 */

import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  Building2,
  ExternalLink,
  MapPin,
  Sparkles,
  Users,
} from 'lucide-react'
import { getCompany } from '@/api/provider'
import type { CompanyDetail } from '@/api/types'
import { BandBadge, EmptyState, StatusBadge } from '@/components/common'
import { Badge, Button, Card, Skeleton, Table, Td, Th, Thead, Tr } from '@/components/ui'
import { scoreColor } from '@/lib/format'

/* ─── Info grid ─────────────────────────────────────────────────────────────── */

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]">{label}</span>
      <div className="text-sm text-[var(--color-text)]">{children}</div>
    </div>
  )
}

function InfoGrid({ company }: { company: CompanyDetail }) {
  const d = company.data
  return (
    <Card className="grid grid-cols-1 gap-x-6 divide-y divide-[var(--color-border)]/60 sm:grid-cols-2 sm:divide-y-0">
      <div className="divide-y divide-[var(--color-border)]/60">
        <InfoItem label="INDUSTRY">
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="size-3.5 text-[var(--color-muted)]" />
            {d.industry ?? '—'}
          </span>
        </InfoItem>
        <InfoItem label="SIZE">
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-3.5 text-[var(--color-muted)]" />
            {d.size ?? '—'}
          </span>
        </InfoItem>
        <InfoItem label="LOCATION">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5 text-[var(--color-muted)]" />
            {d.location ?? '—'}
          </span>
        </InfoItem>
      </div>
      <div className="divide-y divide-[var(--color-border)]/60">
        <InfoItem label="WEBSITE">
          {d.website ? (
            <a
              href={d.website}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[var(--color-accent)] underline decoration-[var(--color-accent)]/30 underline-offset-2 hover:decoration-[var(--color-accent)]"
            >
              <span className="max-w-56 truncate">{d.website}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
          ) : (
            '—'
          )}
        </InfoItem>
        <InfoItem label="SOURCE">
          <span className="font-mono text-xs">{company.source ?? '—'}</span>
        </InfoItem>
        <InfoItem label="IN GRAPH SINCE">
          <span className="font-mono text-xs">{company.created_at.slice(0, 10)}</span>
        </InfoItem>
      </div>
    </Card>
  )
}

/* ─── Opportunities table ───────────────────────────────────────────────────── */

function OpportunityRow({ o, onOpen }: { o: CompanyDetail['opportunities'][number]; onOpen: (id: string) => void }) {
  return (
    <Tr className="cursor-pointer" onClick={() => onOpen(o.id)}>
      <Td className="max-w-64">
        <div className="truncate text-[13px] font-medium text-[var(--color-text)]">{o.data.role ?? o.name}</div>
      </Td>
      <Td>
        {o.score != null ? (
          <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: scoreColor(o.score) }}>
            {o.score}
          </span>
        ) : (
          <span className="font-mono text-sm text-[var(--color-muted)]">—</span>
        )}
      </Td>
      <Td>
        <BandBadge band={o.band} />
      </Td>
      <Td>
        <StatusBadge status={o.status} />
      </Td>
    </Tr>
  )
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: company, isPending, isError, error, refetch } = useQuery({
    queryKey: ['company', id],
    queryFn: () => getCompany(id!),
    enabled: id != null,
  })

  if (!id) {
    return <EmptyState title="Missing company id" hint="Navigate from the companies grid." />
  }

  if (isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-56 w-full rounded-lg" />
      </div>
    )
  }

  if (isError || !company) {
    return (
      <EmptyState
        icon={<AlertTriangle />}
        title="Company unavailable"
        hint={error?.message ?? `No company with id ${id}.`}
        action={
          <div className="flex items-center gap-2">
            <Link to="/companies">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="size-3.5" />
                Back to companies
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

  const d = company.data
  const open = (opportunityId: string): void => void navigate(`/opportunities/${opportunityId}`)
  const opportunities = company.opportunities

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link
          to="/companies"
          className="inline-flex w-fit items-center gap-1.5 font-mono text-[11px] tracking-wider text-[var(--color-muted)] transition-colors hover:text-[var(--color-accent)]"
        >
          <ArrowLeft className="size-3" />
          COMPANIES
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {d.location && (
                <Badge variant="outline" className="font-mono text-[10px] tracking-wider">
                  {d.location.toUpperCase()}
                </Badge>
              )}
              {d.size && (
                <Badge variant="outline" className="font-mono text-[10px] tracking-wider">
                  {d.size} PEOPLE
                </Badge>
              )}
            </div>
            <h1 className="mt-2 truncate text-xl font-semibold tracking-tight text-[var(--color-text)]">
              {company.name ?? 'Unnamed company'}
            </h1>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              {[d.industry, d.location].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
          <span className="font-mono text-[11px] tracking-wider text-[var(--color-muted)] tabular-nums">
            {opportunities.length} OPPORTUNIT{opportunities.length === 1 ? 'Y' : 'IES'}
          </span>
        </div>
      </div>

      {/* Stack + AI culture */}
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <InfoGrid company={company} />

          {/* Opportunities */}
          <div className="flex flex-col gap-2">
            <h2 className="font-mono text-[10px] font-semibold tracking-[0.25em] text-[var(--color-muted)]">
              OPPORTUNITIES
            </h2>
            {opportunities.length === 0 ? (
              <EmptyState
                icon={<Briefcase />}
                title="No linked opportunities"
                hint="Roles discovered at this company will appear here."
                className="py-8"
              />
            ) : (
              <Card className="overflow-hidden">
                <Table>
                  <Thead>
                    <Tr className="hover:bg-transparent">
                      <Th>Role</Th>
                      <Th>Score</Th>
                      <Th>Band</Th>
                      <Th>Status</Th>
                    </Tr>
                  </Thead>
                  <tbody>
                    {opportunities.map((o) => (
                      <OpportunityRow key={o.id} o={o} onOpen={open} />
                    ))}
                  </tbody>
                </Table>
              </Card>
            )}
          </div>
        </div>

        {/* Side column: stack + AI culture notes */}
        <div className="flex flex-col gap-4">
          <Card className="px-4 py-4">
            <h2 className="mb-2.5 font-mono text-[10px] font-semibold tracking-[0.25em] text-[var(--color-muted)]">
              STACK
            </h2>
            {d.stack && d.stack.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {d.stack.map((s) => (
                  <Badge key={s} variant="outline" className="font-mono text-[10px] tracking-wide">
                    {s}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-muted)]">No stack recorded.</p>
            )}
          </Card>
          <Card className="px-4 py-4">
            <h2 className="mb-2 font-mono text-[10px] font-semibold tracking-[0.25em] text-[var(--color-muted)]">
              AI CULTURE
            </h2>
            {d.ai_culture_notes && d.ai_culture_notes.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {d.ai_culture_notes.map((note) => (
                  <li key={note} className="flex items-start gap-1.5 text-xs leading-5 text-[var(--color-text)]/85">
                    <Sparkles className="mt-0.5 size-3 shrink-0 text-[var(--color-accent)]/60" />
                    {note}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--color-muted)]">No AI culture notes yet.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

export default CompanyDetailPage
