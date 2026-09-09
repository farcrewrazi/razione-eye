import { Hono } from 'hono';
import { createTaskSchema, taskStatusSchema, updateTaskSchema, type TaskData } from '@razione-eye/shared';
import { getCtx, err } from './http-util.ts';
import { nodeEventsHandler } from './events.ts';

export const tasksRoute = new Hono()
  .get('/', async (c) => {
    const { nodes } = getCtx(c);
    const q = c.req.query();
    const status = q['status'];
    if (status && !taskStatusSchema.safeParse(status).success) {
      return err(c, 400, 'BAD_QUERY', `invalid status: ${status}`);
    }
    const overdue = q['overdue'];
    const { items, total } = await nodes.list({
      type: 'TASK',
      ...(status ? { status } : {}),
      ...(q['due_before'] ? { due_before: q['due_before'] } : {}),
      ...(overdue === 'true' ? { overdue: true } : {}),
      sort: q['sort'] ?? 'due_at',
      ...(q['limit'] ? { limit: Number(q['limit']) } : {}),
      ...(q['offset'] ? { offset: Number(q['offset']) } : {}),
    });
    return c.json({ items, total });
  })
  .get('/:id/events', nodeEventsHandler('TASK'))
  .post('/', async (c) => {
    const { nodes, edges } = getCtx(c);
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      return err(c, 422, 'VALIDATION', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const input = parsed.data;
    const taskData = input.data as TaskData;
    const node = await nodes.create({
      type: 'TASK',
      name: input.name ?? taskData.title,
      status: input.status ?? 'TODO',
      due_at: input.due_at ?? null,
      source: input.source ?? 'manual',
      tags: input.tags ?? [],
      notes: input.notes ?? [],
      data: taskData as unknown as Record<string, unknown>,
    });

    // opportunity_id is ALSO expressed as a `serves` edge (doc 02 §5).
    if (taskData.opportunity_id) {
      const target = await nodes.getById(taskData.opportunity_id);
      if (target) await edges.ensure(node.id, target.id, 'serves');
    }
    return c.json(node, 201);
  })
  .patch('/:id', async (c) => {
    const { nodes, edges } = getCtx(c);
    const node = await nodes.getById(c.req.param('id'));
    if (!node || node.type !== 'TASK') return err(c, 404, 'NOT_FOUND', 'task not found');

    const body: unknown = await c.req.json().catch(() => null);
    const parsed = updateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return err(c, 422, 'VALIDATION', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const input = parsed.data;
    const mergedData = input.data ? { ...node.data, ...input.data } : node.data;
    const updated = await nodes.update(node.id, {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.due_at !== undefined ? { due_at: input.due_at } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.data?.title !== undefined ? { name: input.data.title } : {}),
      data: mergedData as Record<string, unknown>,
    });

    const oppId = (mergedData as TaskData).opportunity_id;
    if (input.data?.opportunity_id && oppId) {
      const target = await nodes.getById(oppId);
      if (target) await edges.ensure(node.id, target.id, 'serves');
    }
    return c.json(updated);
  });
