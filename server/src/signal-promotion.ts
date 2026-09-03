/**
 * Signal promotion (T1.12-BE) — SIGNAL → JOB OPPORTUNITY.
 *
 * Shared by `POST /api/signals/:id/promote` and the `signal_id` link-back on
 * `POST /api/opportunities` (T1.1.6-BE). Creates the opportunity (status
 * DISCOVERED, source = the signal's source, content excerpt as first note,
 * data.source_signal_id back-link), marks the signal PROMOTED with
 * promoted_to, records `opportunity_created` + `signal_promoted` events.
 */
import type { Node, SignalData } from '@razione-eye/shared';
import type { AppContext } from './context.ts';
import { nowIso } from './ulid.ts';

/** Fields the caller may override when promoting (else extraction-ready minimal). */
export interface PromoteOverrides {
  role?: string | undefined;
  location?: string | undefined;
  salary?: string | undefined;
  url?: string | undefined;
  stack?: string[] | undefined;
  notes?: string[] | undefined;
}

export interface PromoteResult {
  signal: Node;
  opportunity: Node;
}

/** Create a JOB OPPORTUNITY from a signal and mark the signal PROMOTED. */
export function promoteSignal(ctx: AppContext, signal: Node, overrides: PromoteOverrides = {}): PromoteResult {
  const { nodes, events } = ctx;
  const sigData = signal.data as SignalData;
  const now = nowIso();

  const contentExcerpt = sigData.content.length > 200 ? `${sigData.content.slice(0, 200)}…` : sigData.content;
  const opportunity = nodes.create({
    type: 'OPPORTUNITY',
    name: overrides.role ?? signal.name ?? null,
    status: 'DISCOVERED',
    opportunity_type: 'JOB',
    source: signal.source ?? 'manual',
    tags: ['promoted'],
    notes: [{ text: contentExcerpt, created_at: now }, ...(overrides.notes ?? []).map((t) => ({ text: t, created_at: now }))],
    data: {
      role: overrides.role ?? 'Untitled role',
      ...(overrides.location ? { location: overrides.location } : {}),
      ...(overrides.salary ? { salary: overrides.salary } : {}),
      ...(overrides.url ?? sigData.url ? { url: overrides.url ?? sigData.url } : {}),
      ...(overrides.stack ? { stack: overrides.stack } : {}),
      source_signal_id: signal.id,
    },
  });

  events.record({
    type: 'opportunity_created',
    node_id: opportunity.id,
    summary: `Opportunity "${opportunity.name ?? opportunity.id}" created from signal (${signal.id})`,
    data: { status: 'DISCOVERED', opportunity_type: 'JOB', source: opportunity.source, signal_id: signal.id },
  });

  const updatedSignal = nodes.update(signal.id, {
    status: 'PROMOTED',
    data: { promoted_to: opportunity.id },
  });

  events.record({
    type: 'signal_promoted',
    node_id: signal.id,
    summary: `Signal promoted → opportunity ${opportunity.id}`,
    data: { from: signal.status, to: 'PROMOTED', promoted_to: opportunity.id },
  });

  return { signal: updatedSignal!, opportunity };
}

/**
 * T1.1.6-BE link-back: after a manual opportunity is created with `signal_id`,
 * mark that signal PROMOTED with promoted_to = the new opportunity (no new
 * opportunity is created here). No-op when the signal is missing/foreign.
 */
export function linkExistingOpportunityToSignal(ctx: AppContext, signal: Node, opportunity: Node): Node {
  const { nodes, events } = ctx;
  const updatedSignal = nodes.update(signal.id, {
    status: 'PROMOTED',
    data: { promoted_to: opportunity.id },
  });
  events.record({
    type: 'signal_promoted',
    node_id: signal.id,
    summary: `Signal promoted → opportunity ${opportunity.id} (manual entry link-back)`,
    data: { from: signal.status, to: 'PROMOTED', promoted_to: opportunity.id },
  });
  return updatedSignal!;
}
