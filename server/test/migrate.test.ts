/**
 * Migration idempotency — `migrate(pool)` must be safe to run twice
 * (CREATE TABLE / CREATE INDEX IF NOT EXISTS) and leave the core tables
 * behind.
 */
import { describe, it, expect } from 'vitest';
import { openDb, migrate, closeDb } from '../src/db.ts';
import { TEST_DATABASE_URL } from './helpers.ts';

describe('migrate idempotency', () => {
  it('migrate twice succeeds and core tables exist', async () => {
    const pool = openDb({ connectionString: TEST_DATABASE_URL, max: 2 });
    try {
      await migrate(pool);
      await migrate(pool);
      for (const table of ['nodes', 'edges', 'events', 'gate_actions']) {
        const { rows } = await pool.query<{ oid: string | null }>('SELECT to_regclass($1) AS oid', [
          `public.${table}`,
        ]);
        expect(rows[0]!.oid).toBe(table);
      }
    } finally {
      await closeDb(pool);
    }
  });
});
