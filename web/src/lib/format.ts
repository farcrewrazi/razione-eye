/**
 * Formatting helpers — relative time, dates, due-state, score colors, tokens.
 * Palette matches ScoreBar.tsx (single accent system).
 */

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

/** Relative time: past "2h ago" · future "in 3d" · beyond a month → calendar date. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const diff = now.getTime() - t
  const past = diff >= 0
  const abs = Math.abs(diff)
  if (abs < MINUTE) return 'just now'
  const wrap = (v: string): string => (past ? `${v} ago` : `in ${v}`)
  if (abs < HOUR) return wrap(`${Math.round(abs / MINUTE)}m`)
  if (abs < DAY) return wrap(`${Math.round(abs / HOUR)}h`)
  if (abs < 30 * DAY) return wrap(`${Math.round(abs / DAY)}d`)
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** "Sep 2, 09:00" style timestamp. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return `${date}, ${time}`
}

export type DueTone = 'overdue' | 'soon' | 'normal'

export interface DueMeta {
  tone: DueTone
  label: string
}

/**
 * Next-action due descriptor. Overdue (< now) and due-soon (within 48h) get
 * highlighted tones in the UI. Non-ISO strings pass through untouched.
 */
export function dueMeta(iso: string, now: Date = new Date()): DueMeta {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return { tone: 'normal', label: iso }
  const rel = timeAgo(iso, now)
  const diff = t - now.getTime()
  if (diff < 0) return { tone: 'overdue', label: `overdue · ${rel}` }
  if (diff <= 48 * HOUR) return { tone: 'soon', label: `due ${rel}` }
  return { tone: 'normal', label: `due ${rel}` }
}

/** Score → color. Same palette as ScoreBar/ScoreDial. */
export function scoreColor(value: number): string {
  if (value >= 90) return 'var(--color-accent)'
  if (value >= 75) return '#34d399' // emerald-400
  if (value >= 60) return '#fbbf24' // amber-400
  return '#8b8ba3' // muted
}

/** "reply_to_recruiter" → "Reply To Recruiter" (AI stays uppercase). */
export function humanizeToken(token: string): string {
  return token
    .split('_')
    .map((w) => (w.toLowerCase() === 'ai' ? 'AI' : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
}

/** Salary label: prefer the explicit string, else derive from min/max (MYR). */
export function salaryLabel(d: { salary?: string; salary_min?: number; salary_max?: number }): string {
  if (d.salary) return d.salary
  if (d.salary_min != null || d.salary_max != null) {
    const fmt = (n: number): string => `RM ${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
    const lo = d.salary_min != null ? fmt(d.salary_min) : '?'
    const hi = d.salary_max != null ? fmt(d.salary_max) : '?'
    return `${lo}–${hi}`
  }
  return '—'
}
