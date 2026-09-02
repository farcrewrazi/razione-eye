/**
 * BandBadge — score band chips.
 * PRIORITY (accent/hot), APPLY (green), REVIEW (amber), ARCHIVE (gray).
 */

import { Badge, type BadgeProps } from '@/components/ui'
import type { ScoreBand } from '@/api/types'
import { cn } from '@/lib/utils'

const bandStyles: Record<ScoreBand, string> = {
  PRIORITY: 'border-[var(--color-accent)]/50 bg-[var(--color-accent)]/15 text-[var(--color-accent)]',
  APPLY: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  REVIEW: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  ARCHIVE: 'border-white/10 bg-white/5 text-[var(--color-muted)]',
}

export interface BandBadgeProps extends Omit<BadgeProps, 'variant' | 'children'> {
  band: ScoreBand
}

export function BandBadge({ band, className, ...props }: BandBadgeProps) {
  return (
    <Badge
      className={cn('border px-1.5 font-mono text-[10px] tracking-wider', bandStyles[band], className)}
      {...props}
    >
      {band}
    </Badge>
  )
}
