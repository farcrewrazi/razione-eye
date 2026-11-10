/**
 * Session login/logout helpers (real API mode only).
 *
 * Mock mode has no server, so `RequireAuth` skips the round-trip entirely.
 */
import { get, post } from './client'

export interface SessionInfo {
  authenticated: boolean
  user: string
}

export function login(username: string, password: string): Promise<{ user: string }> {
  return post<{ user: string }>('/auth/login', { username, password })
}

export function logout(): Promise<{ ok: boolean }> {
  return post<{ ok: boolean }>('/auth/logout')
}

export function whoami(): Promise<SessionInfo> {
  return get<SessionInfo>('/auth/me')
}
