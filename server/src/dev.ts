/**
 * CLI: pnpm --filter @razione-eye/server dev
 * Boots the API server (also ensures the seed has run at least once).
 */
import { serve } from '@hono/node-server';
import { openDb } from './db.ts';
import { createApp } from './index.ts';
import { makeContext } from './context.ts';
import { runSeed } from './seed-service.ts';

const PORT = Number(process.env.PORT ?? 8787);

const db = openDb();
runSeed(makeContext(db)); // idempotent — cheap no-op after first boot

const { app } = createApp(db);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`RaziOne Eye API listening on http://localhost:${info.port}/api`);
});
