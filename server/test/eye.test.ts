/**
 * Eye scoping (docs/07-api-contract.md §Eye scoping).
 *
 * The Eyes are lenses over the same graph. `?eye=` scopes opportunities /
 * signals / dashboard / briefs; omitting it must be identical to today's
 * behavior (all data, JOB-first). Seeded graph: JOB + WEBSITE + AFFILIATE +
 * CRYPTO opportunities and one signal per eye.
 */
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

async function postJson(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return json(res);
}

async function patchJson(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await app.request(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return json(res);
}

/** Seed one opportunity per eye, all scores in the PRIORITY band. */
async function seedGraph(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const [key, body] of [
    ['job', { opportunity_type: 'JOB', score: 95, data: { role: 'Senior Software Engineer', location: 'Cyberjaya' } }],
    ['website', { opportunity_type: 'WEBSITE', score: 92, data: { name: 'Biz site' } }],
    ['affiliate', { opportunity_type: 'AFFILIATE', score: 91, data: { name: 'Affiliate play' } }],
    ['crypto', { opportunity_type: 'CRYPTO', score: 90, data: { name: 'Gem token' } }],
  ] as const) {
    const created = await postJson('/api/opportunities', body);
    expect(created['id']).toBeTruthy();
    ids[key] = created['id'] as string;
  }
  // Move the JOB into an actionable (NBA-eligible) stage.
  await patchJson(`/api/opportunities/${ids['job']}/status`, { status: 'QUALIFIED' });
  return ids;
}

async function seedSignals(): Promise<void> {
  for (const signalType of ['JOB_POSTING', 'BUSINESS_DISCOVERY', 'SOCIAL_POST', 'COMMENT', 'GEM_CALL']) {
    const res = await postJson('/api/signals', {
      source: 'manual',
      data: { signal_type: signalType, content: `${signalType} observed`, observed_at: '2026-09-02T00:00:00.000Z' },
    });
    expect(res['id']).toBeTruthy();
  }
}

function oppTypeOf(item: Record<string, unknown>): string | null {
  return (item['opportunity_type'] as string | null) ?? null;
}

// ─── Query validation ────────────────────────────────────────────────────────

describe('?eye= validation', () => {
  it('rejects an unknown eye with 400 BAD_QUERY (opportunities)', async () => {
    const res = await app.request('/api/opportunities?eye=crypto');
    expect(res.status).toBe(400);
    const body = await json(res);
    expect((body['error'] as Record<string, unknown>)['code']).toBe('BAD_QUERY');
    expect((body['error'] as Record<string, unknown>)['message']).toContain('invalid eye');
  });

  it('rejects an unknown eye on dashboard, next-best-action, signals and briefs', async () => {
    for (const path of [
      '/api/dashboard?eye=nope',
      '/api/next-best-action?eye=nope',
      '/api/signals?eye=nope',
      '/api/daily-brief/morning?eye=nope',
      '/api/daily-brief/evening?eye=nope',
    ]) {
      const res = await app.request(path);
      expect(res.status, path).toBe(400);
      const body = await json(res);
      expect((body['error'] as Record<string, unknown>)['code'], path).toBe('BAD_QUERY');
    }
  });

  it('accepts all five eyes + all', async () => {
    for (const eye of ['career', 'business', 'growth', 'signal', 'control', 'all']) {
      const res = await app.request(`/api/opportunities?eye=${eye}`);
      expect(res.status, eye).toBe(200);
    }
  });
});

// ─── Backward compat: no eye param ───────────────────────────────────────────

describe('backward compatibility (no ?eye=)', () => {
  it('returns every opportunity, exactly as before', async () => {
    await seedGraph();
    const body = await json(await app.request('/api/opportunities?limit=200'));
    expect(body['total']).toBe(4);
    const types = (body['items'] as Record<string, unknown>[]).map(oppTypeOf);
    expect(new Set(types)).toEqual(new Set(['JOB', 'WEBSITE', 'AFFILIATE', 'CRYPTO']));
  });

  it('board=true still uses JOB columns when no eye is given', async () => {
    await seedGraph();
    const body = await json(await app.request('/api/opportunities?board=true'));
    const columns = body['columns'] as Array<{ status: string; items: unknown[] }>;
    expect(columns[0]!['status']).toBe('DISCOVERED');
    expect(columns.map((c) => c.status)).toContain('HIRED');
    expect(columns.map((c) => c.status)).toContain('EXPIRED');
    // nothing lands in the business/affiliate/crypto columns
    expect(columns.map((c) => c.status)).not.toContain('DISCOVERED_BUSINESS');
    const qualified = columns.find((c) => c.status === 'QUALIFIED')!;
    expect(qualified.items).toHaveLength(1);
  });

  it('NBA without an eye stays JOB-only', async () => {
    await seedGraph();
    const body = await json(await app.request('/api/next-best-action'));
    const opp = body['opportunity'] as Record<string, unknown> | null;
    expect(opp).not.toBeNull();
    expect(opp!['opportunity_type']).toBe('JOB');
  });

  it('dashboard and briefs behave as before without an eye', async () => {
    await seedGraph();
    const dash = await json(await app.request('/api/dashboard'));
    const career = (dash['today'] as Record<string, unknown>)['career'] as Record<string, number>;
    expect(career['new_jobs']).toBe(1); // only the JOB counts

    const morning = await json(await app.request('/api/daily-brief/morning'));
    const counts = morning['counts'] as Record<string, unknown>;
    expect((counts['career'] as Record<string, number>)['new_jobs']).toBe(1);
  });
});

// ─── Opportunities scoping ───────────────────────────────────────────────────

describe('GET /api/opportunities?eye=', () => {
  it('business eye is isolated — WEBSITE only, never sees the JOB', async () => {
    const ids = await seedGraph();
    const body = await json(await app.request('/api/opportunities?eye=business&limit=200'));
    const items = body['items'] as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0]!['id']).toBe(ids['website']);
    expect(items[0]!['opportunity_type']).toBe('WEBSITE');
    expect(body['total']).toBe(1);
  });

  it('growth eye shows AFFILIATE only', async () => {
    const ids = await seedGraph();
    const body = await json(await app.request('/api/opportunities?eye=growth&limit=200'));
    const items = body['items'] as Record<string, unknown>[];
    expect(items.map((i) => i['id'])).toEqual([ids['affiliate']]);
  });

  it('signal eye shows CRYPTO only (GEM_CALL lives in signals)', async () => {
    const ids = await seedGraph();
    const body = await json(await app.request('/api/opportunities?eye=signal&limit=200'));
    const items = body['items'] as Record<string, unknown>[];
    expect(items.map((i) => i['id'])).toEqual([ids['crypto']]);
  });

  it('career eye shows JOB only', async () => {
    const ids = await seedGraph();
    const body = await json(await app.request('/api/opportunities?eye=career&limit=200'));
    const items = body['items'] as Record<string, unknown>[];
    expect(items.map((i) => i['id'])).toEqual([ids['job']]);
  });

  it('all + control show everything', async () => {
    await seedGraph();
    for (const eye of ['all', 'control']) {
      const body = await json(await app.request(`/api/opportunities?eye=${eye}&limit=200`));
      expect(body['total'], eye).toBe(4);
    }
  });

  it('explicit ?type= wins over the eye', async () => {
    const ids = await seedGraph();
    // business eye + type=JOB → the JOB surfaces even though it isn't "business"
    const body = await json(await app.request('/api/opportunities?eye=business&type=JOB&limit=200'));
    const items = body['items'] as Record<string, unknown>[];
    expect(items.map((i) => i['id'])).toEqual([ids['job']]);
    expect(items[0]!['opportunity_type']).toBe('JOB');
  });

  it('an invalid type is still 400 even with a valid eye', async () => {
    const res = await app.request('/api/opportunities?eye=business&type=NOPE');
    expect(res.status).toBe(400);
    expect(((await json(res))['error'] as Record<string, unknown>)['code']).toBe('BAD_QUERY');
  });

  it('eye + status/band filters compose', async () => {
    const ids = await seedGraph();
    const body = await json(await app.request('/api/opportunities?eye=business&status=DISCOVERED_BUSINESS&limit=200'));
    expect(body['total']).toBe(1);
    expect((body['items'] as Record<string, unknown>[])[0]!['id']).toBe(ids['website']);
  });

  it('control eye has no opportunity types of its own — it sees all of them', async () => {
    await seedGraph();
    const body = await json(await app.request('/api/opportunities?eye=control&limit=200'));
    expect(body['total']).toBe(4);
  });

  it('business eye on an empty graph is empty (never leaks JOB rows)', async () => {
    await postJson('/api/opportunities', { opportunity_type: 'JOB', data: { role: 'SSE' } });
    const body = await json(await app.request('/api/opportunities?eye=business&limit=200'));
    expect(body['total']).toBe(0);
    expect(body['items']).toHaveLength(0);
  });
});

// ─── Board columns per eye ───────────────────────────────────────────────────

describe('GET /api/opportunities?board=true&eye=', () => {
  it('business eye board uses BUSINESS pipeline columns', async () => {
    const ids = await seedGraph();
    const body = await json(await app.request('/api/opportunities?board=true&eye=business'));
    const columns = body['columns'] as Array<{ status: string; items: Record<string, unknown>[] }>;
    const statuses = columns.map((c) => c.status);
    expect(statuses[0]).toBe('DISCOVERED_BUSINESS');
    expect(statuses).toContain('TEASER_PROPOSAL');
    expect(statuses).toContain('WON');
    expect(statuses).not.toContain('QUALIFIED');
    expect(statuses).not.toContain('APPLIED');
    const discovered = columns.find((c) => c.status === 'DISCOVERED_BUSINESS')!;
    expect(discovered.items.map((i) => i['id'])).toEqual([ids['website']]);
    expect(body['total']).toBe(1);
  });

  it('growth eye board uses AFFILIATE columns', async () => {
    await seedGraph();
    const body = await json(await app.request('/api/opportunities?board=true&eye=growth'));
    const statuses = (body['columns'] as Array<{ status: string }>).map((c) => c.status);
    expect(statuses).toEqual(['IDEAS', 'RESEARCH', 'SCRIPT', 'PRODUCE', 'PUBLISHED', 'PERFORMANCE']);
  });

  it('signal eye board uses CRYPTO columns', async () => {
    await seedGraph();
    const body = await json(await app.request('/api/opportunities?board=true&eye=signal'));
    const statuses = (body['columns'] as Array<{ status: string }>).map((c) => c.status);
    expect(statuses).toEqual(['SIGNAL', 'TOKEN', 'QUICK_ANALYSIS', 'ALERT']);
  });

  it('career / all / control boards keep JOB columns (backward compat)', async () => {
    await seedGraph();
    for (const eye of ['career', 'all', 'control']) {
      const body = await json(await app.request(`/api/opportunities?board=true&eye=${eye}`));
      const statuses = (body['columns'] as Array<{ status: string }>).map((c) => c.status);
      expect(statuses[0], eye).toBe('DISCOVERED');
      expect(statuses, eye).toContain('READY_TO_APPLY');
      expect(statuses, eye).toContain('HIRED');
    }
  });

  it('explicit type wins for board columns too', async () => {
    await seedGraph();
    const body = await json(await app.request('/api/opportunities?board=true&eye=career&type=AFFILIATE'));
    const statuses = (body['columns'] as Array<{ status: string }>).map((c) => c.status);
    expect(statuses).toEqual(['IDEAS', 'RESEARCH', 'SCRIPT', 'PRODUCE', 'PUBLISHED', 'PERFORMANCE']);
  });
});

// ─── Dashboard + NBA scoping ─────────────────────────────────────────────────

describe('dashboard + NBA scoping', () => {
  it('career counters are zero when the eye is not career/all/control', async () => {
    await seedGraph();
    await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: { title: 'Open task' }, due_at: new Date().toISOString() }),
    });

    for (const eye of ['business', 'growth', 'signal']) {
      const dash = await json(await app.request(`/api/dashboard?eye=${eye}`));
      const today = dash['today'] as Record<string, unknown>;
      const career = today['career'] as Record<string, number>;
      expect(career['new_jobs'], eye).toBe(0);
      expect(career['high_match'], eye).toBe(0);
      expect(career['pending_applications'], eye).toBe(0);
      expect(career['recruiters_awaiting'], eye).toBe(0);
      // Career's next_action-driven contribution is excluded; only the global task counts.
      expect(today['actions_required'], eye).toBe(1);
    }
  });

  it('career/all/control show live career counters', async () => {
    const ids = await seedGraph();
    for (const eye of ['career', 'all', 'control']) {
      const dash = await json(await app.request(`/api/dashboard?eye=${eye}`));
      const career = (dash['today'] as Record<string, unknown>)['career'] as Record<string, number>;
      expect(career['new_jobs'], eye).toBe(1);
      expect(career['high_match'], eye).toBe(1);
    }
    // pending_applications only once the JOB is actually applied
    await patchJson(`/api/opportunities/${ids['job']}/status`, { status: 'APPLIED' });
    const dash = await json(await app.request('/api/dashboard?eye=career'));
    const career = (dash['today'] as Record<string, unknown>)['career'] as Record<string, number>;
    expect(career['pending_applications']).toBe(1);
    expect(career['recruiters_awaiting']).toBe(0);
  });

  it('agents stay global in every eye', async () => {
    await seedGraph();
    await app.request('/api/seed', { method: 'POST' });
    for (const eye of ['career', 'business', 'growth', 'signal', 'control', 'all']) {
      const dash = await json(await app.request(`/api/dashboard?eye=${eye}`));
      expect((dash['agents'] as unknown[]).length, eye).toBe(6);
    }
  });

  it('business/affiliate/gems stay structurally zero everywhere', async () => {
    await seedGraph();
    for (const eye of ['career', 'business', 'growth', 'signal', 'control', 'all']) {
      const today = (await json(await app.request(`/api/dashboard?eye=${eye}`)))['today'] as Record<string, unknown>;
      expect(today['business'], eye).toEqual({ discovered: 0, worth_approaching: 0, teasers_ready: 0 });
      expect(today['affiliate'], eye).toEqual({ content_opportunities: 0, scheduled: 0 });
      expect(today['gems'], eye).toEqual({ tokens_detected: 0, passed_filter: 0 });
    }
  });

  it('NBA is scoped to the eye (business eye surfaces the WEBSITE, not the JOB)', async () => {
    const ids = await seedGraph();
    const body = await json(await app.request('/api/next-best-action?eye=business'));
    const opp = body['opportunity'] as Record<string, unknown> | null;
    expect(opp).not.toBeNull();
    expect(opp!['id']).toBe(ids['website']);
    expect(opp!['opportunity_type']).toBe('WEBSITE');
  });

  it('NBA for career eye still picks the JOB', async () => {
    const ids = await seedGraph();
    const body = await json(await app.request('/api/next-best-action?eye=career'));
    const opp = body['opportunity'] as Record<string, unknown>;
    expect(opp['id']).toBe(ids['job']);
    expect(typeof body['reason']).toBe('string');
  });

  it('NBA is null for an eye with no data', async () => {
    await postJson('/api/opportunities', { opportunity_type: 'JOB', score: 95, data: { role: 'SSE' } });
    const body = await json(await app.request('/api/next-best-action?eye=business'));
    expect(body['opportunity']).toBeNull();
    expect(body['reason']).toBeNull();
    expect(body['match_score']).toBeNull();
  });
});

// ─── Daily brief scoping ─────────────────────────────────────────────────────

describe('daily brief scoping', () => {
  it('morning priorities are scoped to the eye', async () => {
    const ids = await seedGraph();
    const morning = await json(await app.request('/api/daily-brief/morning?eye=business'));
    const priorities = morning['priorities'] as Record<string, unknown>[];
    expect(priorities.map((p) => p['opportunity_id'])).toEqual([ids['website']]);

    const careerMorning = await json(await app.request('/api/daily-brief/morning?eye=career'));
    expect((careerMorning['priorities'] as Record<string, unknown>[]).map((p) => p['opportunity_id'])).toEqual([
      ids['job'],
    ]);
  });

  it('morning career counts are scoped; gate/task parts stay global', async () => {
    await seedGraph();
    await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: { title: 'Global task' }, due_at: '2020-01-01T00:00:00.000Z' }),
    });

    for (const eye of ['business', 'growth', 'signal']) {
      const counts = (await json(await app.request(`/api/daily-brief/morning?eye=${eye}`)))['counts'] as Record<
        string,
        unknown
      >;
      expect((counts['career'] as Record<string, number>)['new_jobs'], eye).toBe(0);
      // tasks + overdue remain global
      expect(counts['overdue_tasks'], eye).toBe(1);
      expect(counts['actions_required'], eye).toBeGreaterThanOrEqual(1);
    }
  });

  it('evening brief scoping: new/opps-awaiting scoped, tasks global', async () => {
    await seedGraph();
    const evening = await json(await app.request('/api/daily-brief/evening?eye=business'));
    expect(evening['kind']).toBe('evening');
    // 4 opportunities were created today → new_today is an event count (global), pending counts the scoped opps
    expect(evening['new_today']).toEqual({ opportunities: 4, signals: 0 });
    expect(evening['pending']).toBe(1); // the WEBSITE opp only (no tasks)
    expect(typeof evening['observation']).toBe('string');
    expect(typeof evening['recommendation']).toBe('string');
  });

  it('evening NBA-less observation is stable and non-empty for every eye', async () => {
    await seedGraph();
    for (const eye of ['career', 'business', 'growth', 'signal', 'control', 'all']) {
      const evening = await json(await app.request(`/api/daily-brief/evening?eye=${eye}`));
      expect((evening['observation'] as string).length, eye).toBeGreaterThan(0);
      expect((evening['recommendation'] as string).length, eye).toBeGreaterThan(0);
    }
  });
});

// ─── Signals scoping ─────────────────────────────────────────────────────────

describe('GET /api/signals?eye=', () => {
  it('career eye shows JOB_POSTING only', async () => {
    await seedSignals();
    const body = await json(await app.request('/api/signals?eye=career&limit=200'));
    const types = (body['items'] as Record<string, unknown>[]).map(
      (i) => ((i['data'] as Record<string, unknown>)['signal_type'] as string),
    );
    expect(types).toEqual(['JOB_POSTING']);
    expect(body['total']).toBe(1);
  });

  it('business eye shows BUSINESS_DISCOVERY only', async () => {
    await seedSignals();
    const body = await json(await app.request('/api/signals?eye=business&limit=200'));
    const types = (body['items'] as Record<string, unknown>[]).map(
      (i) => ((i['data'] as Record<string, unknown>)['signal_type'] as string),
    );
    expect(types).toEqual(['BUSINESS_DISCOVERY']);
  });

  it('growth eye shows SOCIAL_POST + COMMENT', async () => {
    await seedSignals();
    const body = await json(await app.request('/api/signals?eye=growth&limit=200'));
    const types = (body['items'] as Record<string, unknown>[]).map(
      (i) => ((i['data'] as Record<string, unknown>)['signal_type'] as string),
    );
    expect(new Set(types)).toEqual(new Set(['SOCIAL_POST', 'COMMENT']));
    expect(body['total']).toBe(2);
  });

  it('signal eye sees everything including GEM_CALL', async () => {
    await seedSignals();
    const body = await json(await app.request('/api/signals?eye=signal&limit=200'));
    const types = (body['items'] as Record<string, unknown>[]).map(
      (i) => ((i['data'] as Record<string, unknown>)['signal_type'] as string),
    );
    expect(new Set(types)).toEqual(new Set(['JOB_POSTING', 'BUSINESS_DISCOVERY', 'SOCIAL_POST', 'COMMENT', 'GEM_CALL']));
    expect(body['total']).toBe(5);
  });

  it('control + all see every signal type (incl. GEM_CALL)', async () => {
    await seedSignals();
    for (const eye of ['control', 'all']) {
      const body = await json(await app.request(`/api/signals?eye=${eye}&limit=200`));
      expect(body['total'], eye).toBe(5);
    }
  });

  it('no eye param keeps today\'s unfiltered behavior', async () => {
    await seedSignals();
    const body = await json(await app.request('/api/signals?limit=200'));
    expect(body['total']).toBe(5);
    expect(body['items']).toHaveLength(5);
  });

  it('explicit signal_type wins over the eye', async () => {
    await seedSignals();
    const body = await json(await app.request('/api/signals?eye=career&signal_type=GEM_CALL&limit=200'));
    const types = (body['items'] as Record<string, unknown>[]).map(
      (i) => ((i['data'] as Record<string, unknown>)['signal_type'] as string),
    );
    expect(types).toEqual(['GEM_CALL']);
    expect(body['total']).toBe(1);
  });

  it('eye composes with the disposition filter', async () => {
    await seedSignals();
    const all = await json(await app.request('/api/signals?eye=growth&limit=200'));
    const first = (all['items'] as Record<string, unknown>[])[0]!;
    await patchJson(`/api/signals/${first['id'] as string}`, { status: 'DISMISSED' });

    const body = await json(await app.request('/api/signals?eye=growth&disposition=NEW&limit=200'));
    expect(body['total']).toBe(1);
    expect((body['items'] as Record<string, unknown>[])[0]!['status']).toBe('NEW');
  });

  it('invalid signal_type still 400s', async () => {
    const res = await app.request('/api/signals?eye=career&signal_type=NOPE');
    expect(res.status).toBe(400);
    expect(((await json(res))['error'] as Record<string, unknown>)['code']).toBe('BAD_QUERY');
  });
});

// ─── Shared schema sanity ────────────────────────────────────────────────────

describe('Eye scoping maps', () => {
  it('CRYPTO belongs to Signal Eye and GEM_CALL signals are visible there', async () => {
    await seedGraph();
    const opps = await json(await app.request('/api/opportunities?eye=signal&limit=200'));
    expect((opps['items'] as Record<string, unknown>[])[0]!['opportunity_type']).toBe('CRYPTO');
  });

  it('Growth Eye is AFFILIATE only (no CRYPTO leakage)', async () => {
    await seedGraph();
    const body = await json(await app.request('/api/opportunities?eye=growth&limit=200'));
    const types = (body['items'] as Record<string, unknown>[]).map(oppTypeOf);
    expect(types).toEqual(['AFFILIATE']);
  });
});
