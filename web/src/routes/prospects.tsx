/**
 * Prospects — the pitch-prospect review table (EYE-6, Business Eye).
 *
 * The 30 imported SME prospects (WEBSITE/CONSULTANCY opportunities with the
 * campaign band/segment/agentic payload in data), ranked by opportunity score
 * then agentic fit. Client-side segment/band filters + name search — 30 rows
 * don't need server paging. "Prepare pitch" drafts a `prepare_pitch` gate
 * action (PENDING) and lands on the gate — nothing sends without approval.
 *
 * Note: the live API rejects `prepare_pitch` until GATE_ACTION_TYPES in
 * packages/shared + server/gate.ts accept it (EYE-6 report); mock mode drafts
 * it fine.
 */

import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { AlertTriangle, Search, ShieldCheck, Target } from 'lucide-react'
import { createGateAction, listCompanies, listGateActions, listOpportunities } from '@/api/provider'
import { PROSPECT_BANDS, type Opportunity, type ProspectBand } from '@/api/types'
import { EmptyState, PageHeader } from '@/components/common'
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  Skeleton,
  Table,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
} from '@/components/ui'
import { scoreColor } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Opportunity types the Business Eye owns (EYES.BUSINESS.opportunityTypes). */
const BUSINESS_TYPES: readonly string[] = ['WEBSITE', 'CONSULTANCY']

/** Campaign-band chip — distinct palette from the score-derived BandBadge. */
const PROSPECT_BAND_VARIANTS: Record<ProspectBand, 'accent' | 'success' | 'warning' | 'muted'> = {
  PRIORITY: 'accent',
  STRONG: 'success',
  REVIEW: 'warning',
  ARCHIVE: 'muted',
}

export function ProspectBandBadge({ band }: { band: ProspectBand }) {
  return <Badge variant={PROSPECT_BAND_VARIANTS[band]}>{band}</Badge>
}

interface ProspectRow {
  o: Opportunity
  company: string
  opportunityType: string
  segment: string | null
  /** Campaign band (data.band) — not the score-derived top-level band. */
  band: ProspectBand | null
  agenticFit: number | null
  location: string | null
}

function ScoreCell({ value }: { value: number | null }) {
  if (value == null) return <span className="font-mono text-[var(--color-muted)]">—</span>
  return (
    <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: scoreColor(value) }}>
      {value}
    </span>
  )
}

function AgenticFitCell({ value }: { value: number | null }) {
  if (value == null) return <span className="font-mono text-[var(--color-muted)]">—</span>
  return <span className="font-mono text-sm tabular-nums text-[var(--color-text)]">{value}</span>
}

function ProspectRowRow({
  row,
  inGate,
  submitting,
  onOpen,
  onPrepare,
  onReviewGate,
}: {
  row: ProspectRow
  inGate: boolean
  submitting: boolean
  onOpen: (id: string) => void
  onPrepare: (row: ProspectRow) => void
  onReviewGate: () => void
}) {
  return (
    <Tr className="cursor-pointer" onClick={() => onOpen(row.o.id)}>
      <Td className="max-w-64">
        <div className="truncate text-[13px] font-medium text-[var(--color-text)]">{row.company}</div>
        <div className="truncate font-mono text-[10px] tracking-wider text-[var(--color-muted)]">
          {row.opportunityType}
        </div>
      </Td>
      <Td className="max-w-40 truncate text-xs text-[var(--color-muted)]">{row.segment ?? '—'}</Td>
      <Td className="max-w-48 truncate text-xs text-[var(--color-muted)]">{row.location ?? '—'}</Td>
      <Td>
        <ScoreCell value={row.o.score} />
      </Td>
      <Td>{row.band ? <ProspectBandBadge band={row.band} /> : '—'}</Td>
      <Td>
        <AgenticFitCell value={row.agenticFit} />
      </Td>
      <Td onClick={(e) => e.stopPropagation()}>
        {inGate ? (
          <Button size="sm" variant="subtle" onClick={onReviewGate}>
            <ShieldCheck className="size-3.5" />
            In gate
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={submitting} onClick={() => onPrepare(row)}>
            {submitting ? 'Drafting…' : 'Prepare pitch'}
          </Button>
        )}
      </Td>
    </Tr>
  )
}

export function ProspectsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [q, setQ] = useState('')
  const [segment, setSegment] = useState('')
  const [band, setBand] = useState<ProspectBand | ''>('')

  // Debounce the search box so typing doesn't thrash the render (250 ms, same
  // cadence as the pipeline table).
  const [qInput, setQInput] = useState('')
  const qTimer = useRef<number | undefined>(undefined)
  const onSearchInput = (value: string): void => {
    setQInput(value)
    window.clearTimeout(qTimer.current)
    qTimer.current = window.setTimeout(() => setQ(value), 250)
  }

  // One wide window (server cap is 200), scoped to business types client-side —
  // the web listOpportunities has no eye param (same fetch-wide pattern as the
  // pipeline table for multi-type eyes).
  const { data, isPending, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['opportunities', { limit: 200, sort: '-score' }, 'prospects'],
    queryFn: () => listOpportunities({ limit: 200, sort: '-score' }),
    placeholderData: (prev) => prev,
  })
  // Location lives on the COMPANY node (data.location) — resolve via company_id.
  const { data: companiesData } = useQuery({
    queryKey: ['companies', { limit: 200 }],
    queryFn: () => listCompanies({ limit: 200 }),
    placeholderData: (prev) => prev,
  })
  // Shared cache entry with the dashboard's gate badge — in-gate rows swap to a
  // quiet "In gate" chip instead of offering a duplicate draft.
  const { data: gatePending } = useQuery({
    queryKey: ['gate-pending'],
    queryFn: () => listGateActions({ status: 'PENDING', limit: 50 }),
    staleTime: 15_000,
  })

  const preparePitch = useMutation({
    mutationFn: (opportunityId: string) =>
      createGateAction({ action_type: 'prepare_pitch', payload: { opportunity_id: opportunityId } }),
    onSuccess: (action) => {
      toast.success('Pitch draft submitted to the Action Gate', {
        description: `${action.summary} — review or edit it in the gate. Nothing sends without approval.`,
      })
      void queryClient.invalidateQueries({ queryKey: ['gate-actions'] })
      void queryClient.invalidateQueries({ queryKey: ['gate-pending'] })
      void queryClient.invalidateQueries({ queryKey: ['brief'] })
      void navigate('/gate')
    },
    onError: (err) => {
      toast.error('Could not draft the pitch', { description: err.message })
    },
  })

  const companiesById = useMemo(
    () => new Map((companiesData?.items ?? []).map((c) => [c.id, c])),
    [companiesData],
  )

  const prospects = useMemo<ProspectRow[]>(() => {
    const rows = (data?.items ?? [])
      .filter((o) => o.opportunity_type != null && BUSINESS_TYPES.includes(o.opportunity_type))
      .map((o) => ({
        o,
        company:
          (o.data.company as string | undefined) ?? o.company?.name ?? 'Unknown company',
        opportunityType: o.opportunity_type ?? '',
        segment: o.data.segment ?? null,
        band: o.data.band ?? null,
        agenticFit: o.data.agentic_fit ?? null,
        location: companiesById.get((o.data.company_id as string | undefined) ?? '')?.data.location ?? null,
      }))
    // Default order: opportunity score desc, then agentic fit desc.
    rows.sort(
      (a, b) =>
        (b.o.score ?? -1) - (a.o.score ?? -1) ||
        (b.agenticFit ?? -1) - (a.agenticFit ?? -1),
    )
    return rows
  }, [data, companiesById])

  const segments = useMemo(
    () => [...new Set(prospects.map((p) => p.segment).filter((s): s is string => s != null))].sort(),
    [prospects],
  )

  const filtersActive = q !== '' || segment !== '' || band !== ''
  const filtered = prospects.filter((p) => {
    if (q && !p.company.toLowerCase().includes(q.toLowerCase())) return false
    if (segment && p.segment !== segment) return false
    if (band && p.band !== band) return false
    return true
  })

  const pendingByOpportunity = useMemo(() => {
    const ids = new Set<string>()
    for (const a of gatePending?.items ?? []) {
      if (a.action_type === 'prepare_pitch' && a.payload.opportunity_id) ids.add(a.payload.opportunity_id)
    }
    return ids
  }, [gatePending])

  const open = (id: string): void => void navigate(`/prospects/${id}`)

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader
        title="Prospects"
        subtitle="The companies worth pitching — ranked by opportunity score, then agentic fit."
        actions={
          <span className="font-mono text-xs tracking-wider text-[var(--color-muted)] tabular-nums">
            {isPending ? '…' : filtersActive ? `${filtered.length}/${prospects.length} SHOWN` : `${prospects.length} PROSPECTS`}
          </span>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[var(--color-muted)]" />
          <Input
            className="pl-8"
            placeholder="Search company…"
            value={qInput}
            onChange={(e) => onSearchInput(e.target.value)}
            aria-label="Search prospects"
          />
        </div>
        <Select
          className="w-44"
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
          aria-label="Filter by segment"
        >
          <option value="">Segment: All</option>
          {segments.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select
          className="w-36"
          value={band}
          onChange={(e) => setBand(e.target.value as ProspectBand | '')}
          aria-label="Filter by band"
        >
          <option value="">Band: All</option>
          {PROSPECT_BANDS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </Select>
      </div>

      {/* Table */}
      {isPending ? (
        <Card className="p-3">
          <div className="flex flex-col gap-2.5" aria-busy="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </Card>
      ) : isError ? (
        <EmptyState
          icon={<AlertTriangle />}
          title="Prospects unavailable"
          hint={error?.message ?? 'Prospects could not be loaded.'}
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        />
      ) : prospects.length === 0 ? (
        <EmptyState
          icon={<Target />}
          title="No prospects yet"
          hint="Business prospects land here after a discovery import — they are WEBSITE/CONSULTANCY opportunities with a pitch score."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="No matches"
          hint="Nothing matches the current filters — clear them to see the full prospect list."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQ('')
                setQInput('')
                setSegment('')
                setBand('')
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <Card className={cn('overflow-hidden', isFetching && 'opacity-60 transition-opacity')}>
          <Table>
            <Thead>
              <Tr className="hover:bg-transparent">
                <Th>Company</Th>
                <Th>Segment</Th>
                <Th>Location</Th>
                <Th>Score</Th>
                <Th>Band</Th>
                <Th>Agentic fit</Th>
                <Th>Next action</Th>
              </Tr>
            </Thead>
            <tbody>
              {filtered.map((row) => (
                <ProspectRowRow
                  key={row.o.id}
                  row={row}
                  inGate={pendingByOpportunity.has(row.o.id)}
                  submitting={preparePitch.isPending && preparePitch.variables === row.o.id}
                  onOpen={open}
                  onPrepare={(r) => preparePitch.mutate(r.o.id)}
                  onReviewGate={() => void navigate('/gate')}
                />
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <p className="font-mono text-[10px] tracking-wider text-[var(--color-muted)]/70">
        PREPARE PITCH DRAFTS A GATE ACTION — NOTHING SENDS WITHOUT YOUR APPROVAL IN THE GATE
      </p>
    </div>
  )
}

export default ProspectsPage
