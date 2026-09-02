/**
 * ScoreBar — labeled horizontal 0–100 bar with numeric readout.
 * ScoreDial — big-number circular variant for detail pages.
 */

import { cn } from '@/lib/utils'

function scoreColor(value: number): string {
  if (value >= 90) return 'var(--color-accent)'
  if (value >= 75) return '#34d399' // emerald-400
  if (value >= 60) return '#fbbf24' // amber-400
  return '#8b8ba3' // muted
}

export interface ScoreBarProps {
  label: string
  /** 0–100; null/undefined renders an indeterminate muted bar */
  value?: number | null
  className?: string
}

export function ScoreBar({ label, value, className }: ScoreBarProps) {
  const v = typeof value === 'number' ? Math.max(0, Math.min(100, value)) : null
  return (
    <div className={cn('w-full', className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs tracking-wide text-[var(--color-muted)]">{label}</span>
        <span
          className="font-mono text-xs tabular-nums"
          style={{ color: v === null ? 'var(--color-muted)' : scoreColor(v) }}
        >
          {v === null ? '—' : v}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-white/5"
        role="meter"
        aria-valuenow={v ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} score`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${v ?? 0}%`,
            backgroundColor: v === null ? 'var(--color-muted)' : scoreColor(v),
            opacity: v === null ? 0.3 : 1,
          }}
        />
      </div>
    </div>
  )
}

/* ─── ScoreDial ─────────────────────────────────────────────────────────────── */

export interface ScoreDialProps {
  value?: number | null
  /** px; default 120 */
  size?: number
  label?: string
  className?: string
}

export function ScoreDial({ value, size = 120, label = 'Match score', className }: ScoreDialProps) {
  const v = typeof value === 'number' ? Math.max(0, Math.min(100, value)) : null
  const stroke = 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const color = v === null ? 'var(--color-muted)' : scoreColor(v)
  const filled = v === null ? 0 : (v / 100) * c

  return (
    <div
      className={cn('flex flex-col items-center gap-1.5', className)}
      role="meter"
      aria-valuenow={v ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${c}`}
            className="transition-[stroke-dasharray] duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-mono text-3xl font-bold tabular-nums"
            style={{ color }}
          >
            {v ?? '—'}
          </span>
        </div>
      </div>
      <span className="text-xs tracking-wide text-[var(--color-muted)]">{label}</span>
    </div>
  )
}
