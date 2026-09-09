/**
 * Node repository — typed CRUD helpers over the nodes table.
 * Row ↔ wire-shape (zod `Node`) conversion happens here.
 */
import type { Pool } from 'pg';
import type { Node, NodeType, Note, OpportunityType } from '@razione-eye/shared';
import { ulid, nowIso } from './ulid.ts';

interface NodeRow {
  id: string;
  type: string;
  name: string | null;
  status: string | null;
  opportunity_type: string | null;
  score: number | null;
  due_at: string | Date | null;
  source: string | null;
  /** JSONB — pg returns parsed objects; accept string|object for robustness. */
  tags: unknown;
  notes: unknown;
  data: unknown;
  created_at: string | Date;
  updated_at: string | Date;
}

/** Parse JSON text or pass through already-parsed pg JSONB values. */
function fromJson<T>(value: unknown, fallback: T): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  if (value !== null && typeof value === 'object') return value as T;
  return fallback;
}

/** TIMESTAMPTZ read — pg returns Date; wire shape wants ISO strings. */
function toIsoNullable(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function rowToNode(row: NodeRow): Node {
  return {
    id: row.id,
    type: row.type as NodeType,
    name: row.name,
    status: row.status,
    opportunity_type: (row.opportunity_type ?? null) as OpportunityType | null,
    score: row.score,
    due_at: toIsoNullable(row.due_at),
    source: row.source,
    tags: fromJson<string[]>(row.tags, []),
    notes: fromJson<Note[]>(row.notes, []),
    data: fromJson<Record<string, unknown>>(row.data, {}),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
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
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async create(input: CreateNodeInput): Promise<Node> {
    const id = input.id ?? ulid();
    const now = nowIso();
    await this.pool.query(
      `INSERT INTO nodes (id, type, name, status, opportunity_type, score, due_at, source, tags, notes, data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
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
      ],
    );
    const node = await this.getById(id);
    if (!node) throw new Error(`failed to read back node ${id}`);
    return node;
  }

  async getById(id: string): Promise<Node | null> {
    const res = await this.pool.query('SELECT * FROM nodes WHERE id = $1', [id]);
    const row = res.rows[0] as NodeRow | undefined;
    return row ? rowToNode(row) : null;
  }

  async update(id: string, patch: UpdateNodeInput): Promise<Node | null> {
    const existing = await this.getById(id);
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
    await this.pool.query(
      `UPDATE nodes SET name = $1, status = $2, opportunity_type = $3, score = $4, due_at = $5, source = $6, tags = $7, notes = $8, data = $9, updated_at = $10
         WHERE id = $11`,
      [
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
      ],
    );
    return this.getById(id);
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM nodes WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async list(filter: ListNodesFilter = {}): Promise<{ items: Node[]; total: number }> {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (filter.type) {
      where.push(`type = $${params.length + 1}`);
      params.push(filter.type);
    }
    if (filter.status) {
      where.push(`status = $${params.length + 1}`);
      params.push(filter.status);
    }
    if (filter.opportunity_type) {
      where.push(`opportunity_type = $${params.length + 1}`);
      params.push(filter.opportunity_type);
    }
    if (filter.opportunity_types) {
      // Explicit empty list = match nothing (callers wanting "everything" pass every type).
      const types = filter.opportunity_types.filter((t) => typeof t === 'string' && t !== '');
      if (types.length === 0) {
        where.push('1 = 0');
      } else {
        const placeholders: string[] = [];
        for (const t of types) {
          placeholders.push(`$${params.length + 1}`);
          params.push(t);
        }
        where.push(`opportunity_type IN (${placeholders.join(', ')})`);
      }
    }
    if (filter.q) {
      const like = `%${filter.q}%`;
      const p1 = `$${params.length + 1}`;
      params.push(like);
      const p2 = `$${params.length + 1}`;
      params.push(like);
      where.push(`(name ILIKE ${p1} OR data::text ILIKE ${p2})`);
    }
    if (filter.due_before) {
      where.push(`due_at IS NOT NULL AND due_at <= $${params.length + 1}`);
      params.push(filter.due_before);
    }
    if (filter.overdue) {
      where.push(`due_at IS NOT NULL AND due_at < $${params.length + 1}`);
      params.push(nowIso());
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const countRes = await this.pool.query(`SELECT COUNT(*) AS c FROM nodes ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.c ?? 0);

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

    const limitPh = `$${params.length + 1}`;
    params.push(limit);
    const offsetPh = `$${params.length + 1}`;
    params.push(offset);

    const res = await this.pool.query(
      `SELECT * FROM nodes ${whereSql} ORDER BY ${sortField} ${sortDir}, id ASC LIMIT ${limitPh} OFFSET ${offsetPh}`,
      params,
    );
    const rows = res.rows as unknown as NodeRow[];

    return { items: rows.map(rowToNode), total };
  }

  /** Find a single node by type + exact name (seed idempotency lookups). */
  async findByTypeAndName(type: NodeType, name: string): Promise<Node | null> {
    const res = await this.pool.query('SELECT * FROM nodes WHERE type = $1 AND name = $2 LIMIT 1', [
      type,
      name,
    ]);
    const row = res.rows[0] as NodeRow | undefined;
    return row ? rowToNode(row) : null;
  }

  async countByType(type: NodeType): Promise<number> {
    const res = await this.pool.query('SELECT COUNT(*) AS c FROM nodes WHERE type = $1', [type]);
    return Number(res.rows[0]?.c ?? 0);
  }
}
