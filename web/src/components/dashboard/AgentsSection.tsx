/**
 * AgentsSection — the AGENTS grid: the worker registry with status dot +
 * last run. Control-layer ops surface; eye dashboards show it only when
 * their navAllow includes /agents (SIGNAL — agent-produced detections).
 */

import type { Agent } from '@/api/types'
import { AgentStatusDot, SectionHeader } from '@/components/common'
import { Badge, Card } from '@/components/ui'
import { timeAgo } from '@/lib/format'

export function AgentsSection({ agents }: { agents: Agent[] }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="AGENTS"
        subtitle="Discovery & analysis workers — last run"
        right={
          <Badge variant="outline" className="font-mono text-[10px] tracking-wider">
            {agents.length} REGISTERED
          </Badge>
        }
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {agents.map((a) => (
          <Card key={a.id} className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <AgentStatusDot status={a.data.last_status} />
              <span className="truncate text-xs font-medium text-[var(--color-text)]">
                {a.data.name}
              </span>
            </div>
            <p className="mt-1.5 font-mono text-[10px] tracking-wider text-[var(--color-muted)]">
              {a.data.last_run ? `LAST RUN ${timeAgo(a.data.last_run).toUpperCase()}` : 'NEVER RUN'}
              {a.data.kind === 'adapter' ? ' · ADAPTER' : ''}
            </p>
          </Card>
        ))}
      </div>
    </section>
  )
}
