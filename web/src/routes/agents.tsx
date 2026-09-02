/**
 * Agents — the registry (docs/01 §6 module 6).
 *
 * Registry table: name · capability badge · kind · schedule · last run
 * (relative) · status dot + status · Run button → runAgent mutation.
 * Expanding a row reveals the recent run log (at, status, summary).
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Bot, ChevronDown, Play } from 'lucide-react'
import { listAgents, runAgent } from '@/api/provider'
import type { Agent, AgentCapability, AgentRun } from '@/api/types'
import { AgentStatusDot, EmptyState, PageHeader, StatusBadge } from '@/components/common'
import { Badge, Button, Card, Skeleton, Table, Td, Th, Thead, Tr, useToast } from '@/components/ui'
import { formatDateTime, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

/* ─── Capability badge ──────────────────────────────────────────────────────── */

const capabilityTone: Record<AgentCapability, string> = {
  discover: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  analyze: 'border-violet-400/30 bg-violet-400/10 text-violet-300',
  rank: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300',
  prepare: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  draft: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  suggest: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
}

function CapabilityBadge({ capability }: { capability: AgentCapability }) {
  return (
    <Badge className={cn('border font-mono text-[10px] tracking-wider', capabilityTone[capability])}>
      {capability}
    </Badge>
  )
}

/* ─── Agent activity (expanded row) ─────────────────────────────────────────── */

function RunLog({ runs }: { runs: AgentRun[] }) {
  if (runs.length === 0) {
    return <p className="px-4 py-3 text-xs text-[var(--color-muted)]">No runs recorded yet.</p>
  }
  return (
    <ul className="divide-y divide-[var(--color-border)]/40">
      {runs.slice(0, 10).map((run, i) => (
        <li key={`${run.at}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2">
          <span className="font-mono text-[11px] text-[var(--color-muted)] tabular-nums">
            {formatDateTime(run.at)}
          </span>
          <StatusBadge status={run.status} />
          <span className="min-w-0 flex-1 text-xs leading-4 text-[var(--color-text)]/85">
            {run.summary ?? '—'}
          </span>
        </li>
      ))}
    </ul>
  )
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export function AgentsPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['agents'],
    queryFn: listAgents,
  })

  const runMutation = useMutation({
    mutationFn: (id: string) => runAgent(id),
    onSuccess: (agent) => {
      const status = agent.data.last_status ?? 'empty'
      toast.success(`${agent.data.name} ran`, {
        description:
          status === 'empty'
            ? 'Run completed — no new results (stub returns "empty").'
            : `Run status: ${status}.`,
      })
      void queryClient.invalidateQueries({ queryKey: ['agents'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err) => {
      toast.error('Agent run failed', { description: err.message })
    },
  })

  const agents = data?.items ?? []

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Agents"
        subtitle="Native and adapter agents, schedules, and run health."
        actions={
          <span className="font-mono text-xs tracking-wider text-[var(--color-muted)] tabular-nums">
            {isPending ? '…' : `${agents.length} REGISTERED`}
          </span>
        }
      />

      {isPending ? (
        <Card className="p-3">
          <div className="flex flex-col gap-2.5" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </Card>
      ) : isError ? (
        <EmptyState
          icon={<AlertTriangle />}
          title="Agents unavailable"
          hint={error?.message ?? 'The registry could not be loaded.'}
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        />
      ) : agents.length === 0 ? (
        <EmptyState
          icon={<Bot />}
          title="No agents registered"
          hint="The six scouts and analysts will register here at boot."
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <Thead>
              <Tr className="hover:bg-transparent">
                <Th className="w-8" aria-label="Expand" />
                <Th>Name</Th>
                <Th>Capability</Th>
                <Th>Kind</Th>
                <Th>Schedule</Th>
                <Th>Last run</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </Thead>
            <tbody>
              {agents.map((a) => {
                const expanded = expandedId === a.id
                return (
                  <AgentRow
                    key={a.id}
                    a={a}
                    expanded={expanded}
                    running={runMutation.isPending && runMutation.variables === a.id}
                    onToggle={() => setExpandedId((cur) => (cur === a.id ? null : a.id))}
                    onRun={() => runMutation.mutate(a.id)}
                  />
                )
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  )
}

/* ─── Row + activity section ────────────────────────────────────────────────── */

function AgentRow({ a, expanded, running, onToggle, onRun }: {
  a: Agent
  expanded: boolean
  running: boolean
  onToggle: () => void
  onRun: () => void
}) {
  const d = a.data
  return (
    <>
      <Tr className={cn('cursor-pointer', expanded && 'bg-white/[0.03]')} onClick={onToggle}>
        <Td className="w-8">
          <ChevronDown
            className={cn(
              'size-3.5 text-[var(--color-muted)] transition-transform',
              expanded && 'rotate-180 text-[var(--color-accent)]',
            )}
          />
        </Td>
        <Td className="max-w-56">
          <div className="flex items-center gap-2">
            <AgentStatusDot status={d.last_status} />
            <span className="truncate text-[13px] font-medium text-[var(--color-text)]">{d.name}</span>
          </div>
          {d.behind_adapter && (
            <div className="mt-0.5 truncate font-mono text-[10px] text-[var(--color-muted)]">
              via {d.behind_adapter}
            </div>
          )}
        </Td>
        <Td>
          <CapabilityBadge capability={d.capability} />
        </Td>
        <Td>
          <span
            className={cn(
              'font-mono text-[11px] tracking-wide',
              d.kind === 'adapter' ? 'text-amber-300/90' : 'text-[var(--color-text)]/85',
            )}
          >
            {d.kind}
          </span>
        </Td>
        <Td>
          <span className="font-mono text-[11px] text-[var(--color-muted)]">{d.schedule}</span>
        </Td>
        <Td className="text-xs whitespace-nowrap text-[var(--color-muted)]">
          {d.last_run ? timeAgo(d.last_run) : <span className="font-mono">never</span>}
        </Td>
        <Td>
          <StatusBadge status={d.last_status ?? 'empty'} />
        </Td>
        <Td>
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              disabled={running}
              onClick={(e) => {
                e.stopPropagation()
                onRun()
              }}
            >
              <Play className="size-3" />
              {running ? 'Running…' : 'Run'}
            </Button>
          </div>
        </Td>
      </Tr>
      {expanded && (
        <Tr className="hover:bg-transparent">
          <td colSpan={8} className="p-0">
            <div className="bg-[var(--color-bg)]/50">
              <div className="border-b border-[var(--color-border)]/50 px-4 py-2">
                <span className="font-mono text-[10px] font-semibold tracking-[0.25em] text-[var(--color-muted)]">
                  AGENT ACTIVITY — LAST {Math.min(d.runs.length, 10)} RUNS
                </span>
              </div>
              <RunLog runs={d.runs} />
            </div>
          </td>
        </Tr>
      )}
    </>
  )
}

export default AgentsPage
