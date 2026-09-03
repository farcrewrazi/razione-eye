/**
 * Node repository — typed CRUD helpers over the nodes table.
 * Row ↔ wire-shape (zod `Node`) conversion happens here.
 */
import type { DatabaseSync } from 'node:sqlite';
import type { Node, NodeType, Note, OpportunityType } from '@razione-eye/shared';
import { ulid, nowIso } from './ulid.ts';

interface NodeRow {
  id: string;
  type: string;
  name: string | null;
  status: string | null;
  opportunity_type: string | null;
  score: number | null;
  due_at: string | null;
  source: string | null;
  tags: string;
  notes: string;
  data: string;
  created_at: string;
  updated_at: string;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function rowToNode(row: NodeRow): Node {
  return {
    id: row.id,
    type: row.type as NodeType,
    name: row.name,
    status: row.status,
    opportunity_type: (row.opportunity_type ?? null) as OpportunityType | null,
    score: row.score,
    due_at: row.due_at,
    source: row.source,
    tags: parseJson<string[]>(row.tags, []),
    notes: parseJson<Note[]>(row.notes, []),
    data: parseJson<Record<string, unknown>>(row.data, {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface CreateNodeInput {
  type: NodeType;
  name?: string | null;
  status?: string | null;
  opportunity_type?: OpportunityType | null;
  score?: number | null;
  due_at?: string | null;
  source?: string | null;
  tags?: string[];
  notes?: Note[];
  data: Record<string, unknown>;
  /** Seed uses stable ULIDs for idempotency. */
  id?: string;
}

export interface UpdateNodeInput {
  name?: string | null;
  status?: string | null;
  opportunity_type?: OpportunityType | null;
  score?: number | null;
  due_at?: string | null;
  source?: string | null;
  tags?: string[];
  notes?: Note[];
  data?: Record<string, unknown>;
}

export interface ListNodesFilter {
  type?: NodeType;
  status?: string;
  opportunity_type?: OpportunityType;
  /** Match any of these opportunity types (SQL IN) — Eye scoping. */
  opportunity_types?: readonly string[];
  /** Substring match against name + data blob. */
  q?: string;
  limit?: number;
  offset?: number;
  /** 'score' | 'created_at' | 'updated_at' | 'due_at', prefix '-' for DESC. Default: -created_at */
  sort?: string;
  due_before?: string;
  overdue?: boolean;
}

const SORTABLE = new Set(['score', 'created_at', 'updated_at', 'due_at', 'name']);

export class NodesRepo {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  create(input: CreateNodeInput): Node {
    const id = input.id ?? ulid();
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO nodes (id, type, name, status, opportunity_type, score, due_at, source, tags, notes, data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.type,
        input.name ?? null,
        input.status ?? null,
        input.opportunity_type ?? null,
        input.score ?? null,
        input.due_at ?? null,
        input.source ?? null,
        JSON.stringify(input.tags ?? []),
        JSON.stringify(input.notes ?? []),
        JSON.stringify(input.data),
        now,
        now,
      );
    const node = this.getById(id);
    if (!node) throw new Error(`failed to read back node ${id}`);
    return node;
  }

  getById(id: string): Node | null {
    const row = this.db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as NodeRow | undefined;
    return row ? rowToNode(row) : null;
  }

  update(id: string, patch: UpdateNodeInput): Node | null {
    const existing = this.getById(id);
    if (!existing) return null;
    const merged = {
      name: patch.name !== undefined ? patch.name : existing.name,
      status: patch.status !== undefined ? patch.status : existing.status,
      opportunity_type:
        patch.opportunity_type !== undefined ? patch.opportunity_type : existing.opportunity_type,
      score: patch.score !== undefined ? patch.score : existing.score,
      due_at: patch.due_at !== undefined ? patch.due_at : existing.due_at,
      source: patch.source !== undefined ? patch.source : existing.source,
      tags: patch.tags !== undefined ? patch.tags : existing.tags,
      notes: patch.notes !== undefined ? patch.notes : existing.notes,
      data: patch.data !== undefined ? { ...existing.data, ...patch.data } : existing.data,
    };
    this.db
      .prepare(
        `UPDATE nodes SET name = ?, status = ?, opportunity_type = ?, score = ?, due_at = ?, source = ?, tags = ?, notes = ?, data = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        merged.name,
        merged.status,
        merged.opportunity_type,
        merged.score,
        merged.due_at,
        merged.source,
        JSON.stringify(merged.tags),
        JSON.stringify(merged.notes),
        JSON.stringify(merged.data),
        nowIso(),
        id,
      );
    return this.getById(id);
  }

  delete(id: string): boolean {
    const res = this.db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
    return res.changes > 0;
  }

  list(filter: ListNodesFilter = {}): { items: Node[]; total: number } {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (filter.type) {
      where.push('type = ?');
      params.push(filter.type);
    }
    if (filter.status) {
      where.push('status = ?');
      params.push(filter.status);
    }
    if (filter.opportunity_type) {
      where.push('opportunity_type = ?');
      params.push(filter.opportunity_type);
    }
    if (filter.opportunity_types) {
      // Explicit empty list = match nothing (callers wanting "everything" pass every type).
      const types = filter.opportunity_types.filter((t) => typeof t === 'string' && t !== '');
      if (types.length === 0) {
        where.push('1 = 0');
      } else {
        const placeholders = types.map(() => '?').join(', ');
        where.push(`opportunity_type IN (${placeholders})`);
        params.push(...types);
      }
    }
    if (filter.q) {
      where.push('(name LIKE ? OR data LIKE ?)');
      const like = `%${filter.q}%`;
      params.push(like, like);
    }
    if (filter.due_before) {
      where.push('due_at IS NOT NULL AND due_at <= ?');
      params.push(filter.due_before);
    }
    if (filter.overdue) {
      where.push('due_at IS NOT NULL AND due_at < ?');
      params.push(nowIso());
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS c FROM nodes ${whereSql}`)
      .get(...params) as { c: number };
    const total = totalRow.c;

    let sortField = 'created_at';
    let sortDir = 'DESC';
    if (filter.sort) {
      const raw = filter.sort;
      const field = raw.startsWith('-') ? raw.slice(1) : raw;
      if (SORTABLE.has(field)) {
        sortField = field;
        sortDir = raw.startsWith('-') ? 'DESC' : 'ASC';
      }
    }

    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
    const offset = Math.max(filter.offset ?? 0, 0);

    const rows = this.db
      .prepare(
        `SELECT * FROM nodes ${whereSql} ORDER BY ${sortField} ${sortDir}, id ASC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as unknown as NodeRow[];

    return { items: rows.map(rowToNode), total };
  }

  /** Find a single node by type + exact name (seed idempotency lookups). */
  findByTypeAndName(type: NodeType, name: string): Node | null {
    const row = this.db
      .prepare('SELECT * FROM nodes WHERE type = ? AND name = ? LIMIT 1')
      .get(type, name) as NodeRow | undefined;
    return row ? rowToNode(row) : null;
  }

  countByType(type: NodeType): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS c FROM nodes WHERE type = ?')
      .get(type) as { c: number };
    return row.c;
  }
}
