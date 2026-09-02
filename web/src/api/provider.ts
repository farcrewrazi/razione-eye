/**
 * RaziOne Eye — API provider: the mock↔real switch (D-007).
 *
 * Every function checks `import.meta.env.VITE_API_MODE ?? 'mock'`:
 *   - 'real'  → fetchApi against /api/* (contract docs/07-api-contract.md)
 *   - 'mock'  → ~300ms simulated latency, then filtered data from the mock dataset
 *
 * Mock writes mutate the in-memory dataset so the app behaves consistently
 * during a session (no persistence).
 */

import { get, patch, post, put } from './client'
import { bandForScore } from './mock/band'
import { deriveBriefs, deriveDashboard, deriveNextBestAction } from './mock/derive'
import {
  MOCK_NOW,
  mockAgents,
  mockBriefs,
  mockCompanies,
  mockEdges,
  mockOpportunities,
  mockProfile,
  mockSignals,
  mockTasks,
  mockUlid,
} from './mock/data'
import type {
  Agent,
  Brief,
  Company,
  CompanyDetail,
  CreateSignalInput,
  CreateTaskInput,
  DashboardAggregate,
  Health,
  ListCompaniesParams,
  ListOpportunitiesParams,
  ListSignalsParams,
  ListTasksParams,
  NextBestAction,
  Opportunity,
  OpportunityDetail,
  PatchTaskInput,
  Person,
  Signal,
  SignalDisposition,
  Task,
  UpdateProfileInput,
} from './types'
import { JOB_STATUSES } from './types'

type ApiMode = 'mock' | 'real'

function apiMode(): ApiMode {
  // `import.meta.env` only exists under Vite; fall back to 'mock' elsewhere
  // (e.g. Node-based smoke tests) per D-007 default.
  const raw = import.meta.env?.VITE_API_MODE ?? 'mock'
  return raw === 'real' ? 'real' : 'mock'
}

const MOCK_LATENCY_MS = 300

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS))
}

/** Deep clone so mock reads hand out fresh copies (callers may mutate). */
function clone<T>(value: T): T {
  return structuredClone(value)
}

/** Query-string builder that skips empty values. */
function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') qs.set(key, String(value))
  }
  const query = qs.toString()
  return query ? `?${query}` : ''
}

// ─── In-memory mutable dataset (mock mode) ───────────────────────────────────

const db = {
  profile: clone(mockProfile),
  agents: clone(mockAgents),
  companies: clone(mockCompanies),
  opportunities: clone(mockOpportunities),
  signals: clone(mockSignals),
  tasks: clone(mockTasks),
  edges: clone(mockEdges),
}

// ─── Shared mock helpers ─────────────────────────────────────────────────────

function notFound(what: string): never {
  throw new Error(`NOT_FOUND: ${what}`)
}

function applyLimitOffset<T>(items: T[], limit?: number, offset?: number): T[] {
  const start = offset ?? 0
  const end = limit === undefined ? undefined : start + limit
  return items.slice(start, end)
}

/** Generic substring search over name + data (contract §4 `q`). */
function matchesQuery(node: { name: string | null; data: Record<string, unknown> }, q?: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  if (node.name?.toLowerCase().includes(needle)) return true
  return Object.values(node.data).some((v) => typeof v === 'string' && v.toLowerCase().includes(needle))
}

type SortKey = 'score' | 'created_at' | 'updated_at' | 'due_at' | 'name'

function sortNodes<T extends { score: number | null; due_at: string | null; name: string | null; created_at: string; updated_at: string }>(
  items: T[],
  sort: string | undefined,
  fallback: SortKey = 'created_at',
): T[] {
  const spec = sort ?? `-${fallback}` // default: newest first (contract §4)
  const desc = spec.startsWith('-')
  const key = spec.replace(/^-/, '') as SortKey
  const allowed: SortKey[] = ['score', 'created_at', 'updated_at', 'due_at', 'name']
  if (!allowed.includes(key)) return items
  const sorted = [...items].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    if (av === bv) return 0
    if (av === null) return 1
    if (bv === null) return -1
    if (typeof av === 'number' && typeof bv === 'number') return av - bv
    return String(av).localeCompare(String(bv))
  })
  return desc ? sorted.reverse() : sorted
}

/** Refresh the computed band (mock keeps it in sync with score). */
function withBand(o: Opportunity): Opportunity {
  return { ...o, band: bandForScore(o.score) }
}

function companyOpportunities(companyId: string): Opportunity[] {
  return db.opportunities
    .filter((o) => (o.data.company_id as string | undefined) === companyId)
    .map(withBand)
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export async function getProfile(): Promise<Person> {
  if (apiMode() === 'real') return get<Person>('/api/profile')
  await delay()
  return clone(db.profile)
}

export async function putProfile(input: UpdateProfileInput): Promise<Person> {
  if (apiMode() === 'real') return put<Person>('/api/profile', input)
  await delay()
  const { tags, notes, ...dataPatch } = input
  db.profile = {
    ...db.profile,
    tags: tags ?? db.profile.tags,
    notes: notes ?? db.profile.notes,
    data: { ...db.profile.data, ...dataPatch },
    updated_at: new Date().toISOString(),
  }
  return clone(db.profile)
}

// ─── Agents ──────────────────────────────────────────────────────────────────

export async function listAgents(): Promise<{ items: Agent[]; total: number }> {
  if (apiMode() === 'real') return get<{ items: Agent[]; total: number }>('/api/agents')
  await delay()
  return clone({ items: db.agents, total: db.agents.length })
}

export async function runAgent(id: string): Promise<Agent> {
  if (apiMode() === 'real') return post<Agent>(`/api/agents/${id}/run`)
  await delay()
  const agent = db.agents.find((a) => a.id === id) ?? notFound(`agent ${id}`)
  const run = { at: new Date().toISOString(), status: 'empty' as const, summary: 'Mock run — no new results.' }
  agent.data.runs = [run, ...agent.data.runs].slice(0, 50)
  agent.data.last_run = run.at
  agent.data.last_status = run.status
  agent.updated_at = run.at
  return clone(agent)
}

// ─── Opportunities ───────────────────────────────────────────────────────────

export async function listOpportunities(
  params: ListOpportunitiesParams = {},
): Promise<{ items: Opportunity[]; total: number }> {
  if (apiMode() === 'real') {
    const query = buildQuery({
      type: params.type,
      status: params.status,
      band: params.band,
      q: params.q,
      limit: params.limit,
      offset: params.offset,
      sort: params.sort,
    })
    return get<{ items: Opportunity[]; total: number }>(`/api/opportunities${query}`)
  }

  await delay()
  let items = db.opportunities.map(withBand)
  if (params.type) items = items.filter((o) => o.opportunity_type === params.type)
  if (params.status) items = items.filter((o) => o.status === params.status)
  if (params.band) items = items.filter((o) => o.band === params.band)
  if (params.q) items = items.filter((o) => matchesQuery(o, params.q))
  items = sortNodes(items, params.sort)
  const total = items.length
  return clone({ items: applyLimitOffset(items, params.limit, params.offset), total })
}

export async function getOpportunity(id: string): Promise<OpportunityDetail> {
  if (apiMode() === 'real') return get<OpportunityDetail>(`/api/opportunities/${id}`)
  await delay()
  const opportunity = db.opportunities.find((o) => o.id === id) ?? notFound(`opportunity ${id}`)
  const edges = db.edges.filter((e) => e.from_id === id || e.to_id === id)
  const neighborIds = new Set(edges.flatMap((e) => [e.from_id, e.to_id]))
  const neighbors = [
    ...db.companies.filter((c) => neighborIds.has(c.id)),
    ...db.tasks.filter((t) => neighborIds.has(t.id)),
    ...db.opportunities.filter((o) => neighborIds.has(o.id) && o.id !== id),
    ...db.agents.filter((a) => neighborIds.has(a.id)),
  ]
  return clone({ ...withBand(opportunity), edges, neighbors })
}

export async function patchOpportunityStatus(id: string, status: string): Promise<Opportunity> {
  if (apiMode() === 'real') return patch<Opportunity>(`/api/opportunities/${id}/status`, { status })
  await delay()
  const opportunity = db.opportunities.find((o) => o.id === id) ?? notFound(`opportunity ${id}`)
  if (opportunity.opportunity_type === 'JOB' && !JOB_STATUSES.includes(status as (typeof JOB_STATUSES)[number])) {
    throw new Error(`INVALID_STATUS: ${status} is not a JOB pipeline status`)
  }
  opportunity.status = status
  opportunity.updated_at = new Date().toISOString()
  return clone(withBand(opportunity))
}

// ─── Companies ───────────────────────────────────────────────────────────────

export async function listCompanies(
  params: ListCompaniesParams = {},
): Promise<{ items: Company[]; total: number }> {
  if (apiMode() === 'real') {
    const query = buildQuery({
      q: params.q,
      limit: params.limit,
      offset: params.offset,
      sort: params.sort,
    })
    return get<{ items: Company[]; total: number }>(`/api/companies${query}`)
  }

  await delay()
  let items = db.companies
  if (params.q) items = items.filter((c) => matchesQuery(c, params.q))
  items = sortNodes(items, params.sort, 'name')
  const total = items.length
  return clone({ items: applyLimitOffset(items, params.limit, params.offset), total })
}

export async function getCompany(id: string): Promise<CompanyDetail> {
  if (apiMode() === 'real') return get<CompanyDetail>(`/api/companies/${id}`)
  await delay()
  const company = db.companies.find((c) => c.id === id) ?? notFound(`company ${id}`)
  return clone({ ...company, opportunities: companyOpportunities(company.id) })
}

// ─── Signals ─────────────────────────────────────────────────────────────────

export async function listSignals(
  params: ListSignalsParams = {},
): Promise<{ items: Signal[]; total: number }> {
  if (apiMode() === 'real') {
    const query = buildQuery({
      disposition: params.disposition,
      signal_type: params.signal_type,
      q: params.q,
      limit: params.limit,
      offset: params.offset,
    })
    return get<{ items: Signal[]; total: number }>(`/api/signals${query}`)
  }

  await delay()
  let items = db.signals
  if (params.disposition) items = items.filter((s) => s.status === params.disposition)
  if (params.signal_type) items = items.filter((s) => s.data.signal_type === params.signal_type)
  if (params.q) items = items.filter((s) => matchesQuery(s, params.q))
  const total = items.length
  return clone({ items: applyLimitOffset(items, params.limit, params.offset), total })
}

export async function createSignal(input: CreateSignalInput): Promise<Signal> {
  if (apiMode() === 'real') return post<Signal>('/api/signals', input)
  await delay()
  const now = new Date().toISOString()
  const signal: Signal = {
    id: mockUlid('S'),
    type: 'SIGNAL',
    name: input.name ?? input.data.content.slice(0, 80),
    status: input.status ?? 'NEW',
    opportunity_type: null,
    score: null,
    due_at: null,
    source: input.source ?? 'manual',
    tags: input.tags ?? [],
    notes: input.notes ?? [],
    data: { ...input.data },
    created_at: now,
    updated_at: now,
  }
  db.signals = [signal, ...db.signals]
  return clone(signal)
}

export async function updateSignalDisposition(id: string, disposition: SignalDisposition): Promise<Signal> {
  if (apiMode() === 'real') return patch<Signal>(`/api/signals/${id}`, { status: disposition })
  await delay()
  const signal = db.signals.find((s) => s.id === id) ?? notFound(`signal ${id}`)
  signal.status = disposition
  signal.updated_at = new Date().toISOString()
  return clone(signal)
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export async function listTasks(
  params: ListTasksParams = {},
): Promise<{ items: Task[]; total: number }> {
  if (apiMode() === 'real') {
    const query = buildQuery({
      status: params.status,
      due_before: params.due_before,
      overdue: params.overdue === true ? 'true' : undefined,
      limit: params.limit,
      offset: params.offset,
      sort: params.sort,
    })
    return get<{ items: Task[]; total: number }>(`/api/tasks${query}`)
  }

  await delay()
  let items = db.tasks
  if (params.status) items = items.filter((t) => t.status === params.status)
  if (params.due_before) {
    const dueBefore = params.due_before
    items = items.filter((t) => t.due_at !== null && t.due_at < dueBefore)
  }
  if (params.overdue) {
    items = items.filter(
      (t) => t.due_at !== null && t.due_at < MOCK_NOW && (t.status === 'TODO' || t.status === 'IN_PROGRESS'),
    )
  }
  items = sortNodes(items, params.sort)
  const total = items.length
  return clone({ items: applyLimitOffset(items, params.limit, params.offset), total })
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  if (apiMode() === 'real') return post<Task>('/api/tasks', input)
  await delay()
  const now = new Date().toISOString()
  const task: Task = {
    id: mockUlid('T'),
    type: 'TASK',
    name: input.name ?? input.data.title,
    status: input.status ?? 'TODO',
    opportunity_type: null,
    score: null,
    due_at: input.due_at ?? null,
    source: input.source ?? 'manual',
    tags: input.tags ?? [],
    notes: input.notes ?? [],
    data: { ...input.data },
    created_at: now,
    updated_at: now,
  }
  db.tasks = [task, ...db.tasks]
  // Auto-create a `serves` edge when opportunity_id is set (contract §4).
  if (input.data.opportunity_id) {
    db.edges = [
      ...db.edges,
      {
        id: mockUlid('E'),
        from_id: task.id,
        to_id: input.data.opportunity_id,
        edge_type: 'serves',
        data: null,
        created_at: now,
      },
    ]
  }
  return clone(task)
}

export async function patchTask(id: string, patchInput: PatchTaskInput): Promise<Task> {
  if (apiMode() === 'real') return patch<Task>(`/api/tasks/${id}`, patchInput)
  await delay()
  const task = db.tasks.find((t) => t.id === id) ?? notFound(`task ${id}`)
  if (patchInput.status !== undefined) task.status = patchInput.status
  if (patchInput.data !== undefined) task.data = { ...task.data, ...patchInput.data }
  if (patchInput.due_at !== undefined) task.due_at = patchInput.due_at
  if (patchInput.name !== undefined) task.name = patchInput.name
  if (patchInput.tags !== undefined) task.tags = patchInput.tags
  if (patchInput.notes !== undefined) task.notes = patchInput.notes
  task.updated_at = new Date().toISOString()
  return clone(task)
}

// ─── FE-owned aggregates ─────────────────────────────────────────────────────

export async function getDashboard(): Promise<DashboardAggregate> {
  if (apiMode() === 'real') return get<DashboardAggregate>('/api/dashboard')
  await delay()
  return clone(deriveDashboard(db.agents, db.opportunities, db.tasks, db.signals))
}

export async function getNextBestAction(): Promise<NextBestAction | null> {
  if (apiMode() === 'real') return get<NextBestAction | null>('/api/next-best-action')
  await delay()
  return clone(deriveNextBestAction(db.opportunities))
}

export async function getBrief(slot: 'morning' | 'evening'): Promise<Brief> {
  if (apiMode() === 'real') return get<Brief>(`/api/briefs/${slot}`)
  await delay()
  const derived = deriveBriefs(db.tasks, db.opportunities)
  return clone(derived.find((b) => b.slot === slot) ?? mockBriefs.find((b) => b.slot === slot) ?? mockBriefs[0])
}

// ─── Health ──────────────────────────────────────────────────────────────────

export async function getHealth(): Promise<Health> {
  if (apiMode() === 'real') return get<Health>('/api/health')
  await delay()
  return { ok: true, version: '0.1.0', db: 'connected' }
}
