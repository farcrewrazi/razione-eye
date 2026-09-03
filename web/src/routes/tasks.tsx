/**
 * Tasks — the work queue (docs/01 §6 module 3).
 *
 * Table of tasks with priority badges, relative due dates (overdue = red),
 * serves-opportunity chips, and status actions (mark DONE / cancel).
 * Summary chips: open · overdue · done today. New Task collapsible form.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { AlertTriangle, Ban, Check, ChevronDown, ListChecks, Plus } from 'lucide-react'
import { createTask, listTasks, listOpportunities, patchTask } from '@/api/provider'
import type { Task, TaskPriority, TaskStatus } from '@/api/types'
import { TASK_PRIORITIES, TASK_STATUSES } from '@/api/types'
import { EmptyState, PageHeader, StatusBadge } from '@/components/common'
import { Badge, Button, Card, Input, Select, Skeleton, Table, Td, Textarea, Th, Thead, Tr, useToast } from '@/components/ui'
import { useEyeFocus } from '@/hooks/useEyeFocus'
import { opportunityInEye } from '@/lib/eyes'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

/* ─── Priority badge ────────────────────────────────────────────────────────── */

const priorityStyles: Record<TaskPriority, string> = {
  HIGH: 'border-red-400/40 bg-red-400/10 text-red-300',
  MEDIUM: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  LOW: 'border-white/10 bg-white/5 text-[var(--color-muted)]',
}

function PriorityBadge({ priority }: { priority: TaskPriority | undefined }) {
  if (!priority) return <span className="font-mono text-xs text-[var(--color-muted)]">—</span>
  return (
    <Badge className={cn('border font-mono text-[10px] tracking-wider', priorityStyles[priority])}>
      {priority}
    </Badge>
  )
}

/** Overdue = due in the past AND still open (TODO / IN_PROGRESS). */
function isOverdue(t: Task, now = new Date()): boolean {
  if (!t.due_at) return false
  if (t.status !== 'TODO' && t.status !== 'IN_PROGRESS') return false
  return new Date(t.due_at).getTime() < now.getTime()
}

function isDoneToday(t: Task, now = new Date()): boolean {
  if (t.status !== 'DONE') return false
  return new Date(t.updated_at).toDateString() === now.toDateString()
}

/* ─── New Task form ─────────────────────────────────────────────────────────── */

interface NewTaskForm {
  title: string
  description: string
  priority: TaskPriority
  due: string // yyyy-mm-dd from <input type="date">
}

function NewTaskPanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [form, setForm] = useState<NewTaskForm>({ title: '', description: '', priority: 'MEDIUM', due: '' })

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['tasks'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    void queryClient.invalidateQueries({ queryKey: ['brief'] })
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createTask({
        data: {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          priority: form.priority,
        },
        status: 'TODO',
        due_at: form.due ? new Date(`${form.due}T23:59:59`).toISOString() : null,
      }),
    onSuccess: (t) => {
      toast.success('Task created', { description: t.data.title })
      setForm({ title: '', description: '', priority: 'MEDIUM', due: '' })
      onToggle()
      invalidate()
    },
    onError: (err) => {
      toast.error('Could not create task', { description: err.message })
    },
  })

  const submit = (): void => {
    if (!form.title.trim()) {
      toast.error('Title required', { description: 'Give the task a title before saving.' })
      return
    }
    createMutation.mutate()
  }

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
          <Plus className="size-4 text-[var(--color-accent)]" />
          New Task
        </span>
        <ChevronDown
          className={cn('size-4 text-[var(--color-muted)] transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <form
          className="flex flex-col gap-3 border-t border-[var(--color-border)]/60 px-4 py-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="grid gap-3 md:grid-cols-[1fr_10rem_10rem]">
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]">TITLE</span>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Tailor CV for ABC Technology"
                aria-label="Task title"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]">PRIORITY</span>
              <Select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}
                aria-label="Task priority"
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]">DUE DATE</span>
              <Input
                type="date"
                value={form.due}
                onChange={(e) => setForm((f) => ({ ...f, due: e.target.value }))}
                aria-label="Task due date"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)]">DESCRIPTION</span>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Optional context…"
              aria-label="Task description"
            />
          </label>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onToggle}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create task'}
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

/* ─── Row ───────────────────────────────────────────────────────────────────── */

function TaskRow({ t, opportunities, onStatus }: {
  t: Task
  opportunities: Map<string, string> // id → name
  onStatus: (id: string, status: TaskStatus) => void
}) {
  const overdue = isOverdue(t)
  const open = t.status === 'TODO' || t.status === 'IN_PROGRESS'
  const servesId = t.data.opportunity_id
  const servesName = servesId ? opportunities.get(servesId) : undefined

  return (
    <Tr className={cn(t.status === 'DONE' && 'opacity-55', t.status === 'CANCELLED' && 'opacity-45')}>
      <Td className="max-w-72">
        <div className="truncate text-[13px] font-medium text-[var(--color-text)]">{t.data.title}</div>
        {t.data.description && (
          <div className="truncate text-xs text-[var(--color-muted)]">{t.data.description}</div>
        )}
      </Td>
      <Td>
        <PriorityBadge priority={t.data.priority} />
      </Td>
      <Td>
        <StatusBadge status={t.status} />
      </Td>
      <Td className="text-xs whitespace-nowrap">
        {t.due_at ? (
          <span className={cn('font-mono tabular-nums', overdue ? 'text-red-300' : 'text-[var(--color-muted)]')}>
            {overdue ? 'overdue · ' : ''}
            {timeAgo(t.due_at)}
          </span>
        ) : (
          <span className="font-mono text-xs text-[var(--color-muted)]">—</span>
        )}
      </Td>
      <Td className="max-w-40">
        {servesId ? (
          servesName ? (
            <Link
              to={`/opportunities/${servesId}`}
              title={servesName}
              className="inline-flex max-w-full items-center gap-1 truncate rounded border border-[var(--color-border)] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text)]/85 transition-colors hover:border-[var(--color-accent)]/50 hover:bg-[var(--color-accent)]/10"
            >
              <span className="truncate">{servesName}</span>
            </Link>
          ) : (
            <Link
              to={`/opportunities/${servesId}`}
              className="font-mono text-[11px] text-[var(--color-accent)]/80 hover:text-[var(--color-accent)]"
            >
              opportunity →
            </Link>
          )
        ) : (
          <span className="font-mono text-xs text-[var(--color-muted)]">—</span>
        )}
      </Td>
      <Td>
        {open ? (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="outline"
              size="sm"
              title="Mark as done"
              disabled={t.id === undefined}
              onClick={(e) => {
                e.stopPropagation()
                onStatus(t.id, 'DONE')
              }}
            >
              <Check className="size-3.5" />
              Done
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title="Cancel task"
              onClick={(e) => {
                e.stopPropagation()
                onStatus(t.id, 'CANCELLED')
              }}
            >
              <Ban className="size-3.5" />
              Cancel
            </Button>
          </div>
        ) : (
          <span className="block text-right font-mono text-[10px] tracking-wider text-[var(--color-muted)]">
            {timeAgo(t.updated_at)}
          </span>
        )}
      </Td>
    </Tr>
  )
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export function TasksPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { eye, def, focused } = useEyeFocus()
  const [status, setStatus] = useState<TaskStatus | ''>('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [formOpen, setFormOpen] = useState(false)

  // Windowed task list honoring the active filters.
  const params = {
    status: status || undefined,
    overdue: overdueOnly || undefined,
    limit: 200,
    sort: 'due_at',
  }
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['tasks', params],
    queryFn: () => listTasks(params),
    placeholderData: (prev) => prev,
  })

  // Unfiltered set for the summary chips (open / overdue / done today).
  const { data: all } = useQuery({
    queryKey: ['tasks', 'all'],
    queryFn: () => listTasks({ limit: 500 }),
  })

  // Opportunities for the serves-chip labels + the eye of each served task.
  const { data: opportunitiesData } = useQuery({
    queryKey: ['opportunities', { chips: 'task-serves' }],
    queryFn: () => listOpportunities({ limit: 200 }),
    staleTime: 60_000,
  })
  const opportunityNames = new Map(
    (opportunitiesData?.items ?? []).map((o) => [o.id, o.name ?? o.data.role]),
  )
  const opportunityTypes = new Map(
    (opportunitiesData?.items ?? []).map((o) => [o.id, o.opportunity_type]),
  )

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: TaskStatus }) => patchTask(id, { status: next }),
    onSuccess: (t) => {
      toast.success(`Task ${String(t.status).toLowerCase()}`, { description: t.data.title })
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['brief'] })
    },
    onError: (err) => {
      toast.error('Task update failed', { description: err.message })
    },
  })

  /*
   * Eye filter (T1.13): tasks inherit the eye of the opportunity they serve;
   * unlinked tasks are global and always shown. ALL / CONTROL show everything.
   */
  const eyeFiltered = focused
    ? (all?.items ?? []).filter((t) => {
        const servesId = t.data.opportunity_id
        if (!servesId) return true
        return opportunityInEye(opportunityTypes.get(servesId), eye)
      })
    : (all?.items ?? [])

  const items = focused
    ? (data?.items ?? []).filter((t) => {
        const servesId = t.data.opportunity_id
        if (!servesId) return true
        return opportunityInEye(opportunityTypes.get(servesId), eye)
      })
    : (data?.items ?? [])
  const total = data?.total ?? 0
  const openCount = eyeFiltered.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS').length
  const overdueCount = eyeFiltered.filter((t) => isOverdue(t)).length
  const doneTodayCount = eyeFiltered.filter((t) => isDoneToday(t)).length

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Tasks"
        subtitle={
          focused
            ? `${def.label} work queue — unlinked tasks stay visible.`
            : 'Work queue derived from pipeline needs.'
        }
        actions={
          <Button size="sm" variant={formOpen ? 'outline' : 'default'} onClick={() => setFormOpen((o) => !o)}>
            <Plus className="size-3.5" />
            New Task
          </Button>
        }
      />

      {/* Summary chips */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-sky-400/30 bg-sky-400/10 px-2 py-1 font-mono text-[11px] tracking-wider text-sky-300">
          {openCount} OPEN
        </Badge>
        <Badge variant="outline" className="border-red-400/30 bg-red-400/10 px-2 py-1 font-mono text-[11px] tracking-wider text-red-300">
          {overdueCount} OVERDUE
        </Badge>
        <Badge variant="outline" className="border-emerald-400/30 bg-emerald-400/10 px-2 py-1 font-mono text-[11px] tracking-wider text-emerald-300">
          {doneTodayCount} DONE TODAY
        </Badge>
        <span className="ml-auto font-mono text-[11px] tracking-wider text-[var(--color-muted)] tabular-nums">
          {isPending ? '…' : `${total} SHOWN`}
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-44"
          value={status}
          onChange={(e) => setStatus(e.target.value as TaskStatus | '')}
          aria-label="Filter by status"
        >
          <option value="">Status: All</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)]/50">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
            className="size-3.5 accent-[var(--color-accent)]"
          />
          Overdue only
        </label>
      </div>

      <NewTaskPanel open={formOpen} onToggle={() => setFormOpen((o) => !o)} />

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
          title="Tasks unavailable"
          hint={error?.message ?? 'Tasks could not be loaded.'}
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ListChecks />}
          title={status || overdueOnly ? 'No matches' : focused ? `No ${def.shortLabel} Eye tasks` : 'No tasks yet'}
          hint={
            status || overdueOnly
              ? 'Nothing matches the current filters — clear them to see the full queue.'
              : focused
                ? `${def.label} tasks appear here as its pipeline produces work — reset the focus to All for the full queue.`
                : 'Tasks created here or derived from the pipeline will appear.'
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <Thead>
              <Tr className="hover:bg-transparent">
                <Th>Title</Th>
                <Th>Priority</Th>
                <Th>Status</Th>
                <Th>Due</Th>
                <Th>Serves</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </Thead>
            <tbody>
              {items.map((t) => (
                <TaskRow
                  key={t.id}
                  t={t}
                  opportunities={opportunityNames}
                  onStatus={(id, next) => statusMutation.mutate({ id, next })}
                />
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  )
}

export default TasksPage
