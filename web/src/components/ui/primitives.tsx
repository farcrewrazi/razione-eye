/**
 * UI primitives — hand-rolled shadcn-style, Radix-free, dark theme.
 * Colors come from CSS variables in index.css.
 */

import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/utils'

/* ─── Button ────────────────────────────────────────────────────────────────── */

const buttonVariants = {
  default:
    'bg-[var(--color-accent)] text-[#0a0a0f] hover:bg-[#a5e0fc] active:bg-[#67c4f2] font-medium',
  ghost: 'text-[var(--color-text)] hover:bg-white/5 active:bg-white/10',
  outline:
    'border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-accent)]/50 hover:bg-white/5',
  subtle: 'bg-white/5 text-[var(--color-text)] hover:bg-white/10 active:bg-white/15',
} as const

const buttonSizes = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
} as const

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants
  size?: keyof typeof buttonSizes
}

export function Button({
  className,
  variant = 'default',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-md whitespace-nowrap',
        'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/60',
        'disabled:pointer-events-none disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  )
}

/* ─── Badge ─────────────────────────────────────────────────────────────────── */

const badgeVariants = {
  default: 'bg-white/10 text-[var(--color-text)] border-transparent',
  outline: 'border-[var(--color-border)] text-[var(--color-muted)]',
  accent:
    'border-transparent bg-[var(--color-accent)]/15 text-[var(--color-accent)]',
  success: 'border-transparent bg-emerald-400/15 text-emerald-300',
  warning: 'border-transparent bg-amber-400/15 text-amber-300',
  danger: 'border-transparent bg-red-400/15 text-red-300',
  muted: 'border-transparent bg-white/5 text-[var(--color-muted)]',
} as const

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof badgeVariants
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] leading-4 font-medium tracking-wide',
        badgeVariants[variant],
        className,
      )}
      {...props}
    />
  )
}

/* ─── Card ──────────────────────────────────────────────────────────────────── */

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-between gap-2 px-4 pt-4 pb-2', className)}
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-sm font-semibold tracking-wide text-[var(--color-text)]', className)}
      {...props}
    />
  )
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 pt-2 pb-4', className)} {...props} />
}

/* ─── Skeleton ──────────────────────────────────────────────────────────────── */

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-white/5', className)}
      {...props}
    />
  )
}

/* ─── Separator ─────────────────────────────────────────────────────────────── */

export function Separator({
  className,
  orientation = 'horizontal',
}: {
  className?: string
  orientation?: 'horizontal' | 'vertical'
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'shrink-0 bg-[var(--color-border)]',
        orientation === 'horizontal' ? 'h-px w-full' : 'w-px self-stretch',
        className,
      )}
    />
  )
}

/* ─── Input ─────────────────────────────────────────────────────────────────── */

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-text)]',
        'placeholder:text-[var(--color-muted)]/60',
        'transition-colors outline-none focus:border-[var(--color-accent)]/60 focus:ring-2 focus:ring-[var(--color-accent)]/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

/* ─── Textarea ──────────────────────────────────────────────────────────────── */

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm leading-5 text-[var(--color-text)]',
        'placeholder:text-[var(--color-muted)]/60',
        'transition-colors outline-none focus:border-[var(--color-accent)]/60 focus:ring-2 focus:ring-[var(--color-accent)]/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

/* ─── Select (native) ───────────────────────────────────────────────────────── */

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-9 w-full appearance-none rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 pr-8 text-sm text-[var(--color-text)]',
        'bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%238b8ba3%22 stroke-width=%222%22%3E%3Cpath d=%22m6 9 6 6 6-6%22/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_0.5rem_center] bg-no-repeat',
        'transition-colors outline-none focus:border-[var(--color-accent)]/60 focus:ring-2 focus:ring-[var(--color-accent)]/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

/* ─── Table ─────────────────────────────────────────────────────────────────── */

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn('w-full border-collapse text-left text-sm', className)}
        {...props}
      />
    </div>
  )
}

export function Thead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        'border-b border-[var(--color-border)] text-[11px] tracking-wider text-[var(--color-muted)] uppercase',
        className,
      )}
      {...props}
    />
  )
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'border-b border-[var(--color-border)]/60 transition-colors last:border-0 hover:bg-white/[0.03]',
        className,
      )}
      {...props}
    />
  )
}

export function Th({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('px-3 py-2 font-medium whitespace-nowrap', className)} {...props} />
}

export function Td({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2.5 align-middle', className)} {...props} />
}

/* ─── Tooltip (title-attr fallback) ─────────────────────────────────────────── */

export function Tooltip({
  content,
  children,
  className,
}: {
  content: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cn('inline-flex', className)} title={typeof content === 'string' ? content : undefined}>
      {children}
    </span>
  )
}
