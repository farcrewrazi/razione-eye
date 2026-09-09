import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Pool } from 'pg';
import { openTestDb, resetTestDb, closeTestDb, pgDumpAvailable, pgRestoreAvailable } from './helpers.ts';
import { runBackup } from '../src/backup-service.ts';

const execFileAsync = promisify(execFile);

let pool: Pool;
let dir: string | null = null;

beforeAll(async () => {
  pool = await openTestDb();
});

beforeEach(async () => {
  await resetTestDb(pool);
});

afterAll(async () => {
  await closeTestDb(pool);
});

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

async function requirePgDump(): Promise<boolean> {
  if (await pgDumpAvailable()) return true;
  console.warn('SKIP: pg_dump not available on PATH — backup test skipped.');
  return false;
}

describe('backup (pg_dump)', () => {
  it('creates a .dump snapshot of the test database', async () => {
    if (!(await requirePgDump())) return;
    dir = mkdtempSync(join(tmpdir(), 'razione-backup-'));
    await pool.query(
      "INSERT INTO nodes (id, type, name, data) VALUES ('01J0000000000000000000000X', 'SKILL', 'Node.js', '{}')",
    );

    const result = await runBackup(pool, dir);
    expect(result.filename).toMatch(/^razione-eye-\d{8}-\d{6}.*\.dump$/);
    expect(statSync(result.path).size).toBeGreaterThan(0);
    expect(result.kept).toBeGreaterThanOrEqual(1);

    // The row made it into the database pg_dump just snapshotted.
    const { rows } = await pool.query<{ name: string }>('SELECT name FROM nodes WHERE id = $1', [
      '01J0000000000000000000000X',
    ]);
    expect(rows[0]!.name).toBe('Node.js');

    // Content verification: the custom-format archive must reference the dump.
    if (await pgRestoreAvailable()) {
      const { stdout } = await execFileAsync('pg_restore', ['--list', result.path]);
      expect(stdout).toContain('nodes');
    } else {
      console.warn('SKIP: pg_restore not available — verified file exists + kept/pruned counts only.');
      expect(result.pruned).toBe(0);
    }
  });

  it('prunes old snapshots beyond keep=30', async () => {
    if (!(await requirePgDump())) return;
    dir = mkdtempSync(join(tmpdir(), 'razione-backup-'));
    for (let i = 0; i < 32; i++) {
      await runBackup(pool, dir!);
    }
    const files = readdirSync(dir).filter((f) => f.endsWith('.dump'));
    expect(files.length).toBeLessThanOrEqual(30);
  });
});
