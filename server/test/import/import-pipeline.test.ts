import { describe, it, expect, beforeEach } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDb } from '../../src/db.ts';
import { makeContext, type AppContext } from '../../src/context.ts';
import { runImport } from '../../src/import/import-pipeline.ts';
import { loadFixtures } from './helpers.ts';

let db: DatabaseSync;
let ctx: AppContext;

beforeEach(() => {
  db = openDb({ path: ':memory:' });
  ctx = makeContext(db);
});

describe('import-pipeline integration (fixtures)', () => {
  it('reconciles: raw == created opportunities + duplicates + flagged (T1.2 corpus)', () => {
    const report = runImport(ctx, loadFixtures());
    const accounted = report.created.opportunities + report.totals.duplicates + report.totals.flagged;
    expect(accounted).toBe(report.totals.raw_records);
    // ~30-job corpus across 4 formats: 45 raw records → 34 imported,
    // 5 incomplete flagged (never guessed), 6 duplicates (1 batch + 5 cross-channel).
    expect(report.totals.raw_records).toBe(45);
    expect(report.totals.flagged).toBe(5);
    expect(report.totals.duplicates).toBe(6);
    expect(report.created.opportunities).toBe(34);
  });

  it('links cross-channel duplicates (same company+role, different source) — one node per role', () => {
    const report = runImport(ctx, loadFixtures());
    const reasons = report.files.flatMap((f) => f.duplicates.map((d) => d.reason ?? 'batch'));
    expect(reasons.filter((r) => r === 'linked')).toHaveLength(5);
    expect(reasons.filter((r) => r === 'batch')).toHaveLength(1);

    // Each deliberate near-duplicate pair resolves to exactly ONE opportunity.
    const { items } = ctx.nodes.list({ type: 'OPPORTUNITY', limit: 200 });
    for (const name of ['Stellar Dynamics', 'OrbitPay', 'HexaSoft', 'Nimbus Cloud', 'Vertex Digital']) {
      const matches = items.filter((o) => (o.name ?? '').includes(name));
      expect(matches, name).toHaveLength(1);
    }
    // The keeper records the alternate sighting as a provenance note.
    const orbit = items.find((o) => (o.name ?? '').includes('OrbitPay'))!;
    const texts = orbit.notes.map((n) => (typeof n === 'string' ? n : n.text));
    expect(texts.some((t) => t.startsWith('Also seen via'))).toBe(true);
  });

  it('creates OPPORTUNITY nodes with DISCOVERED status, import source and tags', () => {
    runImport(ctx, loadFixtures());
    const { items, total } = ctx.nodes.list({ type: 'OPPORTUNITY', limit: 200 });
    expect(total).toBe(34);
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
    // 34 opportunities across 34 distinct companies (deduped pairs share one).
    expect(companyTotal).toBe(34);
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

  it('records the in-batch duplicate as a note on the primary opportunity', () => {
    runImport(ctx, loadFixtures());
    const { items } = ctx.nodes.list({ type: 'OPPORTUNITY', q: 'Stellar', limit: 200 });
    expect(items).toHaveLength(1);
    const notes = items[0]!.notes.map((n) => (typeof n === 'string' ? n : n.text));
    // The jobs-notes.md record won the in-batch dedup (richest) and lists the alternates.
    expect(notes.some((t) => t.includes('Deduped 2 alternate record'))).toBe(true);
    // The agent-chat LinkedIn repost is linked as a cross-channel alternate.
    expect(notes.some((t) => t.startsWith('Also seen via'))).toBe(true);
  });

  it('stores flagged records as SIGNAL nodes (queryable, tagged incomplete)', () => {
    runImport(ctx, loadFixtures());
    const { items } = ctx.nodes.list({ type: 'SIGNAL', limit: 200 });
    expect(items).toHaveLength(5);
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
    expect(imported).toHaveLength(34);
    const runs = items.filter((e) => e.type === 'import_run');
    expect(runs).toHaveLength(1);
    expect(runs[0]!.data).toMatchObject({ totals: { raw_records: 45 } });
  });

  it('per-file reports reconcile too', () => {
    const report = runImport(ctx, loadFixtures());
    for (const file of report.files) {
      expect(file.normalized + file.flagged.length).toBe(file.raw_records);
    }
  });
});
