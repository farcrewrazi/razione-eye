/**
 * AppShell — fixed left sidebar (w-60 ↔ w-14 collapsible) + main content area.
 * Dark command-center aesthetic: dense, crisp, single accent color.
 */

import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Toaster } from '@/components/ui/toast'
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

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Primary">
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
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

function TopBar() {
  const { pathname } = useLocation()
  const crumbs = crumbsFor(pathname)
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
      <time className="shrink-0 font-mono text-xs tracking-wider text-[var(--color-muted)] tabular-nums">
        {date}
      </time>
    </header>
  )
}

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
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
  )
}
