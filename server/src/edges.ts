/**
 * Edge repository — generic edge store + typed helpers for the doc 02 §5 catalog.
 */
import type { DatabaseSync } from 'node:sqlite';
import type { Edge, EdgeType } from '@razione-eye/shared';
import { ulid, nowIso } from './ulid.ts';

interface EdgeRow {
  id: string;
  from_id: string;
  to_id: string;
  edge_type: string;
  data: string | null;
  created_at: string;
}

function rowToEdge(row: EdgeRow): Edge {
  return {
    id: row.id,
    from_id: row.from_id,
    to_id: row.to_id,
    edge_type: row.edge_type as EdgeType,
    data: row.data ? (JSON.parse(row.data) as Record<string, unknown>) : null,
    created_at: row.created_at,
  };
}

export class EdgesRepo {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  create(
    fromId: string,
    toId: string,
    edgeType: EdgeType,
    data?: Record<string, unknown>,
  ): Edge {
    const id = ulid();
    const now = nowIso();
    this.db
      .prepare(
        'INSERT INTO edges (id, from_id, to_id, edge_type, data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, fromId, toId, edgeType, data ? JSON.stringify(data) : null, now);
    const edge = this.getById(id);
    if (!edge) throw new Error(`failed to read back edge ${id}`);
    return edge;
  }

  getById(id: string): Edge | null {
    const row = this.db.prepare('SELECT * FROM edges WHERE id = ?').get(id) as EdgeRow | undefined;
    return row ? rowToEdge(row) : null;
  }

  delete(id: string): boolean {
    const res = this.db.prepare('DELETE FROM edges WHERE id = ?').run(id);
    return res.changes > 0;
  }

  /** Outgoing edges from a node (optionally filtered by type). */
  outgoing(fromId: string, edgeType?: EdgeType): Edge[] {
    const rows = (
      edgeType
        ? this.db
            .prepare('SELECT * FROM edges WHERE from_id = ? AND edge_type = ? ORDER BY created_at')
            .all(fromId, edgeType)
        : this.db
            .prepare('SELECT * FROM edges WHERE from_id = ? ORDER BY created_at')
            .all(fromId)
    ) as unknown as EdgeRow[];
    return rows.map(rowToEdge);
  }

  /** Incoming edges to a node (optionally filtered by type). */
  incoming(toId: string, edgeType?: EdgeType): Edge[] {
    const rows = (
      edgeType
        ? this.db
            .prepare('SELECT * FROM edges WHERE to_id = ? AND edge_type = ? ORDER BY created_at')
            .all(toId, edgeType)
        : this.db
            .prepare('SELECT * FROM edges WHERE to_id = ? ORDER BY created_at')
            .all(toId)
    ) as unknown as EdgeRow[];
    return rows.map(rowToEdge);
  }

  /** Idempotent lookup: does an exact (from,to,type) edge already exist? */
  exists(fromId: string, toId: string, edgeType: EdgeType): boolean {
    const row = this.db
      .prepare('SELECT 1 AS x FROM edges WHERE from_id = ? AND to_id = ? AND edge_type = ? LIMIT 1')
      .get(fromId, toId, edgeType);
    return row !== undefined;
  }

  /** Create unless an exact (from,to,type) edge already exists (seed idempotency). */
  ensure(
    fromId: string,
    toId: string,
    edgeType: EdgeType,
    data?: Record<string, unknown>,
  ): Edge {
    const existing = this.db
      .prepare('SELECT * FROM edges WHERE from_id = ? AND to_id = ? AND edge_type = ? LIMIT 1')
      .get(fromId, toId, edgeType) as EdgeRow | undefined;
    if (existing) return rowToEdge(existing);
    return this.create(fromId, toId, edgeType, data);
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM edges').get() as { c: number };
    return row.c;
  }

  // ── Typed helpers for the Phase-0 minimum catalog (+ owns) ──────────────

  knows(personId: string, skillId: string): Edge {
    return this.ensure(personId, skillId, 'knows');
  }

  locatedIn(nodeId: string, locationId: string): Edge {
    return this.ensure(nodeId, locationId, 'located_in');
  }

  hiring(companyId: string, opportunityId: string): Edge {
    return this.ensure(companyId, opportunityId, 'hiring');
  }

  belongsTo(opportunityId: string, companyId: string): Edge {
    return this.ensure(opportunityId, companyId, 'belongs_to');
  }

  matches(opportunityId: string, personId: string, score: number): Edge {
    return this.ensure(opportunityId, personId, 'matches', { score });
  }

  hasProblem(companyId: string, problemId: string): Edge {
    return this.ensure(companyId, problemId, 'has_problem');
  }

  solvedBy(problemId: string, solutionId: string): Edge {
    return this.ensure(problemId, solutionId, 'solved_by');
  }

  owns(personId: string, companyOrProjectId: string): Edge {
    return this.ensure(personId, companyOrProjectId, 'owns');
  }
}
