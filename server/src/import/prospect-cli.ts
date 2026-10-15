/**
 * Business-prospect import CLI (EYE-5) — `node server/src/import/prospect-cli.ts`
 * (or `pnpm --filter @razione-eye/server import:prospects`).
 *
 * Loads the 30-prospect corpus (server/fixtures/prospects-final-30.json merged
 * with prospects-final-30-agentic.json), imports into the configured Postgres
 * (DATABASE_URL — the LIVE database; take a snapshot first, see AGENTS.md),
 * prints the report and exits non-zero unless reconciliation holds:
 *   raw_records == created opportunities + already existing
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDb, initDb } from '../db.ts';
import { makeContext } from '../context.ts';
import {
  AGENTIC_FILE_NAME,
  BASE_FILE_NAME,
  loadProspectsFromContents,
  runProspectImport,
} from './prospects.ts';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BASE = resolve(here, '../../fixtures', BASE_FILE_NAME);
const DEFAULT_AGENTIC = resolve(here, '../../fixtures', AGENTIC_FILE_NAME);

async function main(): Promise<void> {
  const basePath = resolve(process.argv[2] ?? DEFAULT_BASE);
  const agenticPath = resolve(process.argv[3] ?? DEFAULT_AGENTIC);

  let prospects;
  try {
    prospects = loadProspectsFromContents(readFileSync(basePath, 'utf8'), readFileSync(agenticPath, 'utf8'));
  } catch (e) {
    console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }

  const db = await initDb();
  try {
    const ctx = makeContext(db);
    const report = await runProspectImport(ctx, prospects);

    console.log(`\nRaziOne Eye — prospect import run at ${report.ran_at}`);
    for (const f of report.files) {
      console.log(
        `  ${f.path}  raw=${f.raw_records} normalized=${f.normalized} flagged=${f.flagged.length} duplicates=${f.duplicates.length}`,
      );
      for (const d of f.duplicates) {
        console.log(`    ⧉ already existing (skipped): ${d.dropped}`);
      }
    }
    console.log(
      `\nCreated: ${report.created.opportunities} opportunities, ${report.created.companies} companies, ${report.created.edges} edges`,
    );

    const accounted = report.created.opportunities + report.totals.duplicates + report.totals.flagged;
    if (accounted !== report.totals.raw_records) {
      console.error(
        `\nRECONCILIATION FAILED: created(${report.created.opportunities}) + existing(${report.totals.duplicates}) + flagged(${report.totals.flagged}) = ${accounted} != raw_records(${report.totals.raw_records})`,
      );
      process.exit(1);
    }
    console.log(
      `\nReconciliation OK: ${accounted} of ${report.totals.raw_records} prospects accounted for (${report.created.opportunities} created, ${report.totals.duplicates} already existing).`,
    );
  } finally {
    await closeDb(db);
  }
}

await main();
