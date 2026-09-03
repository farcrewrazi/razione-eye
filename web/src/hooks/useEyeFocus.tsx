/**
 * Eye-focus context — which Eye the command center is currently viewing.
 *
 * Persisted in localStorage (`razion-eye:eye-focus`), default ALL. Unknown /
 * unreadable values fall back to ALL (same try/catch pattern as
 * loadViewPref in opportunities.tsx).
 *
 * Non-live eyes (BUSINESS Phase 3, GROWTH Phase 4) can't be selected via the
 * switcher, but `setEye` accepts them so a persisted value / deep-link keeps
 * working when they come online.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { EYE_IDS, EYES, type EyeDef, type EyeId } from '@/lib/eyes'

const STORAGE_KEY = 'razion-eye:eye-focus'

function isEyeId(raw: string | null): raw is EyeId {
  return raw != null && (EYE_IDS as readonly string[]).includes(raw)
}

function loadEyeFocus(): EyeId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return isEyeId(raw) ? raw : 'ALL'
  } catch {
    return 'ALL'
  }
}

interface EyeFocusValue {
  /** Current focus — 'ALL' when nothing is focused. */
  eye: EyeId
  /** Definition of the current eye (icon, labels, types, live, phase). */
  def: EyeDef
  /** Convenience — true when eye !== 'ALL'. */
  focused: boolean
  setEye: (eye: EyeId) => void
  /** Back to the full overview. */
  reset: () => void
}

const EyeFocusContext = createContext<EyeFocusValue | null>(null)

export function EyeFocusProvider({ children }: { children: ReactNode }) {
  const [eye, setEyeState] = useState<EyeId>(loadEyeFocus)

  const setEye = useCallback((next: EyeId) => {
    setEyeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Private mode / storage disabled — preference just won't persist.
    }
  }, [])

  const reset = useCallback(() => setEye('ALL'), [setEye])

  const value = useMemo<EyeFocusValue>(
    () => ({ eye, def: EYES[eye], focused: eye !== 'ALL', setEye, reset }),
    [eye, setEye, reset],
  )

  return <EyeFocusContext.Provider value={value}>{children}</EyeFocusContext.Provider>
}

export function useEyeFocus(): EyeFocusValue {
  const ctx = useContext(EyeFocusContext)
  if (!ctx) throw new Error('useEyeFocus must be used within <EyeFocusProvider>')
  return ctx
}
