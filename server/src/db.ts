/**
 * DB open/init/migrate — PostgreSQL via `pg` Pool.
 *
 * Connection string comes from `DATABASE_URL` (e.g.
 * `postgres://user:pass@localhost:5432/razione_eye`).
 */
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(here, 'schema.sql');

/** Shared DB handle type — a `pg` connection pool. */
export type Db = Pool;

export interface OpenDbOptions {
  /** Override the connection string (tests / scripts). Defaults to `DATABASE_URL`. */
  connectionString?: string;
  /** Max pooled clients. Defaults to `PGPOOL_MAX` or 10. */
  max?: number;
}

function resolveConnectionString(options: OpenDbOptions = {}): string {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Set it to a Postgres connection string.');
  }
  return connectionString;
}

/**
 * Create a new `pg` Pool. Does NOT run migrations — call `migrate(pool)`
 * (or `initDb()`) once at startup. Caller owns the pool and must call
 * `pool.end()` / `closeDb(pool)` on shutdown.
 */
export function openDb(options: OpenDbOptions = {}): Pool {
  const connectionString = resolveConnectionString(options);
  const max = options.max ?? (process.env.PGPOOL_MAX ? Number(process.env.PGPOOL_MAX) : 10);
  return new Pool({ connectionString, max });
}

/** Create a pool and run pending migrations. Convenience wrapper for app entrypoints. */
export async function initDb(options: OpenDbOptions = {}): Promise<Pool> {
  const pool = openDb(options);
  await migrate(pool);
  return pool;
}

/** Run schema.sql against the pool (idempotent — uses CREATE TABLE IF NOT EXISTS). */
export async function migrate(pool: Pool): Promise<void> {
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  try {
    // Single round-trip fast path (pg supports multi-statement simple queries).
    await pool.query(schema);
    return;
  } catch {
    // Fall back to sequential execution (e.g. if the driver rejects
    // multi-statement batches) — split on semicolons and run each part.
  }
  for (const stmt of splitStatements(schema)) {
    await pool.query(stmt);
  }
}

/**
 * Split SQL text into individual statements on `;`, ignoring semicolons
 * inside line comments, block comments, and single- or double-quoted
 * string literals (with doubled-quote escapes).
 */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1] ?? '';
    if (inLineComment) {
      current += ch;
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += next;
        i++;
        inBlockComment = false;
      }
      continue;
    }
    if (inSingle) {
      current += ch;
      if (ch === "'" && next === "'") {
        current += next;
        i++;
      } else if (ch === "'") {
        inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      current += ch;
      if (ch === '"' && next === '"') {
        current += next;
        i++;
      } else if (ch === '"') {
        inDouble = false;
      }
      continue;
    }
    if (ch === '-' && next === '-') {
      inLineComment = true;
      current += ch + next;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      current += ch + next;
      i++;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      current += ch;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      current += ch;
      continue;
    }
    if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed.length > 0) out.push(trimmed);
      current = '';
      continue;
    }
    current += ch;
  }
  const tail = current.trim();
  if (tail.length > 0) out.push(tail);
  return out;
}

/** Gracefully shut down a pool created by `openDb`/`initDb`. */
export async function closeDb(pool: Pool): Promise<void> {
  await pool.end();
}
