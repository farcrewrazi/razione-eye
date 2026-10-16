import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { createApp } from '../src/index.ts';
import { openTestDb, resetTestDb, closeTestDb } from './helpers.ts';
import type { Hono } from 'hono';

let pool: Pool;
let app: Hono;

beforeAll(async () => {
  pool = await openTestDb();
  ({ app } = createApp(pool));
});

beforeEach(async () => {
  await resetTestDb(pool);
  await app.request('/api/seed', { method: 'POST' });
});

afterAll(async () => {
  await closeTestDb(pool);
});

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

async function createJob(role = 'Senior Backend Engineer'): Promise<string> {
  const res = await app.request('/api/opportunities', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      opportunity_type: 'JOB',
      data: { role, company: 'NexLabs', location: 'Cyberjaya' },
    }),
  });
  expect(res.status).toBe(201);
  return (await json(res))['id'] as string;
}

async function submitGateAction(opportunityId: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const res = await app.request('/api/gate/actions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action_type: 'apply_to_job',
      payload: { opportunity_id: opportunityId, cover_note: 'Ready-to-paste note', ...payload },
    }),
  });
  expect(res.status).toBe(201);
  return json(res);
}

/** A business prospect (CONSULTANCY) — the pitch-flow target. */
async function createProspect(company = 'PitchWorks Sdn Bhd'): Promise<string> {
  const res = await app.request('/api/opportunities', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ opportunity_type: 'CONSULTANCY', data: { company } }),
  });
  expect(res.status).toBe(201);
  return (await json(res))['id'] as string;
}

async function submitPitchAction(opportunityId: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const res = await app.request('/api/gate/actions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action_type: 'prepare_pitch',
      payload: { opportunity_id: opportunityId, ...payload },
    }),
  });
  expect(res.status).toBe(201);
  return json(res);
}

describe('Action Gate API (T1.11)', () => {
  it('submit → list pending → approve executes task DONE + opportunity APPLIED with applied_date', async () => {
    const oppId = await createJob();
    const action = await submitGateAction(oppId);
    expect(action['status']).toBe('PENDING');
    expect((action['opportunity'] as Record<string, unknown>)['id']).toBe(oppId);

    const pending = await json(await app.request('/api/gate/actions?status=PENDING'));
    expect(pending['total']).toBe(1);

    const approveRes = await app.request(`/api/gate/actions/${action['id']}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(approveRes.status).toBe(200);
    const decided = await json(approveRes);
    expect(decided['status']).toBe('APPROVED');
    expect(decided['decision']).toBe('approved');
    expect(decided['decided_at']).toBeTruthy();

    const opp = decided['opportunity'] as Record<string, unknown>;
    expect(opp['status']).toBe('APPLIED');
    expect((opp['data'] as Record<string, unknown>)['applied_date']).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const task = decided['task'] as Record<string, unknown>;
    expect(task['status']).toBe('DONE');
    expect((task['data'] as Record<string, unknown>)['opportunity_id']).toBe(oppId);

    // gate_decision event recorded on the opportunity.
    const events = await json(await app.request(`/api/opportunities/${oppId}/events`));
    const gateEvents = (events['items'] as Record<string, unknown>[]).filter((e) => e['type'] === 'gate_decision');
    expect(gateEvents).toHaveLength(1);
  });

  it('edit-then-approve: inline payload replaces the draft, decision = edited_approved', async () => {
    const oppId = await createJob();
    const action = await submitGateAction(oppId, { cover_note: 'draft v1' });

    const res = await app.request(`/api/gate/actions/${action['id']}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: { cover_note: 'edited final note' } }),
    });
    expect(res.status).toBe(200);
    const decided = await json(res);
    expect(decided['decision']).toBe('edited_approved');
    expect((decided['payload'] as Record<string, unknown>)['cover_note']).toBe('edited final note');
  });

  it('PATCH edit on a PENDING action updates the draft payload', async () => {
    const oppId = await createJob();
    const action = await submitGateAction(oppId, { cover_note: 'v1' });
    const res = await app.request(`/api/gate/actions/${action['id']}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: { resume_version: 'v3-senior-backend' } }),
    });
    expect(res.status).toBe(200);
    const updated = await json(res);
    expect((updated['payload'] as Record<string, unknown>)['resume_version']).toBe('v3-senior-backend');
    expect((updated['payload'] as Record<string, unknown>)['cover_note']).toBe('v1'); // merged
  });

  it('reject requires a reason, logs gate_decision, and leaves the opportunity untouched', async () => {
    const oppId = await createJob();
    const action = await submitGateAction(oppId);

    const noReason = await app.request(`/api/gate/actions/${action['id']}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(noReason.status).toBe(422);

    const res = await app.request(`/api/gate/actions/${action['id']}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Salary below band' }),
    });
    expect(res.status).toBe(200);
    const decided = await json(res);
    expect(decided['status']).toBe('REJECTED');
    expect(decided['decision_reason']).toBe('Salary below band');

    const opp = await json(await app.request(`/api/opportunities/${oppId}`));
    expect(opp['status']).toBe('DISCOVERED'); // untouched
    expect((opp['data'] as Record<string, unknown>)['applied_date']).toBeUndefined();
  });

  it('decisions are final — approve/reject on a decided action returns 409', async () => {
    const oppId = await createJob();
    const action = await submitGateAction(oppId);
    await app.request(`/api/gate/actions/${action['id']}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    const again = await app.request(`/api/gate/actions/${action['id']}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(again.status).toBe(409);
    const reject = await app.request(`/api/gate/actions/${action['id']}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'too late' }),
    });
    expect(reject.status).toBe(409);
  });

  it('rejects invalid payloads and non-opportunity links with 422', async () => {
    const res = await app.request('/api/gate/actions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action_type: 'apply_to_job', payload: {} }),
    });
    expect(res.status).toBe(422);

    const bad = await app.request('/api/gate/actions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action_type: 'apply_to_job', payload: { opportunity_id: '01J0000000000000000000000X' } }),
    });
    expect(bad.status).toBe(422);
  });
});

describe('Action Gate — prepare_pitch (EYE-6F)', () => {
  it('submit → PENDING with a pitch summary and no "Apply to" text', async () => {
    const oppId = await createProspect();
    const action = await submitPitchAction(oppId);
    expect(action['status']).toBe('PENDING');
    expect(action['summary']).toBe('Prepare pitch — PitchWorks Sdn Bhd');
    expect(JSON.stringify(action)).not.toContain('Apply to');

    const pending = await json(await app.request('/api/gate/actions?status=PENDING'));
    expect(pending['total']).toBe(1);
    const pendingItems = pending['items'] as Record<string, unknown>[];
    expect(pendingItems).toHaveLength(1);
    const item = pendingItems[0]!;
    expect(item['summary']).toBe('Prepare pitch — PitchWorks Sdn Bhd');
    expect(JSON.stringify(item)).not.toContain('Apply to');
  });

  it('summary resolves the company from the belongs_to COMPANY edge when data.company is absent', async () => {
    const companies = await json(await app.request('/api/companies'));
    const company = (companies['items'] as Record<string, unknown>[]).find((c) => c['type'] === 'COMPANY');
    expect(company).toBeTruthy();

    const res = await app.request('/api/opportunities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ opportunity_type: 'CONSULTANCY', data: { company_id: company!['id'] } }),
    });
    expect(res.status).toBe(201);
    const oppId = (await json(res))['id'] as string;

    const action = await submitPitchAction(oppId);
    expect(action['summary']).toBe(`Prepare pitch — ${company!['name']}`);
  });

  it('approve → TEASER_PROPOSAL + pitch TASK; never APPLIED, no applied_date, no follow_up', async () => {
    const oppId = await createProspect();
    const action = await submitPitchAction(oppId, { note: 'Lean on the KL case study' });

    const approveRes = await app.request(`/api/gate/actions/${action['id']}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(approveRes.status).toBe(200);
    const decided = await json(approveRes);
    expect(decided['status']).toBe('APPROVED');

    const opp = decided['opportunity'] as Record<string, unknown>;
    expect(opp['status']).toBe('TEASER_PROPOSAL');
    expect(opp['status']).not.toBe('APPLIED');
    const oppData = opp['data'] as Record<string, unknown>;
    expect(oppData['applied_date']).toBeUndefined();
    expect(oppData['next_action']).toBeUndefined();

    const task = decided['task'] as Record<string, unknown>;
    expect(task['name']).toBe('Prepare pitch — PitchWorks Sdn Bhd');
    expect(task['status']).toBe('DONE');
    expect(task['tags']).toEqual(['gate', 'pitch']);
    expect((task['data'] as Record<string, unknown>)['description']).toContain('KL case study');

    // status_changed records the real from → to (created at DISCOVERED_BUSINESS).
    const events = await json(await app.request(`/api/opportunities/${oppId}/events`));
    const statusEvents = (events['items'] as Record<string, unknown>[]).filter((e) => e['type'] === 'status_changed');
    expect(statusEvents).toHaveLength(1);
    expect(String(statusEvents[0]!['summary'])).toContain('DISCOVERED_BUSINESS → TEASER_PROPOSAL');
  });

  it('reject leaves the opportunity untouched — no status change, no task', async () => {
    const oppId = await createProspect();
    const action = await submitPitchAction(oppId);
    const res = await app.request(`/api/gate/actions/${action['id']}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Not this quarter' }),
    });
    expect(res.status).toBe(200);

    const opp = await json(await app.request(`/api/opportunities/${oppId}`));
    expect(opp['status']).toBe('DISCOVERED_BUSINESS'); // untouched
    expect((opp['data'] as Record<string, unknown>)['applied_date']).toBeUndefined();

    const tasks = await json(await app.request('/api/tasks'));
    expect(tasks['total']).toBe(0);
  });

  it('unknown action_type is rejected with 422', async () => {
    const res = await app.request('/api/gate/actions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action_type: 'cold_call', payload: { opportunity_id: '01J0000000000000000000000X' } }),
    });
    expect(res.status).toBe(422);
  });
});

describe('Daily Brief API (T1.10)', () => {
  it('morning brief: counts + priorities + NBA', async () => {
    const res = await app.request('/api/daily-brief/morning');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body['kind']).toBe('morning');
    const counts = body['counts'] as Record<string, unknown>;
    expect(counts).toHaveProperty('actions_required');
    expect(counts).toHaveProperty('gate_pending');
    expect(counts).toHaveProperty('career');
    expect(Array.isArray(body['priorities'])).toBe(true);
  });

  it('evening brief: completed/pending/new + one observation + recommendation', async () => {
    const res = await app.request('/api/daily-brief/evening');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body['kind']).toBe('evening');
    expect(typeof body['completed_today']).toBe('number');
    expect(typeof body['pending']).toBe('number');
    expect(body['new_today']).toHaveProperty('opportunities');
    expect(typeof body['observation']).toBe('string');
    expect((body['observation'] as string).length).toBeGreaterThan(0);
    expect(typeof body['recommendation']).toBe('string');
  });

  it('morning brief counts pending gate approvals in actions_required', async () => {
    const oppId = await createJob();
    await submitGateAction(oppId);
    const body = await json(await app.request('/api/daily-brief/morning'));
    const counts = body['counts'] as Record<string, number>;
    expect(counts['gate_pending']).toBe(1);
    expect(counts['actions_required']).toBeGreaterThanOrEqual(1);
  });

  it('approving through the gate clears the pending count in the next morning brief', async () => {
    const oppId = await createJob();
    const action = await submitGateAction(oppId);
    await app.request(`/api/gate/actions/${action['id']}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await json(await app.request('/api/daily-brief/morning'));
    expect((body['counts'] as Record<string, number>)['gate_pending']).toBe(0);
    // And the approval shows up as a completed action in the evening brief.
    const evening = await json(await app.request('/api/daily-brief/evening'));
    expect(evening['gate_decisions_today']).toBe(1);
    expect(evening['completed_today']).toBe(1);
  });
});
