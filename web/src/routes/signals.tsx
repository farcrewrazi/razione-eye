/**
 * Signals — the triage inbox (docs/01 §6 module 4).
 *
 * Inbox-style list: type badge + source chip + observed_at relative +
 * content preview (line-clamped) + disposition StatusBadge.
 * Manual signal entry (T1.12 preview) + promote/dismiss row actions.
 * Promote opens the promote dialog (T1.12) → JOB opportunity (DISCOVERED);
 * PROMOTED rows link to the created opportunity.
 *
 * Career Eye: the inbox moved into Opportunities as the Inbox tab — direct
 * visits under CAREER focus redirect to /opportunities?view=inbox.
 *
 * Triage UI (SignalRow, PromoteDialog, NewSignalPanel, SignalTypeBadge) lives
 * in @/components/signals — shared with the Opportunities Inbox tab.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router'
import { AlertTriangle, Inbox, Plus } from 'lucide-react'
import { listSignals, updateSignalDisposition } from '@/api/provider'
import type { Signal, SignalDisposition, SignalType } from '@/api/types'
import { SIGNAL_DISPOSITIONS, SIGNAL_TYPES } from '@/api/types'
import { EmptyState, PageHeader } from '@/components/common'
import { NewSignalPanel, PromoteDialog, SignalRow } from '@/components/signals'
import { Button, Card, Select, Skeleton, useToast } from '@/components/ui'
import { useEyeFocus } from '@/hooks/useEyeFocus'
import { CONTROL_SIGNAL_TYPES } from '@/lib/eyes'
import { cn } from '@/lib/utils'

export function SignalsPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { eye, def, focused } = useEyeFocus()
  const [disposition, setDisposition] = useState<SignalDisposition | ''>('')
  const [signalType, setSignalType] = useState<SignalType | ''>('')
  const [formOpen, setFormOpen] = useState(false)
  /** Signal queued for the promote dialog (T1.12). */
  const [promoting, setPromoting] = useState<Signal | null>(null)

  /*
   * Eye filter (T1.13): eyes with signal types seed the type filter — the
   * backend is asked for them plus the ops types (SOCIAL_POST / COMMENT) that
   * stay visible in every eye. Manual `signal_type` selection overrides.
   */
  const defaultType = focused && def.signalTypes.length > 0 ? def.signalTypes[0] : 'JOB_POSTING'
  const eyeTypes = focused && def.signalTypes.length > 0 ? def.signalTypes : null
  const serverType = signalType || (eyeTypes && eyeTypes.length === 1 ? eyeTypes[0] : undefined)

  const params = {
    disposition: disposition || undefined,
    signal_type: serverType,
    limit: 100,
  }
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['signals', params, eye],
    queryFn: () => listSignals(params),
    placeholderData: (prev) => prev,
  })

  const dispositionMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: SignalDisposition }) =>
      updateSignalDisposition(id, next),
    onSuccess: (s) => {
      toast.info(`Signal ${String(s.status).toLowerCase()}`, {
        description: s.name ?? 'Signal updated.',
      })
      void queryClient.invalidateQueries({ queryKey: ['signals'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err) => {
      toast.error('Disposition change failed', { description: err.message })
    },
  })

  const allowed = signalType
    ? null // explicit manual selection — the server already filtered
    : eyeTypes
      ? [...eyeTypes, ...CONTROL_SIGNAL_TYPES]
      : null
  const items = (data?.items ?? []).filter((s) => !allowed || allowed.includes(s.data.signal_type))
  const newCount = items.filter((s) => s.status === 'NEW').length

  const onDisposition = (id: string, next: SignalDisposition): void => {
    if (next === 'PROMOTED') {
      // Open the promote dialog instead of the bare disposition flip (T1.12).
      const target = items.find((s) => s.id === id)
      if (target) setPromoting(target)
      return
    }
    dispositionMutation.mutate({ id, next })
  }

  // Career Eye guard: the inbox moved to Opportunities → Inbox tab.
  if (eye === 'CAREER') return <Navigate to="/opportunities?view=inbox" replace />

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Signals"
        subtitle={
          focused
            ? `${def.label} detections${eyeTypes ? ` — ${eyeTypes.join(' + ')}` : ''} — promote or dismiss.`
            : 'Raw detections awaiting triage — promote or dismiss.'
        }
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
          {isPending ? '…' : `${items.length} TOTAL`}
          {!isPending && disposition === 'NEW' ? ` · ${newCount} AWAITING TRIAGE` : ''}
        </span>
      </div>

      <NewSignalPanel open={formOpen} onToggle={() => setFormOpen((o) => !o)} defaultType={defaultType} />

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
          title={disposition || signalType ? 'No matches' : focused ? `No ${def.shortLabel} Eye signals` : 'Inbox is clear'}
          hint={
            disposition || signalType
              ? 'Nothing matches the current filters — clear them to see the full inbox.'
              : focused
                ? `${def.label} detections land here — reset the focus to All for the full inbox.`
                : 'New detections from the scouts and manual entries will land here.'
          }
        />
      ) : (
        <Card className={cn('divide-y divide-[var(--color-border)]/50 overflow-hidden')}>
          {items.map((s) => (
            <SignalRow
              key={s.id}
              s={s}
              onDisposition={onDisposition}
            />
          ))}
        </Card>
      )}

      {/* Promote dialog (T1.12) */}
      {promoting && <PromoteDialog signal={promoting} onClose={() => setPromoting(null)} />}
    </div>
  )
}

export default SignalsPage
