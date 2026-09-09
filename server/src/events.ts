/**
 * Events repository — append-only activity log (Wave 2, T1.1/T1.2).
 * Every status change, note, import run, agent run and gate decision lands here.
 */
import type { Pool } from 'pg';
import type { EventType, EyeEvent } from '@razione-eye/shared';
import { ulid, nowIso } from './ulid.ts';
import { getCtx, err } from './http-util.ts';

interface EventRow {
  id: string;
  at: string | Date;
  type: string;
  node_id: string | null;
  summary: string;
  /** JSONB — pg returns parsed objects; accept string|object|null. */
  data: unknown;
}

function parseData(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof value === 'object') return value as Record<string, unknown>;
  return null;
}

function rowToEvent(row: EventRow): EyeEvent {
  return {
    id: row.id,
    at: row.at instanceof Date ? row.at.toISOString() : row.at,
    type: row.type as EventType,
    node_id: row.node_id,
    summary: row.summary,
    data: parseData(row.data),
  };
}

export interface RecordEventInput {
  type: EventType;
  node_id?: string | null;
  summary: string;
  data?: Record<string, unknown>;
}

export class EventsRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async record(input: RecordEventInput): Promise<EyeEvent> {
    const id = ulid();
    const at = nowIso();
    await this.pool.query(
      'INSERT INTO events (id, at, type, node_id, summary, data) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, at, input.type, input.node_id ?? null, input.summary, input.data ? JSON.stringify(input.data) : null],
    );
    const event = await this.getById(id);
    if (!event) throw new Error(`failed to read back event ${id}`);
    return event;
  }

  async getById(id: string): Promise<EyeEvent | null> {
    const res = await this.pool.query('SELECT * FROM events WHERE id = $1', [id]);
    const row = res.rows[0] as EventRow | undefined;
    return row ? rowToEvent(row) : null;
  }

  /** Newest-first. Pass nodeId to scope to one node's activity log. */
  async list(nodeId?: string): Promise<{ items: EyeEvent[]; total: number }> {
    if (nodeId) {
      const countRes = await this.pool.query('SELECT COUNT(*) AS c FROM events WHERE node_id = $1', [
        nodeId,
      ]);
      const total = Number(countRes.rows[0]?.c ?? 0);
      const res = await this.pool.query(
        'SELECT * FROM events WHERE node_id = $1 ORDER BY at DESC, id DESC',
        [nodeId],
      );
      return { items: (res.rows as unknown as EventRow[]).map(rowToEvent), total };
    }
    const countRes = await this.pool.query('SELECT COUNT(*) AS c FROM events');
    const total = Number(countRes.rows[0]?.c ?? 0);
    const res = await this.pool.query('SELECT * FROM events ORDER BY at DESC, id DESC');
    return { items: (res.rows as unknown as EventRow[]).map(rowToEvent), total };
  }

  /** Latest event of a given type (e.g. the most recent import_run carrying an ImportReport). */
  async latestByType(type: EventType): Promise<EyeEvent | null> {
    const res = await this.pool.query(
      'SELECT * FROM events WHERE type = $1 ORDER BY at DESC, id DESC LIMIT 1',
      [type],
    );
    const row = res.rows[0] as EventRow | undefined;
    return row ? rowToEvent(row) : null;
  }
}

/**
 * Shared handler factory for `GET /api/<collection>/:id/events` — same shape everywhere:
 * `{ items: Event[], total }`, newest first.
 */
import type { Context } from 'hono';

export function nodeEventsHandler(nodeType: 'OPPORTUNITY' | 'TASK' | 'SIGNAL') {
  return async (c: Context) => {
    const { nodes, events } = getCtx(c);
    const node = await nodes.getById(c.req.param('id')!);
    if (!node || node.type !== nodeType) {
      return err(c, 404, 'NOT_FOUND', `${nodeType.toLowerCase()} not found`);
    }
    return c.json(await events.list(node.id));
  };
}
