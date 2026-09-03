/**
 * EyeSwitcher — the Eye-focus dropdown in the TopBar.
 *
 * Trigger: eye icon + short label + ChevronDown; accented whenever the focus
 * isn't ALL. Popover lists ALL + the five eyes with descriptors; BUSINESS and
 * GROWTH are disabled and carry a PHASE badge until they come online.
 *
 * Accessibility: trigger is a button with aria-haspopup="menu" / aria-expanded;
 * the popover is role="menu" with role="menuitemradio" options; Escape and
 * backdrop click close it; ↑/↓ moves between enabled options.
 */

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { EYE_LIST, type EyeId } from '@/lib/eyes'
import { useEyeFocus } from '@/hooks/useEyeFocus'
import { cn } from '@/lib/utils'

export function EyeSwitcher() {
  const { eye, def, focused, setEye } = useEyeFocus()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const TriggerIcon = def.icon

  // Escape closes (regardless of where focus is inside the popover).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Outside-pointer close (backdrop covers the whole viewport; this catches
  // clicks that land on other fixed chrome).
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const select = (id: EyeId): void => {
    setEye(id)
    setOpen(false)
  }

  /** Arrow-key navigation across enabled options. */
  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]:not(:disabled)'),
    )
    if (items.length === 0) return
    const activeIndex = items.findIndex((el) => el === document.activeElement)
    const delta = e.key === 'ArrowDown' ? 1 : -1
    const next = items[(activeIndex + delta + items.length) % items.length]
    next?.focus()
  }

  return (
    <div ref={rootRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Eye focus: ${def.label}`}
        title={`Eye focus — ${def.label}`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-mono text-[11px] tracking-wider transition-colors',
          'outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/60',
          focused
            ? 'border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
            : 'border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-accent)]/40 hover:text-[var(--color-text)]',
        )}
      >
        <TriggerIcon className="size-3.5 shrink-0" strokeWidth={1.75} />
        {/* Icon-only on small screens (label from md: up). */}
        <span className="hidden md:inline">{def.shortLabel.toUpperCase()}</span>
        <ChevronDown className={cn('size-3 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          {/* Backdrop — click-away close */}
          <div className="fixed inset-0 z-40 cursor-default" aria-hidden onClick={() => setOpen(false)} />

          {/* Popover */}
          <div
            role="menu"
            aria-label="Choose Eye focus"
            onKeyDown={onMenuKeyDown}
            className="absolute right-0 z-50 mt-1.5 w-72 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl shadow-black/50"
          >
            <p className="border-b border-[var(--color-border)]/60 px-3 py-2 font-mono text-[9px] font-semibold tracking-[0.25em] text-[var(--color-muted)]">
              FOCUS AN EYE
            </p>
            <ul className="flex flex-col p-1">
              {EYE_LIST.map((item) => {
                const Icon = item.icon
                const active = item.id === eye
                const disabled = !item.live
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      disabled={disabled}
                      onClick={() => select(item.id)}
                      className={cn(
                        'flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                        'outline-none focus-visible:bg-white/5',
                        active
                          ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                          : 'text-[var(--color-text)] hover:bg-white/5',
                        disabled && 'cursor-not-allowed opacity-45 hover:bg-transparent',
                      )}
                    >
                      <Icon
                        className={cn(
                          'mt-0.5 size-4 shrink-0',
                          active ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]',
                        )}
                        strokeWidth={1.75}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-semibold tracking-[0.18em]">
                            {item.shortLabel.toUpperCase()}
                          </span>
                          {item.phase !== undefined && (
                            <span className="rounded border border-[var(--color-border)] px-1 py-px font-mono text-[8px] tracking-[0.15em] text-[var(--color-muted)]">
                              PHASE {item.phase}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-[var(--color-muted)]">
                          {item.description}
                        </span>
                      </span>
                      {active && <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--color-accent)]" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}

export default EyeSwitcher
