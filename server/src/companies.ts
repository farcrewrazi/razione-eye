import { Hono } from 'hono';
import { bandForScore } from '@razione-eye/shared';
import { getCtx, err } from './http-util.ts';

export const companiesRoute = new Hono()
  .get('/', async (c) => {
    const { nodes } = getCtx(c);
    const q = c.req.query();
    const { items, total } = await nodes.list({
      type: 'COMPANY',
      ...(q['q'] ? { q: q['q'] } : {}),
      ...(q['limit'] ? { limit: Number(q['limit']) } : {}),
      ...(q['offset'] ? { offset: Number(q['offset']) } : {}),
      sort: q['sort'] ?? 'name',
    });
    return c.json({ items, total });
  })
  .get('/:id', async (c) => {
    const { nodes, edges } = getCtx(c);
    const node = await nodes.getById(c.req.param('id'));
    if (!node || node.type !== 'COMPANY') return err(c, 404, 'NOT_FOUND', 'company not found');

    // Opportunities of this company: incoming belongs_to / outgoing hiring edges.
    const oppIds = new Set<string>();
    for (const e of await edges.incoming(node.id, 'belongs_to')) oppIds.add(e.from_id);
    for (const e of await edges.outgoing(node.id, 'hiring')) oppIds.add(e.to_id);
    const oppNodes = await Promise.all([...oppIds].map((id) => nodes.getById(id)));
    const opportunities = oppNodes
      .filter((n): n is NonNullable<typeof n> => n !== null)
      .map((n) => ({ ...n, band: bandForScore(n.score) }));

    return c.json({ ...node, opportunities });
  });
