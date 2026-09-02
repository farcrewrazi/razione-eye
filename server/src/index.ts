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
import { importRoute } from './import/import-api.ts';
import { runSeed } from './seed-service.ts';
import { runBackup } from './backup-service.ts';

export function createApp(db: DatabaseSync): { app: Hono; ctx: AppContext } {
  const ctx = makeContext(db);
  const app = new Hono();

  app.use(
    '/api/*',
    cors({
      origin: (origin) => {
        // Localhost dev only (FE dev server on any port).
        if (!origin) return undefined;
        return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : undefined;
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
    .route('/import', importRoute)
    .post('/seed', (c) => c.json(runSeed(ctx)))
    .post('/backup', (c) => c.json(runBackup(ctx.db)));

  app.route('/api', api);

  return { app, ctx };
}
