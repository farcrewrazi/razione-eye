import { Hono } from 'hono';
import { agentDataSchema, type AgentData } from '@razione-eye/shared';
import { getCtx, err } from './http-util.ts';
import { nowIso } from './ulid.ts';

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
    const { nodes, events } = getCtx(c);
    const node = nodes.getById(c.req.param('id'));
    if (!node || node.type !== 'AGENT') return err(c, 404, 'NOT_FOUND', 'agent not found');

    // Phase-0 stub: record a run, set last_run + last_status "empty" (D-005: no real capability).
    const data = agentDataSchema.parse(node.data) as AgentData;
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
