import { Hono } from 'hono';
import { importRequestSchema, importReportSchema } from '@razione-eye/shared';
import { getCtx, err } from '../http-util.ts';
import { runImport } from './import-pipeline.ts';

export const importRoute = new Hono()
  .post('/', async (c) => {
    const ctx = getCtx(c);
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = importRequestSchema.safeParse(body);
    if (!parsed.success) {
      return err(c, 422, 'VALIDATION', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const report = runImport(ctx, parsed.data.files);
    return c.json(report, 201);
  })
  .get('/report', (c) => {
    const { events } = getCtx(c);
    const latest = events.latestByType('import_run');
    if (!latest || !latest.data) return err(c, 404, 'NOT_FOUND', 'no import has run yet');
    const report = importReportSchema.safeParse(latest.data);
    if (!report.success) return err(c, 500, 'INTERNAL', 'stored import report is malformed');
    return c.json(report.data);
  });
