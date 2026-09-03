/**
 * Gate repository — Action Gate queue storage (T1.11, docs/03-agents-and-gates.md §4).
 *
 * One row per draft action. Status lifecycle: PENDING → APPROVED | REJECTED
 * (terminal — a decided action is never reopened; a new draft is a new row).
 * The execution side-effects (task DONE, opportunity → APPLIED) live in gate.ts;
 * this file owns only CRUD over the gate_actions table.
 */
import type { DatabaseSync } from 'node:sqlite';
import type { GateAction, GateActionType, GateDecision, GateStatus } from '@razione-eye/shared';
import { ulid, nowIso } from './ulid.ts';

interface GateRow {
  id: string;
  action_type: string;
  status: string;
  opportunity_id: string | null;
  task_id: string | null;
  payload: string;
  summary: string;
  created_at: string;
  decided_at: string | null;
  decision: string | null;
  decision_reason: string | null;
}

function rowToGate(row: GateRow): GateAction {
  return {
    id: row.id,
    action_type: row.action_type as GateActionType,
    status: row.status as GateStatus,
    opportunity_id: row.opportunity_id,
    task_id: row.task_id,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    summary: row.summary,
    created_at: row.created_at,
    decided_at: row.decided_at,
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
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  create(input: CreateGateInput): GateAction {
    const id = ulid();
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO gate_actions (id, action_type, status, opportunity_id, task_id, payload, summary, created_at)
         VALUES (?, ?, 'PENDING', ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.action_type,
        input.opportunity_id ?? null,
        input.task_id ?? null,
        JSON.stringify(input.payload),
        input.summary,
        now,
      );
    const action = this.getById(id);
    if (!action) throw new Error(`failed to read back gate action ${id}`);
    return action;
  }

  getById(id: string): GateAction | null {
    const row = this.db.prepare('SELECT * FROM gate_actions WHERE id = ?').get(id) as GateRow | undefined;
    return row ? rowToGate(row) : null;
  }

  /** Replace the draft payload (edit-then-approve). PENDING only — enforced by callers. */
  updatePayload(id: string, payload: Record<string, unknown>): GateAction | null {
    this.db.prepare('UPDATE gate_actions SET payload = ? WHERE id = ?').run(JSON.stringify(payload), id);
    return this.getById(id);
  }

  /** Stamp the decision (terminal). Also records the executed task link when created on approve. */
  decide(
    id: string,
    decision: GateDecision,
    options: { reason?: string | null; task_id?: string | null } = {},
  ): GateAction | null {
    const status: GateStatus = decision === 'rejected' ? 'REJECTED' : 'APPROVED';
    this.db
      .prepare(
        `UPDATE gate_actions SET status = ?, decided_at = ?, decision = ?, decision_reason = ?, task_id = COALESCE(?, task_id)
         WHERE id = ?`,
      )
      .run(status, nowIso(), decision, options.reason ?? null, options.task_id ?? null, id);
    return this.getById(id);
  }

  list(filter: ListGateFilter = {}): { items: GateAction[]; total: number } {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter.status) {
      where.push('status = ?');
      params.push(filter.status);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const total = (this.db.prepare(`SELECT COUNT(*) AS c FROM gate_actions ${whereSql}`).get(...params) as { c: number }).c;
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
    const offset = Math.max(filter.offset ?? 0, 0);
    // Pending first, newest first — the review queue order.
    const rows = this.db
      .prepare(`SELECT * FROM gate_actions ${whereSql} ORDER BY created_at DESC, id ASC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as unknown as GateRow[];
    return { items: rows.map(rowToGate), total };
  }

  pendingCount(): number {
    return (this.db.prepare("SELECT COUNT(*) AS c FROM gate_actions WHERE status = 'PENDING'").get() as { c: number }).c;
  }
}
