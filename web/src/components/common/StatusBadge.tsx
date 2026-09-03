/**
 * StatusBadge — color-codes ANY status string in the system.
 *
 * JOB pipeline progression (blues→greens), job terminals (grays/reds),
 * task statuses, signal dispositions, agent run statuses. Unknown → gray.
 */

import { Badge, type BadgeProps } from '@/components/ui'
import { cn } from '@/lib/utils'

/** Visual tone → Badge variant + optional dot color class. */
type Tone = 'blue' | 'cyan' | 'green' | 'amber' | 'red' | 'gray' | 'violet'

const toneStyles: Record<Tone, string> = {
  blue: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  cyan: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300',
  green: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  amber: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  red: 'border-red-400/30 bg-red-400/10 text-red-300',
  gray: 'border-white/10 bg-white/5 text-[var(--color-muted)]',
  violet: 'border-violet-400/30 bg-violet-400/10 text-violet-300',
}

/** status → tone. Keys are uppercase snake (node.status vocabulary). */
const STATUS_TONES: Record<string, Tone> = {
  // JOB pipeline — progression from discovery to hire (blues → greens)
  DISCOVERED: 'blue',
  ANALYZED: 'blue',
  QUALIFIED: 'cyan',
  READY_TO_APPLY: 'cyan',
  APPLIED: 'green',
  RECRUITER_RESPONSE: 'green',
  INTERVIEW: 'green',
  OFFER: 'green',
  HIRED: 'green',
  // JOB terminals — grays/reds
  REJECTED: 'red',
  IGNORED: 'gray',
  NOT_SUITABLE: 'gray',
  EXPIRED: 'gray',
  // Task statuses
  TODO: 'gray',
  IN_PROGRESS: 'blue',
  DONE: 'green',
  CANCELLED: 'gray',
  // Signal dispositions
  NEW: 'blue',
  PROMOTED: 'green',
  DISMISSED: 'gray',
  DUPLICATE: 'gray',
  // Action Gate statuses (T1.11 [W4])
  PENDING: 'amber',
  APPROVED: 'green',
  // Agent run statuses
  ok: 'green',
  error: 'red',
  empty: 'gray',
}

export interface StatusBadgeProps extends Omit<BadgeProps, 'variant' | 'children'> {
  status: string | null | undefined
}

export function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  if (!status) return null
  const tone = STATUS_TONES[status] ?? 'gray'
  return (
    <Badge
      className={cn('border px-1.5 font-mono text-[10px] tracking-wider', toneStyles[tone], className)}
      {...props}
    >
      {status}
    </Badge>
  )
}
