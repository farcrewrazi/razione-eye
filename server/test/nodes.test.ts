import { describe, it, expect, beforeEach } from 'vitest';
import { openDb } from '../src/db.ts';
import { NodesRepo } from '../src/nodes.ts';

let repo: NodesRepo;

beforeEach(() => {
  repo = new NodesRepo(openDb({ path: ':memory:' }));
});

describe('NodesRepo', () => {
  it('creates and reads back a node with ULID + timestamps', () => {
    const n = repo.create({
      type: 'COMPANY',
      name: 'ABC Technology',
      source: 'manual',
      tags: ['software-house'],
      data: { industry: 'Software', stack: ['Node.js', 'React'] },
    });
    expect(n.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(n.created_at).toBeTruthy();
    expect(n.updated_at).toBeTruthy();
    expect(n.tags).toEqual(['software-house']);

    const back = repo.getById(n.id);
    expect(back?.name).toBe('ABC Technology');
    expect(back?.data['industry']).toBe('Software');
    expect((back?.data['stack'] as string[]).length).toBe(2);
  });

  it('updates fields and merges data, bumping updated_at', async () => {
    const n = repo.create({ type: 'SKILL', name: 'Node.js', data: { name: 'Node.js' } });
    await new Promise((r) => setTimeout(r, 5));
    const u = repo.update(n.id, { status: 'X', data: { level: 'expert' } });
    expect(u?.status).toBe('X');
    expect(u?.data['level']).toBe('expert');
    expect(u?.data['name']).toBe('Node.js'); // merged, not replaced
    expect(u!.updated_at >= n.updated_at).toBe(true);
  });

  it('deletes a node', () => {
    const n = repo.create({ type: 'SKILL', name: 'SQL', data: { name: 'SQL' } });
    expect(repo.delete(n.id)).toBe(true);
    expect(repo.getById(n.id)).toBeNull();
    expect(repo.delete(n.id)).toBe(false);
  });

  it('lists with filters + pagination', () => {
    repo.create({ type: 'TASK', name: 'a', status: 'TODO', due_at: '2026-09-10T00:00:00.000Z', data: { title: 'a' } });
    repo.create({ type: 'TASK', name: 'b', status: 'DONE', due_at: '2026-09-01T00:00:00.000Z', data: { title: 'b' } });
    repo.create({ type: 'COMPANY', name: 'c', data: {} });

    expect(repo.list({ type: 'TASK' }).total).toBe(2);
    expect(repo.list({ type: 'TASK', status: 'TODO' }).total).toBe(1);
    expect(repo.list({ type: 'TASK', due_before: '2026-09-05T00:00:00.000Z' }).total).toBe(1);
    expect(repo.list({ type: 'TASK', overdue: true }).total).toBe(1);
    expect(repo.list({ q: 'ABC' }).total).toBe(0);

    const page = repo.list({ type: 'TASK', limit: 1, offset: 1, sort: 'due_at' });
    expect(page.items.length).toBe(1);
    expect(page.total).toBe(2);
  });

  it('findByTypeAndName supports deterministic lookups', () => {
    repo.create({ type: 'PERSON', name: 'Farcrew Razi', data: { full_name: 'Farcrew Razi' } });
    expect(repo.findByTypeAndName('PERSON', 'Farcrew Razi')?.type).toBe('PERSON');
    expect(repo.findByTypeAndName('PERSON', 'nobody')).toBeNull();
  });
});
