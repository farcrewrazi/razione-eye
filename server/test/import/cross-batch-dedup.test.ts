/**
 * Cross-batch dedup (T1.2) — re-imports are idempotent: survivors are matched
 * against existing JOB OPPORTUNITY nodes on normalized company+role; matches are
 * skipped (never re-created), merged (missing fields only), and reported as
 * duplicates with reason 'existing'.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { makeContext, type AppContext } from '../../src/context.ts';
import { runImport } from '../../src/import/import-pipeline.ts';
import type { ImportFileInput, ImportReportData } from '../../src/import/types.ts';
import { openTestDb, resetTestDb, closeTestDb } from '../helpers.ts';
import { loadFixtures } from './helpers.ts';

function reconcile(report: ImportReportData): void {
  const accounted = report.created.opportunities + report.totals.duplicates + report.totals.flagged;
  expect(accounted).toBe(report.totals.raw_records);
}

let pool: Pool;
let ctx: AppContext;

beforeAll(async () => {
  pool = await openTestDb();
});

beforeEach(async () => {
  await resetTestDb(pool);
  ctx = makeContext(pool);
});

afterAll(async () => {
  await closeTestDb(pool);
});

describe('cross-batch dedup (T1.2 idempotent re-imports)', () => {
  it('second import of the same fixtures creates 0 opportunities, all records are duplicates (reason existing)', async () => {
    const first = await runImport(ctx, loadFixtures());
    expect(first.created.opportunities).toBe(34);
    reconcile(first);

    const second = await runImport(ctx, loadFixtures());
    expect(second.created.opportunities).toBe(0);
    expect(second.created.companies).toBe(0);
    expect(second.created.edges).toBe(0);
    // Second run: all 40 normalized survivors reconcile as duplicates — 34 match
    // existing nodes (reason 'existing'), 5 repeat as cross-channel links, 1 as
    // the in-batch duplicate.
    expect(second.totals.duplicates).toBe(40);
    const reasons = second.files.flatMap((f) => f.duplicates.map((d) => d.reason ?? 'batch'));
    expect(reasons.filter((r) => r === 'existing')).toHaveLength(34);
    expect(reasons.filter((r) => r === 'linked')).toHaveLength(5);
    expect(reasons.filter((r) => r === 'batch')).toHaveLength(1);
    reconcile(second);

    // Graph unchanged: still exactly 34 opportunities / 34 companies.
    expect(await ctx.nodes.countByType('OPPORTUNITY')).toBe(34);
    expect(await ctx.nodes.countByType('COMPANY')).toBe(34);
  });

  it('appends a provenance note + note_added event to existing opportunities on re-import', async () => {
    await runImport(ctx, loadFixtures());
    await runImport(ctx, loadFixtures());

    const { items } = await ctx.nodes.list({ type: 'OPPORTUNITY', limit: 200 });
    const withNote = items.filter((opp) =>
      opp.notes.some((n) => (typeof n === 'string' ? n : n.text).startsWith('Re-imported duplicate skipped:')),
    );
    expect(withNote).toHaveLength(34);
    const note = withNote[0]!.notes.map((n) => (typeof n === 'string' ? n : n.text)).find((t) => t.startsWith('Re-imported duplicate skipped:'))!;
    expect(note).toMatch(/Re-imported duplicate skipped: ".+ — .+" \(from file .+, format (json|csv|md|chat)\)/);

    const noteEvents = (await ctx.events.list()).items.filter((e) => e.type === 'note_added');
    expect(noteEvents).toHaveLength(34);
  });

  it('merges fields the existing opportunity lacks (salary gained on re-import)', async () => {
    const sparse: ImportFileInput = {
      name: 'sparse.json',
      format: 'json',
      content: JSON.stringify([
        { company: 'MergeCo Sdn Bhd', role: 'Senior Backend Engineer', location: 'Kuala Lumpur' },
      ]),
    };
    const rich: ImportFileInput = {
      name: 'rich.csv',
      format: 'csv',
      content: [
        'Company,Role,Location,Salary,URL,Source',
        '"MergeCo","Backend Engineer","Kuala Lumpur","RM12,000 - RM15,000",https://example.com/jobs/1,LinkedIn',
      ].join('\n'),
    };

    const first = await runImport(ctx, [sparse]);
    expect(first.created.opportunities).toBe(1);
    const before = (await ctx.nodes.list({ type: 'OPPORTUNITY', q: 'MergeCo', limit: 10 })).items[0]!;
    expect(before.data['salary_min']).toBeUndefined();
    expect(before.data['salary_max']).toBeUndefined();
    expect(before.data['url']).toBeUndefined();

    const second = await runImport(ctx, [rich]);
    expect(second.created.opportunities).toBe(0);
    expect(second.totals.duplicates).toBe(1);
    expect(second.files[0]!.duplicates[0]).toMatchObject({ reason: 'existing', file: 'rich.csv' });

    const after = (await ctx.nodes.list({ type: 'OPPORTUNITY', q: 'MergeCo', limit: 10 })).items;
    expect(after).toHaveLength(1); // seniority words + company suffix ignored → same node
    expect(after[0]!.id).toBe(before.id);
    expect(after[0]!.data['salary_min']).toBe(12000);
    expect(after[0]!.data['salary_max']).toBe(15000);
    expect(after[0]!.data['url']).toBe('https://example.com/jobs/1');
    expect(after[0]!.updated_at > before.updated_at || after[0]!.updated_at >= before.updated_at).toBe(true);

    const mergeNote = after[0]!.notes
      .map((n) => (typeof n === 'string' ? n : n.text))
      .find((t) => t.startsWith('Re-imported duplicate skipped:'))!;
    expect(mergeNote).toContain('(from file rich.csv, format csv)');
    expect(mergeNote).toContain('merged fields:');
    expect(mergeNote).toContain('salary_min');

    const noteEvent = (await ctx.events.list(after[0]!.id)).items.find((e) => e.type === 'note_added');
    expect(noteEvent?.data).toMatchObject({ file: 'rich.csv' });
    expect((noteEvent?.data?.['merged_fields'] as string[]).sort()).toEqual(['salary', 'salary_max', 'salary_min', 'url']);
  });

  it('never overwrites fields the existing opportunity already has', async () => {
    const first: ImportFileInput = {
      name: 'first.json',
      format: 'json',
      content: JSON.stringify([
        { company: 'KeepCo', role: 'AI Engineer', url: 'https://original.example/job', salary_min: 9000, salary_max: 11000 },
      ]),
    };
    const secondFile: ImportFileInput = {
      name: 'second.json',
      format: 'json',
      content: JSON.stringify([
        { company: 'KeepCo', role: 'AI Engineer', url: 'https://other.example/job', salary_min: 1, salary_max: 2, contact: { recruiter: 'Aina' } },
      ]),
    };
    await runImport(ctx, [first]);
    await runImport(ctx, [secondFile]);

    const opp = (await ctx.nodes.list({ type: 'OPPORTUNITY', q: 'KeepCo', limit: 10 })).items[0]!;
    expect(opp.data['url']).toBe('https://original.example/job'); // untouched
    expect(opp.data['salary_min']).toBe(9000); // untouched
    expect(opp.data['contact']).toEqual({ recruiter: 'Aina' }); // merged (was missing)
  });

  it('reconciliation invariant holds on both runs', async () => {
    const first = await runImport(ctx, loadFixtures());
    reconcile(first);
    const second = await runImport(ctx, loadFixtures());
    reconcile(second);
    // Per-file reconciliation holds on the re-run as well.
    for (const file of second.files) {
      expect(file.normalized + file.flagged.length).toBe(file.raw_records);
    }
  });
});
