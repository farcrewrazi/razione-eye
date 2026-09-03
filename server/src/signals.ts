import { Hono } from 'hono';
import { z } from 'zod';
import {
  bandForScore,
  createSignalSchema,
  signalDispositionSchema,
  signalTypeSchema,
  updateSignalSchema,
  type SignalData,
} from '@razione-eye/shared';
import { getCtx, err } from './http-util.ts';
import { nodeEventsHandler } from './events.ts';
import { promoteSignal } from './signal-promotion.ts';

const promoteSignalSchema = z
  .object({
    data: z
      .object({
        role: z.string().min(1).optional(),
        location: z.string().optional(),
        salary: z.string().optional(),
        url: z.string().url().optional(),
        stack: z.array(z.string()).optional(),
        notes: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

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
    const { nodes, events } = getCtx(c);
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
    events.record({
      type: 'signal_created',
      node_id: node.id,
      summary: `Signal created (${input.data.signal_type}, ${node.source})`,
      data: { signal_type: input.data.signal_type },
    });
    return c.json(node, 201);
  })
  .get('/:id/events', nodeEventsHandler('SIGNAL'))
  .get('/:id', (c) => {
    const { nodes } = getCtx(c);
    const node = nodes.getById(c.req.param('id'));
    if (!node || node.type !== 'SIGNAL') return err(c, 404, 'NOT_FOUND', 'signal not found');
    return c.json(node);
  })
  .patch('/:id', async (c) => {
    const { nodes, events } = getCtx(c);
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

    if (input.status && input.status !== node.status) {
      const eventType =
        input.status === 'PROMOTED' ? 'signal_promoted' : input.status === 'DISMISSED' ? 'signal_dismissed' : 'status_changed';
      events.record({
        type: eventType,
        node_id: node.id,
        summary: `Signal ${node.status} → ${input.status}`,
        data: { from: node.status, to: input.status },
      });
    }
    return c.json(updated);
  })
  .post('/:id/promote', async (c) => {
    // T1.12-BE — promote a signal into a JOB OPPORTUNITY (idempotent).
    const ctx = getCtx(c);
    const node = ctx.nodes.getById(c.req.param('id'));
    if (!node || node.type !== 'SIGNAL') return err(c, 404, 'NOT_FOUND', 'signal not found');

    const raw: unknown = await c.req.json().catch(() => ({}));
    const parsed = promoteSignalSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return err(c, 422, 'VALIDATION', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }

    // Idempotent: already promoted → return the signal + its opportunity.
    if (node.status === 'PROMOTED' && typeof (node.data as SignalData).promoted_to === 'string') {
      const existing = ctx.nodes.getById((node.data as SignalData).promoted_to!);
      if (existing) {
        return c.json({ signal: node, opportunity: { ...existing, band: bandForScore(existing.score) } });
      }
    }

    const { signal, opportunity } = promoteSignal(ctx, node, parsed.data.data ?? {});
    return c.json({ signal, opportunity: { ...opportunity, band: bandForScore(opportunity.score) } }, 201);
  });
