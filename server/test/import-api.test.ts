import { describe, it, expect, beforeEach } from 'vitest';
import { openDb } from '../src/db.ts';
import { createApp } from '../src/index.ts';
import type { Hono } from 'hono';

let app: Hono;

beforeEach(() => {
  ({ app } = createApp(openDb({ path: ':memory:' })));
});

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const SMALL_JSON = JSON.stringify({
  jobs: [
    {
      company: 'TestCo Sdn Bhd',
      role: 'Senior Backend Engineer',
      location: 'Cyberjaya',
      salary: 'RM12k-RM16k',
      source: 'LinkedIn',
      stack: 'Node.js, TypeScript',
    },
    { company: 'OtherCo', role: 'Frontend Engineer', location: 'KL' },
    { company: '', role: 'Mystery Role' },
  ],
});

describe('POST /api/import', () => {
  it('imports inline file content and returns a reconciled report', async () => {
    const res = await app.request('/api/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: [{ name: 'inline.json', format: 'json', content: SMALL_JSON }] }),
    });
    expect(res.status).toBe(201);
    const report = await json(res);

    const totals = report['totals'] as Record<string, number>;
    expect(totals['raw_records']).toBe(3);
    expect(totals['normalized']).toBe(2);
    expect(totals['flagged']).toBe(1);
    const created = report['created'] as Record<string, number>;
    expect(created['opportunities']).toBe(2);
    expect(created['companies']).toBe(2);
    expect(created['edges']).toBe(4);
    // Reconciled.
    expect(created['opportunities']! + totals['duplicates']! + totals['flagged']!).toBe(totals['raw_records']);

    // Opportunities are queryable after import.
    const opps = await json(await app.request('/api/opportunities?limit=200'));
    expect(opps['total']).toBe(2);
    const items = opps['items'] as Record<string, unknown>[];
    const testco = items.find((o) => (o['name'] as string).includes('TestCo'))!;
    expect(testco['status']).toBe('DISCOVERED');
    expect(testco['source']).toBe('import');
    expect(testco['tags']).toContain('imported');
    const data = testco['data'] as Record<string, unknown>;
    expect(data['salary_min']).toBe(12000);
    expect(data['salary_max']).toBe(16000);
    expect(data['stack']).toEqual(['Node.js', 'TypeScript']);

    // Flagged record is a queryable SIGNAL.
    const signals = await json(await app.request('/api/signals?limit=200'));
    expect(signals['total']).toBe(1);
    const sig = (signals['items'] as Record<string, unknown>[])[0]!;
    expect(sig['tags']).toEqual(expect.arrayContaining(['import', 'flagged', 'incomplete']));
  });

  it('GET /api/import/report returns the most recent run', async () => {
    const before = await app.request('/api/import/report');
    expect(before.status).toBe(404);

    await app.request('/api/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: [{ name: 'inline.json', format: 'json', content: SMALL_JSON }] }),
    });
    const res = await app.request('/api/import/report');
    expect(res.status).toBe(200);
    const report = await json(res);
    expect((report['totals'] as Record<string, number>)['raw_records']).toBe(3);
    expect(typeof report['ran_at']).toBe('string');
  });

  it('imported opportunity exposes opportunity_imported events', async () => {
    await app.request('/api/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: [{ name: 'inline.json', format: 'json', content: SMALL_JSON }] }),
    });
    const opps = await json(await app.request('/api/opportunities?limit=200'));
    const id = (opps['items'] as Record<string, unknown>[])[0]!['id'] as string;
    const events = await json(await app.request(`/api/opportunities/${id}/events`));
    expect(events['total']).toBe(1);
    expect((events['items'] as Record<string, unknown>[])[0]!['type']).toBe('opportunity_imported');
  });

  it('validates the request body', async () => {
    const res = await app.request('/api/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: [{ name: 'x', format: 'yaml', content: 'a: 1' }] }),
    });
    expect(res.status).toBe(422);
    const body = await json(res);
    expect((body['error'] as Record<string, unknown>)['code']).toBe('VALIDATION');
  });
});

describe('GET /api/opportunities?board=true', () => {
  it('returns grouped-by-status columns in JOB pipeline order', async () => {
    await app.request('/api/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: [{ name: 'inline.json', format: 'json', content: SMALL_JSON }] }),
    });
    const res = await app.request('/api/opportunities?board=true');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body['total']).toBe(2);
    const columns = body['columns'] as Array<{ status: string; items: unknown[] }>;
    expect(columns[0]!['status']).toBe('DISCOVERED');
    expect(columns.map((c) => c.status)).toContain('HIRED');
    expect(columns.map((c) => c.status)).toContain('EXPIRED');
    const discovered = columns.find((c) => c.status === 'DISCOVERED')!;
    expect(discovered.items).toHaveLength(2);
    for (const col of columns.filter((c) => c.status !== 'DISCOVERED')) {
      expect(col.items).toHaveLength(0);
    }
  });
});
