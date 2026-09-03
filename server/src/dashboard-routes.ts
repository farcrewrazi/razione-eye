import { Hono } from 'hono';
import { getCtx, err } from './http-util.ts';
import { dashboard, nextBestAction } from './dashboard.ts';
import { parseEyeQuery } from './eye.ts';

/** T1.9-BE groundwork — deterministic aggregations for the FE dashboard (Wave 4). */
export const dashboardRoute = new Hono()
  .get('/next-best-action', (c) => {
    const ctx = getCtx(c);
    const eyeParsed = parseEyeQuery(c.req.query('eye'));
    if ('error' in eyeParsed) return err(c, 400, 'BAD_QUERY', eyeParsed.error);
    return c.json(nextBestAction(ctx, new Date(), eyeParsed.eye));
  })
  .get('/dashboard', (c) => {
    const ctx = getCtx(c);
    const eyeParsed = parseEyeQuery(c.req.query('eye'));
    if ('error' in eyeParsed) return err(c, 400, 'BAD_QUERY', eyeParsed.error);
    return c.json(dashboard(ctx, new Date(), eyeParsed.eye));
  });
