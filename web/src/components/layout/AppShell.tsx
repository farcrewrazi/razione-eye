/**
 * AppShell — fixed left sidebar (w-60 ↔ w-14 collapsible) + main content area.
 * Dark command-center aesthetic: dense, crisp, single accent color.
 */

import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Link } from 'react-router'
import { ChevronsLeft, ChevronsRight, X } from 'lucide-react'
import { Toaster } from '@/components/ui/toast'
import { EyeSwitcher } from '@/components/eye/EyeSwitcher'
import { EyeFocusProvider, useEyeFocus } from '@/hooks/useEyeFocus'
import { NAV_ITEMS, crumbsFor } from '@/lib/nav'
import { cn } from '@/lib/utils'

const API_MODE = import.meta.env.VITE_API_MODE ?? 'mock'

function ApiModeBadge() {
  const live = API_MODE === 'real'
  return (
    <div className="flex flex-col items-start gap-1.5 px-3 py-3">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-widest',
          live
            ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
            : 'border-amber-400/40 bg-amber-400/10 text-amber-300',
        )}
        title={`API mode: ${API_MODE}`}
      >
        <span
          className={cn(
            'size-1.5 rounded-full',
            live ? 'bg-emerald-400' : 'bg-amber-400',
          )}
        />
        {live ? 'LIVE' : 'MOCK'}
      </span>
      <span className="font-mono text-[10px] tracking-widest text-[var(--color-muted)]/70">
        v0.1
      </span>
    </div>
  )
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { def, focused } = useEyeFocus()
  const visibleItems = focused
    ? NAV_ITEMS.filter((item) => def.navAllow.includes(item.to))
    : NAV_ITEMS

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      {/* Wordmark */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 font-mono text-sm font-bold text-[var(--color-accent)]">
          R
        </span>
        {!collapsed && (
          <div className="min-w-0 leading-none">
            <div className="font-mono text-[13px] font-bold tracking-[0.18em] text-[var(--color-text)]">
              RAZIONE
            </div>
            <div className="mt-0.5 font-mono text-[10px] tracking-[0.5em] text-[var(--color-accent)]">
              EYE
            </div>
          </div>
        )}
      </div>

      {/* Nav — narrowed to the focused eye's navAllow (ALL shows everything) */}
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Primary">
        <ul className="flex flex-col gap-0.5">
          {visibleItems.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex h-9 items-center gap-3 rounded-md px-2.5 text-[13px] transition-colors',
                    collapsed && 'justify-center px-0',
                    isActive
                      ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                      : 'text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-text)]',
                  )
                }
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                {!collapsed && <span className="truncate">{label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
        {focused && !collapsed && (
          <p className="mt-3 border-t border-[var(--color-border)] px-2.5 pt-3 font-mono text-[10px] tracking-widest text-[var(--color-accent)]/80">
            {def.shortLabel.toUpperCase()} FOCUS · {visibleItems.length}/{NAV_ITEMS.length}
          </p>
        )}
      </nav>

      {/* Bottom: API mode + collapse toggle */}
      <div className="shrink-0 border-t border-[var(--color-border)]">
        {!collapsed && <ApiModeBadge />}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex h-9 w-full items-center gap-3 px-2.5 text-[var(--color-muted)] transition-colors hover:bg-white/5 hover:text-[var(--color-text)]',
            collapsed && 'justify-center px-0',
          )}
        >
          {collapsed ? (
            <ChevronsRight className="size-4 shrink-0" strokeWidth={1.75} />
          ) : (
            <>
              <ChevronsLeft className="size-4 shrink-0" strokeWidth={1.75} />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}

/** Active-focus chip — visible whenever an eye is focused, X resets to ALL. */
function FocusChip() {
  const { def, focused, reset } = useEyeFocus()
  if (!focused) return null
  const Icon = def.icon
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-2 font-mono text-[10px] tracking-wider text-[var(--color-accent)]">
      <Icon className="size-3 shrink-0" strokeWidth={2} />
      <span className="hidden lg:inline">FOCUS: {def.shortLabel.toUpperCase()}</span>
      <span className="lg:hidden">{def.shortLabel.toUpperCase()}</span>
      <button
        type="button"
        onClick={reset}
        aria-label="Reset eye focus to All"
        title="Reset to All Eyes"
        className="grid size-4 place-items-center rounded-sm transition-colors hover:bg-[var(--color-accent)]/20"
      >
        <X className="size-3" />
      </button>
    </span>
  )
}

function TopBar() {
  const { pathname } = useLocation()
  const crumbs = crumbsFor(pathname)
  const isActiveRoute = (to: string): boolean => pathname === to || pathname.startsWith(`${to}/`)
  const date = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 px-6 backdrop-blur">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex items-center gap-1.5 font-mono text-xs tracking-wider">
          {crumbs.length === 0 ? (
            <li className="text-[var(--color-muted)]">/</li>
          ) : (
            crumbs.map((crumb, i) => (
              <li key={`${crumb}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-[var(--color-border)]">/</span>}
                <span
                  className={cn(
                    'truncate',
                    i === crumbs.length - 1
                      ? 'text-[var(--color-text)]'
                      : 'text-[var(--color-muted)]',
                  )}
                >
                  {crumb}
                </span>
              </li>
            ))
          )}
        </ol>
      </nav>
      <div className="flex shrink-0 items-center gap-3">
        <EyeSwitcher />
        <FocusChip />
        <time className="hidden font-mono text-xs tracking-wider text-[var(--color-muted)] tabular-nums sm:inline">
          {date}
        </time>
        {/* Razi Profile access — subtle "R" avatar */}
        <Link
          to="/profile"
          aria-label="Razi Profile"
          title="Razi Profile"
          className={cn(
            'grid size-8 place-items-center rounded-full border font-mono text-xs font-bold transition-colors',
            isActiveRoute('/profile')
              ? 'border-[var(--color-accent)]/60 bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
              : 'border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-accent)]/50 hover:text-[var(--color-accent)]',
          )}
        >
          R
        </Link>
      </div>
    </header>
  )
}

/**
 * Focus redirect — when the focused eye changes and the current route is no
 * longer in the eye's navAllow, bounce to '/' (the per-eye home anchor) so the
 * user never sits on a surface their sidebar can't reach. '/profile' is an
 * avatar route outside the sidebar — never blocked. Deep links to hidden
 * routes still render; the guard only fires on eye changes.
 */
function EyeFocusRedirect() {
  const { eye, def } = useEyeFocus()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (eye === 'ALL' || pathname === '/profile') return
    const base = `/${pathname.split('/')[1] ?? ''}`
    if (!def.navAllow.includes(base)) {
      navigate('/', { replace: true })
    }
  }, [eye, def, pathname, navigate])

  return null
}

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <EyeFocusProvider>
      <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
        <EyeFocusRedirect />
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        <div
          className={cn(
            'flex min-h-screen flex-col transition-[padding] duration-200',
            collapsed ? 'pl-14' : 'pl-60',
          )}
        >
          <TopBar />
          <main className="flex-1">
            <div className="mx-auto w-full max-w-6xl px-6 py-6">
              <Outlet />
            </div>
          </main>
        </div>
        <Toaster />
      </div>
    </EyeFocusProvider>
  )
}
