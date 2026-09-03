/**
 * Action Gate (T1.11-FE) — route /gate, nav "Gate".
 *
 * The approval queue (docs/03-agents-and-gates.md §4): the system PREPARES a
 * draft apply action → it sits PENDING here (and on the dashboard badge) →
 * Razi Approves / Edit-then-approves / Rejects-with-reason. Decisions are
 * FINAL — controls disappear once status ≠ PENDING (server 409s regardless),
 * and decided rows render their decision + reason as history.
 *
 * Real mode: GET/POST /api/gate/actions (+ /:id/approve, /:id/reject) per
 * docs/07-api-contract.md §4 [W4]. Mock mode runs the same flow against the
 * in-memory queue (web/src/api/mock/gate.ts) with identical side-effects
 * (task DONE, opportunity → APPLIED + applied_date, events recorded).
 */

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  Check,
  ClipboardList,
  ExternalLink,
  FileText,
  History,
  ShieldCheck,
  StickyNote,
  X,
} from 'lucide-react'
import { approveGateAction, listGateActions, rejectGateAction } from '@/api/provider'
import type { GateAction, GateStatus } from '@/api/types'
import { EmptyState, PageHeader, StatusBadge } from '@/components/common'
import { Badge, Button, Card, Input, Skeleton, Textarea, useToast } from '@/components/ui'
import { useEyeFocus } from '@/hooks/useEyeFocus'
import { opportunityInEye } from '@/lib/eyes'
import { formatDateTime, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

type StatusFilter = GateStatus | 'ALL'

/* ─── Status filter (segmented control, mirrors the brief slot toggle) ──────── */

function StatusFilterTabs({
  value,
  counts,
  onChange,
}: {
  value: StatusFilter
  counts: Record<GateStatus, number>
  onChange: (s: StatusFilter) => void
}) {
  const options: Array<{ value: StatusFilter; label: string }> = [
    { value: 'PENDING', label: `Pending${counts.PENDING > 0 ? ` (${counts.PENDING})` : ''}` },
    { value: 'APPROVED', label: `Approved${counts.APPROVED > 0 ? ` (${counts.APPROVED})` : ''}` },
    { value: 'REJECTED', label: `Rejected${counts.REJECTED > 0 ? ` (${counts.REJECTED})` : ''}` },
    { value: 'ALL', label: 'All' },
  ]
  return (
    <div
      role="tablist"
      aria-label="Filter by gate status"
      className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1"
    >
      {options.map(({ value: v, label }) => {
        const active = value === v
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
              'outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/60',
              active
                ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                : 'text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-text)]',
            )}
          >
            {v === 'PENDING' && <ClipboardList className="size-3.5" />}
            {v === 'ALL' && <History className="size-3.5" />}
            {label}
          </button>
        )
      })}
    </div>
  )
}

/* ─── Payload preview ───────────────────────────────────────────────────────── */

function PayloadPreview({ action }: { action: GateAction }) {
  const p = action.payload
  const hasAnything = p.cover_note || p.resume_version || p.apply_url || p.notes
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md border border-[var(--color-border)]/70 bg-white/[0.02] px-3 py-2.5">
      {p.cover_note ? (
        <div>
          <p className="font-mono text-[9px] tracking-[0.2em] text-[var(--color-muted)]">COVER NOTE</p>
          <p className="mt-1 text-[13px] leading-5 text-[var(--color-text)]/90">{p.cover_note}</p>
        </div>
      ) : (
        <p className="text-xs italic text-[var(--color-muted)]/70">
          No cover note drafted yet — add one via Edit &amp; Approve.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-[var(--color-muted)]">
        {p.resume_version && (
          <span className="inline-flex items-center gap-1">
            <FileText className="size-3" />
            {p.resume_version}
          </span>
        )}
        {p.apply_url && (
          <a
            href={p.apply_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-64 items-center gap-1 truncate text-[var(--color-accent)]/80 underline decoration-[var(--color-accent)]/30 underline-offset-2 hover:text-[var(--color-accent)]"
          >
            <ExternalLink className="size-3 shrink-0" />
            <span className="truncate">{p.apply_url}</span>
          </a>
        )}
      </div>
      {p.notes && (
        <p className="flex items-start gap-1.5 text-xs leading-5 text-[var(--color-muted)]">
          <StickyNote className="mt-0.5 size-3 shrink-0" />
          {p.notes}
        </p>
      )}
      {!hasAnything && !p.apply_url && (
        <p className="font-mono text-[10px] text-[var(--color-muted)]/60">Empty draft payload.</p>
      )}
    </div>
  )
}

/* ─── Queue row ─────────────────────────────────────────────────────────────── */

function GateActionRow({
  action,
  onApprove,
  onEditApprove,
  onReject,
  busy,
}: {
  action: GateAction
  onApprove: (a: GateAction) => void
  onEditApprove: (a: GateAction) => void
  onReject: (a: GateAction) => void
  busy: boolean
}) {
  const pending = action.status === 'PENDING'
  const o = action.opportunity

  return (
    <div className={cn('flex flex-col gap-1.5 px-4 py-3.5', !pending && 'opacity-75')}>
      {/* Line 1 — summary + status + meta */}
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck
          className={cn(
            'size-4 shrink-0',
            action.status === 'PENDING'
              ? 'text-amber-300'
              : action.status === 'APPROVED'
                ? 'text-emerald-300'
                : 'text-red-300',
          )}
        />
        <h3 className="min-w-0 truncate text-[13px] font-semibold text-[var(--color-text)]" title={action.summary}>
          {action.summary}
        </h3>
        <span className="ml-auto inline-flex items-center gap-2">
          <StatusBadge status={action.status} />
          {pending && (
            <span className="font-mono text-[10px] tracking-wider text-[var(--color-muted)] tabular-nums">
              WAITING {timeAgo(action.created_at).toUpperCase()}
            </span>
          )}
        </span>
      </div>

      {/* Line 2 — linked nodes */}
      <div className="flex flex-wrap items-center gap-1.5">
        {o ? (
          <Link
            to={`/opportunities/${o.id}`}
            className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] text-[var(--color-muted)] transition-colors hover:border-[var(--color-accent)]/50 hover:text-[var(--color-accent)]"
          >
            <ArrowUpRight className="size-3" />
            {o.data.role ?? o.name}
            {o.company?.name ? ` @ ${o.company.name}` : ''}
            {o.status === 'APPLIED' && o.data.applied_date ? ` · applied ${o.data.applied_date}` : ''}
          </Link>
        ) : (
          action.opportunity_id && (
            <span className="font-mono text-[11px] text-[var(--color-muted)]">{action.opportunity_id}</span>
          )
        )}
        {action.task && (
          <span className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] text-[var(--color-muted)]">
            <Check className="size-3 text-emerald-300/80" />
            {action.task.name} · {action.task.status}
          </span>
        )}
      </div>

      {/* Payload preview (draft kit) */}
      <PayloadPreview action={action} />

      {/* Decision history for decided rows */}
      {!pending && action.decision && (
        <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] tracking-wide">
          <Badge
            variant="outline"
            className={cn(
              'font-mono text-[10px]',
              action.decision === 'rejected' ? 'text-red-300/90' : 'text-emerald-300/90',
            )}
          >
            {action.decision.toUpperCase()}
          </Badge>
          {action.decided_at && (
            <span className="text-[var(--color-muted)] tabular-nums">{formatDateTime(action.decided_at)}</span>
          )}
          {action.decision_reason && (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-red-300/80">
              <Ban className="size-3 shrink-0" />
              <span className="truncate" title={action.decision_reason}>
                “{action.decision_reason}”
              </span>
            </span>
          )}
        </div>
      )}

      {/* Controls — PENDING only; decisions are FINAL (server 409s anyway) */}
      {pending && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => onApprove(action)} disabled={busy}>
            <Check className="size-3.5" />
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => onEditApprove(action)} disabled={busy}>
            <FileText className="size-3.5" />
            Edit &amp; Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onReject(action)}
            disabled={busy}
            className="text-red-300/90 hover:bg-red-400/10 hover:text-red-300"
          >
            <X className="size-3.5" />
            Reject
          </Button>
        </div>
      )}
    </div>
  )
}

/* ─── Approve confirm (decisions are final) ─────────────────────────────────── */

function ApproveConfirmDialog({
  action,
  busy,
  onConfirm,
  onCancel,
}: {
  action: GateAction
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onCancel}>
      <Card
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="approve-confirm-title"
        className="w-full max-w-sm px-5 py-5 shadow-xl shadow-black/50"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-emerald-400/40 bg-emerald-400/10 text-emerald-300">
            <ShieldCheck className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 id="approve-confirm-title" className="text-sm font-semibold text-[var(--color-text)]">
              Approve this action?
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">
              Decisions are final. On approve: the apply task is marked DONE, the opportunity moves to APPLIED with
              today&apos;s applied-date, and a follow-up is scheduled in 7 days.
            </p>
            <p className="mt-2 truncate font-mono text-[11px] text-[var(--color-accent)]" title={action.summary}>
              {action.summary}
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" autoFocus onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onConfirm}
            className="border-emerald-400/50 bg-emerald-400/10 text-emerald-300 hover:border-emerald-400/70 hover:bg-emerald-400/20"
          >
            <Check className="size-3.5" />
            Approve
          </Button>
        </div>
      </Card>
    </div>
  )
}

/* ─── Edit-then-approve dialog ──────────────────────────────────────────────── */

interface EditForm {
  cover_note: string
  apply_url: string
  resume_version: string
  notes: string
}

function EditApproveDialog({
  action,
  onClose,
}: {
  action: GateAction
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [form, setForm] = useState<EditForm>({
    cover_note: action.payload.cover_note ?? '',
    apply_url: action.payload.apply_url ?? '',
    resume_version: action.payload.resume_version ?? '',
    notes: action.payload.notes ?? '',
  })

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const approveMutation = useMutation({
    mutationFn: () =>
      approveGateAction(action.id, {
        payload: {
          ...(form.cover_note.trim() ? { cover_note: form.cover_note.trim() } : { cover_note: '' }),
          ...(form.apply_url.trim() ? { apply_url: form.apply_url.trim() } : { apply_url: '' }),
          ...(form.resume_version.trim() ? { resume_version: form.resume_version.trim() } : { resume_version: '' }),
          ...(form.notes.trim() ? { notes: form.notes.trim() } : { notes: '' }),
        },
      }),
    onSuccess: (result) => {
      toast.success(`Approved (${result.decision})`, {
        description: `${result.opportunity.data.role ?? result.opportunity.name} → ${result.opportunity.status}.`,
      })
      invalidateAfterDecision(queryClient)
      onClose()
    },
    onError: (err) => {
      toast.error('Approve failed', { description: err.message })
    },
  })

  const set = (patch: Partial<EditForm>): void => setForm((f) => ({ ...f, ...patch }))

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-approve-title"
        className="my-auto w-full max-w-xl px-5 py-5 shadow-xl shadow-black/50"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="edit-approve-title" className="text-sm font-semibold text-[var(--color-text)]">
              Edit payload — then approve
            </h2>
            <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">{action.summary}</p>
          </div>
          <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <form
          className="mt-4 flex flex-col gap-3.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (!approveMutation.isPending) approveMutation.mutate()
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]">COVER NOTE</span>
            <Textarea
              rows={4}
              value={form.cover_note}
              onChange={(e) => set({ cover_note: e.target.value })}
              placeholder="The message that goes out with the application…"
              aria-label="Cover note"
              disabled={approveMutation.isPending}
            />
          </label>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]">APPLY URL</span>
              <Input
                type="url"
                value={form.apply_url}
                onChange={(e) => set({ apply_url: e.target.value })}
                placeholder="https://…"
                aria-label="Apply URL"
                disabled={approveMutation.isPending}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]">RESUME VERSION</span>
              <Input
                value={form.resume_version}
                onChange={(e) => set({ resume_version: e.target.value })}
                placeholder="resume-2026-node-ts.pdf"
                aria-label="Resume version"
                disabled={approveMutation.isPending}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]">INTERNAL NOTES</span>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Context for future-you…"
              aria-label="Internal notes"
              disabled={approveMutation.isPending}
            />
          </label>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)]/60 pt-4">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={approveMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={approveMutation.isPending}>
              <Check className="size-3.5" />
              {approveMutation.isPending ? 'Approving…' : 'Approve'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

/* ─── Reject dialog (reason required) ───────────────────────────────────────── */

function RejectDialog({ action, onClose }: { action: GateAction; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [reason, setReason] = useState('')

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const rejectMutation = useMutation({
    mutationFn: () => rejectGateAction(action.id, { reason: reason.trim() }),
    onSuccess: (result) => {
      toast.info('Rejected — logged for LEARN', {
        description: result.summary,
      })
      invalidateAfterDecision(queryClient)
      onClose()
    },
    onError: (err) => {
      toast.error('Reject failed', { description: err.message })
    },
  })

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <Card
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reject-title"
        className="w-full max-w-md px-5 py-5 shadow-xl shadow-black/50"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-red-400/40 bg-red-400/10 text-red-300">
            <Ban className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 id="reject-title" className="text-sm font-semibold text-[var(--color-text)]">
              Reject this action?
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">
              The opportunity and task stay untouched. A reason is required — it feeds the LEARN stage.
            </p>
            <p className="mt-2 truncate font-mono text-[11px] text-[var(--color-accent)]" title={action.summary}>
              {action.summary}
            </p>
          </div>
        </div>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (reason.trim() && !rejectMutation.isPending) rejectMutation.mutate()
          }}
        >
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this application not going out?"
            aria-label="Rejection reason"
            aria-required
            autoFocus
            disabled={rejectMutation.isPending}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={rejectMutation.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={!reason.trim() || rejectMutation.isPending}
              className="border-red-400/50 bg-red-400/10 text-red-300 hover:border-red-400/70 hover:bg-red-400/20"
            >
              <X className="size-3.5" />
              Reject
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

/* ─── Cache invalidation shared by all decision mutations ───────────────────── */

function invalidateAfterDecision(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: ['gate-actions'] })
  void queryClient.invalidateQueries({ queryKey: ['gate-pending'] })
  void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
  void queryClient.invalidateQueries({ queryKey: ['tasks'] })
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  void queryClient.invalidateQueries({ queryKey: ['brief'] })
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export function GatePage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { eye, def, focused } = useEyeFocus()
  const [filter, setFilter] = useState<StatusFilter>('PENDING')
  /** Dialog state: confirm-approve / edit-approve / reject target. */
  const [confirming, setConfirming] = useState<GateAction | null>(null)
  const [editing, setEditing] = useState<GateAction | null>(null)
  const [rejecting, setRejecting] = useState<GateAction | null>(null)

  const statusParam = filter === 'ALL' ? undefined : filter
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['gate-actions', { status: statusParam }],
    queryFn: () => listGateActions({ status: statusParam, limit: 100 }),
    placeholderData: (prev) => prev,
  })

  // Unfiltered counts for the tabs (cheap: limit 100 covers the demo scale).
  const { data: all } = useQuery({
    queryKey: ['gate-actions', { status: undefined }],
    queryFn: () => listGateActions({ limit: 100 }),
  })
  const counts: Record<GateStatus, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0 }
  for (const a of all?.items ?? []) counts[a.status]++

  // Plain approve (confirm dialog path). Edit-then-approve / reject live in
  // their dialogs (they own form state).
  const approveMutation = useMutation({
    mutationFn: (id: string) => approveGateAction(id),
    onSuccess: (result) => {
      toast.success(`Approved (${result.decision})`, {
        description: `${result.opportunity.data.role ?? result.opportunity.name} → ${result.opportunity.status}.`,
      })
      invalidateAfterDecision(queryClient)
    },
    onError: (err) => {
      toast.error('Approve failed', { description: err.message })
    },
  })

  /*
   * Eye filter (T1.13): actions inherit the eye of their linked opportunity;
   * actions without a resolvable opportunity stay visible (global ops items).
   * Tab counts stay global so pending work in other eyes is never lost.
   */
  const inEye = (a: GateAction): boolean => {
    if (!focused) return true
    if (!a.opportunity) return true
    return opportunityInEye(a.opportunity.opportunity_type, eye)
  }
  const items = (data?.items ?? []).filter(inEye)
  const pendingCount = counts.PENDING

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Action Gate"
        subtitle="System prepares — you confirm. Decisions are final."
        actions={
          <Badge
            variant="outline"
            className={cn(
              'px-2.5 py-1 font-mono text-[11px] tracking-wider',
              pendingCount > 0
                ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
            )}
          >
            <ShieldCheck className="size-3" />
            {pendingCount} PENDING
          </Badge>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusFilterTabs value={filter} counts={counts} onChange={setFilter} />
        <span className="ml-auto font-mono text-[11px] tracking-wider text-[var(--color-muted)] tabular-nums">
          {isPending ? '…' : `${items.length} TOTAL`}
        </span>
      </div>

      {/* Queue */}
      {isPending ? (
        <Card className="p-3">
          <div className="flex flex-col gap-2.5" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </Card>
      ) : isError ? (
        <EmptyState
          icon={<AlertTriangle />}
          title="Gate queue unavailable"
          hint={error?.message ?? 'Gate actions could not be loaded.'}
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck />}
          title={filter === 'ALL' ? 'Queue is empty' : focused ? `No ${def.shortLabel} Eye ${filter.toLowerCase()} actions` : `No ${filter.toLowerCase()} actions`}
          hint={
            filter === 'PENDING'
              ? focused
                ? `Nothing waiting in ${def.label} — reset the focus to All for the full queue.`
                : 'Nothing waiting on you — the system will queue prepared actions here.'
              : 'Switch filters to see the rest of the decision history.'
          }
        />
      ) : (
        <Card className="divide-y divide-[var(--color-border)]/50 overflow-hidden">
          {items.map((a) => (
            <GateActionRow
              key={a.id}
              action={a}
              busy={approveMutation.isPending}
              onApprove={setConfirming}
              onEditApprove={setEditing}
              onReject={setRejecting}
            />
          ))}
        </Card>
      )}

      {/* Decision dialogs */}
      {confirming && (
        <ApproveConfirmDialog
          action={confirming}
          busy={approveMutation.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const id = confirming.id
            setConfirming(null)
            approveMutation.mutate(id)
          }}
        />
      )}
      {editing && <EditApproveDialog action={editing} onClose={() => setEditing(null)} />}
      {rejecting && <RejectDialog action={rejecting} onClose={() => setRejecting(null)} />}
    </div>
  )
}

export default GatePage
