/**
 * RaziOne Eye — mock Action Gate queue (Wave-4 [W4], contract §4, T1.11).
 *
 * Seed queue for mock mode: two PENDING drafts, one APPROVED (edited_approved)
 * and one REJECTED — every decision value represented. Session writes mutate
 * the in-memory array in provider.ts (seeded from `mockGateActions` here).
 *
 * Timestamps anchor to MOCK_NOW (data.ts) like the rest of the dataset.
 */

import type { GateAction } from '../types'

function at(daysOffset: number, hours = 0): string {
  const base = new Date('2026-09-02T09:00:00.000Z').getTime()
  return new Date(base + daysOffset * 86_400_000 + hours * 3_600_000).toISOString().replace(/\.000Z$/, 'Z')
}

export const mockGateActions: GateAction[] = [
  // ── PENDING 1 — full application kit (cover note drafted, ready to review) ──
  {
    id: '01JDYGATE00000000000001',
    action_type: 'apply_to_job',
    status: 'PENDING',
    opportunity_id: '01JDYJOB0000000000000005',
    task_id: null,
    payload: {
      opportunity_id: '01JDYJOB0000000000000005',
      cover_note:
        'Hi Kiterunner team — I build Node/TypeScript services with agentic CI pipelines and would love to help scale your logistics platform. 8 years shipping React + Node in production.',
      resume_version: 'resume-2026-node-ts.pdf',
      apply_url: 'https://jobs.example.com/01jdyjob0000000000000005',
      notes: 'Recruiter post said "hack weeks with AI agents" — lead with the multi-agent orchestration story.',
    },
    summary: 'Apply to Full-Stack Developer (React/Node) — Kiterunner Labs',
    created_at: at(0, -3),
    decided_at: null,
    decision: null,
    decision_reason: null,
    opportunity: null, // enriched in provider (db lookup)
    task: null,
  },
  // ── PENDING 2 — minimal draft (no cover note yet; edit-then-approve demo) ──
  {
    id: '01JDYGATE00000000000002',
    action_type: 'apply_to_job',
    status: 'PENDING',
    opportunity_id: '01JDYJOB0000000000000004',
    task_id: null,
    payload: {
      opportunity_id: '01JDYJOB0000000000000004',
      apply_url: 'https://jobs.example.com/01jdyjob0000000000000004',
    },
    summary: 'Apply to Senior Backend Engineer — DataHarbor',
    created_at: at(-1, -1),
    decided_at: null,
    decision: null,
    decision_reason: null,
    opportunity: null,
    task: null,
  },
  // ── APPROVED (edited) — history: Orbit Edge apply, task DONE, opp APPLIED ──
  {
    id: '01JDYGATE00000000000003',
    action_type: 'apply_to_job',
    status: 'APPROVED',
    opportunity_id: '01JDYJOB0000000000000006',
    task_id: '01JDYTASK0000000000000009',
    payload: {
      opportunity_id: '01JDYJOB0000000000000006',
      cover_note:
        'Hi Orbit Edge — senior engineer with Go/Terraform adjacent skills and heavy Node/TypeScript experience. Excited about your infra-codegen tooling.',
      resume_version: 'resume-2026-node-ts.pdf',
      apply_url: 'https://jobs.example.com/01jdyjob0000000000000006',
    },
    summary: 'Apply to Senior Software Engineer — Orbit Edge',
    created_at: at(-10, -2),
    decided_at: at(-9, 2),
    decision: 'edited_approved',
    decision_reason: null,
    opportunity: null,
    task: null,
  },
  // ── REJECTED — history: decided against applying (reason feeds LEARN) ──
  {
    id: '01JDYGATE00000000000004',
    action_type: 'apply_to_job',
    status: 'REJECTED',
    opportunity_id: '01JDYJOB0000000000000012',
    task_id: null,
    payload: {
      opportunity_id: '01JDYJOB0000000000000012',
      apply_url: 'https://jobs.example.com/01jdyjob0000000000000012',
    },
    summary: 'Apply to Senior TypeScript Engineer — Monsoon Interactive',
    created_at: at(-13),
    decided_at: at(-12),
    decision: 'rejected',
    decision_reason: 'Agency culture mismatch — Monsoon is design-led with no AI tooling appetite.',
    opportunity: null,
    task: null,
  },
]
