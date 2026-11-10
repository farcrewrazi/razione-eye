/**
 * Session gate for the real API.
 *
 * Checks /api/auth/me once on mount, then trusts the `eye:unauthorized` event
 * that the fetch wrapper fires whenever the server answers 401 (expired or
 * cleared cookie). Mock mode has no server, so it renders straight through.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Loader2 } from 'lucide-react'
import { whoami } from '@/api/auth'

const API_MODE = import.meta.env.VITE_API_MODE ?? 'mock'

type Status = 'checking' | 'ok' | 'signed-out'

export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [status, setStatus] = useState<Status>(API_MODE === 'real' ? 'checking' : 'ok')

  useEffect(() => {
    if (API_MODE !== 'real') return
    let alive = true

    whoami()
      .then(() => {
        if (alive) setStatus('ok')
      })
      .catch(() => {
        if (alive) setStatus('signed-out')
      })

    const onUnauthorized = (): void => setStatus('signed-out')
    window.addEventListener('eye:unauthorized', onUnauthorized)
    return () => {
      alive = false
      window.removeEventListener('eye:unauthorized', onUnauthorized)
    }
  }, [])

  if (status === 'checking') {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--color-bg)]">
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] text-[var(--color-muted)]">
          <Loader2 className="size-4 animate-spin" strokeWidth={2} />
          CHECKING SESSION
        </div>
      </div>
    )
  }

  if (status === 'signed-out') {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    )
  }

  return <>{children}</>
}

export default RequireAuth
