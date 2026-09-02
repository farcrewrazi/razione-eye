/**
 * Events repository — append-only activity log (Wave 2, T1.1/T1.2).
 * Every status change, note, import run, agent run and gate decision lands here.
 */
import { Hono } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import type { EventType, EyeEvent } from '@razione-eye/shared';
import { ulid, nowIso } from './ulid.ts';
import { getCtx, err } from './http-util.ts';

interface EventRow {
  id: string;
  at: string;
  type: string;
  node_id: string | null;
  summary: string;
  data: string | null;
}

function rowToEvent(row: EventRow): EyeEvent {
  return {
    id: row.id,
    at: row.at,
    type: row.type as EventType,
    node_id: row.node_id,
    summary: row.summary,
    data: row.data ? (JSON.parse(row.data) as Record<string, unknown>) : null,
  };
}

export interface RecordEventInput {
  type: EventType;
  node_id?: string | null;
  summary: string;
  data?: Record<string, unknown>;
}

export class EventsRepo {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  record(input: RecordEventInput): EyeEvent {
    const id = ulid();
    const at = nowIso();
    this.db
      .prepare('INSERT INTO events (id, at, type, node_id, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, at, input.type, input.node_id ?? null, input.summary, input.data ? JSON.stringify(input.data) : null);
    const event = this.getById(id);
    if (!event) throw new Error(`failed to read back event ${id}`);
    return event;
  }

  getById(id: string): EyeEvent | null {
    const row = this.db.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined;
    return row ? rowToEvent(row) : null;
  }

  /** Newest-first. Pass nodeId to scope to one node's activity log. */
  list(nodeId?: string): { items: EyeEvent[]; total: number } {
    if (nodeId) {
      const total = (this.db.prepare('SELECT COUNT(*) AS c FROM events WHERE node_id = ?').get(nodeId) as { c: number }).c;
      const rows = this.db
        .prepare('SELECT * FROM events WHERE node_id = ? ORDER BY at DESC, id DESC')
        .all(nodeId) as unknown as EventRow[];
      return { items: rows.map(rowToEvent), total };
    }
    const total = (this.db.prepare('SELECT COUNT(*) AS c FROM events').get() as { c: number }).c;
    const rows = this.db.prepare('SELECT * FROM events ORDER BY at DESC, id DESC').all() as unknown as EventRow[];
    return { items: rows.map(rowToEvent), total };
  }

  /** Latest event of a given type (e.g. the most recent import_run carrying an ImportReport). */
  latestByType(type: EventType): EyeEvent | null {
    const row = this.db
      .prepare('SELECT * FROM events WHERE type = ? ORDER BY at DESC, id DESC LIMIT 1')
      .get(type) as EventRow | undefined;
    return row ? rowToEvent(row) : null;
  }
}

/**
 * Shared handler factory for `GET /api/<collection>/:id/events` — same shape everywhere:
 * `{ items: Event[], total }`, newest first.
 */
import type { Context } from 'hono';

export function nodeEventsHandler(nodeType: 'OPPORTUNITY' | 'TASK' | 'SIGNAL') {
  return (c: Context) => {
    const { nodes, events } = getCtx(c);
    const node = nodes.getById(c.req.param('id')!);
    if (!node || node.type !== nodeType) {
      return err(c, 404, 'NOT_FOUND', `${nodeType.toLowerCase()} not found`);
    }
    return c.json(events.list(node.id));
  };
}
