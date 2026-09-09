import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { makeContext, type AppContext } from '../src/context.ts';
import { runSeed } from '../src/seed-service.ts';
import { openTestDb, resetTestDb, closeTestDb } from './helpers.ts';

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

describe('seed', () => {
  it('creates profile, RaziSurf, skills, location, six agents + edges', async () => {
    const r = await runSeed(ctx);

    expect(await ctx.nodes.findByTypeAndName('PERSON', 'Farcrew Razi')).not.toBeNull();
    expect(await ctx.nodes.findByTypeAndName('COMPANY', 'RaziSurf')).not.toBeNull();
    expect(await ctx.nodes.findByTypeAndName('LOCATION', 'Cyberjaya')).not.toBeNull();
    expect(await ctx.nodes.countByType('SKILL')).toBe(6);
    expect(await ctx.nodes.countByType('AGENT')).toBe(6);

    const profile = (await ctx.nodes.getById(r.profile_id))!;
    expect(profile.data['salary_min']).toBe(12000);
    expect(profile.data['salary_max']).toBe(16000);
    expect((profile.data['ai_culture_prefs'] as string[]).length).toBe(4);

    // owns edge Razi → RaziSurf
    expect(await ctx.edges.exists(r.profile_id, r.razisurf_id, 'owns')).toBe(true);
    // knows edges to all 6 skills
    expect((await ctx.edges.outgoing(r.profile_id, 'knows')).length).toBe(6);
    // located_in + lives_near
    expect((await ctx.edges.outgoing(r.profile_id, 'located_in')).length).toBe(1);
    expect((await ctx.edges.outgoing(r.profile_id, 'lives_near')).length).toBe(1);

    // agents are native / on_demand / empty
    for (const id of r.agent_ids) {
      const a = (await ctx.nodes.getById(id))!;
      expect(a.data['kind']).toBe('native');
      expect(a.data['schedule']).toBe('on_demand');
      expect(a.data['last_status']).toBe('empty');
    }
  });

  it('is idempotent — running twice creates no duplicates', async () => {
    const first = await runSeed(ctx);
    const second = await runSeed(ctx);

    expect(second.created.nodes).toBe(0);
    expect(second.created.edges).toBe(0);
    expect(second.totals).toEqual(first.totals);
    expect(second.profile_id).toBe(first.profile_id);
    expect(second.agent_ids).toEqual(first.agent_ids);
  });
});
