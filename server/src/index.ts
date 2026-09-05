import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { DatabaseSync } from 'node:sqlite';
import { makeContext, type AppContext } from './context.ts';
import { healthRoute } from './health.ts';
import { profileRoute } from './profile.ts';
import { agentsRoute } from './agents.ts';
import { opportunitiesRoute } from './opportunities.ts';
import { companiesRoute } from './companies.ts';
import { signalsRoute } from './signals.ts';
import { tasksRoute } from './tasks.ts';
import { graphRoute } from './graph.ts';
import { pipelineRoute } from './pipeline.ts';
import { dashboardRoute } from './dashboard-routes.ts';
import { gateRoute } from './gate.ts';
import { morningBrief, eveningBrief } from './daily-brief.ts';
import { parseEyeQuery } from './eye.ts';
import { err, getCtx } from './http-util.ts';
import { importRoute } from './import/import-api.ts';
import { runSeed } from './seed-service.ts';
import { runBackup } from './backup-service.ts';

export function createApp(db: DatabaseSync): { app: Hono; ctx: AppContext } {
  const ctx = makeContext(db);
  const app = new Hono();

  // CORS origins: localhost for dev + CORS_ORIGIN env (comma-separated)
  // for production, e.g. CORS_ORIGIN=https://eye.example.com.
  // Same-origin deploys (frontend nginx proxying /api/ to backend) don't
  // need CORS, but direct browser→API calls do.
  const extraOrigins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);

  app.use(
    '/api/*',
    cors({
      origin: (origin) => {
        // Localhost dev only (FE dev server on any port).
        if (!origin) return undefined;
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
        if (extraOrigins.includes(origin)) return origin;
        return undefined;
      },
    }),
  );

  app.use('/api/*', async (c, next) => {
    c.set('ctx', ctx);
    await next();
  });

  app.onError((e, c) => {
    console.error(e);
    return c.json({ error: { code: 'INTERNAL', message: e.message } }, 500);
  });

  const api = new Hono()
    .route('/health', healthRoute)
    .route('/profile', profileRoute)
    .route('/agents', agentsRoute)
    .route('/opportunities', opportunitiesRoute)
    .route('/companies', companiesRoute)
    .route('/signals', signalsRoute)
    .route('/tasks', tasksRoute)
    .route('/graph', graphRoute)
    .route('/pipeline', pipelineRoute)
    .route('/', dashboardRoute)
    .route('/import', importRoute)
    .route('/gate', gateRoute)
    .get('/daily-brief/morning', (c) => {
      const eyeParsed = parseEyeQuery(c.req.query('eye'));
      if ('error' in eyeParsed) return err(c, 400, 'BAD_QUERY', eyeParsed.error);
      return c.json(morningBrief(getCtx(c), new Date(), eyeParsed.eye));
    })
    .get('/daily-brief/evening', (c) => {
      const eyeParsed = parseEyeQuery(c.req.query('eye'));
      if ('error' in eyeParsed) return err(c, 400, 'BAD_QUERY', eyeParsed.error);
      return c.json(eveningBrief(getCtx(c), new Date(), eyeParsed.eye));
    })
    .post('/seed', (c) => c.json(runSeed(ctx)))
    .post('/backup', (c) => c.json(runBackup(ctx.db)));

  app.route('/api', api);

  return { app, ctx };
}
