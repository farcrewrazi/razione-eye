/**
 * DashboardHeader — homepage contract line 1: RAZIONE EYE — {Weekday} + date
 * + ⚡ actions-required chip + gate badge (→ /gate).
 *
 * The two badges are control-layer counters and stay global in every eye;
 * `subtitle` names the eye whose dashboard is rendered.
 */

import { Link } from 'react-router'
import { ShieldCheck, Zap } from 'lucide-react'
import { Badge } from '@/components/ui'
import { cn } from '@/lib/utils'

export function DashboardHeader({
  weekday,
  dateLine,
  subtitle,
  actionsRequired,
  gatePending,
}: {
  weekday: string
  dateLine: string
  subtitle: string
  actionsRequired: number
  gatePending: number
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-mono text-2xl font-bold tracking-tight text-[var(--color-text)]">
          RAZIONE EYE <span className="text-[var(--color-border)]">—</span>{' '}
          <span className="text-[var(--color-accent)]">{weekday.toUpperCase()}</span>
        </h1>
        <p className="mt-1 font-mono text-xs tracking-wider text-[var(--color-muted)]">
          {dateLine} · {subtitle}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          className={cn(
            'gap-1.5 px-2 py-1 font-mono text-[11px] tracking-wider',
            actionsRequired > 0
              ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
              : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
          )}
        >
          <Zap className="size-3" />
          {actionsRequired} ACTION{actionsRequired === 1 ? '' : 'S'} REQUIRED
        </Badge>
        <Link to="/gate" className="transition-opacity hover:opacity-80">
          <Badge
            className={cn(
              'gap-1.5 px-2 py-1 font-mono text-[11px] tracking-wider',
              gatePending > 0
                ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                : 'border-[var(--color-border)] text-[var(--color-muted)]',
            )}
          >
            <ShieldCheck className="size-3" />
            {gatePending} GATE PENDING
          </Badge>
        </Link>
      </div>
    </header>
  )
}
