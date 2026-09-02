/**
 * RaziOne Eye — mock event-log derivation (Wave-2 [W2], contract §1).
 *
 * The real server appends to an `events` table on every write; mock mode has
 * no table, so we derive a plausible per-opportunity event list from the
 * in-memory dataset state:
 *
 *   1. `opportunity_imported` (source 'import') or `opportunity_created`
 *      (anything else) — first event, at `created_at`.
 *   2. One `status_changed` per pipeline step up to the current status:
 *      the JOB ladder DISCOVERED → … → current, timestamps spread evenly
 *      between created_at and updated_at (so the trail is monotonic and
 *      plausible relative to MOCK_NOW). Terminal statuses land at updated_at.
 *   3. One `note_added` per note — object notes at their created_at, string
 *      notes at updated_at (mock dataset only stores legacy strings).
 *   4. Runtime events appended by mock writes (appendOpportunityNote,
 *      patchOpportunityStatus) are kept in an in-memory registry and merged
 *      in, newest first — same append-only semantics as the real table.
 */

import { JOB_STATUSES, JOB_TERMINAL_STATUSES } from '../types'
import type { Event, Opportunity } from '../types'
import { mockUlid } from './data'

/** Runtime (session) events — appended by mock writes, never persisted. */
const runtimeEvents: Event[] = []

/** Record a mock write as an event (mirrors the server's event hooks). */
export function recordMockEvent(event: Omit<Event, 'id'>): Event {
  const full: Event = { ...event, id: mockUlid('EV') }
  runtimeEvents.push(full)
  return full
}

/** Spread `n` timestamps evenly between two ISO anchors (inclusive). */
function spread(fromIso: string, toIso: string, n: number): string[] {
  const from = new Date(fromIso).getTime()
  const to = new Date(toIso).getTime()
  if (n <= 0) return []
  if (n === 1) return [toIso]
  const step = (to - from) / (n - 1)
  return Array.from({ length: n }, (_, i) => new Date(from + step * i).toISOString())
}

/** Where a job realistically got before landing each terminal status. */
const TERMINAL_LADDER_DEPTH: Record<string, number> = {
  NOT_SUITABLE: 1, // flagged by the Job Analyst at ANALYZED
  IGNORED: 1, // never engaged
  REJECTED: 4, // applied, then cut
  EXPIRED: 3, // window closed before applying
}

/** Job ladder from DISCOVERED up to (and including) `status`. */
function ladderUpTo(status: string | null): string[] {
  if (!status) return []
  const nonTerminal = JOB_STATUSES.filter((s) => !(JOB_TERMINAL_STATUSES as readonly string[]).includes(s))
  if ((JOB_TERMINAL_STATUSES as readonly string[]).includes(status)) {
    // Terminals sit off-ladder: pre-terminal stages up to a plausible depth,
    // then the terminal transition itself.
    const depth = TERMINAL_LADDER_DEPTH[status] ?? 2
    return [...nonTerminal.slice(0, depth + 1), status]
  }
  const idx = JOB_STATUSES.indexOf(status as (typeof JOB_STATUSES)[number])
  if (idx < 0) return []
  return JOB_STATUSES.slice(0, idx + 1)
}

/**
 * Derive the full event list for one opportunity (oldest → newest), then
 * merge runtime events. The provider returns newest-first per contract.
 */
export function deriveOpportunityEvents(o: Opportunity): Event[] {
  const events: Array<Omit<Event, 'id'>> = []
  const role = o.data.role ?? o.name ?? 'opportunity'
  const imported = o.source === 'import'

  // 1. Origin
  events.push({
    at: o.created_at,
    type: imported ? 'opportunity_imported' : 'opportunity_created',
    node_id: o.id,
    summary: imported
      ? `${role} imported from a source file.`
      : `${role} created${o.source ? ` via ${o.source}` : ''}.`,
    data: imported ? { source: o.source } : null,
  })

  // 2. Pipeline progression
  const ladder = ladderUpTo(o.status)
  // The first ladder entry equals the origin status; transitions are the
  // entries after it (a status_changed per move).
  const transitions = ladder.slice(1)
  const lastAt = o.updated_at > o.created_at ? o.updated_at : o.created_at
  const times = spread(o.created_at, lastAt, transitions.length + 1)
  transitions.forEach((status, i) => {
    events.push({
      at: times[i + 1] ?? lastAt,
      type: 'status_changed',
      node_id: o.id,
      summary: `Status moved to ${status}.`,
      data: { status },
    })
  })

  // 3. Notes (existing in the dataset)
  for (const note of o.notes) {
    const at = typeof note === 'string' ? lastAt : note.created_at
    events.push({
      at,
      type: 'note_added',
      node_id: o.id,
      summary: 'Note added.',
      data: { text: typeof note === 'string' ? note : note.text },
    })
  }

  // 4. Runtime events for this node (session writes)
  const runtime = runtimeEvents.filter((e) => e.node_id === o.id)

  const all = [
    ...events.map((e) => ({ ...e, id: mockUlid('EV') })),
    ...runtime,
  ]
  // Newest first (contract §1 [W2]).
  return all.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}
