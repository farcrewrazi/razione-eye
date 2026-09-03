import { Hono } from 'hono';
import { agentDataSchema, type AgentData } from '@razione-eye/shared';
import { getCtx, err } from './http-util.ts';
import { nowIso } from './ulid.ts';
import { JOB_ANALYST_NAME, runJobAnalyst } from './agents/run-service.ts';

const RUNS_CAP = 50;

export const agentsRoute = new Hono()
  .get('/', (c) => {
    const { nodes } = getCtx(c);
    const { items, total } = nodes.list({ type: 'AGENT', sort: 'name' });
    return c.json({ items, total });
  })
  .get('/:id', (c) => {
    const { nodes } = getCtx(c);
    const node = nodes.getById(c.req.param('id'));
    if (!node || node.type !== 'AGENT') return err(c, 404, 'NOT_FOUND', 'agent not found');
    return c.json(node);
  })
  .post('/:id/run', (c) => {
    const ctx = getCtx(c);
    const { nodes, events } = ctx;
    const node = nodes.getById(c.req.param('id'));
    if (!node || node.type !== 'AGENT') return err(c, 404, 'NOT_FOUND', 'agent not found');

    const data = agentDataSchema.parse(node.data) as AgentData;

    // ── Job Analyst (T1.4): real deterministic run over JOB opportunities ──
    // ?force=true re-analyzes everything; default only jobs lacking sub-scores.
    if (data.name === JOB_ANALYST_NAME) {
      const force = c.req.query('force') === 'true';
      const { agent, report } = runJobAnalyst(ctx, node, { force });
      return c.json({ ...agent, report });
    }

    // ── Other agents: Phase-0 stub (D-005: capability not implemented yet) ──
    const now = nowIso();
    const runs = [...data.runs, { at: now, status: 'empty' as const, summary: 'stub run — capability not implemented in Phase 0' }].slice(-RUNS_CAP);
    const patched: AgentData = { ...data, last_run: now, last_status: 'empty', runs };
    const updated = nodes.update(node.id, { data: { ...patched } });
    events.record({
      type: 'agent_run',
      node_id: node.id,
      summary: `Agent "${data.name}" run: empty (stub)`,
      data: { status: 'empty', at: now },
    });
    return c.json(updated);
  });
