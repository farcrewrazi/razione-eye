import { Hono } from 'hono';
import { getCtx } from './http-util.ts';
import { dashboard, nextBestAction } from './dashboard.ts';

/** T1.9-BE groundwork — deterministic aggregations for the FE dashboard (Wave 4). */
export const dashboardRoute = new Hono()
  .get('/next-best-action', (c) => {
    const ctx = getCtx(c);
    return c.json(nextBestAction(ctx));
  })
  .get('/dashboard', (c) => {
    const ctx = getCtx(c);
    return c.json(dashboard(ctx));
  });
