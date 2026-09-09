/**
 * CLI: pnpm --filter @razione-eye/server dev
 * Boots the API server (also ensures the seed has run at least once).
 */
import { serve } from '@hono/node-server';
import { initDb } from './db.ts';
import { createApp } from './index.ts';
import { makeContext } from './context.ts';
import { runSeed } from './seed-service.ts';

const PORT = Number(process.env.PORT ?? 8787);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract `host:port/db` from DATABASE_URL without leaking credentials. */
function hostForLog(): string {
  try {
    const u = new URL(process.env.DATABASE_URL ?? '');
    return `${u.hostname}:${u.port || '5432'}${u.pathname}`;
  } catch {
    return '(unparsable)';
  }
}

async function boot(): Promise<void> {
  // Retry loop for db not ready (e.g. compose `db` still starting or cold
  // volume init): 15 attempts with backoff (2s, capped at 5s). initDb()
  // already runs migrate(), so no second migrate() call here.
  const MAX_ATTEMPTS = Number(process.env.DB_CONNECT_RETRIES ?? 15);
  let db: Awaited<ReturnType<typeof initDb>> | null = null;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      db = await initDb();
      if (attempt > 1) console.log(`dev: connected to Postgres on attempt ${attempt}/${MAX_ATTEMPTS}`);
      break;
    } catch (e) {
      lastError = e;
      console.error(`dev: db not ready (attempt ${attempt}/${MAX_ATTEMPTS}): ${e instanceof Error ? e.message : String(e)}`);
      if (attempt < MAX_ATTEMPTS) await sleep(Math.min(2000 * attempt, 5000));
    }
  }
  if (!db) {
    console.error(`dev: could not connect to Postgres after ${MAX_ATTEMPTS} attempts (DATABASE_HOST=${hostForLog()})`);
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  await runSeed(makeContext(db)); // idempotent — cheap no-op after first boot

  const { app } = createApp(db);

  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`RaziOne Eye API listening on http://localhost:${info.port}/api`);
  });
}

await boot();
