/**
 * NbaHero — the NEXT BEST ACTION hero (docs/01 homepage contract).
 *
 * Self-contained so any eye dashboard composes <NbaHero nba visible />:
 * it owns the apply-to-gate draft submission [T1.11] and reads the shared
 * ['gate-pending'] cache for the in-gate check. `visible: false` never
 * renders another eye's NBA — only the empty state.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { Crosshair, ShieldCheck } from 'lucide-react'
import { createGateAction, listGateActions } from '@/api/provider'
import type { NextBestAction } from '@/api/types'
import { BandBadge, EmptyState, ScoreDial, StatusBadge } from '@/components/common'
import { Button, Card, useToast } from '@/components/ui'
import { salaryLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

export function NbaHero({ nba, visible }: { nba: NextBestAction | null; visible: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Same cache entry the dashboard header's gate badge reads — no extra fetch.
  const { data: gatePending } = useQuery({
    queryKey: ['gate-pending'],
    queryFn: () => listGateActions({ status: 'PENDING', limit: 50 }),
    staleTime: 15_000,
  })

  const submitToGate = useMutation({
    mutationFn: (opportunityId: string) =>
      createGateAction({
        action_type: 'apply_to_job',
        payload: { opportunity_id: opportunityId },
      }),
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

  const o = nba?.opportunity
  if (!nba || !o || !visible) {
    return (
      <EmptyState
        icon={<Crosshair />}
        title="No next best action"
        hint={
          nba && !visible
            ? 'The current NBA belongs to another eye — reset the focus to All to see it.'
            : 'Nothing actionable right now — the pipeline is clear or fully terminal.'
        }
        action={
          <Button variant="outline" size="sm" onClick={() => void navigate('/opportunities')}>
            View pipeline
          </Button>
        }
      />
    )
  }

  const nbaInGate = (gatePending?.items ?? []).some((a) => a.payload.opportunity_id === o.id)
  const meta = [o.data.location, salaryLabel(o.data)].filter(Boolean).join(' · ') || '—'

  return (
    <Card
      className={cn(
        'border-[var(--color-accent)]/25',
        'bg-gradient-to-br from-[var(--color-accent)]/[0.07] via-transparent to-transparent p-5',
      )}
    >
      <div className="flex flex-wrap items-center gap-6">
        <ScoreDial value={nba.match_score ?? o.score} size={112} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] font-semibold tracking-[0.3em] text-[var(--color-accent)]">
              NEXT BEST ACTION
            </span>
            <StatusBadge status={o.status} />
            <BandBadge band={o.band} />
          </div>
          <h2 className="mt-1.5 truncate text-lg font-semibold tracking-tight text-[var(--color-text)]">
            {o.data.role ?? o.name} — {o.company?.name ?? 'Unknown company'}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">{meta}</p>
          <p className="mt-2.5 max-w-2xl text-sm leading-5 text-[var(--color-text)]/90">{nba.reason}</p>
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void navigate(`/opportunities/${o.id}`)}>
              Review
            </Button>
            {nbaInGate ? (
              <Button size="sm" variant="outline" onClick={() => void navigate('/gate')}>
                <ShieldCheck className="size-3.5" />
                In Gate — review
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={submitToGate.isPending}
                onClick={() => submitToGate.mutate(o.id)}
              >
                <ShieldCheck className="size-3.5" />
                {submitToGate.isPending ? 'Submitting…' : 'Apply'}
              </Button>
            )}
          </div>
          <p className="mt-2 font-mono text-[10px] tracking-wider text-[var(--color-muted)]/70">
            APPLY SUBMITS A DRAFT TO THE ACTION GATE — NOTHING SENDS WITHOUT YOUR APPROVAL
          </p>
        </div>
      </div>
    </Card>
  )
}
