/**
 * AgentStatusDot — tiny status indicator.
 * ok=green (with pulse), error=red, empty=gray.
 */

import type { AgentRunStatus } from '@/api/types'
import { cn } from '@/lib/utils'

const dotStyles: Record<AgentRunStatus, string> = {
  ok: 'bg-emerald-400',
  error: 'bg-red-400',
  empty: 'bg-[var(--color-muted)]',
}

export interface AgentStatusDotProps {
  status: AgentRunStatus | string | null | undefined
  className?: string
}

export function AgentStatusDot({ status, className }: AgentStatusDotProps) {
  const s = (status ?? 'empty') as AgentRunStatus
  const style = dotStyles[s] ?? dotStyles.empty
  return (
    <span className={cn('relative inline-flex size-2.5 shrink-0', className)} title={s}>
      <span className={cn('absolute inset-0 rounded-full', style, s === 'ok' && 'animate-ping opacity-60')} />
      <span className={cn('relative inline-flex size-2.5 rounded-full', style)} />
    </span>
  )
}
