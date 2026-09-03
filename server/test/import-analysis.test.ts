/**
 * T1.4 end-to-end — import the ~30-job fixture corpus, run the Job Analyst
 * over every imported job, then read the ranked pipeline and assert the whole
 * loop works: DISCOVERED → ANALYZED, scored, banded, ranked.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Hono } from 'hono';
import { openDb } from '../src/db.ts';
import { createApp } from '../src/index.ts';
import { loadFixtures } from './import/helpers.ts';

let app: Hono;

beforeEach(() => {
  ({ app } = createApp(openDb({ path: ':memory:' })));
});

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

async function importCorpus(): Promise<Record<string, unknown>> {
  const res = await app.request('/api/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ files: loadFixtures() }),
  });
  expect(res.status).toBe(201);
  return json(res);
}

async function runJobAnalyst(): Promise<Record<string, unknown>> {
  const agents = await json(await app.request('/api/agents'));
  const analyst = (agents['items'] as Array<{ id: string; data: { name: string } }>).find(
    (a) => a.data.name === 'Job Analyst',
  )!;
  const res = await app.request(`/api/agents/${analyst.id}/run`, { method: 'POST' });
  expect(res.status).toBe(200);
  return json(res);
}

describe('T1.4 — import → analyze → ranked pipeline (end-to-end)', () => {
  it('imports the corpus, analyzes every job, and ranks them score DESC', async () => {
    const report = await importCorpus();
    expect((report['created'] as Record<string, number>)['opportunities']).toBe(34);

    // Seed the profile (needed for matches edges + salary/location scoring).
    await app.request('/api/seed', { method: 'POST' });

    const run = await runJobAnalyst();
    const runReport = run['report'] as { analyzed: number; bands: Record<string, number>; top_5: unknown[] };
    expect(runReport.analyzed).toBe(34);

    // Every opportunity is now ANALYZED with a score + band + next_action.
    const ranking = await json(await app.request('/api/pipeline/ranking'));
    expect(ranking['total']).toBe(34);
    const items = ranking['items'] as Array<{
      id: string;
      role: string;
      company: string;
      score: number;
      band: string;
      status: string;
      next_action_due: string | null;
    }>;
    for (const item of items) {
      expect(item.status).toBe('ANALYZED');
      expect(typeof item.score).toBe('number');
      expect(['PRIORITY', 'APPLY', 'REVIEW', 'ARCHIVE']).toContain(item.band);
      expect(item.next_action_due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // Ranked score DESC.
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1]!.score).toBeGreaterThanOrEqual(items[i]!.score);
    }
    // Band counts in the run report reconcile with the ranking.
    const bandCounts = items.reduce<Record<string, number>>((acc, i) => {
      acc[i.band] = (acc[i.band] ?? 0) + 1;
      return acc;
    }, {});
    for (const band of ['PRIORITY', 'APPLY', 'REVIEW', 'ARCHIVE']) {
      expect(runReport.bands[band] ?? 0).toBe(bandCounts[band] ?? 0);
    }
    // The corpus contains strong Cyberjaya AI-culture roles — at least one must
    // surface as PRIORITY/APPLY, and the top of the ranking beats the bottom.
    expect((bandCounts['PRIORITY'] ?? 0) + (bandCounts['APPLY'] ?? 0)).toBeGreaterThan(0);
    expect(items[0]!.score).toBeGreaterThan(items[items.length - 1]!.score);
  });

  it('Next Best Action surfaces the top-ranked job after analysis', async () => {
    await importCorpus();
    await app.request('/api/seed', { method: 'POST' });
    await runJobAnalyst();

    const nba = await json(await app.request('/api/next-best-action'));
    const opp = nba['opportunity'] as Record<string, unknown> | null;
    expect(opp).not.toBeNull();
    expect(['PRIORITY', 'APPLY']).toContain(opp!['band']);
    expect(['ANALYZED', 'QUALIFIED', 'READY_TO_APPLY']).toContain(opp!['status']);
    // The NBA is the top of the ranking.
    const ranking = await json(await app.request('/api/pipeline/ranking'));
    const top = (ranking['items'] as Array<{ id: string; band: string }>).find((i) =>
      ['PRIORITY', 'APPLY'].includes(i.band),
    )!;
    expect(opp!['id']).toBe(top.id);
  });
});
