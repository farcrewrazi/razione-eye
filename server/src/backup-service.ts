/**
 * Backup routine: pg_dump custom-format snapshot; keep last N=30.
 *
 * Runs `pg_dump $DATABASE_URL --format=custom -f <backupDir>/razione-eye-<ts>.dump`
 * via child_process. Prunes to the newest KEEP snapshots (*.dump).
 */
import { mkdirSync, readdirSync, unlinkSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));

function defaultBackupDir(): string {
  if (process.env.BACKUP_DIR) return process.env.BACKUP_DIR;
  // In the backend container backups live at /app/server/backups (pgbackups volume).
  if (process.env.NODE_ENV === 'production' || existsSync('/app/server/backups')) {
    return '/app/server/backups';
  }
  return resolve(here, '../data/backups');
}

export const BACKUP_DIR = defaultBackupDir();

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

function exists(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a pg_dump custom-format backup.
 *
 * @param backupDirOrDb backup directory, or a legacy db handle (ignored — kept
 *   for backwards compat with callers passing `ctx.db`). When a non-string is
 *   passed, it is ignored and the default dir is used unless `backupDirMaybe`
 *   is given.
 */
export async function runBackup(
  backupDirOrDb?: string | unknown,
  backupDirMaybe?: string,
): Promise<BackupResult> {
  const backupDir =
    typeof backupDirOrDb === 'string'
      ? backupDirOrDb
      : typeof backupDirMaybe === 'string'
        ? backupDirMaybe
        : BACKUP_DIR;
  mkdirSync(backupDir, { recursive: true });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Cannot run pg_dump backup.');
  }

  let filename = `razione-eye-${timestamp()}.dump`;
  let path = join(backupDir, filename);
  let i = 1;
  while (exists(path)) {
    filename = `razione-eye-${timestamp()}-${i}.dump`;
    path = join(backupDir, filename);
    i++;
  }

  await execFileAsync('pg_dump', [databaseUrl, '--format=custom', '-f', path]);

  const snapshots = readdirSync(backupDir)
    .filter((f) => f.startsWith('razione-eye-') && f.endsWith('.dump'))
    .map((f) => ({ f, mtime: statSync(join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  let pruned = 0;
  for (const old of snapshots.slice(KEEP)) {
    unlinkSync(join(backupDir, old.f));
    pruned++;
  }

  return { path, filename, kept: Math.min(snapshots.length, KEEP), pruned };
}
