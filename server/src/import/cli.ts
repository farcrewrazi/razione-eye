/**
 * Import CLI (T1.2) — `node server/src/import/cli.ts [dir]`
 * Imports every job file from `server/fixtures/` (default) or a given directory
 * (the real ~30-job files later — same one-liner). Prints the ImportReport and
 * exits non-zero if reconciliation fails:
 *   raw_records == created opportunities + duplicates + flagged
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../db.ts';
import { makeContext } from '../context.ts';
import { runImport } from './import-pipeline.ts';
import type { ImportFileInput } from './types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = resolve(here, '../../fixtures');

const FORMAT_BY_EXT: Record<string, ImportFileInput['format']> = {
  '.json': 'json',
  '.csv': 'csv',
  '.md': 'md',
  '.txt': 'chat',
};

function main(): void {
  const dir = resolve(process.argv[2] ?? DEFAULT_DIR);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    console.error(`error: cannot read directory ${dir}`);
    process.exit(2);
  }

  const files: ImportFileInput[] = [];
  for (const entry of entries.sort()) {
    const dot = entry.lastIndexOf('.');
    if (dot === -1) continue;
    const format = FORMAT_BY_EXT[entry.slice(dot).toLowerCase()];
    if (!format) continue;
    const path = resolve(dir, entry);
    files.push({ name: entry, format, content: readFileSync(path, 'utf8') });
  }

  if (files.length === 0) {
    console.error(`error: no importable files (.json/.csv/.md/.txt) found in ${dir}`);
    process.exit(2);
  }

  const db = openDb();
  const ctx = makeContext(db);
  const report = runImport(ctx, files);

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\nRaziOne Eye — import run at ${report.ran_at}`);
  console.log(`Directory: ${dir}\n`);
  for (const f of report.files) {
    console.log(
      `  ${f.path} [${f.format}]  raw=${f.raw_records} normalized=${f.normalized} flagged=${f.flagged.length} duplicates=${f.duplicates.length}`,
    );
    for (const fl of f.flagged) console.log(`    ⚑ flagged: ${fl.reason} → signal ${fl.signal_id ?? '?'}`);
    for (const d of f.duplicates) console.log(`    ⧉ duplicate: kept "${d.kept}", dropped "${d.dropped}" [${d.reason ?? 'batch'}]`);
  }
  console.log(
    `\nCreated: ${report.created.opportunities} opportunities, ${report.created.companies} companies, ${report.created.edges} edges`,
  );
  console.log(
    `Totals: raw=${report.totals.raw_records} normalized=${report.totals.normalized} flagged=${report.totals.flagged} duplicates=${report.totals.duplicates}`,
  );

  // ── Reconciliation gate ──────────────────────────────────────────────────
  const accounted = report.created.opportunities + report.totals.duplicates + report.totals.flagged;
  if (accounted !== report.totals.raw_records) {
    console.error(
      `\nRECONCILIATION FAILED: created(${report.created.opportunities}) + duplicates(${report.totals.duplicates}) + flagged(${report.totals.flagged}) = ${accounted} != raw_records(${report.totals.raw_records})`,
    );
    process.exit(1);
  }
  console.log(`\nReconciliation OK: ${accounted} of ${report.totals.raw_records} raw records accounted for.`);
}

main();
