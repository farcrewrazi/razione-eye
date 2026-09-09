/**
 * Edge repository — generic edge store + typed helpers for the doc 02 §5 catalog.
 */
import type { Pool } from 'pg';
import type { Edge, EdgeType } from '@razione-eye/shared';
import { ulid, nowIso } from './ulid.ts';

interface EdgeRow {
  id: string;
  from_id: string;
  to_id: string;
  edge_type: string;
  /** JSONB — pg returns parsed objects; accept string|object|null. */
  data: unknown;
  created_at: string | Date;
}

/** Parse JSON text or pass through already-parsed pg JSONB values. */
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

function rowToEdge(row: EdgeRow): Edge {
  return {
    id: row.id,
    from_id: row.from_id,
    to_id: row.to_id,
    edge_type: row.edge_type as EdgeType,
    data: parseData(row.data),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export class EdgesRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async create(
    fromId: string,
    toId: string,
    edgeType: EdgeType,
    data?: Record<string, unknown>,
  ): Promise<Edge> {
    const id = ulid();
    const now = nowIso();
    await this.pool.query(
      'INSERT INTO edges (id, from_id, to_id, edge_type, data, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, fromId, toId, edgeType, data ? JSON.stringify(data) : null, now],
    );
    const edge = await this.getById(id);
    if (!edge) throw new Error(`failed to read back edge ${id}`);
    return edge;
  }

  async getById(id: string): Promise<Edge | null> {
    const res = await this.pool.query('SELECT * FROM edges WHERE id = $1', [id]);
    const row = res.rows[0] as EdgeRow | undefined;
    return row ? rowToEdge(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM edges WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  /** Outgoing edges from a node (optionally filtered by type). */
  async outgoing(fromId: string, edgeType?: EdgeType): Promise<Edge[]> {
    const res = edgeType
      ? await this.pool.query(
          'SELECT * FROM edges WHERE from_id = $1 AND edge_type = $2 ORDER BY created_at',
          [fromId, edgeType],
        )
      : await this.pool.query('SELECT * FROM edges WHERE from_id = $1 ORDER BY created_at', [
          fromId,
        ]);
    return (res.rows as unknown as EdgeRow[]).map(rowToEdge);
  }

  /** Incoming edges to a node (optionally filtered by type). */
  async incoming(toId: string, edgeType?: EdgeType): Promise<Edge[]> {
    const res = edgeType
      ? await this.pool.query(
          'SELECT * FROM edges WHERE to_id = $1 AND edge_type = $2 ORDER BY created_at',
          [toId, edgeType],
        )
      : await this.pool.query('SELECT * FROM edges WHERE to_id = $1 ORDER BY created_at', [toId]);
    return (res.rows as unknown as EdgeRow[]).map(rowToEdge);
  }

  /** Idempotent lookup: does an exact (from,to,type) edge already exist? */
  async exists(fromId: string, toId: string, edgeType: EdgeType): Promise<boolean> {
    const res = await this.pool.query(
      'SELECT 1 AS x FROM edges WHERE from_id = $1 AND to_id = $2 AND edge_type = $3 LIMIT 1',
      [fromId, toId, edgeType],
    );
    return res.rows.length > 0;
  }

  /** Create unless an exact (from,to,type) edge already exists (seed idempotency). */
  async ensure(
    fromId: string,
    toId: string,
    edgeType: EdgeType,
    data?: Record<string, unknown>,
  ): Promise<Edge> {
    const res = await this.pool.query(
      'SELECT * FROM edges WHERE from_id = $1 AND to_id = $2 AND edge_type = $3 LIMIT 1',
      [fromId, toId, edgeType],
    );
    const existing = res.rows[0] as EdgeRow | undefined;
    if (existing) return rowToEdge(existing);
    return this.create(fromId, toId, edgeType, data);
  }

  async count(): Promise<number> {
    const res = await this.pool.query('SELECT COUNT(*) AS c FROM edges');
    return Number(res.rows[0]?.c ?? 0);
  }

  // ── Typed helpers for the Phase-0 minimum catalog (+ owns) ──────────────

  async knows(personId: string, skillId: string): Promise<Edge> {
    return this.ensure(personId, skillId, 'knows');
  }

  async locatedIn(nodeId: string, locationId: string): Promise<Edge> {
    return this.ensure(nodeId, locationId, 'located_in');
  }

  async hiring(companyId: string, opportunityId: string): Promise<Edge> {
    return this.ensure(companyId, opportunityId, 'hiring');
  }

  async belongsTo(opportunityId: string, companyId: string): Promise<Edge> {
    return this.ensure(opportunityId, companyId, 'belongs_to');
  }

  async matches(opportunityId: string, personId: string, score: number): Promise<Edge> {
    return this.ensure(opportunityId, personId, 'matches', { score });
  }

  async hasProblem(companyId: string, problemId: string): Promise<Edge> {
    return this.ensure(companyId, problemId, 'has_problem');
  }

  async solvedBy(problemId: string, solutionId: string): Promise<Edge> {
    return this.ensure(problemId, solutionId, 'solved_by');
  }

  async owns(personId: string, companyOrProjectId: string): Promise<Edge> {
    return this.ensure(personId, companyOrProjectId, 'owns');
  }
}
