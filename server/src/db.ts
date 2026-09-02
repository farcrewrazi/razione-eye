/**
 * DB open/init/migrate — node:sqlite (built-in, zero native deps).
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(here, 'schema.sql');

export const DEFAULT_DB_PATH = resolve(here, '../data/razione-eye.db');
export const BACKUP_DIR = resolve(here, '../data/backups');

export interface OpenDbOptions {
  /** Override db path (tests use ':memory:'). */
  path?: string;
}

export function openDb(options: OpenDbOptions = {}): DatabaseSync {
  const path = options.path ?? process.env.RAZIONE_DB_PATH ?? DEFAULT_DB_PATH;
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

export function migrate(db: DatabaseSync): void {
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);
}
