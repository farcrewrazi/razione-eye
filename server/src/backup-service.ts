/**
 * Backup routine (T0.11): SQLite VACUUM INTO a timestamped snapshot; keep last N=30.
 */
import { mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { BACKUP_DIR } from './db.ts';

const KEEP = 30;

export interface BackupResult {
  path: string;
  filename: string;
  kept: number;
  pruned: number;
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

export function runBackup(db: DatabaseSync, backupDir: string = BACKUP_DIR): BackupResult {
  mkdirSync(backupDir, { recursive: true });

  let filename = `razione-eye-${timestamp()}.db`;
  let path = join(backupDir, filename);
  let i = 1;
  while (exists(path)) {
    filename = `razione-eye-${timestamp()}-${i}.db`;
    path = join(backupDir, filename);
    i++;
  }

  db.exec(`VACUUM INTO '${path.replaceAll("'", "''")}'`);

  const snapshots = readdirSync(backupDir)
    .filter((f) => f.startsWith('razione-eye-') && f.endsWith('.db'))
    .map((f) => ({ f, mtime: statSync(join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  let pruned = 0;
  for (const old of snapshots.slice(KEEP)) {
    unlinkSync(join(backupDir, old.f));
    pruned++;
  }

  return { path, filename, kept: Math.min(snapshots.length, KEEP), pruned };
}

function exists(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}
