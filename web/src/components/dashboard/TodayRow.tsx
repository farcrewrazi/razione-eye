/**
 * TodayRow — one eye's metric row inside the dashboard's TODAY section.
 *
 * Shared by the ALL/CONTROL overview (all four rows) and each focused eye's
 * dashboard (its own row) via the registry in routes/dashboard.tsx.
 */

import { Badge } from '@/components/ui'
import { cn } from '@/lib/utils'

export interface Metric {
  value: number
  label: string
}

export function TodayRow({
  eye,
  metrics,
  phase,
  live,
}: {
  eye: string
  metrics: Metric[]
  /** When set the eye isn't live yet — values render muted + phase tag. */
  phase?: number
  live?: boolean
}) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-center gap-3 px-4 py-2.5">
      <span className="font-mono text-[11px] font-medium tracking-[0.18em] text-[var(--color-text)]/80">
        {eye}
      </span>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {metrics.map((m) => (
          <span key={m.label} className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
            <span
              className={cn(
                'font-mono text-sm font-semibold tabular-nums',
                live && m.value > 0 ? 'text-[var(--color-text)]' : 'text-[var(--color-muted)]',
              )}
            >
              {m.value}
            </span>
            <span className="text-xs text-[var(--color-muted)]">{m.label}</span>
          </span>
        ))}
        {phase !== undefined && (
          <Badge variant="outline" className="font-mono text-[9px] tracking-[0.15em]">
            ONLINE IN PHASE {phase}
          </Badge>
        )}
      </div>
    </div>
  )
}
