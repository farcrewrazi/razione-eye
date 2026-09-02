import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { openDb } from '../../src/db.ts';
import { makeContext, type AppContext } from '../../src/context.ts';
import { runImport } from '../../src/import/import-pipeline.ts';
import type { ImportFileInput } from '../../src/import/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(here, '../../fixtures');

const FORMAT_BY_EXT: Record<string, ImportFileInput['format']> = {
  '.json': 'json',
  '.csv': 'csv',
  '.md': 'md',
  '.txt': 'chat',
};

function loadFixtures(): ImportFileInput[] {
  return readdirSync(FIXTURES)
    .sort()
    .filter((name) => FORMAT_BY_EXT[name.slice(name.lastIndexOf('.'))] !== undefined)
    .map((name) => ({
      name,
      format: FORMAT_BY_EXT[name.slice(name.lastIndexOf('.'))]!,
      content: readFileSync(resolve(FIXTURES, name), 'utf8'),
    }));
}

let db: DatabaseSync;
let ctx: AppContext;

beforeEach(() => {
  db = openDb({ path: ':memory:' });
  ctx = makeContext(db);
});

describe('import-pipeline integration (fixtures)', () => {
  it('reconciles: raw == created opportunities + duplicates + flagged', () => {
    const report = runImport(ctx, loadFixtures());
    const accounted = report.created.opportunities + report.totals.duplicates + report.totals.flagged;
    expect(accounted).toBe(report.totals.raw_records);
    expect(report.totals.raw_records).toBe(31);
    expect(report.totals.flagged).toBe(3);
    expect(report.totals.duplicates).toBe(1);
    expect(report.created.opportunities).toBe(27);
  });

  it('creates OPPORTUNITY nodes with DISCOVERED status, import source and tags', () => {
    runImport(ctx, loadFixtures());
    const { items, total } = ctx.nodes.list({ type: 'OPPORTUNITY', limit: 200 });
    expect(total).toBe(27);
    for (const opp of items) {
      expect(opp.status).toBe('DISCOVERED');
      expect(opp.opportunity_type).toBe('JOB');
      expect(opp.source).toBe('import');
      expect(opp.tags).toContain('imported');
      expect(typeof opp.data['role']).toBe('string');
      expect(typeof opp.data['company_id']).toBe('string');
    }
  });

  it('creates each COMPANY once + belongs_to and hiring edges', () => {
    const report = runImport(ctx, loadFixtures());
    const { total: companyTotal, items: companies } = ctx.nodes.list({ type: 'COMPANY', limit: 200 });
    // 27 opportunities across 27 distinct companies (Stellar Dynamics deduped into one).
    expect(companyTotal).toBe(report.created.companies);
    const names = companies.map((c) => c.name?.toLowerCase());
    expect(new Set(names).size).toBe(names.length);

    const { items: opps } = ctx.nodes.list({ type: 'OPPORTUNITY', limit: 200 });
    for (const opp of opps) {
      const belongs = ctx.edges.outgoing(opp.id, 'belongs_to');
      expect(belongs).toHaveLength(1);
      const companyId = belongs[0]!.to_id;
      const hiring = ctx.edges.outgoing(companyId, 'hiring');
      expect(hiring.map((e) => e.to_id)).toContain(opp.id);
    }
  });

  it('records the cross-format duplicate as a note on the primary opportunity', () => {
    runImport(ctx, loadFixtures());
    const { items } = ctx.nodes.list({ type: 'OPPORTUNITY', q: 'Stellar', limit: 200 });
    expect(items).toHaveLength(1);
    const notes = items[0]!.notes.map((n) => (typeof n === 'string' ? n : n.text));
    expect(notes.some((t) => t.includes('Deduped 1 alternate record'))).toBe(true);
  });

  it('stores flagged records as SIGNAL nodes (queryable, tagged incomplete)', () => {
    runImport(ctx, loadFixtures());
    const { items } = ctx.nodes.list({ type: 'SIGNAL', limit: 200 });
    expect(items).toHaveLength(3);
    for (const sig of items) {
      expect(sig.source).toBe('import');
      expect(sig.tags).toEqual(expect.arrayContaining(['import', 'flagged', 'incomplete']));
      expect(sig.data['signal_type']).toBe('JOB_POSTING');
      expect(typeof sig.data['flag_reason']).toBe('string');
    }
  });

  it('records opportunity_imported + import_run events', () => {
    runImport(ctx, loadFixtures());
    const { items } = ctx.events.list();
    const imported = items.filter((e) => e.type === 'opportunity_imported');
    expect(imported).toHaveLength(27);
    const runs = items.filter((e) => e.type === 'import_run');
    expect(runs).toHaveLength(1);
    expect(runs[0]!.data).toMatchObject({ totals: { raw_records: 31 } });
  });

  it('per-file reports reconcile too', () => {
    const report = runImport(ctx, loadFixtures());
    for (const file of report.files) {
      expect(file.normalized + file.flagged.length).toBe(file.raw_records);
    }
  });
});
