import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db.ts';
import { runBackup } from '../src/backup-service.ts';

let dir: string | null = null;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('backup', () => {
  it('creates a snapshot file that is a valid copy', () => {
    dir = mkdtempSync(join(tmpdir(), 'razione-backup-'));
    const db = openDb({ path: ':memory:' });
    db.prepare("INSERT INTO nodes (id, type, name, data, created_at, updated_at) VALUES ('01J0000000000000000000000X', 'SKILL', 'Node.js', '{}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')").run();

    const result = runBackup(db, dir);
    expect(result.filename).toMatch(/^razione-eye-\d{8}-\d{6}.*\.db$/);
    expect(statSync(result.path).size).toBeGreaterThan(0);

    const copy = openDb({ path: result.path });
    const row = copy.prepare("SELECT name FROM nodes WHERE id = '01J0000000000000000000000X'").get() as { name: string };
    expect(row.name).toBe('Node.js');
    copy.close();
    db.close();
  });

  it('prunes old snapshots beyond keep=30', () => {
    dir = mkdtempSync(join(tmpdir(), 'razione-backup-'));
    const db = openDb({ path: ':memory:' });
    for (let i = 0; i < 32; i++) {
      runBackup(db, dir!);
    }
    const files = readdirSync(dir).filter((f) => f.endsWith('.db'));
    expect(files.length).toBeLessThanOrEqual(30);
    db.close();
  });
});
