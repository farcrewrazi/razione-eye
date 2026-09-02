/**
 * Layout-ish shared components: EmptyState, SectionHeader, PageHeader.
 */

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* ─── EmptyState ────────────────────────────────────────────────────────────── */

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  hint?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, hint, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] px-6 py-14 text-center',
        className,
      )}
    >
      {icon && <div className="mb-1 text-[var(--color-muted)] opacity-70 [&_svg]:size-8">{icon}</div>}
      <p className="text-sm font-medium text-[var(--color-text)]">{title}</p>
      {hint && <p className="max-w-sm text-xs leading-5 text-[var(--color-muted)]">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/* ─── SectionHeader ─────────────────────────────────────────────────────────── */

export interface SectionHeaderProps {
  title: string
  subtitle?: string
  right?: ReactNode
  className?: string
}

export function SectionHeader({ title, subtitle, right, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-wide text-[var(--color-text)]">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-[var(--color-muted)]">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

/* ─── PageHeader ────────────────────────────────────────────────────────────── */

export interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--color-text)]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-[var(--color-muted)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
