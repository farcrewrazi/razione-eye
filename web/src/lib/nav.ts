/** Single source of truth for nav ↔ route ↔ title mapping. */

import {
  Bot,
  Briefcase,
  Building2,
  CheckSquare,
  LayoutDashboard,
  Radio,
  Sunrise,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/opportunities', label: 'Opportunities', icon: Briefcase },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/companies', label: 'Companies', icon: Building2 },
  { to: '/signals', label: 'Signals', icon: Radio },
  { to: '/agents', label: 'Agents', icon: Bot },
  { to: '/daily-brief', label: 'Daily Brief', icon: Sunrise },
]

/** Crumb chain for the top bar; derived from pathname. */
export function crumbsFor(pathname: string): string[] {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return []
  const [head, ...rest] = parts
  const headLabel =
    NAV_ITEMS.find(
      (n) => n.to === `/${head}` || (head === 'opportunities' && n.to === '/opportunities'),
    )?.label ?? (head === 'profile' ? 'Profile' : head)
  return [headLabel, ...rest.map((p) => (p.length > 8 ? `${p.slice(0, 8)}…` : p))]
}
