import { Hono } from 'hono';
import type { Edge, Node } from '@razione-eye/shared';
import { getCtx, err } from './http-util.ts';

/**
 * BFS neighborhood expansion up to `depth` hops (default 1, max 3).
 * Returns the root node + all edges traversed + resolved neighbor nodes.
 */
export const graphRoute = new Hono().get('/neighbors/:id', (c) => {
  const { nodes, edges } = getCtx(c);
  const root = nodes.getById(c.req.param('id'));
  if (!root) return err(c, 404, 'NOT_FOUND', 'node not found');

  const depthParam = c.req.query('depth');
  const depth = Math.min(Math.max(depthParam ? Number(depthParam) : 1, 1), 3);

  const seenNodes = new Map<string, Node>([[root.id, root]]);
  const seenEdges = new Map<string, Edge>();
  let frontier = [root.id];

  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of [...edges.outgoing(id), ...edges.incoming(id)]) {
        seenEdges.set(e.id, e);
        const otherId = e.from_id === id ? e.to_id : e.from_id;
        if (!seenNodes.has(otherId)) {
          const n = nodes.getById(otherId);
          if (n) {
            seenNodes.set(otherId, n);
            next.push(otherId);
          }
        }
      }
    }
    frontier = next;
  }

  return c.json({
    node: root,
    edges: [...seenEdges.values()],
    neighbors: [...seenNodes.values()].filter((n) => n.id !== root.id),
  });
});
