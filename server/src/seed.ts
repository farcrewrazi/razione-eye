/**
 * CLI: pnpm --filter @razione-eye/server seed
 * Idempotent — safe to run repeatedly.
 */
import { openDb } from './db.ts';
import { makeContext } from './context.ts';
import { runSeed } from './seed-service.ts';

const db = openDb();
const ctx = makeContext(db);
const result = runSeed(ctx);

console.log(JSON.stringify(result, null, 2));
console.log(
  result.created.nodes === 0 && result.created.edges === 0
    ? 'seed: no changes (already seeded)'
    : `seed: created ${result.created.nodes} nodes, ${result.created.edges} edges`,
);
db.close();
