import { describe, it, expect, beforeEach } from 'vitest';
import { openDb } from '../src/db.ts';
import { makeContext, type AppContext } from '../src/context.ts';
import { runSeed } from '../src/seed-service.ts';

let ctx: AppContext;

beforeEach(() => {
  ctx = makeContext(openDb({ path: ':memory:' }));
});

describe('seed', () => {
  it('creates profile, RaziSurf, skills, location, six agents + edges', () => {
    const r = runSeed(ctx);

    expect(ctx.nodes.findByTypeAndName('PERSON', 'Farcrew Razi')).not.toBeNull();
    expect(ctx.nodes.findByTypeAndName('COMPANY', 'RaziSurf')).not.toBeNull();
    expect(ctx.nodes.findByTypeAndName('LOCATION', 'Cyberjaya')).not.toBeNull();
    expect(ctx.nodes.countByType('SKILL')).toBe(6);
    expect(ctx.nodes.countByType('AGENT')).toBe(6);

    const profile = ctx.nodes.getById(r.profile_id)!;
    expect(profile.data['salary_min']).toBe(12000);
    expect(profile.data['salary_max']).toBe(16000);
    expect((profile.data['ai_culture_prefs'] as string[]).length).toBe(4);

    // owns edge Razi → RaziSurf
    expect(ctx.edges.exists(r.profile_id, r.razisurf_id, 'owns')).toBe(true);
    // knows edges to all 6 skills
    expect(ctx.edges.outgoing(r.profile_id, 'knows').length).toBe(6);
    // located_in + lives_near
    expect(ctx.edges.outgoing(r.profile_id, 'located_in').length).toBe(1);
    expect(ctx.edges.outgoing(r.profile_id, 'lives_near').length).toBe(1);

    // agents are native / on_demand / empty
    for (const id of r.agent_ids) {
      const a = ctx.nodes.getById(id)!;
      expect(a.data['kind']).toBe('native');
      expect(a.data['schedule']).toBe('on_demand');
      expect(a.data['last_status']).toBe('empty');
    }
  });

  it('is idempotent — running twice creates no duplicates', () => {
    const first = runSeed(ctx);
    const second = runSeed(ctx);

    expect(second.created.nodes).toBe(0);
    expect(second.created.edges).toBe(0);
    expect(second.totals).toEqual(first.totals);
    expect(second.profile_id).toBe(first.profile_id);
    expect(second.agent_ids).toEqual(first.agent_ids);
  });
});
