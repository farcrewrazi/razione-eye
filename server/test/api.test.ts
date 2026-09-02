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

describe('API smoke', () => {
  it('GET /api/health', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body['ok']).toBe(true);
    expect(body['db']).toBe('connected');
  });

  it('POST /api/seed then GET /api/profile, /api/agents', async () => {
    const seedRes = await app.request('/api/seed', { method: 'POST' });
    expect(seedRes.status).toBe(200);

    const profile = await json(await app.request('/api/profile'));
    expect((profile['data'] as Record<string, unknown>)['full_name']).toBe('Farcrew Razi');

    const agents = await json(await app.request('/api/agents'));
    expect(agents['total']).toBe(6);

    // idempotent via API too
    const seed2 = await json(await app.request('/api/seed', { method: 'POST' }));
    expect((seed2['created'] as Record<string, number>)['nodes']).toBe(0);
  });

  it('PUT /api/profile validates and persists', async () => {
    await app.request('/api/seed', { method: 'POST' });
    const res = await app.request('/api/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ seniority: 'Lead', salary_min: 14000 }),
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body['data'] as Record<string, unknown>)['seniority']).toBe('Lead');
    expect((body['data'] as Record<string, unknown>)['salary_min']).toBe(14000);
    // untouched fields survive
    expect((body['data'] as Record<string, unknown>)['location']).toBe('Cyberjaya');

    const bad = await app.request('/api/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ salary_min: 'lots' }),
    });
    expect(bad.status).toBe(422);
    expect(((await json(bad))['error'] as Record<string, unknown>)['code']).toBe('VALIDATION');
  });

  it('POST /api/agents/:id/run records a stub run', async () => {
    const seed = await json(await app.request('/api/seed', { method: 'POST' }));
    const agentId = (seed['agent_ids'] as string[])[0]!;
    const res = await app.request(`/api/agents/${agentId}/run`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await json(res);
    const data = body['data'] as Record<string, unknown>;
    expect(data['last_status']).toBe('empty');
    expect(data['last_run']).toBeTruthy();
    expect((data['runs'] as unknown[]).length).toBe(1);
  });

  it('opportunity CRUD + pipeline status validation + band filter', async () => {
    const create = await app.request('/api/opportunities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        opportunity_type: 'JOB',
        score: 91,
        data: { role: 'Senior Software Engineer', location: 'Cyberjaya', matching: { role_match: 92, company_match: 86, ai_culture: 95, location: 100, salary: 75, career_upside: 90 } },
      }),
    });
    expect(create.status).toBe(201);
    const opp = await json(create);
    expect(opp['status']).toBe('DISCOVERED');
    expect(opp['band']).toBe('PRIORITY');
    const id = opp['id'] as string;

    // invalid status for JOB pipeline rejected
    const badStatus = await app.request(`/api/opportunities/${id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'WON' }),
    });
    expect(badStatus.status).toBe(422);

    const okStatus = await app.request(`/api/opportunities/${id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'QUALIFIED' }),
    });
    expect(okStatus.status).toBe(200);
    expect((await json(okStatus))['status']).toBe('QUALIFIED');

    // band filter
    const priority = await json(await app.request('/api/opportunities?band=PRIORITY'));
    expect((priority['items'] as unknown[]).length).toBe(1);
    const archive = await json(await app.request('/api/opportunities?band=ARCHIVE'));
    expect((archive['items'] as unknown[]).length).toBe(0);

    // detail includes graph fields
    const detail = await json(await app.request(`/api/opportunities/${id}`));
    expect(Array.isArray(detail['edges'])).toBe(true);
    expect(Array.isArray(detail['neighbors'])).toBe(true);
  });

  it('JOB matching block enforces the six sub-scores (0-100)', async () => {
    const res = await app.request('/api/opportunities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        opportunity_type: 'JOB',
        data: { role: 'X', matching: { role_match: 200 } },
      }),
    });
    expect(res.status).toBe(422);

    const unknownKey = await app.request('/api/opportunities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        opportunity_type: 'JOB',
        data: { role: 'X', matching: { seniority: 90 } },
      }),
    });
    expect(unknownKey.status).toBe(422);
  });

  it('signals: create/list/filter/patch disposition', async () => {
    const create = await app.request('/api/signals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'linkedin',
        data: { signal_type: 'JOB_POSTING', content: 'hiring SSE Cyberjaya', observed_at: '2026-09-02T00:00:00.000Z' },
      }),
    });
    expect(create.status).toBe(201);
    const sig = await json(create);
    expect(sig['status']).toBe('NEW');

    const list = await json(await app.request('/api/signals?disposition=NEW&signal_type=JOB_POSTING'));
    expect((list['items'] as unknown[]).length).toBe(1);

    const patched = await app.request(`/api/signals/${sig['id'] as string}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'DISMISSED' }),
    });
    expect(patched.status).toBe(200);
    expect((await json(patched))['status']).toBe('DISMISSED');

    const empty = await json(await app.request('/api/signals?disposition=NEW'));
    expect((empty['items'] as unknown[]).length).toBe(0);
  });

  it('tasks: create (+ serves edge), list overdue, patch', async () => {
    const opp = await json(
      await app.request('/api/opportunities', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ opportunity_type: 'JOB', data: { role: 'SSE' } }),
      }),
    );
    const create = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        data: { title: 'Apply to ABC', priority: 'HIGH', opportunity_id: opp['id'] },
        due_at: '2020-01-01T00:00:00.000Z',
      }),
    });
    expect(create.status).toBe(201);
    const task = await json(create);

    const overdue = await json(await app.request('/api/tasks?overdue=true'));
    expect((overdue['items'] as unknown[]).length).toBe(1);

    // serves edge auto-created
    const graph = await json(await app.request(`/api/graph/neighbors/${task['id'] as string}`));
    expect(((graph['edges'] as Record<string, unknown>[])[0])!['edge_type']).toBe('serves');
    expect(((graph['neighbors'] as Record<string, unknown>[])[0])!['id']).toBe(opp['id']);

    const done = await app.request(`/api/tasks/${task['id'] as string}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'DONE' }),
    });
    expect(done.status).toBe(200);
  });

  it('companies list + detail with opportunities', async () => {
    await app.request('/api/seed', { method: 'POST' });
    const list = await json(await app.request('/api/companies'));
    expect(list['total']).toBe(1);
    const razisurf = (list['items'] as Record<string, unknown>[])[0]!;
    const detail = await json(await app.request(`/api/companies/${razisurf['id'] as string}`));
    expect(detail['name']).toBe('RaziSurf');
    expect(Array.isArray(detail['opportunities'])).toBe(true);
  });

  it('graph neighbors resolves edges both directions', async () => {
    await app.request('/api/seed', { method: 'POST' });
    const profile = await json(await app.request('/api/profile'));
    const graph = await json(await app.request(`/api/graph/neighbors/${profile['id'] as string}?depth=1`));
    const edgeTypes = (graph['edges'] as Record<string, unknown>[]).map((e) => e['edge_type']);
    expect(edgeTypes).toContain('owns');
    expect(edgeTypes).toContain('knows');
    expect((graph['neighbors'] as unknown[]).length).toBe(8); // 6 skills + location + RaziSurf
  });

  it('POST /api/backup returns a snapshot path', async () => {
    const res = await app.request('/api/backup', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body['filename']).toMatch(/\.db$/);
  });

  it('404 + error envelope shape', async () => {
    const res = await app.request('/api/opportunities/01J0000000000000000000000X');
    expect(res.status).toBe(404);
    const body = await json(res);
    expect((body['error'] as Record<string, unknown>)['code']).toBe('NOT_FOUND');
  });
});
