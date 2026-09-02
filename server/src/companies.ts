import { Hono } from 'hono';
import { bandForScore } from '@razione-eye/shared';
import { getCtx, err } from './http-util.ts';

export const companiesRoute = new Hono()
  .get('/', (c) => {
    const { nodes } = getCtx(c);
    const q = c.req.query();
    const { items, total } = nodes.list({
      type: 'COMPANY',
      ...(q['q'] ? { q: q['q'] } : {}),
      ...(q['limit'] ? { limit: Number(q['limit']) } : {}),
      ...(q['offset'] ? { offset: Number(q['offset']) } : {}),
      sort: q['sort'] ?? 'name',
    });
    return c.json({ items, total });
  })
  .get('/:id', (c) => {
    const { nodes, edges } = getCtx(c);
    const node = nodes.getById(c.req.param('id'));
    if (!node || node.type !== 'COMPANY') return err(c, 404, 'NOT_FOUND', 'company not found');

    // Opportunities of this company: incoming belongs_to / outgoing hiring edges.
    const oppIds = new Set<string>();
    for (const e of edges.incoming(node.id, 'belongs_to')) oppIds.add(e.from_id);
    for (const e of edges.outgoing(node.id, 'hiring')) oppIds.add(e.to_id);
    const opportunities = [...oppIds]
      .map((id) => nodes.getById(id))
      .filter((n): n is NonNullable<typeof n> => n !== null)
      .map((n) => ({ ...n, band: bandForScore(n.score) }));

    return c.json({ ...node, opportunities });
  });
