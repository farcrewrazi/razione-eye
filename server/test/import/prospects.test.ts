/**
 * EYE-5 prospect import tests — 30 pitch prospects as COMPANY + business
 * OPPORTUNITY (WEBSITE/CONSULTANCY, PROBLEM_IDENTIFIED) with
 * `offered_by → RaziSurf`, idempotent re-runs, no JOB interference, and the
 * /api/opportunities?type= contract the Business Eye consumes.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Pool } from 'pg';
import type { Hono } from 'hono';
import { createApp } from '../../src/index.ts';
import { makeContext, type AppContext } from '../../src/context.ts';
import { runImport } from '../../src/import/import-pipeline.ts';
import {
  loadProspectsFromContents,
  runProspectImport,
  OPPORTUNITY_TYPE_BY_COMPANY,
} from '../../src/import/prospects.ts';
import { openTestDb, resetTestDb, closeTestDb } from '../helpers.ts';
import { loadFixtures, FIXTURES_DIR } from './helpers.ts';

const here = dirname(fileURLToPath(import.meta.url));
const prospects = loadProspectsFromContents(
  readFileSync(resolve(FIXTURES_DIR, 'prospects-final-30.json'), 'utf8'),
  readFileSync(resolve(FIXTURES_DIR, 'prospects-final-30-agentic.json'), 'utf8'),
);

let pool: Pool;
let ctx: AppContext;
let app: Hono;

beforeAll(async () => {
  pool = await openTestDb();
  ({ app } = createApp(pool));
});

beforeEach(async () => {
  await resetTestDb(pool);
  ctx = makeContext(pool);
});

afterAll(async () => {
  await closeTestDb(pool);
});

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe('prospect import (EYE-5)', () => {
  it('imports 30 prospects: 31 companies (incl. RaziSurf), 30 business opportunities, reconciles', async () => {
    const report = await runProspectImport(ctx, prospects);
    const accounted = report.created.opportunities + report.totals.duplicates + report.totals.flagged;
    expect(accounted).toBe(report.totals.raw_records);
    expect(report.totals.raw_records).toBe(30);
    expect(report.created.opportunities).toBe(30);
    expect(report.created.companies).toBe(31); // 30 prospects + RaziSurf
    expect(report.created.edges).toBe(61); // 30 belongs_to + 30 offered_by + 1 owns

    expect(await ctx.nodes.countByType('COMPANY')).toBe(31);
    expect(await ctx.nodes.countByType('OPPORTUNITY')).toBe(30);
  });

  it('splits 18 WEBSITE / 12 CONSULTANCY exactly as classified', async () => {
    await runProspectImport(ctx, prospects);
    const types = Object.values(OPPORTUNITY_TYPE_BY_COMPANY);
    expect(types.filter((t) => t === 'WEBSITE')).toHaveLength(18);
    expect(types.filter((t) => t === 'CONSULTANCY')).toHaveLength(12);

    for (const prospect of prospects) {
      const key = `${prospect.name} — ${
        OPPORTUNITY_TYPE_BY_COMPANY[prospect.name] === 'WEBSITE' ? 'Website' : 'Consultancy'
      } opportunity`;
      const { items } = await ctx.nodes.list({ type: 'OPPORTUNITY', q: prospect.name, limit: 200 });
      const opp = items.find((n) => n.name === key);
      expect(opp, key).toBeDefined();
      expect(opp!.opportunity_type).toBe(OPPORTUNITY_TYPE_BY_COMPANY[prospect.name]);
    }
  });

  it('each opportunity: PROBLEM_IDENTIFIED, scored, full data payload, linked to its company', async () => {
    await runProspectImport(ctx, prospects);
    const { items } = await ctx.nodes.list({ type: 'OPPORTUNITY', limit: 200 });
    expect(items).toHaveLength(30);

    const companies = new Map((await ctx.nodes.list({ type: 'COMPANY', limit: 200 })).items.map((c) => [c.id, c]));
    for (const opp of items) {
      expect(opp.status).toBe('PROBLEM_IDENTIFIED');
      expect(opp.source).toBe('import');
      expect(opp.tags).toEqual(expect.arrayContaining(['imported', 'prospect']));
      expect(typeof opp.score).toBe('number');

      const data = opp.data;
      expect(typeof data['company']).toBe('string');
      expect(typeof data['company_id']).toBe('string');
      expect(data['sub_scores']).toMatchObject({
        problem_severity: expect.any(Number),
        budget_hint: expect.any(Number),
        reachability: expect.any(Number),
        fit: expect.any(Number),
      });
      expect(['PRIORITY', 'STRONG', 'REVIEW', 'ARCHIVE']).toContain(data['band']);
      expect(typeof data['segment']).toBe('string');
      expect(typeof data['agentic_fit']).toBe('number');
      expect(typeof data['suggested_agentic_offer']).toBe('string');
      expect(typeof data['source_url']).toBe('string');
      expect(typeof data['fit_reason']).toBe('string');
      expect(data['problems_detected']).toEqual([data['fit_reason']]);

      // Company linkage + company payload.
      const belongs = await ctx.edges.outgoing(opp.id, 'belongs_to');
      expect(belongs).toHaveLength(1);
      const company = companies.get(belongs[0]!.to_id);
      expect(company).toBeDefined();
      expect(company!.data['industry']).toBeTruthy();
      expect(company!.data['segment']).toBeTruthy();
      expect(company!.data['location']).toBeTruthy();
      expect(company!.data['entity_type']).toBeTruthy();

      // offered_by → RaziSurf.
      const offeredBy = await ctx.edges.outgoing(opp.id, 'offered_by');
      expect(offeredBy).toHaveLength(1);
      const razisurf = companies.get(offeredBy[0]!.to_id);
      expect(razisurf?.name).toBe('RaziSurf');
    }
  });

  it('campaign band distribution matches the input file', async () => {
    await runProspectImport(ctx, prospects);
    const expected = new Map<string, number>();
    for (const p of prospects) expected.set(p.band, (expected.get(p.band) ?? 0) + 1);

    const { items } = await ctx.nodes.list({ type: 'OPPORTUNITY', limit: 200 });
    const actual = new Map<string, number>();
    for (const opp of items) {
      const band = opp.data['band'] as string;
      actual.set(band, (actual.get(band) ?? 0) + 1);
    }
    expect(Object.fromEntries(actual)).toEqual(Object.fromEntries(expected));
  });

  it('RaziSurf exists, owned by Farcrew Razi', async () => {
    await runProspectImport(ctx, prospects);
    const razisurf = await ctx.nodes.findByTypeAndName('COMPANY', 'RaziSurf');
    expect(razisurf).not.toBeNull();
    const razi = await ctx.nodes.findByTypeAndName('PERSON', 'Farcrew Razi');
    expect(razi).not.toBeNull();
    expect(await ctx.edges.exists(razi!.id, razisurf!.id, 'owns')).toBe(true);
  });

  it('re-run creates nothing new (idempotent), every prospect reported as existing', async () => {
    await runProspectImport(ctx, prospects);
    const before = {
      companies: await ctx.nodes.countByType('COMPANY'),
      opportunities: await ctx.nodes.countByType('OPPORTUNITY'),
      edges: await ctx.edges.count(),
    };

    const second = await runProspectImport(ctx, prospects);
    expect(second.created.opportunities).toBe(0);
    expect(second.created.companies).toBe(0);
    expect(second.totals.duplicates).toBe(30);
    expect(second.files[0]!.duplicates.every((d) => d.reason === 'existing')).toBe(true);

    expect(await ctx.nodes.countByType('COMPANY')).toBe(before.companies);
    expect(await ctx.nodes.countByType('OPPORTUNITY')).toBe(before.opportunities);
    expect(await ctx.edges.count()).toBe(before.edges);
  });

  it('leaves JOB data untouched when both pipelines run', async () => {
    const jobReport = await runImport(ctx, loadFixtures());
    expect(jobReport.created.opportunities).toBe(34);

    await runProspectImport(ctx, prospects);

    const { items } = await ctx.nodes.list({ type: 'OPPORTUNITY', opportunity_type: 'JOB', limit: 200 });
    expect(items).toHaveLength(34);
    for (const job of items) {
      expect(job.status).toBe('DISCOVERED');
      expect(job.opportunity_type).toBe('JOB');
    }
    expect(await ctx.nodes.countByType('OPPORTUNITY')).toBe(64); // 34 JOB + 30 business
  });

  it('GET /api/opportunities?type=CONSULTANCY and ?type=WEBSITE return the prospects (business eye)', async () => {
    await runProspectImport(ctx, prospects);

    const consultancy = await json(await app.request('/api/opportunities?type=CONSULTANCY'));
    expect(consultancy['total']).toBe(12);
    const website = await json(await app.request('/api/opportunities?type=WEBSITE'));
    expect(website['total']).toBe(18);

    const business = await json(await app.request('/api/opportunities?eye=business&limit=200'));
    expect(business['total']).toBe(30);
    const career = await json(await app.request('/api/opportunities?eye=career&limit=200'));
    expect(career['total']).toBe(0); // prospects never leak into the career eye

    // Every item carries the campaign band in data and the computed band on top.
    for (const item of (business['items'] as Record<string, unknown>[]) ?? []) {
      const data = item['data'] as Record<string, unknown>;
      expect(['PRIORITY', 'STRONG', 'REVIEW', 'ARCHIVE']).toContain(data['band']);
      expect(typeof item['band']).toBe('string');
      expect(typeof data['source_url']).toBe('string');
    }
  });

  it('records opportunity_imported + import_run events (report stays schema-valid)', async () => {
    const report = await runProspectImport(ctx, prospects);
    const { items } = await ctx.events.list();
    expect(items.filter((e) => e.type === 'opportunity_imported')).toHaveLength(30);
    const run = items.find((e) => e.type === 'import_run');
    expect(run).toBeDefined();
    expect(run!.data).toMatchObject({
      totals: { raw_records: 30, duplicates: report.totals.duplicates },
      created: { opportunities: report.created.opportunities },
    });

    // The latest import_run must validate against the shared ImportReport
    // schema — GET /api/import/report depends on it.
    const latest = await ctx.events.latestByType('import_run');
    expect(latest?.data).toMatchObject({ ran_at: expect.any(String) });
  });
});
