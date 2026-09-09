import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { NodesRepo } from '../src/nodes.ts';
import { EdgesRepo } from '../src/edges.ts';
import { openTestDb, resetTestDb, closeTestDb } from './helpers.ts';

let pool: Pool;
let nodes: NodesRepo;
let edges: EdgesRepo;

beforeAll(async () => {
  pool = await openTestDb();
});

beforeEach(async () => {
  await resetTestDb(pool);
  nodes = new NodesRepo(pool);
  edges = new EdgesRepo(pool);
});

afterAll(async () => {
  await closeTestDb(pool);
});

describe('EdgesRepo', () => {
  it('creates edges and queries both directions', async () => {
    const person = await nodes.create({ type: 'PERSON', name: 'Razi', data: { full_name: 'Razi' } });
    const skill = await nodes.create({ type: 'SKILL', name: 'Node.js', data: { name: 'Node.js' } });

    const e = await edges.knows(person.id, skill.id);
    expect(e.edge_type).toBe('knows');

    const out = await edges.outgoing(person.id, 'knows');
    expect(out.length).toBe(1);
    expect(out[0]!.to_id).toBe(skill.id);

    const inc = await edges.incoming(skill.id, 'knows');
    expect(inc.length).toBe(1);
    expect(inc[0]!.from_id).toBe(person.id);
  });

  it('stores data payloads (matches score)', async () => {
    const opp = await nodes.create({
      type: 'OPPORTUNITY',
      opportunity_type: 'JOB',
      status: 'QUALIFIED',
      score: 91,
      data: { role: 'SSE' },
    });
    const person = await nodes.create({ type: 'PERSON', name: 'Razi', data: { full_name: 'Razi' } });
    const e = await edges.matches(opp.id, person.id, 91);
    expect(e.data).toEqual({ score: 91 });
  });

  it('ensure() is idempotent; exists() detects duplicates', async () => {
    const a = await nodes.create({ type: 'COMPANY', name: 'A', data: {} });
    const b = await nodes.create({ type: 'LOCATION', name: 'Cyberjaya', data: { name: 'Cyberjaya' } });

    const first = await edges.locatedIn(a.id, b.id);
    const second = await edges.locatedIn(a.id, b.id);
    expect(second.id).toBe(first.id);
    expect(await edges.exists(a.id, b.id, 'located_in')).toBe(true);
    expect((await edges.incoming(b.id, 'located_in')).length).toBe(1);
  });

  it('cascades on node delete', async () => {
    const a = await nodes.create({ type: 'PERSON', name: 'x', data: { full_name: 'x' } });
    const b = await nodes.create({ type: 'SKILL', name: 'y', data: { name: 'y' } });
    await edges.knows(a.id, b.id);
    expect(await edges.count()).toBe(1);
    await nodes.delete(a.id);
    expect(await edges.count()).toBe(0);
  });

  it('deletes individual edges', async () => {
    const a = await nodes.create({ type: 'COMPANY', name: 'A', data: {} });
    const b = await nodes.create({ type: 'COMPANY', name: 'B', data: {} });
    const e = await edges.ensure(a.id, b.id, 'parent_of');
    expect(await edges.delete(e.id)).toBe(true);
    expect(await edges.delete(e.id)).toBe(false);
  });
});
