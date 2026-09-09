/**
 * Gate repository — Action Gate queue storage (T1.11, docs/03-agents-and-gates.md §4).
 *
 * One row per draft action. Status lifecycle: PENDING → APPROVED | REJECTED
 * (terminal — a decided action is never reopened; a new draft is a new row).
 * The execution side-effects (task DONE, opportunity → APPLIED) live in gate.ts;
 * this file owns only CRUD over the gate_actions table.
 */
import type { Pool } from 'pg';
import type { GateAction, GateActionType, GateDecision, GateStatus } from '@razione-eye/shared';
import { ulid, nowIso } from './ulid.ts';

interface GateRow {
  id: string;
  action_type: string;
  status: string;
  opportunity_id: string | null;
  task_id: string | null;
  /** JSONB — pg returns parsed objects; accept string|object. */
  payload: unknown;
  summary: string;
  created_at: string | Date;
  decided_at: string | Date | null;
  decision: string | null;
  decision_reason: string | null;
}

function parsePayload(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (value !== null && typeof value === 'object') return value as Record<string, unknown>;
  return {};
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toIsoNullable(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function rowToGate(row: GateRow): GateAction {
  return {
    id: row.id,
    action_type: row.action_type as GateActionType,
    status: row.status as GateStatus,
    opportunity_id: row.opportunity_id,
    task_id: row.task_id,
    payload: parsePayload(row.payload),
    summary: row.summary,
    created_at: toIso(row.created_at),
    decided_at: toIsoNullable(row.decided_at),
    decision: (row.decision ?? null) as GateDecision | null,
    decision_reason: row.decision_reason,
  };
}

export interface CreateGateInput {
  action_type: GateActionType;
  opportunity_id?: string | null;
  task_id?: string | null;
  payload: Record<string, unknown>;
  summary: string;
}

export interface ListGateFilter {
  status?: GateStatus;
  limit?: number;
  offset?: number;
}

export class GateRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async create(input: CreateGateInput): Promise<GateAction> {
    const id = ulid();
    const now = nowIso();
    await this.pool.query(
      `INSERT INTO gate_actions (id, action_type, status, opportunity_id, task_id, payload, summary, created_at)
         VALUES ($1, $2, 'PENDING', $3, $4, $5, $6, $7)`,
      [
        id,
        input.action_type,
        input.opportunity_id ?? null,
        input.task_id ?? null,
        JSON.stringify(input.payload),
        input.summary,
        now,
      ],
    );
    const action = await this.getById(id);
    if (!action) throw new Error(`failed to read back gate action ${id}`);
    return action;
  }

  async getById(id: string): Promise<GateAction | null> {
    const res = await this.pool.query('SELECT * FROM gate_actions WHERE id = $1', [id]);
    const row = res.rows[0] as GateRow | undefined;
    return row ? rowToGate(row) : null;
  }

  /** Replace the draft payload (edit-then-approve). PENDING only — enforced by callers. */
  async updatePayload(id: string, payload: Record<string, unknown>): Promise<GateAction | null> {
    await this.pool.query('UPDATE gate_actions SET payload = $1 WHERE id = $2', [
      JSON.stringify(payload),
      id,
    ]);
    return this.getById(id);
  }

  /** Stamp the decision (terminal). Also records the executed task link when created on approve. */
  async decide(
    id: string,
    decision: GateDecision,
    options: { reason?: string | null; task_id?: string | null } = {},
  ): Promise<GateAction | null> {
    const status: GateStatus = decision === 'rejected' ? 'REJECTED' : 'APPROVED';
    await this.pool.query(
      `UPDATE gate_actions SET status = $1, decided_at = $2, decision = $3, decision_reason = $4, task_id = COALESCE($5, task_id)
         WHERE id = $6`,
      [status, nowIso(), decision, options.reason ?? null, options.task_id ?? null, id],
    );
    return this.getById(id);
  }

  async list(filter: ListGateFilter = {}): Promise<{ items: GateAction[]; total: number }> {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter.status) {
      where.push(`status = $${params.length + 1}`);
      params.push(filter.status);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const countRes = await this.pool.query(
      `SELECT COUNT(*) AS c FROM gate_actions ${whereSql}`,
      params,
    );
    const total = Number(countRes.rows[0]?.c ?? 0);
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
    const offset = Math.max(filter.offset ?? 0, 0);
    const limitPh = `$${params.length + 1}`;
    params.push(limit);
    const offsetPh = `$${params.length + 1}`;
    params.push(offset);
    // Pending first, newest first — the review queue order.
    const res = await this.pool.query(
      `SELECT * FROM gate_actions ${whereSql} ORDER BY created_at DESC, id ASC LIMIT ${limitPh} OFFSET ${offsetPh}`,
      params,
    );
    return { items: (res.rows as unknown as GateRow[]).map(rowToGate), total };
  }

  async pendingCount(): Promise<number> {
    const res = await this.pool.query("SELECT COUNT(*) AS c FROM gate_actions WHERE status = 'PENDING'");
    return Number(res.rows[0]?.c ?? 0);
  }
}
