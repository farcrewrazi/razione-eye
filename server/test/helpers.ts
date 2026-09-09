/**
 * Shared Postgres test helpers — every DB-backed test file uses these.
 *
 * The suite runs against a dedicated `razione_eye_test` database (never the
 * dev/prod one). Connection string precedence:
 *   TEST_DATABASE_URL > DATABASE_URL > default local URL.
 *
 * `openTestDb()` also pins `process.env.DATABASE_URL` to the test URL so
 * child-process tooling (`pg_dump` via runBackup, `pg_restore` verification)
 * targets the same database the pools use.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Pool } from 'pg';
import { openDb, migrate, closeDb } from '../src/db.ts';

const execFileAsync = promisify(execFile);

export const TEST_DATABASE_URL: string =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgres://razione:razione@localhost:5432/razione_eye_test';

/**
 * Open a pool to the test database and migrate it. Truncates all domain
 * tables so the first test in the file starts from an empty graph.
 */
export async function openTestDb(): Promise<Pool> {
  // pg_dump/pg_restore spawned by backup tests read DATABASE_URL.
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  const pool = openDb({ connectionString: TEST_DATABASE_URL, max: 5 });
  await migrate(pool);
  await resetTestDb(pool);
  return pool;
}

/** Empty the graph between tests (sequences/ULIDs need no reset). */
export async function resetTestDb(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE nodes, edges, events, gate_actions CASCADE');
}

export async function closeTestDb(pool: Pool): Promise<void> {
  await closeDb(pool);
}

/** True when `pg_dump` is on PATH (used to skip backup tests gracefully). */
export async function pgDumpAvailable(): Promise<boolean> {
  try {
    await execFileAsync('pg_dump', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/** True when `pg_restore` is on PATH (used for dump-content verification). */
export async function pgRestoreAvailable(): Promise<boolean> {
  try {
    await execFileAsync('pg_restore', ['--version']);
    return true;
  } catch {
    return false;
  }
}
