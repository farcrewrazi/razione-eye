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
import { deriveDashboard, deriveEveningBrief, deriveMorningBrief, deriveNextBestAction } from './mock/derive'
import { deriveOpportunityEvents, recordMockEvent } from './mock/events'
import { mockGateActions } from './mock/gate'
import {
  MOCK_NOW,
  mockAgents,
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
  ApproveGateActionResult,
  ApproveGateActionInput,
  Company,
  CompanyDetail,
  CreateGateActionInput,
  CreateManualJobInput,
  CreateOpportunityInput,
  CreateSignalInput,
  CreateTaskInput,
  DashboardAggregate,
  EveningBrief,
  Event,
  GateAction,
  Health,
  ListCompaniesParams,
  ListEventsParams,
  ListGateActionsParams,
  ListOpportunitiesParams,
  ListSignalsParams,
  ListTasksParams,
  MorningBrief,
  NextBestAction,
  Note,
  Opportunity,
  OpportunityDetail,
  PatchTaskInput,
  Person,
  PromoteSignalData,
  PromoteSignalResult,
  RejectGateActionInput,
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
  gateActions: clone(mockGateActions),
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
  // Mirror real-mode JSON semantics: undefined keys never overwrite stored values.
  const definedPatch = Object.fromEntries(Object.entries(dataPatch).filter(([, v]) => v !== undefined))
  const fullName = typeof definedPatch.full_name === 'string' ? definedPatch.full_name : undefined
  db.profile = {
    ...db.profile,
    tags: tags ?? db.profile.tags,
    notes: notes ?? db.profile.notes,
    data: { ...db.profile.data, ...definedPatch },
    name: fullName ?? db.profile.name,
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
  const now = new Date().toISOString()
  opportunity.status = status
  opportunity.updated_at = now
  // Record the status_changed event (contract §4 — records an event on write).
  recordMockEvent({
    at: now,
    type: 'status_changed',
    node_id: id,
    summary: `Status moved to ${status}.`,
    data: { status },
  })
  return clone(withBand(opportunity))
}

/**
 * PATCH /api/opportunities/:id — partial update (contract §4: any subset of
 * the create fields, data is merged). FE uses: applied-date setter, reply/
 * interview logging via data (T1.8).
 */
export async function patchOpportunity(
  id: string,
  input: Partial<Pick<CreateOpportunityInput, 'data' | 'name' | 'source' | 'tags' | 'score' | 'due_at'>>,
): Promise<Opportunity> {
  if (apiMode() === 'real') return patch<Opportunity>(`/api/opportunities/${id}`, input)
  await delay()
  const opportunity = db.opportunities.find((o) => o.id === id) ?? notFound(`opportunity ${id}`)
  const now = new Date().toISOString()
  const previousAppliedDate = opportunity.data.applied_date as string | undefined
  if (input.data !== undefined) opportunity.data = { ...opportunity.data, ...input.data }
  if (input.name !== undefined) opportunity.name = input.name
  if (input.source !== undefined) opportunity.source = input.source
  if (input.tags !== undefined) opportunity.tags = input.tags
  if (input.score !== undefined) opportunity.score = input.score
  if (input.due_at !== undefined) opportunity.due_at = input.due_at
  opportunity.updated_at = now
  // Applied-date tracking (T1.8) — log the change in the activity feed.
  if (
    input.data?.applied_date !== undefined &&
    input.data.applied_date !== previousAppliedDate
  ) {
    recordMockEvent({
      at: now,
      type: 'note_added',
      node_id: id,
      summary: `Applied date set to ${String(input.data.applied_date) || '—'} (manual edit).`,
      data: { applied_date: input.data.applied_date },
    })
  }
  return clone(withBand(opportunity))
}

/** GET /api/opportunities/:id/events [W2] → { items: Event[], total } (newest first). */
export async function getOpportunityEvents(
  id: string,
  params: ListEventsParams = {},
): Promise<{ items: Event[]; total: number }> {
  if (apiMode() === 'real') {
    const query = buildQuery({ limit: params.limit, offset: params.offset })
    return get<{ items: Event[]; total: number }>(`/api/opportunities/${id}/events${query}`)
  }
  await delay()
  const opportunity = db.opportunities.find((o) => o.id === id) ?? notFound(`opportunity ${id}`)
  const items = deriveOpportunityEvents(opportunity)
  const total = items.length
  return clone({ items: applyLimitOffset(items, params.limit, params.offset), total })
}

/** POST /api/opportunities/:id/notes [W2] — body {text}; appends note + note_added event. → Node */
export async function appendOpportunityNote(id: string, text: string): Promise<Opportunity> {
  if (apiMode() === 'real') return post<Opportunity>(`/api/opportunities/${id}/notes`, { text })
  await delay()
  const opportunity = db.opportunities.find((o) => o.id === id) ?? notFound(`opportunity ${id}`)
  const now = new Date().toISOString()
  opportunity.notes.push({ text, created_at: now })
  opportunity.updated_at = now
  // Register the note_added event so subsequent getOpportunityEvents include it.
  recordMockEvent({
    at: now,
    type: 'note_added',
    node_id: id,
    summary: 'Note added.',
    data: { text },
  })
  return clone(withBand(opportunity))
}

/**
 * POST /api/opportunities — generic create (contract §4 body, verbatim).
 * Real mode only; mock writes go through the typed manual-entry path below.
 */
export async function createOpportunity(input: CreateOpportunityInput): Promise<Opportunity> {
  if (apiMode() === 'real') return post<Opportunity>('/api/opportunities', input)
  throw new Error('Mock mode: use createOpportunity(input: CreateManualJobInput)')
}

/**
 * Manual JOB entry (T1.1.6-FE) — the `/opportunities/new` form's save.
 *
 * Mock: find-or-create COMPANY by normalized name, create a JOB opportunity
 * (status DISCOVERED, source default 'manual', score null, tags
 * ['manual-entry']), link via a `belongs_to` edge + derived `company` field,
 * then the T1.1.6-BE signal link-back semantics (PROMOTED + promoted_to +
 * `signal_promoted` event) when signal_id is set. Records an
 * `opportunity_created` event. Real: POST /api/opportunities per contract —
 * company is NOT part of the contract data payload, so the company name rides
 * along as a note until the real integration lands.
 */
export async function createManualJob(input: CreateManualJobInput): Promise<Opportunity> {
  if (apiMode() === 'real') {
    // Contract data has no company field; keep it in notes so the info isn't
    // lost (BE company linking arrives with the real integration).
    const notes: Note[] = []
    if (input.notes?.trim()) notes.push({ text: input.notes.trim(), created_at: new Date().toISOString() })
    notes.push({ text: `Company: ${input.company.trim()}`, created_at: new Date().toISOString() })
    if (input.signal_id) {
      notes.push({ text: `Created from signal ${input.signal_id}`, created_at: new Date().toISOString() })
    }
    const data: Record<string, unknown> = {
      role: input.role.trim(),
      ...(input.location?.trim() ? { location: input.location.trim() } : {}),
      ...(input.salary?.trim() ? { salary: input.salary.trim() } : {}),
      ...(input.url?.trim() ? { url: input.url.trim() } : {}),
      ...(input.stack && input.stack.length > 0 ? { stack: input.stack } : {}),
    }
    return post<Opportunity>('/api/opportunities', {
      opportunity_type: 'JOB',
      data,
      name: input.role.trim(),
      source: input.source ?? 'manual',
      notes,
      signal_id: input.signal_id,
    })
  }

  await delay()
  const now = new Date().toISOString()
  const company = findOrCreateCompany(input.company.trim(), input.source, now)
  const discoveredAt = input.discovered_at ?? now
  const notes: Note[] = input.notes?.trim()
    ? [{ text: input.notes.trim(), created_at: now }]
    : []

  const opportunity: Opportunity = {
    id: mockUlid('O'),
    type: 'OPPORTUNITY',
    name: input.role.trim(),
    status: 'DISCOVERED',
    opportunity_type: 'JOB',
    score: null,
    due_at: null,
    source: input.source ?? 'manual',
    tags: ['manual-entry'],
    notes,
    data: {
      role: input.role.trim(),
      ...(input.location?.trim() ? { location: input.location.trim() } : {}),
      ...(input.salary?.trim() ? { salary: input.salary.trim() } : {}),
      ...(input.url?.trim() ? { url: input.url.trim() } : {}),
      ...(input.stack && input.stack.length > 0 ? { stack: input.stack } : {}),
      company_id: company.id,
    },
    created_at: discoveredAt,
    updated_at: now,
    band: bandForScore(null),
    company,
  }
  db.opportunities = [opportunity, ...db.opportunities]
  // belongs_to link (mock dataset links via data.company_id + edge, mirroring
  // the seed's belongs_to/hiring representation).
  db.edges = [
    ...db.edges,
    {
      id: mockUlid('E'),
      from_id: opportunity.id,
      to_id: company.id,
      edge_type: 'belongs_to',
      data: null,
      created_at: now,
    },
  ]
  recordMockEvent({
    at: now,
    type: 'opportunity_created',
    node_id: opportunity.id,
    summary: `${opportunity.name} created (DISCOVERED)`,
    data: { status: 'DISCOVERED', opportunity_type: 'JOB', source: opportunity.source },
  })
  // T1.1.6-BE link-back (mirror): mark the signal PROMOTED + promoted_to.
  if (input.signal_id) {
    const signal = db.signals.find((s) => s.id === input.signal_id)
    if (signal) {
      signal.status = 'PROMOTED'
      signal.updated_at = now
      signal.data.promoted_to = opportunity.id
      recordMockEvent({
        at: now,
        type: 'signal_promoted',
        node_id: signal.id,
        summary: `Signal promoted → opportunity ${opportunity.id} (manual entry link-back)`,
        data: { from: 'NEW', to: 'PROMOTED', promoted_to: opportunity.id },
      })
    }
  }
  return clone(withBand(opportunity))
}

/** Find-or-create a COMPANY by normalized name (lowercased + whitespace-collapsed). */
function findOrCreateCompany(name: string, source: string | undefined, now: string): Company {
  const key = name.toLowerCase().replace(/\s+/g, ' ').trim()
  const existing = db.companies.find((c) => (c.name ?? '').toLowerCase().replace(/\s+/g, ' ').trim() === key)
  if (existing) return existing
  const company: Company = {
    id: mockUlid('C'),
    type: 'COMPANY',
    name,
    status: null,
    opportunity_type: null,
    score: null,
    due_at: null,
    source: source ?? 'manual',
    tags: ['manual-entry'],
    notes: [],
    data: {},
    created_at: now,
    updated_at: now,
  }
  db.companies = [...db.companies, company]
  return company
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

/** GET /api/signals/:id — used by the manual-entry form's ?from_signal prefill. */
export async function getSignal(id: string): Promise<Signal> {
  if (apiMode() === 'real') return get<Signal>(`/api/signals/${id}`)
  await delay()
  const signal = db.signals.find((s) => s.id === id) ?? notFound(`signal ${id}`)
  return clone(signal)
}

/**
 * Promote a signal into a JOB OPPORTUNITY (T1.12) — the Promote dialog's save.
 *
 * Real: POST /api/signals/:id/promote with the contract body `{ data }`
 * (company isn't in the contract promote body — it rides along as a note,
 * same convention as createManualJob). → 201 `{ signal, opportunity }`.
 *
 * Mock: idempotent (already-promoted → return the existing pair), find-or-create
 * COMPANY by normalized name, create the JOB (status DISCOVERED, source =
 * signal.source, tags ['promoted'], content excerpt as first note + provided
 * notes, data.source_signal_id back-link), belongs_to edge, signal → PROMOTED +
 * promoted_to, `signal_promoted` + `opportunity_created` events.
 */
export async function promoteSignal(id: string, data: PromoteSignalData = {}): Promise<PromoteSignalResult> {
  if (apiMode() === 'real') {
    const notes: Note[] = []
    if (data.notes?.trim()) notes.push({ text: data.notes.trim(), created_at: new Date().toISOString() })
    if (data.company?.trim()) notes.push({ text: `Company: ${data.company.trim()}`, created_at: new Date().toISOString() })
    return post<PromoteSignalResult>(`/api/signals/${id}/promote`, {
      data: {
        ...(data.role?.trim() ? { role: data.role.trim() } : {}),
        ...(data.location?.trim() ? { location: data.location.trim() } : {}),
        ...(data.salary?.trim() ? { salary: data.salary.trim() } : {}),
        ...(data.url?.trim() ? { url: data.url.trim() } : {}),
        ...(data.stack && data.stack.length > 0 ? { stack: data.stack } : {}),
        ...(notes.length > 0 ? { notes: notes.map((n) => (typeof n === 'string' ? n : n.text)) } : {}),
      },
    })
  }

  await delay()
  const signal = db.signals.find((s) => s.id === id) ?? notFound(`signal ${id}`)

  // Idempotent — already promoted → return the existing pair, no duplicate.
  if (signal.status === 'PROMOTED' && typeof signal.data.promoted_to === 'string') {
    const existing = db.opportunities.find((o) => o.id === signal.data.promoted_to)
    if (existing) return clone({ signal, opportunity: withBand(existing) })
  }

  const now = new Date().toISOString()
  const company = data.company?.trim() ? findOrCreateCompany(data.company.trim(), signal.source ?? undefined, now) : undefined

  const contentExcerpt =
    signal.data.content.length > 200 ? `${signal.data.content.slice(0, 200)}…` : signal.data.content
  const notes: Note[] = [{ text: contentExcerpt, created_at: now }]
  if (data.notes?.trim()) notes.push({ text: data.notes.trim(), created_at: now })

  const opportunity: Opportunity = {
    id: mockUlid('O'),
    type: 'OPPORTUNITY',
    name: data.role?.trim() || 'Untitled role',
    status: 'DISCOVERED',
    opportunity_type: 'JOB',
    score: null,
    due_at: null,
    source: signal.source ?? 'manual',
    tags: ['promoted'],
    notes,
    data: {
      role: data.role?.trim() || 'Untitled role',
      ...(data.location?.trim() ? { location: data.location.trim() } : {}),
      ...(data.salary?.trim() ? { salary: data.salary.trim() } : {}),
      ...(data.url?.trim() || signal.data.url ? { url: data.url?.trim() || signal.data.url } : {}),
      ...(data.stack && data.stack.length > 0 ? { stack: data.stack } : {}),
      source_signal_id: signal.id,
      ...(company ? { company_id: company.id } : {}),
    },
    created_at: now,
    updated_at: now,
    band: bandForScore(null),
    company,
  }
  db.opportunities = [opportunity, ...db.opportunities]
  if (company) {
    db.edges = [
      ...db.edges,
      {
        id: mockUlid('E'),
        from_id: opportunity.id,
        to_id: company.id,
        edge_type: 'belongs_to',
        data: null,
        created_at: now,
      },
    ]
  }
  recordMockEvent({
    at: now,
    type: 'opportunity_created',
    node_id: opportunity.id,
    summary: `Opportunity "${opportunity.name ?? opportunity.id}" created from signal (${signal.id})`,
    data: { status: 'DISCOVERED', opportunity_type: 'JOB', source: opportunity.source, signal_id: signal.id },
  })

  signal.status = 'PROMOTED'
  signal.updated_at = now
  signal.data.promoted_to = opportunity.id
  recordMockEvent({
    at: now,
    type: 'signal_promoted',
    node_id: signal.id,
    summary: `Signal promoted → opportunity ${opportunity.id}`,
    data: { from: 'NEW', to: 'PROMOTED', promoted_to: opportunity.id },
  })
  return clone({ signal, opportunity: withBand(opportunity) })
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

// ─── Action Gate (T1.11 [W4]) ────────────────────────────────────────────────
//
// The apply-task flow: a PENDING draft sits in the queue → approve (optionally
// with an edited payload = edit-then-approve) or reject (reason REQUIRED).
// Decisions are FINAL — mock mirrors the server's 409 ALREADY_DECIDED.
//
// Mock approve executes the same side-effects as the server: ensures the
// "Apply to <role>" TASK exists and is DONE, moves the opportunity to APPLIED
// with data.applied_date + a follow_up next_action (+7d, terminals untouched),
// and records status_changed + gate_decision events.

/** "Today" as an ISO date (YYYY-MM-DD) — server `nowIso().slice(0, 10)`. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function enrichGateAction(action: GateAction): GateAction {
  const opportunity = action.opportunity_id
    ? (db.opportunities.find((o) => o.id === action.opportunity_id) ?? null)
    : null
  const task = action.task_id ? (db.tasks.find((t) => t.id === action.task_id) ?? null) : null
  return { ...action, opportunity, task }
}

/** "Apply to Senior Backend Engineer — DataHarbor" (mirrors server summaryFor). */
function gateSummaryFor(opportunityId: string): string {
  const o = db.opportunities.find((op) => op.id === opportunityId)
  const role = o ? ((o.data.role as string | undefined) ?? o.name) : null
  const company = o ? (o.company?.name ?? (o.data.company as string | undefined)) : null
  const target = [role, company].filter((s) => typeof s === 'string' && s.trim() !== '').join(' — ')
  return `Apply to ${target !== '' ? target : opportunityId}`
}

/** GET /api/gate/actions?status&limit&offset [W4] — the approval queue, newest first. */
export async function listGateActions(
  params: ListGateActionsParams = {},
): Promise<{ items: GateAction[]; total: number }> {
  if (apiMode() === 'real') {
    const query = buildQuery({ status: params.status, limit: params.limit, offset: params.offset })
    return get<{ items: GateAction[]; total: number }>(`/api/gate/actions${query}`)
  }
  await delay()
  let items = [...db.gateActions]
  if (params.status) items = items.filter((a) => a.status === params.status)
  items.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
  const total = items.length
  return clone({ items: applyLimitOffset(items, params.limit, params.offset).map(enrichGateAction), total })
}

/**
 * POST /api/gate/actions [W4] — submit a draft (PENDING). Mock validates that
 * payload.opportunity_id resolves to an OPPORTUNITY (422 semantics on the
 * server; NOT_FOUND-flavored error here) and stamps the summary.
 */
export async function createGateAction(input: CreateGateActionInput): Promise<GateAction> {
  if (apiMode() === 'real') return post<GateAction>('/api/gate/actions', input)
  await delay()
  const opportunityId = input.payload.opportunity_id ?? input.opportunity_id
  if (!opportunityId) throw new Error('VALIDATION: opportunity_id is required (in payload or top-level)')
  const opportunity = db.opportunities.find((o) => o.id === opportunityId)
  if (!opportunity) throw new Error(`VALIDATION: opportunity_id ${opportunityId} does not reference an OPPORTUNITY node`)
  const taskId = input.payload.task_id ?? input.task_id
  if (taskId && !db.tasks.some((t) => t.id === taskId)) {
    throw new Error(`VALIDATION: task_id ${taskId} does not reference a TASK node`)
  }

  const now = new Date().toISOString()
  const action: GateAction = {
    id: mockUlid('G'),
    action_type: input.action_type,
    status: 'PENDING',
    opportunity_id: opportunityId,
    task_id: taskId ?? null,
    payload: { ...input.payload, opportunity_id: opportunityId, ...(taskId ? { task_id: taskId } : {}) },
    summary: gateSummaryFor(opportunityId),
    created_at: now,
    decided_at: null,
    decision: null,
    decision_reason: null,
    opportunity: null,
    task: null,
  }
  db.gateActions = [action, ...db.gateActions]
  return clone(enrichGateAction(action))
}

/**
 * POST /api/gate/actions/:id/approve [W4] — optional payload = edit-then-approve.
 * Response carries the executed opportunity (APPLIED + applied_date) and the
 * DONE task so callers can update local state without refetching.
 */
export async function approveGateAction(
  id: string,
  input: ApproveGateActionInput = {},
): Promise<ApproveGateActionResult> {
  if (apiMode() === 'real') {
    return post<ApproveGateActionResult>(
      `/api/gate/actions/${id}/approve`,
      input.payload ? { payload: input.payload } : undefined,
    )
  }
  await delay()
  const action = db.gateActions.find((a) => a.id === id) ?? notFound(`gate action ${id}`)
  if (action.status !== 'PENDING') {
    throw new Error(`ALREADY_DECIDED: gate action already ${action.status.toLowerCase()} — decisions are final`)
  }

  const edited = input.payload !== undefined
  if (edited) action.payload = { ...action.payload, ...input.payload }
  const now = new Date().toISOString()
  const today = todayIso()

  const opportunity = db.opportunities.find((o) => o.id === action.opportunity_id)
  if (!opportunity) throw new Error('VALIDATION: linked opportunity no longer exists')

  // 1. Ensure the apply TASK exists and is DONE.
  let task = action.task_id ? db.tasks.find((t) => t.id === action.task_id) : undefined
  const role = (opportunity.data.role as string | undefined) ?? opportunity.name ?? 'role'
  if (!task) {
    task = {
      id: mockUlid('T'),
      type: 'TASK',
      name: `Apply to ${role}`,
      status: 'DONE',
      opportunity_type: null,
      score: null,
      due_at: null,
      source: 'gate',
      tags: ['gate', 'apply'],
      notes: [],
      data: {
        title: `Apply to ${role}`,
        description: 'Prepared and approved through the Action Gate',
        opportunity_id: opportunity.id,
        priority: 'HIGH',
        completed_at: now,
      },
      created_at: now,
      updated_at: now,
    }
    db.tasks = [task, ...db.tasks]
    db.edges = [
      ...db.edges,
      { id: mockUlid('E'), from_id: task.id, to_id: opportunity.id, edge_type: 'serves', data: null, created_at: now },
    ]
  } else {
    task.status = 'DONE'
    task.data = { ...task.data, completed_at: now }
    task.updated_at = now
  }
  action.task_id = task.id

  // 2. Opportunity → APPLIED with applied_date (terminals/HIRED stay untouched).
  const TERMINAL = new Set(['REJECTED', 'IGNORED', 'NOT_SUITABLE', 'EXPIRED', 'HIRED'])
  const previousStatus = opportunity.status
  if (!TERMINAL.has(previousStatus ?? '') && previousStatus !== 'APPLIED') {
    opportunity.status = 'APPLIED'
    opportunity.data = {
      ...opportunity.data,
      applied_date: today,
      next_action: { type: 'follow_up', due: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10) },
    }
    opportunity.updated_at = now
    recordMockEvent({
      at: now,
      type: 'status_changed',
      node_id: opportunity.id,
      summary: `"${opportunity.name ?? opportunity.id}": ${previousStatus} → APPLIED (Action Gate)`,
      data: { from: previousStatus, to: 'APPLIED', gate_action_id: action.id, applied_date: today },
    })
  } else if (previousStatus === 'APPLIED' && opportunity.data.applied_date === undefined) {
    opportunity.data = { ...opportunity.data, applied_date: today }
    opportunity.updated_at = now
  }

  // 3. Stamp the decision + log it.
  action.status = 'APPROVED'
  action.decided_at = now
  action.decision = edited ? 'edited_approved' : 'approved'
  recordMockEvent({
    at: now,
    type: 'gate_decision',
    node_id: opportunity.id,
    summary: `Gate ${action.decision}: ${action.summary}`,
    data: {
      gate_action_id: action.id,
      action_type: action.action_type,
      decision: action.decision,
      opportunity_id: opportunity.id,
      task_id: task.id,
      edited,
    },
  })

  const decided = enrichGateAction(action)
  return clone({
    ...decided,
    opportunity: { ...withBand(opportunity) },
    task: clone(task),
  })
}

/**
 * POST /api/gate/actions/:id/reject [W4] — reason REQUIRED (feeds LEARN).
 * No side-effects on the opportunity/task; records a gate_decision event.
 */
export async function rejectGateAction(id: string, input: RejectGateActionInput): Promise<GateAction> {
  if (apiMode() === 'real') return post<GateAction>(`/api/gate/actions/${id}/reject`, { reason: input.reason })
  await delay()
  const action = db.gateActions.find((a) => a.id === id) ?? notFound(`gate action ${id}`)
  if (action.status !== 'PENDING') {
    throw new Error(`ALREADY_DECIDED: gate action already ${action.status.toLowerCase()} — decisions are final`)
  }
  const now = new Date().toISOString()
  action.status = 'REJECTED'
  action.decided_at = now
  action.decision = 'rejected'
  action.decision_reason = input.reason
  recordMockEvent({
    at: now,
    type: 'gate_decision',
    node_id: action.opportunity_id,
    summary: `Gate rejected: ${action.summary} — ${input.reason}`,
    data: {
      gate_action_id: action.id,
      action_type: action.action_type,
      decision: 'rejected',
      reason: input.reason,
      opportunity_id: action.opportunity_id,
    },
  })
  return clone(enrichGateAction(action))
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

/** GET /api/daily-brief/morning [W4] — counts by eye + top 3–5 priorities. */
export async function getMorningBrief(): Promise<MorningBrief> {
  if (apiMode() === 'real') return get<MorningBrief>('/api/daily-brief/morning')
  await delay()
  return clone(
    deriveMorningBrief(db.opportunities, db.tasks, db.signals, db.gateActions),
  )
}

/** GET /api/daily-brief/evening [W4] — completed/pending/new + one observation. */
export async function getEveningBrief(): Promise<EveningBrief> {
  if (apiMode() === 'real') return get<EveningBrief>('/api/daily-brief/evening')
  await delay()
  return clone(deriveEveningBrief(db.opportunities, db.tasks, db.gateActions))
}

// ─── Health ──────────────────────────────────────────────────────────────────

export async function getHealth(): Promise<Health> {
  if (apiMode() === 'real') return get<Health>('/api/health')
  await delay()
  return { ok: true, version: '0.1.0', db: 'connected' }
}
