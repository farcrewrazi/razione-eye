/**
 * EyeBadge — small chip marking which Eye owns an object.
 *
 * Reused on detail pages (opportunities-detail header, …). Renders nothing
 * for unknown ids so it stays safe on hand-written data.
 */

import { EYES, type EyeId } from '@/lib/eyes'
import { cn } from '@/lib/utils'

export function EyeBadge({
  eye,
  className,
}: {
  eye: EyeId | string | null | undefined
  className?: string
}) {
  const def = eye != null && eye in EYES ? EYES[eye as EyeId] : null
  if (!def || def.id === 'ALL') return null
  const Icon = def.icon
  return (
    <span
      title={def.label}
      className={cn(
        'inline-flex items-center gap-1 rounded border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/10 px-1.5 py-0.5',
        'font-mono text-[10px] tracking-wider text-[var(--color-accent)]',
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={2} />
      {def.shortLabel.toUpperCase()} EYE
    </span>
  )
}

export default EyeBadge
