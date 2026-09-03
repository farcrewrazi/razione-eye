/**
 * T1.2 corpus verification — `node server/src/import/verify.ts [dir]` (or
 * `pnpm --filter @razione-eye/server verify:import`).
 *
 * Imports the ~30-job mixed-format corpus (server/fixtures/ by default) into
 * a throwaway in-memory DB and asserts the T1.2 contract:
 *   1. Reconciliation: raw_records == created opportunities + duplicates + flagged.
 *   2. Expected corpus shape (jobs per format, deliberate duplicates, flagged
 *      stragglers) — update EXPECT below if the corpus changes deliberately.
 *   3. Idempotent re-import: a second run creates 0 opportunities and every
 *      record reconciles as a duplicate or a flagged straggler.
 *
 * Exits 0 when all assertions hold, 1 otherwise.
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

/** Expected shape of the committed corpus (see docs/04 T1.2). */
const EXPECT = {
  files: 5, // json, csv, 2 × md, chat export
  raw_records: 45,
  created_opportunities: 34,
  flagged: 5, // incomplete records — flagged, never guessed
  duplicates: 6, // 1 in-batch (same company+role+source) + 5 cross-channel linked
  linked: 5, // same company+role arriving via a different channel
  batch: 1,
} as const;

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`);
}

function main(): void {
  const dir = resolve(process.argv[2] ?? DEFAULT_DIR);
  const files: ImportFileInput[] = readdirSync(dir)
    .sort()
    .filter((name) => FORMAT_BY_EXT[name.slice(name.lastIndexOf('.'))] !== undefined)
    .map((name) => ({
      name,
      format: FORMAT_BY_EXT[name.slice(name.lastIndexOf('.'))]!,
      content: readFileSync(resolve(dir, name), 'utf8'),
    }));
  if (files.length === 0) {
    console.error(`error: no importable files (.json/.csv/.md/.txt) found in ${dir}`);
    process.exit(2);
  }

  const db = openDb({ path: ':memory:' });
  const ctx = makeContext(db);
  const report = runImport(ctx, files);

  console.log(`\nT1.2 verification — import corpus from ${dir}\n`);
  for (const f of report.files) {
    console.log(
      `  ${f.path} [${f.format}]  raw=${f.raw_records} normalized=${f.normalized} flagged=${f.flagged.length} duplicates=${f.duplicates.length}`,
    );
  }
  console.log('');

  check('files', report.files.length, EXPECT.files);
  check('raw records', report.totals.raw_records, EXPECT.raw_records);
  check('created opportunities', report.created.opportunities, EXPECT.created_opportunities);
  check('flagged stragglers', report.totals.flagged, EXPECT.flagged);
  check('duplicates', report.totals.duplicates, EXPECT.duplicates);
  const reasons = report.files.flatMap((f) => f.duplicates.map((d) => d.reason ?? 'batch'));
  check(
    'cross-channel linked',
    reasons.filter((r) => r === 'linked').length,
    EXPECT.linked,
  );
  check(
    'in-batch duplicates',
    reasons.filter((r) => r === 'batch').length,
    EXPECT.batch,
  );

  // Reconciliation invariant (T1.2: imported = raw ± stragglers flagged).
  const accounted = report.created.opportunities + report.totals.duplicates + report.totals.flagged;
  check('reconciliation (created + duplicates + flagged == raw)', accounted, report.totals.raw_records);
  check('opportunities in graph', ctx.nodes.countByType('OPPORTUNITY'), EXPECT.created_opportunities);
  check('flagged stored as SIGNALs', ctx.nodes.countByType('SIGNAL'), EXPECT.flagged);

  // Idempotent re-import: nothing new created; every record accounted for.
  const second = runImport(ctx, files);
  console.log('\nRe-import (idempotency):');
  check('second run created', second.created.opportunities, 0);
  const accounted2 = second.created.opportunities + second.totals.duplicates + second.totals.flagged;
  check('second run reconciliation', accounted2, second.totals.raw_records);
  check('opportunities still', ctx.nodes.countByType('OPPORTUNITY'), EXPECT.created_opportunities);

  if (failures > 0) {
    console.error(`\nT1.2 verification FAILED: ${failures} assertion(s) did not hold.`);
    process.exit(1);
  }
  console.log(
    `\nT1.2 verification OK: ${report.totals.raw_records} raw → ${report.created.opportunities} imported, ` +
      `${report.totals.duplicates} duplicates linked/merged, ${report.totals.flagged} stragglers flagged.`,
  );
}

main();
