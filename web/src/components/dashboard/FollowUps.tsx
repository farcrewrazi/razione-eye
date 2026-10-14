/**
 * FollowUps — post-application follow-up reminders (T1.8): opportunities in
 * the waiting stages (APPLIED → OFFER) with a due/overdue `next_action` — the
 * "replies and follow-ups never slip" promise, visible on the dashboard.
 *
 * Career-owned content (JOB opportunities): eye dashboards render it only
 * under CAREER (plus the ALL/CONTROL overview). Returns null when empty.
 */

import { Link } from 'react-router'
import { CalendarClock } from 'lucide-react'
import type { Opportunity } from '@/api/types'
import { SectionHeader, StatusBadge } from '@/components/common'
import { Badge, Card } from '@/components/ui'
import { dueMeta } from '@/lib/format'
import { cn } from '@/lib/utils'

const FOLLOW_UP_STATUSES = ['APPLIED', 'RECRUITER_RESPONSE', 'INTERVIEW', 'OFFER']

const followUpTone: Record<string, string> = {
  overdue: 'border-red-400/40 bg-red-400/10 text-red-300',
  soon: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  normal: 'border-[var(--color-border)] bg-white/[0.03] text-[var(--color-muted)]',
}

export function FollowUps({ opportunities }: { opportunities: Opportunity[] }) {
  const followUps = opportunities
    .filter((o) => o.status != null && FOLLOW_UP_STATUSES.includes(o.status))
    .map((o) => ({ o, due: o.data.next_action?.due ? dueMeta(o.data.next_action.due) : null }))
    // Urgent first: overdue → due soon → everything else; then by company/role for stability.
    .sort((a, b) => {
      const rank = { overdue: 0, soon: 1, normal: 2 } as const
      const ra = a.due ? rank[a.due.tone] : 3
      const rb = b.due ? rank[b.due.tone] : 3
      if (ra !== rb) return ra - rb
      return (a.o.company?.name ?? '').localeCompare(b.o.company?.name ?? '')
    })
    .slice(0, 5)

  if (followUps.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="FOLLOW-UPS"
        subtitle="Applications awaiting a reply or next step"
        right={
          <Badge variant="outline" className="font-mono text-[10px] tracking-wider">
            {followUps.length} TRACKING
          </Badge>
        }
      />
      <Card>
        <div className="divide-y divide-[var(--color-border)]/60">
          {followUps.map(({ o, due }) => (
            <Link
              key={o.id}
              to={`/opportunities/${o.id}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-[var(--color-accent)]/[0.05]"
            >
              <StatusBadge status={o.status} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-text)]">
                {o.data.role ?? o.name}
                {o.company?.name && (
                  <span className="text-[var(--color-muted)]"> — {o.company.name}</span>
                )}
              </span>
              {o.data.applied_date && (
                <span className="font-mono text-[10px] tracking-wider text-[var(--color-muted)] tabular-nums">
                  APPLIED {o.data.applied_date}
                </span>
              )}
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wider whitespace-nowrap',
                  due ? followUpTone[due.tone] : 'border-[var(--color-border)] bg-white/[0.03] text-[var(--color-muted)]',
                )}
              >
                <CalendarClock className="size-3" />
                {due?.label ?? 'no date'}
              </span>
            </Link>
          ))}
        </div>
      </Card>
    </section>
  )
}
