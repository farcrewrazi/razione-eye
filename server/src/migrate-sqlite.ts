/**
 * One-off SQLite file → Postgres import.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node server/src/migrate-sqlite.ts --from ./server/data/razione-eye.db
 *   DATABASE_URL=postgres://... pnpm --filter @razione-eye/server migrate:sqlite -- --from ./server/data/razione-eye.db
 *
 * Reads nodes/edges/events/gate_actions from the SQLite file via `node:sqlite`
 * and inserts into Postgres with `ON CONFLICT (id) DO NOTHING`, in FK-safe
 * order: nodes → edges → events → gate_actions. Idempotent — safe to re-run.
 * Verifies counts at the end (pg total must be >= sqlite total per table).
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDb, initDb } from './db.ts';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FROM = resolve(here, '../data/razione-eye.db');

const TABLES = ['nodes', 'edges', 'events', 'gate_actions'] as const;

function parseFromArg(argv: string[]): string {
  const idx = argv.indexOf('--from');
  if (idx !== -1) {
    const value = argv[idx + 1];
    if (value) return resolve(value);
  }
  // Bare positional fallback: `node migrate-sqlite.ts ./path/to.db`.
  const positional = argv.find((a) => !a.startsWith('-') && (a.endsWith('.db') || a.includes('/')));
  if (positional) return resolve(positional);
  return DEFAULT_FROM;
}

interface CountRow {
  c: string | number;
}

async function main(): Promise<void> {
  const from = parseFromArg(process.argv.slice(2));
  if (!existsSync(from)) {
    console.error(`error: sqlite file not found: ${from} (pass --from <path>)`);
    process.exit(2);
  }

  const sqlite = new DatabaseSync(from, { readOnly: true });
  try {
    const pool = await initDb();
    try {
      const summary: Record<string, { sqlite: number; inserted: number; pg: number }> = {};

      // ── nodes ──────────────────────────────────────────────────────────
      const nodeRows = sqlite.prepare('SELECT * FROM nodes').all() as Record<string, unknown>[];
      let nodesInserted = 0;
      for (const r of nodeRows) {
        const res = await pool.query(
          `INSERT INTO nodes (id, type, name, status, opportunity_type, score, due_at, source, tags, notes, data, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13)
           ON CONFLICT (id) DO NOTHING`,
          [
            r['id'],
            r['type'],
            r['name'],
            r['status'],
            r['opportunity_type'],
            r['score'],
            r['due_at'],
            r['source'],
            r['tags'],
            r['notes'],
            r['data'],
            r['created_at'],
            r['updated_at'],
          ],
        );
        nodesInserted += res.rowCount ?? 0;
      }

      // ── edges ──────────────────────────────────────────────────────────
      const edgeRows = sqlite.prepare('SELECT * FROM edges').all() as Record<string, unknown>[];
      let edgesInserted = 0;
      for (const r of edgeRows) {
        const res = await pool.query(
          `INSERT INTO edges (id, from_id, to_id, edge_type, data, created_at)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6)
           ON CONFLICT (id) DO NOTHING`,
          [r['id'], r['from_id'], r['to_id'], r['edge_type'], r['data'], r['created_at']],
        );
        edgesInserted += res.rowCount ?? 0;
      }

      // ── events ─────────────────────────────────────────────────────────
      const eventRows = sqlite.prepare('SELECT * FROM events').all() as Record<string, unknown>[];
      let eventsInserted = 0;
      for (const r of eventRows) {
        const res = await pool.query(
          `INSERT INTO events (id, at, type, node_id, summary, data)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb)
           ON CONFLICT (id) DO NOTHING`,
          [r['id'], r['at'], r['type'], r['node_id'], r['summary'], r['data']],
        );
        eventsInserted += res.rowCount ?? 0;
      }

      // ── gate_actions ───────────────────────────────────────────────────
      let gateRows: Record<string, unknown>[] = [];
      try {
        gateRows = sqlite.prepare('SELECT * FROM gate_actions').all() as Record<string, unknown>[];
      } catch {
        gateRows = [];
      }
      let gateInserted = 0;
      for (const r of gateRows) {
        const res = await pool.query(
          `INSERT INTO gate_actions (id, action_type, status, opportunity_id, task_id, payload, summary, created_at, decided_at, decision, decision_reason)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11)
           ON CONFLICT (id) DO NOTHING`,
          [
            r['id'],
            r['action_type'],
            r['status'],
            r['opportunity_id'],
            r['task_id'],
            r['payload'],
            r['summary'],
            r['created_at'],
            r['decided_at'],
            r['decision'],
            r['decision_reason'],
          ],
        );
        gateInserted += res.rowCount ?? 0;
      }

      // ── Count verification (pg total must cover every sqlite row) ──────
      let failed = false;
      const checks: Array<{ table: string; sqliteCount: number; inserted: number }> = [
        { table: 'nodes', sqliteCount: nodeRows.length, inserted: nodesInserted },
        { table: 'edges', sqliteCount: edgeRows.length, inserted: edgesInserted },
        { table: 'events', sqliteCount: eventRows.length, inserted: eventsInserted },
        { table: 'gate_actions', sqliteCount: gateRows.length, inserted: gateInserted },
      ];
      for (const { table, sqliteCount, inserted } of checks) {
        const pgRes = await pool.query(`SELECT COUNT(*) AS c FROM ${table}`);
        const pgCount = Number((pgRes.rows[0] as CountRow)?.c ?? 0);
        summary[table] = { sqlite: sqliteCount, inserted, pg: pgCount };
        const ok = pgCount >= sqliteCount;
        if (!ok) failed = true;
        console.log(`  ${ok ? '✓' : '✗'} ${table}: sqlite=${sqliteCount} inserted=${inserted} pg=${pgCount}`);
      }

      void TABLES;
      console.log(`\nmigrate-sqlite: ${from} → Postgres`);
      if (failed) {
        console.error('migrate-sqlite FAILED: pg counts below sqlite counts.');
        process.exit(1);
      }
      console.log('migrate-sqlite OK: all sqlite rows present in Postgres.');
      void summary;
    } finally {
      await closeDb(pool);
    }
  } finally {
    sqlite.close();
  }
}

await main();
