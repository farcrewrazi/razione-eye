import { describe, it, expect, beforeEach } from 'vitest';
import { openDb } from '../src/db.ts';
import { NodesRepo } from '../src/nodes.ts';
import { EdgesRepo } from '../src/edges.ts';

let nodes: NodesRepo;
let edges: EdgesRepo;

beforeEach(() => {
  const db = openDb({ path: ':memory:' });
  nodes = new NodesRepo(db);
  edges = new EdgesRepo(db);
});

describe('EdgesRepo', () => {
  it('creates edges and queries both directions', () => {
    const person = nodes.create({ type: 'PERSON', name: 'Razi', data: { full_name: 'Razi' } });
    const skill = nodes.create({ type: 'SKILL', name: 'Node.js', data: { name: 'Node.js' } });

    const e = edges.knows(person.id, skill.id);
    expect(e.edge_type).toBe('knows');

    const out = edges.outgoing(person.id, 'knows');
    expect(out.length).toBe(1);
    expect(out[0]!.to_id).toBe(skill.id);

    const inc = edges.incoming(skill.id, 'knows');
    expect(inc.length).toBe(1);
    expect(inc[0]!.from_id).toBe(person.id);
  });

  it('stores data payloads (matches score)', () => {
    const opp = nodes.create({
      type: 'OPPORTUNITY',
      opportunity_type: 'JOB',
      status: 'QUALIFIED',
      score: 91,
      data: { role: 'SSE' },
    });
    const person = nodes.create({ type: 'PERSON', name: 'Razi', data: { full_name: 'Razi' } });
    const e = edges.matches(opp.id, person.id, 91);
    expect(e.data).toEqual({ score: 91 });
  });

  it('ensure() is idempotent; exists() detects duplicates', () => {
    const a = nodes.create({ type: 'COMPANY', name: 'A', data: {} });
    const b = nodes.create({ type: 'LOCATION', name: 'Cyberjaya', data: { name: 'Cyberjaya' } });

    const first = edges.locatedIn(a.id, b.id);
    const second = edges.locatedIn(a.id, b.id);
    expect(second.id).toBe(first.id);
    expect(edges.exists(a.id, b.id, 'located_in')).toBe(true);
    expect(edges.incoming(b.id, 'located_in').length).toBe(1);
  });

  it('cascades on node delete', () => {
    const a = nodes.create({ type: 'PERSON', name: 'x', data: { full_name: 'x' } });
    const b = nodes.create({ type: 'SKILL', name: 'y', data: { name: 'y' } });
    edges.knows(a.id, b.id);
    expect(edges.count()).toBe(1);
    nodes.delete(a.id);
    expect(edges.count()).toBe(0);
  });

  it('deletes individual edges', () => {
    const a = nodes.create({ type: 'COMPANY', name: 'A', data: {} });
    const b = nodes.create({ type: 'COMPANY', name: 'B', data: {} });
    const e = edges.ensure(a.id, b.id, 'parent_of');
    expect(edges.delete(e.id)).toBe(true);
    expect(edges.delete(e.id)).toBe(false);
  });
});
