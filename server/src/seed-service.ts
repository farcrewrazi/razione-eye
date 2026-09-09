/**
 * Idempotent seed (T0.8 / T0.8b / T0.10) — safe to run repeatedly.
 * Deterministic lookups by (type, name) for nodes; (from,to,edge_type) for edges.
 */
import type { AppContext } from './context.ts';
import type { AgentCapability, Node } from '@razione-eye/shared';

export const PROFILE_PERSON_NAME = 'Farcrew Razi';
export const RAZISURF_NAME = 'RaziSurf';
export const CYBERJAYA_NAME = 'Cyberjaya';

const RAZI_SKILLS = ['Node.js', 'TypeScript', 'React', 'JavaScript', 'AI orchestration', 'SQL'] as const;

const AGENT_STUBS: ReadonlyArray<{ name: string; capability: AgentCapability }> = [
  { name: 'Job Scout', capability: 'discover' },
  { name: 'Job Analyst', capability: 'analyze' },
  { name: 'Business Scout', capability: 'discover' },
  { name: 'Business Analyst', capability: 'analyze' },
  { name: 'Affiliate Analyst', capability: 'analyze' },
  { name: 'Signal Watcher', capability: 'discover' },
];

export interface SeedResult {
  created: { nodes: number; edges: number };
  totals: { nodes: number; edges: number };
  profile_id: string;
  razisurf_id: string;
  agent_ids: string[];
}

export async function runSeed(ctx: AppContext): Promise<SeedResult> {
  const { nodes, edges } = ctx;

  const nodesBefore = await countAllNodes(ctx);
  const edgesBefore = await edges.count();

  // ── T0.8: Razi Profile PERSON ──────────────────────────────────────────
  let profile = await nodes.findByTypeAndName('PERSON', PROFILE_PERSON_NAME);
  if (!profile) {
    profile = await nodes.create({
      type: 'PERSON',
      name: PROFILE_PERSON_NAME,
      source: 'seed',
      tags: ['owner'],
      data: {
        full_name: PROFILE_PERSON_NAME,
        skills: [...RAZI_SKILLS],
        seniority: 'Senior',
        salary_min: 12000,
        salary_max: 16000,
        location: CYBERJAYA_NAME,
        ai_culture_prefs: [
          'AI-assisted development',
          'multi-agent orchestration',
          'Claude Code / AI coding agents',
          'vibe coding',
        ],
      },
    });
  }

  // ── LOCATION node: Cyberjaya + located_in / lives_near edges ───────────
  const cyberjaya = await ensureNamed(ctx, 'LOCATION', CYBERJAYA_NAME);
  if (!(await edges.exists(profile.id, cyberjaya.id, 'located_in'))) {
    await edges.locatedIn(profile.id, cyberjaya.id);
  }
  if (!(await edges.exists(profile.id, cyberjaya.id, 'lives_near'))) {
    await edges.ensure(profile.id, cyberjaya.id, 'lives_near');
  }

  // ── SKILL nodes + knows edges ──────────────────────────────────────────
  for (const skill of RAZI_SKILLS) {
    const skillNode = await ensureNamed(ctx, 'SKILL', skill);
    if (!(await edges.exists(profile.id, skillNode.id, 'knows'))) {
      await edges.knows(profile.id, skillNode.id);
    }
  }

  // ── T0.8b: RaziSurf COMPANY + owns edge ────────────────────────────────
  let razisurf = await nodes.findByTypeAndName('COMPANY', RAZISURF_NAME);
  if (!razisurf) {
    razisurf = await nodes.create({
      type: 'COMPANY',
      name: RAZISURF_NAME,
      source: 'seed',
      tags: ['owner', 'business-entity'],
      data: {
        industry: 'Software / digital services',
        location: CYBERJAYA_NAME,
        ai_culture_notes: ['AI-native delivery'],
      },
    });
  }
  if (!(await edges.exists(profile.id, razisurf.id, 'owns'))) {
    await edges.owns(profile.id, razisurf.id);
  }

  // ── T0.10: Six AGENT stubs ─────────────────────────────────────────────
  const agentIds: string[] = [];
  for (const stub of AGENT_STUBS) {
    let agent = await nodes.findByTypeAndName('AGENT', stub.name);
    if (!agent) {
      agent = await nodes.create({
        type: 'AGENT',
        name: stub.name,
        source: 'seed',
        data: {
          name: stub.name,
          kind: 'native',
          capability: stub.capability,
          behind_adapter: null,
          schedule: 'on_demand',
          last_status: 'empty',
          runs: [],
        },
      });
    }
    agentIds.push(agent.id);
  }

  const nodesAfter = await countAllNodes(ctx);
  const edgesAfter = await edges.count();

  return {
    created: { nodes: nodesAfter - nodesBefore, edges: edgesAfter - edgesBefore },
    totals: { nodes: nodesAfter, edges: edgesAfter },
    profile_id: profile.id,
    razisurf_id: razisurf.id,
    agent_ids: agentIds,
  };
}

async function ensureNamed(ctx: AppContext, type: 'SKILL' | 'LOCATION', name: string): Promise<Node> {
  const existing = await ctx.nodes.findByTypeAndName(type, name);
  if (existing) return existing;
  return ctx.nodes.create({ type, name, source: 'seed', data: { name } });
}

async function countAllNodes(ctx: AppContext): Promise<number> {
  const res = await ctx.db.query('SELECT COUNT(*) AS c FROM nodes');
  return Number(res.rows[0]?.c ?? 0);
}
