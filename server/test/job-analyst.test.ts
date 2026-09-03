/**
 * Job Analyst tests (T1.3 / T1.4 / T1.9-BE / T1.12-BE).
 *
 * Part 1: pure scoring rules (rules.ts) — sub-score math, boundaries.
 * Part 2: analyst unit tests (job-analyst.ts) — extraction, totals, bands,
 *         next_action due dates.
 * Part 3: API integration — agent run, idempotency/force, ranking, NBA,
 *         dashboard, signal promotion, events.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Hono } from 'hono';
import type { Node, PersonData } from '@razione-eye/shared';
import { bandForScore } from '@razione-eye/shared';
import { openDb } from '../src/db.ts';
import { createApp } from '../src/index.ts';
import type { AppContext } from '../src/context.ts';
import {
  detectAiMarkers,
  detectLocation,
  extractStackTokens,
  parseSalaryToMinMax,
  scoreAiCulture,
  scoreCareerUpside,
  scoreCompanyMatch,
  scoreLocation,
  scoreRoleMatch,
  scoreSalary,
} from '../src/agents/rules.ts';
import {
  DeterministicAnalyst,
  extractSignals,
  nextActionForBand,
  totalScore,
  type AnalystInput,
} from '../src/agents/job-analyst.ts';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PROFILE: PersonData = {
  full_name: 'Farcrew Razi',
  skills: ['Node.js', 'TypeScript', 'React', 'JavaScript', 'AI orchestration', 'SQL'],
  seniority: 'Senior',
  salary_min: 12000,
  salary_max: 16000,
  location: 'Cyberjaya',
};

function makeOpp(data: Record<string, unknown>, notes: Array<string | { text: string }> = []): Node {
  const now = '2026-09-02T00:00:00.000Z';
  return {
    id: '01J0000000000000000000000A',
    type: 'OPPORTUNITY',
    name: (data['role'] as string) ?? null,
    status: 'DISCOVERED',
    opportunity_type: 'JOB',
    score: null,
    due_at: null,
    source: 'import',
    tags: [],
    notes: notes.map((n) => (typeof n === 'string' ? n : { text: n.text, created_at: now })),
    data,
    created_at: now,
    updated_at: now,
  };
}

function input(data: Record<string, unknown>, notes: string[] = []): AnalystInput {
  return { opportunity: makeOpp(data, notes), profile: PROFILE, company: null };
}

const FIXED_NOW = new Date('2026-09-02T09:00:00.000Z');

// ─── Part 1: pure rules ──────────────────────────────────────────────────────

describe('rules — extraction helpers', () => {
  it('extractStackTokens finds canonical tokens, dedupes, ignores noise', () => {
    // matched in text order
    expect(extractStackTokens('Node.js, TypeScript, PostgreSQL, Redis')).toEqual([
      'TypeScript',
      'PostgreSQL',
      'Node.js',
      'Redis',
    ]);
    expect(extractStackTokens('golang + k8s on AWS')).toEqual(['Go', 'Kubernetes', 'AWS']);
    expect(extractStackTokens('no tech here')).toEqual([]);
  });

  it('parseSalaryToMinMax handles RM12k-RM16k, RM12,500 - RM15,500, single values', () => {
    expect(parseSalaryToMinMax('RM12k-RM16k')).toEqual({ min: 12000, max: 16000 });
    expect(parseSalaryToMinMax('RM12,500 - RM15,500')).toEqual({ min: 12500, max: 15500 });
    expect(parseSalaryToMinMax('salary RM11,000 - RM14,000 monthly')).toEqual({ min: 11000, max: 14000 });
    expect(parseSalaryToMinMax('RM12k')).toEqual({ min: 12000, max: 12000 });
    expect(parseSalaryToMinMax('not stated')).toBeNull();
  });

  it('detectLocation finds Cyberjaya before nearby cities', () => {
    expect(detectLocation('based in Cyberjaya, near KL')).toBe('Cyberjaya');
    expect(detectLocation('Kuala Lumpur office')).toBe('Kuala Lumpur');
    expect(detectLocation('Putrajaya HQ')).toBe('Putrajaya');
    expect(detectLocation('nowhere')).toBeNull();
  });

  it('detectAiMarkers canonical + pattern matching', () => {
    expect(detectAiMarkers('We use Claude Code internally')).toEqual(['Claude Code']);
    expect(detectAiMarkers('AI-assisted development encouraged')).toEqual(['AI-assisted']);
    expect(detectAiMarkers('GitHub Copilot for all engineers')).toEqual(['Copilot']);
    expect(detectAiMarkers('multi-agent orchestration products')).toEqual(['multi-agent']); // "ai orchestration" is not a substring
    expect(detectAiMarkers('AI orchestration background')).toEqual(['AI orchestration']);
    expect(detectAiMarkers('plain text')).toEqual([]);
  });
});

describe('rules — sub-scores', () => {
  it('location: Cyberjaya=100, hybrid Cyberjaya=95, KL=80, elsewhere MY=40, unknown=60', () => {
    expect(scoreLocation('Cyberjaya')).toBe(100);
    expect(scoreLocation('Cyberjaya (Hybrid)')).toBe(95);
    expect(scoreLocation('Kuala Lumpur')).toBe(80);
    expect(scoreLocation('Bangsar South, KL')).toBe(80);
    expect(scoreLocation('Putrajaya')).toBe(80);
    expect(scoreLocation('Petaling Jaya')).toBe(40);
    expect(scoreLocation('Remote (Malaysia)')).toBe(40);
    expect(scoreLocation(null)).toBe(60);
    expect(scoreLocation('')).toBe(60);
  });

  it('role_match: seniority alignment × stack overlap, 60/40 blend', () => {
    // Senior role + Senior profile → seniority 100; stack 2/3 overlap → 66.7
    // → 100*0.6 + 66.7*0.4 ≈ 87
    expect(scoreRoleMatch(PROFILE, 'Senior Backend Engineer', ['Node.js', 'TypeScript', 'PostgreSQL'])).toBe(87);
    // full overlap → 100
    expect(scoreRoleMatch(PROFILE, 'Senior Software Engineer', ['Node.js', 'TypeScript'])).toBe(100);
    // unknown stack → 70 baseline
    expect(scoreRoleMatch(PROFILE, 'Senior Software Engineer', undefined)).toBe(88);
    // unknown seniority → 60 seniority leg
    expect(scoreRoleMatch(PROFILE, 'Software Engineer', ['Node.js'])).toBe(76); // 60*.6+100*.4
    // zero overlap
    expect(scoreRoleMatch(PROFILE, 'Senior PHP Developer', ['PHP', 'Laravel'])).toBe(60);
  });

  it('company_match: tech industry 90, unknown 60, non-tech 40, size adjustments', () => {
    expect(scoreCompanyMatch({ industry: 'Software / digital services' }, 'Acme')).toBe(90);
    expect(scoreCompanyMatch({}, 'Acme')).toBe(60);
    expect(scoreCompanyMatch({ industry: 'Construction' }, 'BuildCo')).toBe(40);
    expect(scoreCompanyMatch({ industry: 'Fintech', size: '50-500' }, 'FinCo')).toBe(95);
    expect(scoreCompanyMatch({ industry: 'Software', size: '10,000+' }, 'BigCo')).toBe(80);
  });

  it('ai_culture: each marker +20 capped at 100, none → 50, explicit no-AI → 20', () => {
    expect(scoreAiCulture([])).toBe(50);
    expect(scoreAiCulture(['Claude Code'])).toBe(20); // 1 × 20
    expect(scoreAiCulture(['Claude Code', 'Copilot', 'LLM'])).toBe(60);
    expect(scoreAiCulture(['Claude Code', 'Copilot', 'LLM', 'multi-agent', 'vibe coding'])).toBe(100); // capped
    expect(scoreAiCulture(['policy: no AI tooling here'])).toBe(20); // explicit "no AI"
  });

  it('salary: midpoint in band 100, above max 90, ≥10% below 70, ≥25% below 40, unknown 60', () => {
    expect(scoreSalary(PROFILE, 12000, 16000)).toBe(100); // midpoint 14000 in band
    expect(scoreSalary(PROFILE, 18000, 22000)).toBe(90); // midpoint above band max
    expect(scoreSalary(PROFILE, 9000, 12000)).toBe(70); // midpoint 10500, 12.5% below min
    expect(scoreSalary(PROFILE, 7000, 9000)).toBe(40); // midpoint 8000, 33% below min
    expect(scoreSalary(PROFILE, null, null)).toBe(60);
    expect(scoreSalary(null, 12000, 16000)).toBe(60); // no target band
  });

  it('career_upside: senior 70 / lead 90 + AI bonus 15 + new-stack 5, capped', () => {
    expect(scoreCareerUpside('senior', 0, ['Node.js'], PROFILE.skills)).toBe(70);
    expect(scoreCareerUpside('lead', 0, ['Node.js'], PROFILE.skills)).toBe(90);
    expect(scoreCareerUpside('senior', 2, ['Node.js'], PROFILE.skills)).toBe(85); // +15 AI
    expect(scoreCareerUpside('senior', 1, ['Rust'], PROFILE.skills)).toBe(90); // +15 +5 new stack
    expect(scoreCareerUpside('lead', 1, ['Rust'], PROFILE.skills)).toBe(100); // capped
    expect(scoreCareerUpside('unknown', 0, undefined, PROFILE.skills)).toBe(60);
  });
});

// ─── Part 2: analyst unit ────────────────────────────────────────────────────

describe('job-analyst — extraction (T1.3.1)', () => {
  it('infers location/salary/stack/AI-culture from notes; never overwrites explicit', () => {
    const opp = makeOpp(
      { role: 'Backend Engineer', location: 'Kuala Lumpur' },
      ['Fintech in Cyberjaya, RM12k-RM15k, Node.js + TypeScript stack, uses Claude Code'],
    );
    const { patch, inferences } = extractSignals(opp);
    expect(patch['location']).toBeUndefined(); // explicit value kept
    expect(patch['salary_min']).toBe(12000);
    expect(patch['salary_max']).toBe(15000);
    expect(patch['stack']).toEqual(expect.arrayContaining(['Node.js', 'TypeScript']));
    expect(patch['ai_culture']).toEqual(['Claude Code']);
    expect(inferences.join(' ')).toContain('salary_min=12000');
  });
});

describe('job-analyst — total, bands, boundaries (T1.3.4)', () => {
  it('total = weighted sub-scores, rounded', () => {
    // 100*.3 + 86*.2 + 95*.15 + 100*.15 + 75*.1 + 90*.1 = 30+17.2+14.25+15+7.5+9 = 92.95 → 93
    expect(
      totalScore({ role_match: 100, company_match: 86, ai_culture: 95, location: 100, salary: 75, career_upside: 90 }),
    ).toBe(93);
    // doc example: 92*.3+86*.2+95*.15+100*.15+75*.1+90*.1 = 90.7 → 91 ≈ doc's 90 example
    expect(
      totalScore({ role_match: 92, company_match: 86, ai_culture: 95, location: 100, salary: 75, career_upside: 90 }),
    ).toBe(91);
  });

  it('band boundaries: 89 REVIEW / 90 PRIORITY, 74 REVIEW / 75 APPLY, 59 ARCHIVE / 60 REVIEW', () => {
    // total = rm*0.3 + 50*0.2 + 50*0.15 + 100*0.15 + 100*0.1 + 70*0.1 = rm*0.3 + 49.5
    // → rm = 135 lands on exactly 90 (boundary-reachable math verified)
    const totalAt = (rm: number) =>
      Math.round(rm * 0.3 + 50 * 0.2 + 50 * 0.15 + 100 * 0.15 + 100 * 0.1 + 70 * 0.1);
    expect(totalAt(135)).toBe(90);
    expect(totalAt(133)).toBe(89);
    // Band contract itself (doc 02 §6.2: PRIORITY ≥90, APPLY ≥75, REVIEW ≥60, else ARCHIVE):
    expect(bandForScore(89)).toBe('APPLY');
    expect(bandForScore(90)).toBe('PRIORITY');
    expect(bandForScore(74)).toBe('REVIEW');
    expect(bandForScore(75)).toBe('APPLY');
    expect(bandForScore(59)).toBe('ARCHIVE');
    expect(bandForScore(60)).toBe('REVIEW');
  });

  it('full analyze: perfect Cyberjaya senior role at a tech company → PRIORITY; weak role → ARCHIVE', () => {
    const analyst = new DeterministicAnalyst(FIXED_NOW);
    const techCompany = makeOpp({}); // reuse shape; overridden below
    const company = { ...techCompany, id: '01J0000000000000000000000B', type: 'COMPANY' as const, name: 'AlphaTech', data: { industry: 'Software / SaaS' } };
    const great = analyst.analyze({
      ...input(
        { role: 'Senior Software Engineer', location: 'Cyberjaya', salary_min: 12000, salary_max: 16000, stack: ['Node.js', 'TypeScript'] },
        ['Uses Claude Code daily. AI-assisted dev. multi-agent tooling.'],
      ),
      company,
    });
    expect(great.sub_scores.ai_culture).toBe(60); // 3 markers × 20
    expect(great.sub_scores.company_match).toBe(90); // tech industry
    expect(great.band).toBe('PRIORITY');
    expect(great.total).toBeGreaterThanOrEqual(90);
    expect(great.dimensions.role_dimension).toBeGreaterThan(0);
    expect(great.dimensions.company_dimension).toBeGreaterThan(0);

    const weak = analyst.analyze(
      input({ role: 'Junior PHP Developer', location: 'Petaling Jaya', salary_min: 6000, salary_max: 8000, stack: ['PHP', 'Laravel'] }),
    );
    expect(weak.band).toBe('ARCHIVE');
    expect(weak.total).toBeLessThan(60);
  });
});

describe('job-analyst — next_action due dates (T1.3.5)', () => {
  it('PRIORITY today+1 apply, APPLY today+3 apply, REVIEW today+7 review, ARCHIVE today+14 archive', () => {
    expect(nextActionForBand('PRIORITY', FIXED_NOW)).toEqual({ type: 'apply', due: '2026-09-03' });
    expect(nextActionForBand('APPLY', FIXED_NOW)).toEqual({ type: 'apply', due: '2026-09-05' });
    expect(nextActionForBand('REVIEW', FIXED_NOW)).toEqual({ type: 'review', due: '2026-09-09' });
    expect(nextActionForBand('ARCHIVE', FIXED_NOW)).toEqual({ type: 'archive', due: '2026-09-16' });
  });
});

// ─── Part 3: API integration ─────────────────────────────────────────────────

let app: Hono;
let ctx: AppContext;

beforeEach(() => {
  ({ app, ctx } = createApp(openDb({ path: ':memory:' })));
});

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

async function postJson(path: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SEED_OPPS = [
  {
    // Strong: Cyberjaya, in-band salary, full stack, AI culture → PRIORITY
    opportunity_type: 'JOB',
    data: {
      role: 'Senior Backend Engineer',
      company: 'AlphaTech',
      location: 'Cyberjaya',
      salary_min: 12000,
      salary_max: 16000,
      stack: ['Node.js', 'TypeScript'],
    },
    notes: [{ text: 'Uses Claude Code daily. AI-assisted dev. multi-agent tooling.', created_at: '2026-09-01T00:00:00.000Z' }],
  },
  {
    // KL, in-band, partial stack, strong AI culture (3 markers) → APPLY
    opportunity_type: 'JOB',
    data: {
      role: 'Senior Software Engineer',
      company: 'BetaSoft',
      location: 'Kuala Lumpur',
      salary_min: 12000,
      salary_max: 16000,
      stack: ['Node.js', 'PostgreSQL'],
    },
    notes: [{ text: 'Claude Code internally, AI-assisted dev, multi-agent tooling.', created_at: '2026-09-01T00:00:00.000Z' }],
  },
  {
    // Weak: PJ, low salary, no overlap → ARCHIVE
    opportunity_type: 'JOB',
    data: {
      role: 'PHP Developer',
      company: 'GammaWeb',
      location: 'Petaling Jaya',
      salary_min: 6000,
      salary_max: 8000,
      stack: ['PHP', 'Laravel'],
    },
  },
] as const;

async function seedAndCreateOpps(): Promise<string[]> {
  await app.request('/api/seed', { method: 'POST' });
  // AlphaTech is a known software house → company_match 90 (needed for PRIORITY).
  // (No POST /api/companies endpoint — create via the repo, same in-memory DB.)
  ctx.nodes.create({ type: 'COMPANY', name: 'AlphaTech', source: 'manual', data: { industry: 'Software / SaaS' } });
  const ids: string[] = [];
  for (const opp of SEED_OPPS) {
    const res = await postJson('/api/opportunities', opp);
    expect(res.status).toBe(201);
    ids.push(((await json(res))['id']) as string);
  }
  return ids;
}

async function jobAnalystId(): Promise<string> {
  const agents = await json(await app.request('/api/agents'));
  const items = agents['items'] as Array<{ id: string; data: { name: string } }>;
  return items.find((a) => a.data.name === 'Job Analyst')!.id;
}

describe('Job Analyst agent run (T1.4)', () => {
  it('analyzes all JOB opportunities: scores, bands, next_action, status, edges, events', async () => {
    const ids = await seedAndCreateOpps();
    const agentId = await jobAnalystId();

    const res = await app.request(`/api/agents/${agentId}/run`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await json(res);
    const report = body['report'] as {
      analyzed: number;
      bands: Record<string, number>;
      top_5: Array<{ id: string; role: string; company: string; score: number }>;
    };
    expect(report.analyzed).toBe(3);
    expect(report.bands['PRIORITY']).toBe(1);
    expect(report.bands['APPLY']).toBe(1);
    expect(report.bands['ARCHIVE']).toBe(1);
    expect(report.top_5.length).toBe(3);
    expect(report.top_5[0]!.score).toBeGreaterThanOrEqual(report.top_5[2]!.score);

    // Agent node updated
    const agentData = body['data'] as Record<string, unknown>;
    expect(agentData['last_status']).toBe('ok');
    expect((agentData['runs'] as unknown[]).length).toBe(1);

    // Every opportunity now has sub-scores + dimensions + next_action + ANALYZED
    for (const id of ids) {
      const opp = await json(await app.request(`/api/opportunities/${id}`));
      expect(opp['status']).toBe('ANALYZED');
      expect(typeof opp['score']).toBe('number');
      const data = opp['data'] as Record<string, unknown>;
      const matching = data['matching'] as Record<string, number>;
      for (const key of ['role_match', 'company_match', 'ai_culture', 'location', 'salary', 'career_upside']) {
        expect(matching[key]).toBeGreaterThanOrEqual(0);
        expect(matching[key]).toBeLessThanOrEqual(100);
      }
      const dimensions = data['dimensions'] as { role_dimension: number; company_dimension: number };
      expect(dimensions.role_dimension).toBeGreaterThan(0);
      expect(dimensions.company_dimension).toBeGreaterThan(0);
      const nextAction = data['next_action'] as { type: string; due: string };
      expect(['apply', 'review', 'archive']).toContain(nextAction.type);
      expect(nextAction.due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(data['match_score']).toBe(opp['score']);

      // analysis note + analyzed event
      const notes = opp['notes'] as Array<{ text: string } | string>;
      const texts = notes.map((n) => (typeof n === 'string' ? n : n.text));
      expect(texts.some((t) => t.startsWith('Job Analyst: '))).toBe(true);
      const events = await json(await app.request(`/api/opportunities/${id}/events`));
      const types = (events['items'] as Array<{ type: string }>).map((e) => e.type);
      expect(types).toContain('analyzed');
    }

    // matches edge person→opportunity with score
    const profile = await json(await app.request('/api/profile'));
    const graph = await json(await app.request(`/api/graph/neighbors/${ids[0]}`));
    const matchEdge = (graph['edges'] as Array<{ from_id: string; edge_type: string; data: { score: number } }>).find(
      (e) => e.edge_type === 'matches',
    );
    expect(matchEdge).toBeDefined();
    expect(matchEdge!.from_id).toBe(profile['id']);
    expect(matchEdge!.data.score).toBeGreaterThan(0);
  });

  it('idempotent: re-run without force analyzes 0; force=true re-analyzes all', async () => {
    await seedAndCreateOpps();
    const agentId = await jobAnalystId();

    await app.request(`/api/agents/${agentId}/run`, { method: 'POST' });
    const second = await json(await app.request(`/api/agents/${agentId}/run`, { method: 'POST' }));
    expect((second['report'] as { analyzed: number }).analyzed).toBe(0);
    expect((second['data'] as Record<string, unknown>)['last_status']).toBe('empty');

    const forced = await json(await app.request(`/api/agents/${agentId}/run?force=true`, { method: 'POST' }));
    expect((forced['report'] as { analyzed: number }).analyzed).toBe(3);
    expect(((forced['data'] as Record<string, unknown>)['runs'] as unknown[]).length).toBe(3);
  });

  it('other agents still run as stubs', async () => {
    await app.request('/api/seed', { method: 'POST' });
    const agents = await json(await app.request('/api/agents'));
    const scout = (agents['items'] as Array<{ id: string; data: { name: string } }>).find(
      (a) => a.data.name === 'Job Scout',
    )!;
    const res = await json(await app.request(`/api/agents/${scout.id}/run`, { method: 'POST' }));
    expect((res['data'] as Record<string, unknown>)['last_status']).toBe('empty');
    expect(res['report']).toBeUndefined();
  });
});

describe('GET /api/pipeline/ranking (T1.4)', () => {
  it('returns scored items ordered by score DESC with band + next_action_due', async () => {
    await seedAndCreateOpps();
    const agentId = await jobAnalystId();
    await app.request(`/api/agents/${agentId}/run`, { method: 'POST' });

    const res = await app.request('/api/pipeline/ranking');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body['total']).toBe(3);
    const items = body['items'] as Array<{
      id: string;
      role: string;
      company: string;
      score: number;
      band: string;
      status: string;
      next_action_due: string | null;
    }>;
    expect(items[0]!.score).toBeGreaterThanOrEqual(items[1]!.score);
    expect(items[1]!.score).toBeGreaterThanOrEqual(items[2]!.score);
    expect(items[0]!.band).toBe('PRIORITY');
    expect(items[0]!.role).toBe('Senior Backend Engineer');
    expect(items[0]!.company).toBe('AlphaTech');
    expect(items[0]!.status).toBe('ANALYZED');
    expect(items[0]!.next_action_due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('GET /api/next-best-action (T1.9-BE)', () => {
  it('returns the top PRIORITY/APPLY opportunity with a deterministic reason', async () => {
    await seedAndCreateOpps();
    const agentId = await jobAnalystId();
    await app.request(`/api/agents/${agentId}/run`, { method: 'POST' });

    const res = await app.request('/api/next-best-action');
    expect(res.status).toBe(200);
    const body = await json(res);
    const opp = body['opportunity'] as Record<string, unknown>;
    expect(opp).not.toBeNull();
    expect(opp['band']).toBe('PRIORITY');
    expect((opp['data'] as Record<string, unknown>)['company']).toBe('AlphaTech');
    expect(typeof body['match_score']).toBe('number');
    const reason = body['reason'] as string;
    expect(reason).toContain('(PRIORITY)');
    expect(reason).toContain('Cyberjaya');
    expect(reason).toContain('stack overlap 100%');
    expect(reason).toMatch(/due (today|tomorrow|in \d+ days)/);
  });

  it('returns {opportunity: null} when nothing qualifies', async () => {
    await app.request('/api/seed', { method: 'POST' });
    const res = await json(await app.request('/api/next-best-action'));
    expect(res['opportunity']).toBeNull();
  });

  it('ARCHIVE-only pipeline yields no NBA', async () => {
    await app.request('/api/seed', { method: 'POST' });
    await postJson('/api/opportunities', {
      opportunity_type: 'JOB',
      data: { role: 'PHP Developer', location: 'Petaling Jaya', salary_min: 5000, salary_max: 6000, stack: ['PHP'] },
    });
    const agentId = await jobAnalystId();
    await app.request(`/api/agents/${agentId}/run`, { method: 'POST' });
    const res = await json(await app.request('/api/next-best-action'));
    expect(res['opportunity']).toBeNull();
  });
});

describe('GET /api/dashboard (T1.9-BE)', () => {
  it('aggregates career counts + agents + NBA; business/affiliate/gems zero', async () => {
    const ids = await seedAndCreateOpps();
    const agentId = await jobAnalystId();
    await app.request(`/api/agents/${agentId}/run`, { method: 'POST' });
    // one open task due today
    await postJson('/api/tasks', {
      data: { title: 'Apply to AlphaTech', opportunity_id: ids[0] },
      due_at: new Date().toISOString(),
    });
    // one application in flight
    await app.request(`/api/opportunities/${ids[1]}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'APPLIED' }),
    });

    const res = await app.request('/api/dashboard');
    expect(res.status).toBe(200);
    const body = await json(res);
    const today = body['today'] as Record<string, unknown>;
    const career = today['career'] as Record<string, number>;

    expect(career['new_jobs']).toBe(3); // created just now
    expect(career['high_match']).toBe(1); // AlphaTech PRIORITY
    expect(career['pending_applications']).toBe(1); // BetaSoft APPLIED
    expect(career['recruiters_awaiting']).toBe(0);
    // actions_required = open TASKs due ≤ today + opportunities with next_action.due ≤ today.
    // Server uses an end-of-today UTC horizon: the task (due now) + the PRIORITY opp
    // (due tomorrow 00:00 local, within the horizon) count; APPLY(+3d) and ARCHIVE(+14d) do not.
    expect(today['actions_required']).toBe(2);

    const business = today['business'] as Record<string, number>;
    expect(business['discovered']).toBe(0);
    const gems = today['gems'] as Record<string, number>;
    expect(gems['tokens_detected']).toBe(0);

    const agents = body['agents'] as unknown[];
    expect(agents.length).toBe(6);

    const nba = body['next_best_action'] as { opportunity: { band: string } };
    expect(nba.opportunity.band).toBe('PRIORITY');
  });
});

describe('POST /api/signals/:id/promote (T1.12-BE)', () => {
  it('creates a JOB opportunity, links it, promotes the signal, records events', async () => {
    const sigRes = await postJson('/api/signals', {
      source: 'linkedin',
      data: { signal_type: 'JOB_POSTING', content: 'Hiring Senior Node.js engineer, Cyberjaya, RM13k', observed_at: '2026-09-02T00:00:00.000Z' },
    });
    expect(sigRes.status).toBe(201);
    const sig = await json(sigRes);

    const res = await postJson(`/api/signals/${sig['id']}/promote`, {
      data: { role: 'Senior Node.js Engineer', location: 'Cyberjaya' },
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    const signal = body['signal'] as Record<string, unknown>;
    const opportunity = body['opportunity'] as Record<string, unknown>;

    expect(signal['status']).toBe('PROMOTED');
    expect((signal['data'] as Record<string, unknown>)['promoted_to']).toBe(opportunity['id']);
    expect(opportunity['status']).toBe('DISCOVERED');
    expect(opportunity['opportunity_type']).toBe('JOB');
    expect(opportunity['source']).toBe('linkedin');
    const oppData = opportunity['data'] as Record<string, unknown>;
    expect(oppData['source_signal_id']).toBe(sig['id']);
    expect(oppData['role']).toBe('Senior Node.js Engineer');
    const notes = opportunity['notes'] as Array<{ text: string }>;
    expect(notes[0]!.text).toContain('Hiring Senior Node.js engineer');

    // events: signal_promoted on the signal; opportunity_created on the opportunity
    const sigEvents = await json(await app.request(`/api/signals/${sig['id']}/events`));
    const sigTypes = (sigEvents['items'] as Array<{ type: string }>).map((e) => e.type);
    expect(sigTypes).toContain('signal_promoted');
    const oppEvents = await json(await app.request(`/api/opportunities/${opportunity['id']}/events`));
    const oppTypes = (oppEvents['items'] as Array<{ type: string }>).map((e) => e.type);
    expect(oppTypes).toContain('opportunity_created');

    // idempotent re-promote returns the same opportunity (200, not a new creation)
    const again = await postJson(`/api/signals/${sig['id']}/promote`, {});
    expect(again.status).toBe(200);
    const againBody = await json(again);
    expect((againBody['opportunity'] as Record<string, unknown>)['id']).toBe(opportunity['id']);
  });

  it('404 on missing signal; 422 on bad body', async () => {
    const missing = await postJson('/api/signals/01J0000000000000000000000X/promote', {});
    expect(missing.status).toBe(404);
    const sig = await json(
      await postJson('/api/signals', {
        data: { signal_type: 'JOB_POSTING', content: 'x', observed_at: '2026-09-02T00:00:00.000Z' },
      }),
    );
    const bad = await postJson(`/api/signals/${sig['id']}/promote`, { data: { role: '' } });
    expect(bad.status).toBe(422);
  });
});

describe('POST /api/opportunities with signal_id (T1.1.6-BE link-back)', () => {
  it('manual entry links back: signal created-and-PROMOTED with promoted_to', async () => {
    const sig = await json(
      await postJson('/api/signals', {
        source: 'x',
        data: { signal_type: 'JOB_POSTING', content: 'recruiter DM about a role', observed_at: '2026-09-02T00:00:00.000Z' },
      }),
    );
    const res = await postJson('/api/opportunities', {
      opportunity_type: 'JOB',
      signal_id: sig['id'],
      data: { role: 'Senior Platform Engineer', location: 'Cyberjaya' },
    });
    expect(res.status).toBe(201);
    const opp = await json(res);

    const updatedSig = await json(await app.request(`/api/signals/${sig['id']}`));
    expect(updatedSig['status']).toBe('PROMOTED');
    expect((updatedSig['data'] as Record<string, unknown>)['promoted_to']).toBe(opp['id']);
  });

  it('422 when signal_id does not reference a SIGNAL', async () => {
    const res = await postJson('/api/opportunities', {
      opportunity_type: 'JOB',
      signal_id: '01J0000000000000000000000X',
      data: { role: 'Nope' },
    });
    expect(res.status).toBe(422);
  });
});
