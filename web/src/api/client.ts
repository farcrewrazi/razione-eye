/**
 * RaziOne Eye — real-mode fetch wrapper (contract §0).
 *
 * - Base path `/api/*` (dev server proxies to http://localhost:8787).
 * - JSON in/out; non-2xx responses parse the `{error:{code,message}}`
 *   envelope and throw `ApiError` (code: VALIDATION | INVALID_STATUS |
 *   BAD_QUERY | NOT_FOUND | INTERNAL).
 */

import type { ErrorEnvelope } from './types'

export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith('/api') ? path : `/api/${path.replace(/^\//, '')}`

  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  // Empty body (e.g. 204) → return null-ish as T
  if (response.status === 204) return null as T

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const envelope = payload as ErrorEnvelope | null
    if (envelope && typeof envelope.error?.code === 'string' && typeof envelope.error?.message === 'string') {
      throw new ApiError(envelope.error.code, envelope.error.message, response.status)
    }
    throw new ApiError('INTERNAL', text || `Request failed with status ${response.status}`, response.status)
  }

  return payload as T
}

// ─── Verb helpers ─────────────────────────────────────────────────────────────

export function get<T>(path: string, init?: RequestInit): Promise<T> {
  return fetchApi<T>(path, { ...init, method: 'GET' })
}

export function post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return fetchApi<T>(path, {
    ...init,
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function patch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return fetchApi<T>(path, {
    ...init,
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function put<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return fetchApi<T>(path, {
    ...init,
    method: 'PUT',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
