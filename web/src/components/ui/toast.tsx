/**
 * Tiny toast system — context + store + auto-dismiss, zero deps.
 *
 * Usage:
 *   const { toast } = useToast()          // inside React tree
 *   toast('Saved', { description: '…' })  // or toast.success/error/info(...)
 *   <Toaster /> mounted once in AppShell.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'

export type ToastVariant = 'default' | 'success' | 'error' | 'info'

export interface ToastOptions {
  description?: string
  variant?: ToastVariant
  /** ms; default 4000 */
  duration?: number
}

export interface ToastItem extends Required<Omit<ToastOptions, 'description'>> {
  id: number
  title: string
  description?: string
}

type PushFn = (title: string, options?: ToastOptions) => void

interface ToastContextValue {
  toast: PushFn & { success: PushFn; error: PushFn; info: PushFn }
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** Imperative store so `toast()` works outside React too. */
class ToastStore {
  private listeners = new Set<(items: ToastItem[]) => void>()
  private items: ToastItem[] = []
  private nextId = 1
  private timers = new Map<number, ReturnType<typeof setTimeout>>()

  subscribe = (fn: (items: ToastItem[]) => void): (() => void) => {
    this.listeners.add(fn)
    fn(this.items)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): ToastItem[] => this.items

  push = (title: string, options: ToastOptions = {}): number => {
    const id = this.nextId++
    const item: ToastItem = {
      id,
      title,
      description: options.description,
      variant: options.variant ?? 'default',
      duration: options.duration ?? 4000,
    }
    this.items = [...this.items, item].slice(-5) // cap visible stack
    this.emit()
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), item.duration),
    )
    return id
  }

  dismiss = (id: number): void => {
    const timer = this.timers.get(id)
    if (timer) clearTimeout(timer)
    this.timers.delete(id)
    if (!this.items.some((t) => t.id === id)) return
    this.items = this.items.filter((t) => t.id !== id)
    this.emit()
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.items)
  }
}

const store = new ToastStore()

const variantIcon: Record<ToastVariant, string> = {
  default: '',
  success: '✓',
  error: '✕',
  info: 'ℹ',
}

const variantClass: Record<ToastVariant, string> = {
  default: 'border-[var(--color-border)]',
  success: 'border-emerald-400/40',
  error: 'border-red-400/40',
  info: 'border-[var(--color-accent)]/40',
}

const iconClass: Record<ToastVariant, string> = {
  default: 'text-transparent',
  success: 'text-emerald-300',
  error: 'text-red-300',
  info: 'text-[var(--color-accent)]',
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex w-80 items-start gap-2.5 rounded-lg border bg-[var(--color-surface)] px-3.5 py-3 shadow-lg shadow-black/40',
        variantClass[item.variant],
      )}
    >
      <span className={cn('mt-0.5 text-xs font-bold select-none', iconClass[item.variant])}>
        {variantIcon[item.variant]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-5 font-medium text-[var(--color-text)]">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-xs leading-4 text-[var(--color-muted)]">
            {item.description}
          </p>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(item.id)}
        className="rounded p-0.5 text-[var(--color-muted)] transition-colors hover:bg-white/5 hover:text-[var(--color-text)]"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const push = useCallback<PushFn>((title, options) => store.push(title, options), [])

  const value = useMemo<ToastContextValue>(() => {
    const withVariant =
      (variant: ToastVariant): PushFn =>
      (title, options = {}) =>
        store.push(title, { ...options, variant })
    const base = Object.assign(push, {
      success: withVariant('success'),
      error: withVariant('error'),
      info: withVariant('info'),
    })
    return { toast: base, dismiss: store.dismiss }
  }, [push])

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

/** Hook for components inside the React tree. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (ctx) return ctx
  // Fallback to the imperative store so the hook never crashes before mount.
  return {
    toast: Object.assign(
      (title: string, options?: ToastOptions) => store.push(title, options),
      {
        success: (title: string, options?: ToastOptions) => store.push(title, { ...options, variant: 'success' }),
        error: (title: string, options?: ToastOptions) => store.push(title, { ...options, variant: 'error' }),
        info: (title: string, options?: ToastOptions) => store.push(title, { ...options, variant: 'info' }),
      },
    ),
    dismiss: store.dismiss,
  }
}

/** Imperative helper usable anywhere (event handlers, outside components). */
export const toast = Object.assign(
  (title: string, options?: ToastOptions) => store.push(title, options),
  {
    success: (title: string, options?: ToastOptions) => store.push(title, { ...options, variant: 'success' }),
    error: (title: string, options?: ToastOptions) => store.push(title, { ...options, variant: 'error' }),
    info: (title: string, options?: ToastOptions) => store.push(title, { ...options, variant: 'info' }),
  },
)

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>(store.getSnapshot())
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    unsubRef.current = store.subscribe(setItems)
    return () => unsubRef.current?.()
  }, [])

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col-reverse gap-2"
    >
      {items.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={store.dismiss} />
      ))}
    </div>
  )
}
