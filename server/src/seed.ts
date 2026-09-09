/**
 * CLI: pnpm --filter @razione-eye/server seed
 * Idempotent — safe to run repeatedly.
 */
import { closeDb, initDb } from './db.ts';
import { makeContext } from './context.ts';
import { runSeed } from './seed-service.ts';

const db = await initDb();
try {
  const ctx = makeContext(db);
  const result = await runSeed(ctx);

  console.log(JSON.stringify(result, null, 2));
  console.log(
    result.created.nodes === 0 && result.created.edges === 0
      ? 'seed: no changes (already seeded)'
      : `seed: created ${result.created.nodes} nodes, ${result.created.edges} edges`,
  );
} finally {
  await closeDb(db);
}
