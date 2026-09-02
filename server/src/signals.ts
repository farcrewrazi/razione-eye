import { Hono } from 'hono';
import {
  createSignalSchema,
  signalDispositionSchema,
  signalTypeSchema,
  updateSignalSchema,
  type SignalData,
} from '@razione-eye/shared';
import { getCtx, err } from './http-util.ts';

export const signalsRoute = new Hono()
  .get('/', (c) => {
    const { nodes } = getCtx(c);
    const q = c.req.query();
    const disposition = q['disposition'];
    if (disposition && !signalDispositionSchema.safeParse(disposition).success) {
      return err(c, 400, 'BAD_QUERY', `invalid disposition: ${disposition}`);
    }
    const signalType = q['signal_type'];
    if (signalType && !signalTypeSchema.safeParse(signalType).success) {
      return err(c, 400, 'BAD_QUERY', `invalid signal_type: ${signalType}`);
    }

    const { items, total } = nodes.list({
      type: 'SIGNAL',
      ...(disposition ? { status: disposition } : {}),
      ...(q['q'] ? { q: q['q'] } : {}),
      ...(q['limit'] ? { limit: Number(q['limit']) } : {}),
      ...(q['offset'] ? { offset: Number(q['offset']) } : {}),
    });

    // signal_type lives in the data blob — filter post-query (single-user scale).
    const filtered = signalType
      ? items.filter((n: (typeof items)[number]) => (n.data as SignalData).signal_type === signalType)
      : items;

    return c.json({ items: filtered, total: signalType ? filtered.length : total });
  })
  .post('/', async (c) => {
    const { nodes } = getCtx(c);
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = createSignalSchema.safeParse(body);
    if (!parsed.success) {
      return err(c, 422, 'VALIDATION', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const input = parsed.data;
    const node = nodes.create({
      type: 'SIGNAL',
      name: input.name ?? null,
      status: input.status ?? 'NEW',
      source: input.source ?? 'manual',
      tags: input.tags ?? [],
      notes: input.notes ?? [],
      data: input.data as unknown as Record<string, unknown>,
    });
    return c.json(node, 201);
  })
  .get('/:id', (c) => {
    const { nodes } = getCtx(c);
    const node = nodes.getById(c.req.param('id'));
    if (!node || node.type !== 'SIGNAL') return err(c, 404, 'NOT_FOUND', 'signal not found');
    return c.json(node);
  })
  .patch('/:id', async (c) => {
    const { nodes } = getCtx(c);
    const node = nodes.getById(c.req.param('id'));
    if (!node || node.type !== 'SIGNAL') return err(c, 404, 'NOT_FOUND', 'signal not found');

    const body: unknown = await c.req.json().catch(() => null);
    const parsed = updateSignalSchema.safeParse(body);
    if (!parsed.success) {
      return err(c, 422, 'VALIDATION', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const input = parsed.data;
    const mergedData = input.data ? { ...node.data, ...input.data } : node.data;
    const updated = nodes.update(node.id, {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      data: mergedData as Record<string, unknown>,
    });
    return c.json(updated);
  });
