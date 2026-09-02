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

describe('events + activity log API', () => {
  it('GET /api/opportunities/:id/events returns created + status_changed + note_added events', async () => {
    const create = await app.request('/api/opportunities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ opportunity_type: 'JOB', data: { role: 'SSE' } }),
    });
    expect(create.status).toBe(201);
    const opp = await json(create);
    const id = opp['id'] as string;

    await app.request(`/api/opportunities/${id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'QUALIFIED' }),
    });
    const noteRes = await app.request(`/api/opportunities/${id}/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Recruiter emailed — reply tomorrow' }),
    });
    expect(noteRes.status).toBe(201);

    const events = await json(await app.request(`/api/opportunities/${id}/events`));
    expect(events['total']).toBe(3);
    const types = (events['items'] as Record<string, unknown>[]).map((e) => e['type']);
    expect(types).toEqual(['note_added', 'status_changed', 'opportunity_created']); // newest first

    // Note actually persisted on the node.
    const detail = await json(await app.request(`/api/opportunities/${id}`));
    const notes = detail['notes'] as Array<{ text: string }>;
    expect(notes.some((n) => n.text === 'Recruiter emailed — reply tomorrow')).toBe(true);
  });

  it('POST /api/opportunities/:id/notes validates input', async () => {
    const create = await json(
      await app.request('/api/opportunities', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ opportunity_type: 'JOB', data: { role: 'SSE' } }),
      }),
    );
    const bad = await app.request(`/api/opportunities/${create['id'] as string}/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '' }),
    });
    expect(bad.status).toBe(422);
  });

  it('GET /api/signals/:id/events and /api/tasks/:id/events share the same shape', async () => {
    const sig = await json(
      await app.request('/api/signals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 'linkedin',
          data: { signal_type: 'JOB_POSTING', content: 'hiring SSE', observed_at: '2026-09-02T00:00:00.000Z' },
        }),
      }),
    );
    await app.request(`/api/signals/${sig['id'] as string}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'DISMISSED' }),
    });
    const sigEvents = await json(await app.request(`/api/signals/${sig['id'] as string}/events`));
    expect(sigEvents['total']).toBe(2);
    const sigTypes = (sigEvents['items'] as Record<string, unknown>[]).map((e) => e['type']);
    expect(sigTypes).toEqual(['signal_dismissed', 'signal_created']);

    const task = await json(
      await app.request('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data: { title: 'Apply' } }),
      }),
    );
    const taskEvents = await json(await app.request(`/api/tasks/${task['id'] as string}/events`));
    expect(taskEvents['total']).toBe(0);
    expect(Array.isArray(taskEvents['items'])).toBe(true);
  });

  it('agent run records an agent_run event', async () => {
    const seed = await json(await app.request('/api/seed', { method: 'POST' }));
    const agentId = (seed['agent_ids'] as string[])[0]!;
    const res = await app.request(`/api/agents/${agentId}/run`, { method: 'POST' });
    expect(res.status).toBe(200);
    // agent events live in the events table — covered by repo-level checks in
    // import-pipeline.test.ts (ctx.events.list()); no per-agent endpoint in Wave 2.
  });

  it('404 on events for a missing node', async () => {
    const res = await app.request('/api/opportunities/01J0000000000000000000000X/events');
    expect(res.status).toBe(404);
  });
});
