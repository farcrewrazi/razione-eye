/**
 * Job Analyst run service (T1.4) — DB wiring around the pure analyst.
 *
 * Iterates JOB opportunities (all, or only unanalyzed ones), runs the
 * AnalystPort over each, persists scores/bands/next_action/notes, ensures the
 * `matches` edge person→opportunity (doc 02 §5) carries the latest score, and
 * records `analyzed` events. Returns the aggregate stored in the agent's run
 * entry + the `agent_run` event.
 */
import {
  agentDataSchema,
  bandForScore,
  type AgentData,
  type Node,
  type PersonData,
  type ScoreBand,
} from '@razione-eye/shared';
import type { AppContext } from '../context.ts';
import { nowIso } from '../ulid.ts';
import { PROFILE_PERSON_NAME } from '../seed-service.ts';
import {
  DeterministicAnalyst,
  analystSummaryNote,
  buildPersistedAnalysis,
  type AnalystPort,
  type AnalysisResult,
} from './job-analyst.ts';

export const JOB_ANALYST_NAME = 'Job Analyst';

const RUNS_CAP = 50;

export interface AnalyzedItem {
  id: string;
  role: string | null;
  company: string | null;
  score: number;
  band: ScoreBand;
  result: AnalysisResult;
}

export interface JobAnalystRunReport {
  analyzed: number;
  bands: Record<ScoreBand, number>;
  top_5: Array<{ id: string; role: string | null; company: string | null; score: number }>;
}

export interface JobAnalystRunResult {
  agent: Node;
  report: JobAnalystRunReport;
}

function emptyBands(): Record<ScoreBand, number> {
  return { PRIORITY: 0, APPLY: 0, REVIEW: 0, ARCHIVE: 0 };
}

/**
 * Find the company node linked to an opportunity: `belongs_to`/`hiring` edges,
 * falling back to a name lookup on data.company.
 */
function companyFor(ctx: AppContext, opportunity: Node): Node | null {
  const { nodes, edges } = ctx;
  for (const e of edges.outgoing(opportunity.id, 'belongs_to')) {
    const n = nodes.getById(e.to_id);
    if (n?.type === 'COMPANY') return n;
  }
  for (const e of edges.incoming(opportunity.id, 'hiring')) {
    const n = nodes.getById(e.from_id);
    if (n?.type === 'COMPANY') return n;
  }
  const companyName = opportunity.data['company'];
  if (typeof companyName === 'string' && companyName.trim() !== '') {
    return nodes.findByTypeAndName('COMPANY', companyName.trim());
  }
  return null;
}

/**
 * Run the Job Analyst over JOB opportunities.
 * - force=false (default): only opportunities without sub-scores (idempotent).
 * - force=true: re-analyze every JOB opportunity.
 */
export function runJobAnalyst(
  ctx: AppContext,
  agentNode: Node,
  options: { force?: boolean; analyst?: AnalystPort } = {},
): JobAnalystRunResult {
  const { nodes, edges, events } = ctx;
  const analyst = options.analyst ?? new DeterministicAnalyst();
  const force = options.force ?? false;

  const profileNode = nodes.findByTypeAndName('PERSON', PROFILE_PERSON_NAME);
  const profile = (profileNode?.data ?? null) as PersonData | null;

  const { items: jobs } = nodes.list({ type: 'OPPORTUNITY', opportunity_type: 'JOB', limit: 200, sort: 'created_at' });
  const targets = force ? jobs : jobs.filter((j) => j.data['matching'] === undefined);

  const analyzedItems: AnalyzedItem[] = [];
  for (const opp of targets) {
    const result = analyst.analyze({ opportunity: opp, profile, company: companyFor(ctx, opp) });
    const persisted = buildPersistedAnalysis(opp, result);
    nodes.update(opp.id, {
      score: persisted.score,
      status: persisted.status,
      data: persisted.dataPatch,
      notes: persisted.notes,
    });

    // matches edge person→opportunity with {score} — update score if the edge exists.
    if (profileNode) {
      const existing = edges.outgoing(profileNode.id, 'matches').find((e) => e.to_id === opp.id);
      if (existing) {
        edges.delete(existing.id);
        edges.create(profileNode.id, opp.id, 'matches', { score: result.total });
      } else {
        edges.matches(profileNode.id, opp.id, result.total);
      }
    }

    events.record({
      type: 'analyzed',
      node_id: opp.id,
      summary: analystSummaryNote(result),
      data: {
        score: result.total,
        band: result.band,
        dimensions: result.dimensions,
        sub_scores: result.sub_scores,
        inferences: result.inferences,
        force,
      },
    });

    analyzedItems.push({
      id: opp.id,
      role: (opp.data['role'] as string) ?? opp.name,
      company: (opp.data['company'] as string) ?? null,
      score: result.total,
      band: result.band,
      result,
    });
  }

  const bands = emptyBands();
  for (const item of analyzedItems) bands[item.band] = bands[item.band] + 1;
  const top5 = [...analyzedItems]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ id, role, company, score }) => ({ id, role, company, score }));

  const report: JobAnalystRunReport = { analyzed: analyzedItems.length, bands, top_5: top5 };

  // ── Update the agent node (run entry + last_run/last_status) ────────────
  const data = agentDataSchema.parse(agentNode.data) as AgentData;
  const now = nowIso();
  const status = analyzedItems.length > 0 ? ('ok' as const) : ('empty' as const);
  const summary =
    analyzedItems.length > 0
      ? `Job Analyst run: analyzed ${report.analyzed} job(s) — PRIORITY ${bands.PRIORITY}, APPLY ${bands.APPLY}, REVIEW ${bands.REVIEW}, ARCHIVE ${bands.ARCHIVE}`
      : `Job Analyst run: 0 jobs to analyze${force ? ' (force)' : ''}`;
  const runs = [
    ...data.runs,
    { at: now, status, summary, ...({ report } as Record<string, unknown>) },
  ].slice(-RUNS_CAP);
  const patched: AgentData = { ...data, last_run: now, last_status: status, runs };
  const updatedAgent = nodes.update(agentNode.id, { data: { ...patched } });

  events.record({
    type: 'agent_run',
    node_id: agentNode.id,
    summary,
    data: { status, at: now, force, ...report },
  });

  return { agent: updatedAgent!, report };
}

/** Wire shape for GET /api/pipeline/ranking. */
export interface RankingItem {
  id: string;
  role: string | null;
  company: string | null;
  score: number | null;
  band: ScoreBand;
  status: string | null;
  next_action_due: string | null;
}

/** Ranked pipeline — JOB opportunities by score DESC (unscored last). */
export function pipelineRanking(ctx: AppContext): { items: RankingItem[]; total: number } {
  const { nodes } = ctx;
  const { items } = nodes.list({ type: 'OPPORTUNITY', opportunity_type: 'JOB', limit: 200 });
  const projected: RankingItem[] = items.map((opp) => {
    const nextAction = opp.data['next_action'] as { due?: string | null } | undefined;
    return {
      id: opp.id,
      role: (opp.data['role'] as string) ?? opp.name,
      company: (opp.data['company'] as string) ?? null,
      score: opp.score,
      band: bandForScore(opp.score),
      status: opp.status,
      next_action_due: nextAction?.due ?? null,
    };
  });
  projected.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return { items: projected, total: projected.length };
}
