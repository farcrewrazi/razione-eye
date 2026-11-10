/**
 * Sign-in page — replaces the old Nginx basic-auth popup.
 *
 * Same visual language as the shell: near-black canvas, one accent colour,
 * mono micro-labels, a single R tile for the wordmark. Full-screen and outside
 * AppShell, so it works before any session exists.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { ApiError } from '@/api/client'
import { login, whoami } from '@/api/auth'

const API_MODE = import.meta.env.VITE_API_MODE ?? 'mock'

interface LocationState {
  from?: string
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as LocationState | null)?.from ?? '/'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alreadyIn, setAlreadyIn] = useState(false)

  // Already signed in? Straight through — the login page is not a place to be.
  useEffect(() => {
    if (API_MODE !== 'real') return
    let alive = true
    whoami()
      .then(() => {
        if (alive) setAlreadyIn(true)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  if (alreadyIn) return <Navigate to={from} replace />

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (pending) return
    setError(null)

    if (API_MODE !== 'real') {
      navigate(from, { replace: true })
      return
    }

    setPending(true)
    try {
      await login(username.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      const apiError = err instanceof ApiError ? err : null
      setError(
        apiError?.code === 'INVALID_CREDENTIALS'
          ? 'Wrong username or password.'
          : apiError?.code === 'TOO_MANY_ATTEMPTS'
            ? 'Too many attempts. Wait five minutes, then try again.'
            : (apiError?.message ?? 'Could not reach the server. Retry in a moment.'),
      )
      setPassword('')
      setPending(false)
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-[var(--color-bg)] px-4 py-10 text-[var(--color-text)]">
      {/* Ambient accent wash + hairline grid — decorative only. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          background:
            'radial-gradient(60rem 40rem at 50% -10%, rgba(125,211,252,0.10), transparent 70%), radial-gradient(40rem 30rem at 90% 110%, rgba(125,211,252,0.06), transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--color-text) 1px, transparent 1px), linear-gradient(to bottom, var(--color-text) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <main className="relative w-full max-w-[400px]">
        {/* Wordmark — mirrors the sidebar lockup */}
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 font-mono text-base font-bold text-[var(--color-accent)]">
            R
          </span>
          <div className="leading-none">
            <div className="font-mono text-[15px] font-bold tracking-[0.18em] text-[var(--color-text)]">
              RAZIONE
            </div>
            <div className="mt-1 font-mono text-[10px] tracking-[0.5em] text-[var(--color-accent)]">
              EYE
            </div>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded border border-[var(--color-border)] px-2 py-1 font-mono text-[10px] tracking-widest text-[var(--color-muted)]">
            <LockKeyhole className="size-3" strokeWidth={2} />
            PRIVATE
          </span>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl shadow-black/40">
          <div className="mb-5">
            <h1 className="text-lg font-semibold tracking-tight text-[var(--color-text)]">
              Sign in
            </h1>
            <p className="mt-1 text-[13px] text-[var(--color-muted)]">
              Operator access to the command centre.
            </p>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)] uppercase">
                Username
              </span>
              <Input
                name="username"
                autoFocus
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                required
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-muted)] uppercase">
                Password
              </span>
              <div className="relative">
                <Input
                  name="password"
                  type={reveal ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setReveal((value) => !value)}
                  aria-label={reveal ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 grid w-9 place-items-center rounded-r-md text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
                >
                  {reveal ? (
                    <EyeOff className="size-4" strokeWidth={1.75} />
                  ) : (
                    <Eye className="size-4" strokeWidth={1.75} />
                  )}
                </button>
              </div>
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-md border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-[12px] text-rose-200"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={pending || username.trim() === '' || password === ''}
              className="mt-1 w-full"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" strokeWidth={2} />
                  Signing in…
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" strokeWidth={2} />
                  Sign in
                </>
              )}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center font-mono text-[11px] tracking-[0.1em] text-[var(--color-muted)]">
          SESSION 7 DAYS · NOTHING IS SENT WITHOUT APPROVAL
        </p>
      </main>
    </div>
  )
}
