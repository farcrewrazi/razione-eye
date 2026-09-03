/**
 * Action Gate routes (T1.11-BE) — docs/03-agents-and-gates.md §4.
 *
 * The apply-task flow: the system PREPARES a draft (`POST /api/gate/actions`,
 * status PENDING) → Razi reviews → `POST …/approve` (optionally with an edited
 * payload — edit-then-approve) or `POST …/reject` (reason required).
 *
 * Only on approve do the side-effects execute, atomically:
 *   • an "Apply to <role>" TASK is ensured (created when the draft had none) and set DONE
 *   • the JOB opportunity transitions → APPLIED with data.applied_date = today
 *   • `status_changed` + task events are recorded alongside the `gate_decision` event
 *
 * v0.x reality (doc 03 §4): "execute" means the system hands Razi a ready-to-paste
 * kit and marks it done on confirm — no auto-apply exists, by design.
 */
import { Hono } from 'hono';
import {
  applyToJobPayloadSchema,
  approveGateActionSchema,
  bandForScore,
  createGateActionSchema,
  gateStatusSchema,
  rejectGateActionSchema,
  updateGateActionSchema,
  type ApplyToJobPayload,
  type GateAction,
  type Node,
} from '@razione-eye/shared';
import { getCtx, err } from './http-util.ts';
import type { AppContext } from './context.ts';
import { nowIso } from './ulid.ts';

/** Enrich a gate row with its linked nodes for the review screen. */
function withLinks(ctx: AppContext, action: GateAction): GateAction {
  const opportunity = action.opportunity_id ? ctx.nodes.getById(action.opportunity_id) : null;
  const task = action.task_id ? ctx.nodes.getById(action.task_id) : null;
  return {
    ...action,
    opportunity: opportunity ?? null,
    task: task ?? null,
  };
}

function summaryFor(payload: ApplyToJobPayload, opportunity: Node | null): string {
  const role = opportunity ? ((opportunity.data['role'] as string | undefined) ?? opportunity.name) : null;
  const company = opportunity ? (opportunity.data['company'] as string | undefined) : null;
  const target = [role, company].filter((s) => typeof s === 'string' && s.trim() !== '').join(' — ');
  return `Apply to ${target !== '' ? target : (payload.opportunity_id ?? 'opportunity')}`;
}

export const gateRoute = new Hono()
  // ── List the approval queue (default: PENDING — the dashboard's "N actions required") ──
  .get('/actions', (c) => {
    const ctx = getCtx(c);
    const q = c.req.query();
    const status = q['status'];
    if (status && !gateStatusSchema.safeParse(status).success) {
      return err(c, 400, 'BAD_QUERY', `invalid status: ${status}`);
    }
    const { items, total } = ctx.gate.list({
      ...(status ? { status: status as GateAction['status'] } : {}),
      ...(q['limit'] ? { limit: Number(q['limit']) } : {}),
      ...(q['offset'] ? { offset: Number(q['offset']) } : {}),
    });
    return c.json({ items: items.map((a) => withLinks(ctx, a)), total });
  })
  // ── Submit a draft action (system prepares → Razi confirms) ──
  .post('/actions', async (c) => {
    const ctx = getCtx(c);
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = createGateActionSchema.safeParse(body);
    if (!parsed.success) {
      return err(c, 422, 'VALIDATION', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const input = parsed.data;

    // Validate the payload for the action type (v1: apply_to_job only).
    const payloadParsed = applyToJobPayloadSchema.safeParse(input.payload);
    if (!payloadParsed.success) {
      return err(c, 422, 'VALIDATION', payloadParsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const payload = payloadParsed.data;

    const opportunityId = payload.opportunity_id ?? input.opportunity_id ?? null;
    if (!opportunityId) return err(c, 422, 'VALIDATION', 'opportunity_id is required (in payload or top-level)');
    const opportunity = ctx.nodes.getById(opportunityId);
    if (!opportunity || opportunity.type !== 'OPPORTUNITY') {
      return err(c, 422, 'VALIDATION', `opportunity_id ${opportunityId} does not reference an OPPORTUNITY node`);
    }

    const taskId = payload.task_id ?? input.task_id ?? null;
    if (taskId) {
      const task = ctx.nodes.getById(taskId);
      if (!task || task.type !== 'TASK') {
        return err(c, 422, 'VALIDATION', `task_id ${taskId} does not reference a TASK node`);
      }
    }

    const action = ctx.gate.create({
      action_type: input.action_type,
      opportunity_id: opportunityId,
      task_id: taskId,
      payload: { ...payload, opportunity_id: opportunityId, ...(taskId ? { task_id: taskId } : {}) },
      summary: summaryFor(payload, opportunity),
    });
    return c.json(withLinks(ctx, action), 201);
  })
  // ── Read one queue entry ──
  .get('/actions/:id', (c) => {
    const ctx = getCtx(c);
    const action = ctx.gate.getById(c.req.param('id'));
    if (!action) return err(c, 404, 'NOT_FOUND', 'gate action not found');
    return c.json(withLinks(ctx, action));
  })
  // ── Edit the draft payload (PENDING only) ──
  .patch('/actions/:id', async (c) => {
    const ctx = getCtx(c);
    const action = ctx.gate.getById(c.req.param('id'));
    if (!action) return err(c, 404, 'NOT_FOUND', 'gate action not found');
    if (action.status !== 'PENDING') {
      return err(c, 409, 'ALREADY_DECIDED', `gate action already ${action.status.toLowerCase()} — decisions are final`);
    }
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = updateGateActionSchema.safeParse(body);
    if (!parsed.success) {
      return err(c, 422, 'VALIDATION', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const payloadParsed = applyToJobPayloadSchema.safeParse({ ...action.payload, ...parsed.data.payload });
    if (!payloadParsed.success) {
      return err(c, 422, 'VALIDATION', payloadParsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const updated = ctx.gate.updatePayload(action.id, { ...action.payload, ...parsed.data.payload })!;
    return c.json(withLinks(ctx, updated));
  })
  // ── Approve (optionally edit-then-approve in one call) → EXECUTE ──
  .post('/actions/:id/approve', async (c) => {
    const ctx = getCtx(c);
    const action = ctx.gate.getById(c.req.param('id'));
    if (!action) return err(c, 404, 'NOT_FOUND', 'gate action not found');
    if (action.status !== 'PENDING') {
      return err(c, 409, 'ALREADY_DECIDED', `gate action already ${action.status.toLowerCase()} — decisions are final`);
    }
    const body: unknown = await c.req.json().catch(() => ({}));
    const parsed = approveGateActionSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return err(c, 422, 'VALIDATION', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }

    // Edit-then-approve: an inline payload replaces the draft before execution.
    const edited = parsed.data.payload !== undefined;
    const mergedPayloadRaw = edited ? { ...action.payload, ...parsed.data.payload } : action.payload;
    const payloadParsed = applyToJobPayloadSchema.safeParse(mergedPayloadRaw);
    if (!payloadParsed.success) {
      return err(c, 422, 'VALIDATION', payloadParsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const payload = payloadParsed.data;
    if (edited) ctx.gate.updatePayload(action.id, { ...action.payload, ...parsed.data.payload });

    const opportunity = action.opportunity_id ? ctx.nodes.getById(action.opportunity_id) : null;
    if (!opportunity || opportunity.type !== 'OPPORTUNITY') {
      return err(c, 422, 'VALIDATION', 'linked opportunity no longer exists');
    }

    // ── Execute the apply-task flow ──────────────────────────────────────────
    const now = nowIso();
    const today = now.slice(0, 10);
    const role = (opportunity.data['role'] as string | undefined) ?? opportunity.name ?? 'role';

    // 1. Ensure the apply TASK exists and is DONE.
    let task = action.task_id ? ctx.nodes.getById(action.task_id) : null;
    if (!task) {
      task = ctx.nodes.create({
        type: 'TASK',
        name: `Apply to ${role}`,
        status: 'DONE',
        source: 'gate',
        tags: ['gate', 'apply'],
        data: {
          title: `Apply to ${role}`,
          description: 'Prepared and approved through the Action Gate',
          opportunity_id: opportunity.id,
          priority: 'HIGH',
          completed_at: now,
        },
      });
      ctx.edges.ensure(task.id, opportunity.id, 'serves');
    } else {
      task = ctx.nodes.update(task.id, {
        status: 'DONE',
        data: { ...(task.data as Record<string, unknown>), completed_at: now },
      })!;
    }

    // 2. Opportunity → APPLIED with applied_date (terminals stay untouched).
    const TERMINAL = new Set(['REJECTED', 'IGNORED', 'NOT_SUITABLE', 'EXPIRED', 'HIRED']);
    const previousStatus = opportunity.status;
    let updatedOpp = opportunity;
    if (!TERMINAL.has(previousStatus ?? '') && previousStatus !== 'APPLIED') {
      updatedOpp = ctx.nodes.update(opportunity.id, {
        status: 'APPLIED',
        data: {
          ...opportunity.data,
          applied_date: today,
          next_action: { type: 'follow_up', due: isoDaysFromNow(7) },
        },
      })!;
      ctx.events.record({
        type: 'status_changed',
        node_id: opportunity.id,
        summary: `"${opportunity.name ?? opportunity.id}": ${previousStatus} → APPLIED (Action Gate)`,
        data: { from: previousStatus, to: 'APPLIED', gate_action_id: action.id, applied_date: today },
      });
    } else if (previousStatus === 'APPLIED' && opportunity.data['applied_date'] === undefined) {
      updatedOpp = ctx.nodes.update(opportunity.id, { data: { ...opportunity.data, applied_date: today } })!;
    }

    // 3. Stamp the decision + log it.
    const decided = ctx.gate.decide(action.id, edited ? 'edited_approved' : 'approved', { task_id: task.id })!;
    ctx.events.record({
      type: 'gate_decision',
      node_id: opportunity.id,
      summary: `Gate ${decided.decision}: ${action.summary}`,
      data: {
        gate_action_id: action.id,
        action_type: action.action_type,
        decision: decided.decision,
        opportunity_id: opportunity.id,
        task_id: task.id,
        edited,
      },
    });

    return c.json({ ...withLinks(ctx, decided), opportunity: { ...updatedOpp, band: bandForScore(updatedOpp.score) }, task });
  })
  // ── Reject (reason required — logged for LEARN) ──
  .post('/actions/:id/reject', async (c) => {
    const ctx = getCtx(c);
    const action = ctx.gate.getById(c.req.param('id'));
    if (!action) return err(c, 404, 'NOT_FOUND', 'gate action not found');
    if (action.status !== 'PENDING') {
      return err(c, 409, 'ALREADY_DECIDED', `gate action already ${action.status.toLowerCase()} — decisions are final`);
    }
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = rejectGateActionSchema.safeParse(body);
    if (!parsed.success) {
      return err(c, 422, 'VALIDATION', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const decided = ctx.gate.decide(action.id, 'rejected', { reason: parsed.data.reason })!;
    ctx.events.record({
      type: 'gate_decision',
      node_id: action.opportunity_id,
      summary: `Gate rejected: ${action.summary} — ${parsed.data.reason}`,
      data: {
        gate_action_id: action.id,
        action_type: action.action_type,
        decision: 'rejected',
        reason: parsed.data.reason,
        opportunity_id: action.opportunity_id,
      },
    });
    return c.json(withLinks(ctx, decided));
  });

const DAY_MS = 24 * 60 * 60 * 1000;
function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}
