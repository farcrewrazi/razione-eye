/**
 * Business-prospect import (EYE-5) — the 30 SME pitch prospects from the
 * planer campaign, landed on the existing graph model (no new tables):
 *
 *   prospect = COMPANY (name, location; industry/segment/website/size/entity_type
 *              in data) + ONE business OPPORTUNITY (opportunity_type WEBSITE or
 *              CONSULTANCY, status PROBLEM_IDENTIFIED, score = opportunity_score)
 *              with `offered_by → RaziSurf` and `belongs_to → COMPANY`. The
 *              detected problem lives in `data.problems_detected[]` (no PROBLEM
 *              nodes — 30 one-off problems add no reusable graph structure).
 *
 * The JOB pipeline (import-pipeline.ts) is untouched — it hardcodes
 * opportunity_type JOB / status DISCOVERED and role-shaped dedup keys, which
 * would flag every prospect as incomplete. This module reuses the same
 * primitives (normalizeCompanyName, NodesRepo, EdgesRepo.ensure, an
 * ImportReportData-shaped run report recorded as `import_run`) so the run is
 * idempotent: existing companies and business opportunities are matched by
 * normalized name and skipped (duplicates, reason 'existing'), never re-created.
 *
 * Input: server/fixtures/prospects-final-30.json (12-final-30.json) merged by
 * exact name with prospects-final-30-agentic-ranked.json
 * (22-final-30-agentic-ranked.json) for agentic_fit / suggested_agentic_offer.
 */
import { z } from 'zod';
import type { Node } from '@razione-eye/shared';
import { prospectBandSchema } from '@razione-eye/shared';
import type { AppContext } from '../context.ts';
import { nowIso } from '../ulid.ts';
import { PROFILE_PERSON_NAME, RAZISURF_NAME } from '../seed-service.ts';
import { normalizeCompanyName } from './dedup.ts';
import type { FileReport, ImportReportData } from './types.ts';

export const BASE_FILE_NAME = 'prospects-final-30.json';
export const AGENTIC_FILE_NAME = 'prospects-final-30-agentic.json';

/** One merged prospect record: 12-final-30 + its agentic-ranked counterpart. */
export const prospectRecordSchema = z
  .object({
    name: z.string().min(1),
    category: z.string().min(1),
    location: z.string().min(1),
    entity_type: z.string().min(1),
    website: z.string().min(1),
    size: z.string().min(1),
    fit_reason: z.string().min(1),
    source: z.string().min(1),
    opportunity_score: z.number().int().min(0).max(100),
    sub_scores: z.object({
      problem_severity: z.number(),
      budget_hint: z.number(),
      reachability: z.number(),
      fit: z.number(),
    }),
    category_group: z.string().min(1),
    band: prospectBandSchema,
    rank: z.number().int().min(1),
    agentic_fit: z.number().int().min(0).max(100),
    suggested_agentic_offer: z.string().min(1),
  })
  .passthrough();

export type ProspectRecord = z.infer<typeof prospectRecordSchema>;

/**
 * EYE-5 classification (approved): WEBSITE when the primary detected problem is
 * the site itself (missing, broken, stale, template residue); CONSULTANCY when
 * a site exists and the gap is a manual process (booking, registration,
 * enrolment, portal, lead handling). Keyed by exact prospect name — an
 * unclassified name aborts the import instead of guessing.
 */
export const OPPORTUNITY_TYPE_BY_COMPANY: Record<string, 'WEBSITE' | 'CONSULTANCY'> = {
  // CONSULTANCY (12) — site exists; the gap is a process/system.
  'Egen Event Sdn Bhd (Event Company KL)': 'CONSULTANCY', // templated site; gap = online registration
  'Rimau Sports / Rimau Running': 'CONSULTANCY', // Shopee + self-built form; gap = registration system
  'PHYSIOGO Cyberjaya': 'CONSULTANCY', // WhatsApp-only booking across branches
  'Anggun Aesthetic Clinic (Cyberjaya)': 'CONSULTANCY', // static site; gap = booking/consent management
  'Lumen Sports Sdn Bhd': 'CONSULTANCY', // Wix site; gap = owned registration
  'Klinik Pergigian My Dental Care Cyberjaya': 'CONSULTANCY', // gap = central booking/patient portal
  'Kolej Mutiara': 'CONSULTANCY', // Apply Now → WhatsApp; enrolment intake
  Mybesthome2u: 'CONSULTANCY', // gap = enquiry/booking + lead follow-up
  'Pusat Tuisyen Warna Cemerlang': 'CONSULTANCY', // WhatsApp-only conversion path
  'Panda Education Center': 'CONSULTANCY', // has site+app+LMS; gap = maintenance
  'EUMA.Properties (Esp Properties Sdn Bhd)': 'CONSULTANCY', // gap = statements + tenant/landlord portals
  'Ridge Property Management Sdn Bhd': 'CONSULTANCY', // brochure site; gap = client portal
  // WEBSITE (18) — the site itself is the problem.
  'Klinik Pergigian Shiny Teeth Dental': 'WEBSITE', // zero owned web presence
  'M Sports Sdn Bhd (MSPORTS)': 'WEBSITE', // stale WordPress, 2018 events
  'Zues Event Sdn Bhd': 'WEBSITE', // placeholder blog, outdated news
  'Naisc Global (Naisc Event)': 'WEBSITE', // half-edited placeholder stats
  'Klinik Pergigian Dental Place Cyberjaya': 'WEBSITE', // no real website
  'Klinik Pergigian Kee (Kee Dental Surgery)': 'WEBSITE', // no owned website
  'PutraMedic Physiotherapy Centre': 'WEBSITE', // no website at all
  'Lanai Asmara Event Management Sdn Bhd': 'WEBSITE', // template site, WhatsApp bookings
  'Tetrad Event Empire (TETRAD)': 'WEBSITE', // no owned site, all on third-party portals
  'Klinik Haiwan Dan Surgeri Hajraa': 'WEBSITE', // none, Gmail/phone only
  'Klinik Pergigian Suriani': 'WEBSITE', // no website
  'Omni Mediaworks Sdn Bhd': 'WEBSITE', // Instagram only; site-build target
  'Pusat Tuisyen Bestari Didik': 'WEBSITE', // WordPress template residue
  'Star Physio Service / Prophysio Centre': 'WEBSITE', // site effectively broken
  'InControl Group Sdn Bhd (APEX Team Building)': 'WEBSITE', // broken build
  'Memoires Events Management Sdn Bhd': 'WEBSITE', // minimal/thin site
  'BOLT Event Management (Bolt 360 Management Sdn Bhd)': 'WEBSITE', // needs maintained race microsites
  'ACR Property PLT': 'WEBSITE', // free Google Sites page only
};

export function opportunityTypeForProspect(name: string): 'WEBSITE' | 'CONSULTANCY' {
  const type = OPPORTUNITY_TYPE_BY_COMPANY[name];
  if (!type) throw new Error(`prospect "${name}" has no WEBSITE/CONSULTANCY classification`);
  return type;
}

/**
 * Merge the base file with its agentic-ranked counterpart (matched by exact
 * name) and validate. Any unmatched record on either side is a hard error —
 * no silent partial import.
 */
export function loadProspectsFromContents(baseJson: string, agenticJson: string): ProspectRecord[] {
  const base: unknown = JSON.parse(baseJson);
  const agentic: unknown = JSON.parse(agenticJson);
  if (!Array.isArray(base) || !Array.isArray(agentic)) {
    throw new Error('both prospect files must be JSON arrays');
  }

  const agenticByName = new Map<string, Record<string, unknown>>();
  for (const raw of agentic) {
    const rec = raw as Record<string, unknown>;
    if (typeof rec['name'] !== 'string') throw new Error('agentic record without a name');
    if (agenticByName.has(rec['name'])) throw new Error(`duplicate agentic record: ${rec['name']}`);
    agenticByName.set(rec['name'], rec);
  }

  const prospects: ProspectRecord[] = [];
  const seen = new Set<string>();
  for (const raw of base) {
    const rec = raw as Record<string, unknown>;
    const name = rec['name'];
    if (typeof name !== 'string') throw new Error('base record without a name');
    if (seen.has(name)) throw new Error(`duplicate base record: ${name}`);
    seen.add(name);
    const agenticRec = agenticByName.get(name);
    if (!agenticRec) throw new Error(`prospect "${name}" has no agentic-ranked counterpart`);
    const parsed = prospectRecordSchema.safeParse({ ...rec, ...pickAgentic(agenticRec) });
    if (!parsed.success) {
      throw new Error(`prospect "${name}" failed validation: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    }
    prospects.push(parsed.data);
  }

  for (const name of agenticByName.keys()) {
    if (!seen.has(name)) throw new Error(`agentic record "${name}" has no base counterpart`);
  }
  if (prospects.length !== 30) {
    throw new Error(`expected 30 prospects, got ${prospects.length}`);
  }
  // Fail fast on classification drift — every prospect must be in the map.
  for (const p of prospects) opportunityTypeForProspect(p.name);
  return prospects;
}

function pickAgentic(rec: Record<string, unknown>): Record<string, unknown> {
  return {
    agentic_fit: rec['agentic_fit'],
    suggested_agentic_offer: rec['suggested_agentic_offer'],
  };
}

/** Normalized company name of an existing business OPPORTUNITY (idempotent re-run key). */
async function businessOppKeyOf(ctx: AppContext, opp: Node): Promise<string | null> {
  const company = opp.data['company'];
  if (typeof company === 'string' && company !== '') return normalizeCompanyName(company);
  const linked = await ctx.edges.outgoing(opp.id, 'belongs_to');
  if (linked.length > 0) {
    const companyNode = await ctx.nodes.getById(linked[0]!.to_id);
    if (companyNode?.name) return normalizeCompanyName(companyNode.name);
  }
  if (opp.name) return normalizeCompanyName(opp.name.split(' — ')[0]!);
  return null;
}

/** RaziSurf (+ Farcrew Razi ── owns ──► RaziSurf), created only if missing. */
async function ensureRazisurf(
  ctx: AppContext,
): Promise<{ razisurfId: string; createdCompanies: number; createdEdges: number }> {
  let razisurf = await ctx.nodes.findByTypeAndName('COMPANY', RAZISURF_NAME);
  let createdCompanies = 0;
  if (!razisurf) {
    // Same shape the seed creates — the two stay interchangeable.
    razisurf = await ctx.nodes.create({
      type: 'COMPANY',
      name: RAZISURF_NAME,
      source: 'seed',
      tags: ['owner', 'business-entity'],
      data: {
        industry: 'Software / digital services',
        location: 'Cyberjaya',
        ai_culture_notes: ['AI-native delivery'],
      },
    });
    createdCompanies = 1;
  }
  let profile = await ctx.nodes.findByTypeAndName('PERSON', PROFILE_PERSON_NAME);
  if (!profile) {
    profile = await ctx.nodes.create({
      type: 'PERSON',
      name: PROFILE_PERSON_NAME,
      source: 'seed',
      tags: ['owner'],
      data: { full_name: PROFILE_PERSON_NAME },
    });
  }
  let createdEdges = 0;
  if (!(await ctx.edges.exists(profile.id, razisurf.id, 'owns'))) {
    await ctx.edges.owns(profile.id, razisurf.id);
    createdEdges = 1;
  }
  return { razisurfId: razisurf.id, createdCompanies, createdEdges };
}

/**
 * Import (or skip) all 30 prospects. Idempotent: a prospect whose company
 * already has a business OPPORTUNITY (matched by normalized company name) is
 * reported as a duplicate with reason 'existing' and left untouched.
 */
export async function runProspectImport(ctx: AppContext, prospects: ProspectRecord[]): Promise<ImportReportData> {
  const { nodes, edges, events } = ctx;

  const owner = await ensureRazisurf(ctx);
  let createdCompanies = owner.createdCompanies;
  let createdEdges = owner.createdEdges;

  // Existing state for idempotent re-runs. 200 is the repo cap (single-user
  // scale); the live graph holds ~60 opportunities / ~60 companies today.
  const existingByKey = new Map<string, Node>();
  for (const type of ['WEBSITE', 'CONSULTANCY'] as const) {
    const { items } = await nodes.list({ type: 'OPPORTUNITY', opportunity_type: type, limit: 200 });
    for (const opp of items) {
      const key = await businessOppKeyOf(ctx, opp);
      if (key) existingByKey.set(key, opp);
    }
  }
  const companyByKey = new Map<string, Node>();
  {
    const { items } = await nodes.list({ type: 'COMPANY', limit: 200 });
    for (const company of items) {
      if (company.name) companyByKey.set(normalizeCompanyName(company.name), company);
    }
  }

  const duplicates: FileReport['duplicates'] = [];
  let createdOpportunities = 0;

  for (const prospect of prospects) {
    const key = normalizeCompanyName(prospect.name);
    const existing = existingByKey.get(key);
    if (existing) {
      duplicates.push({
        kept: existing.name ?? prospect.name,
        dropped: prospect.name,
        reason: 'existing',
        file: BASE_FILE_NAME,
      });
      continue;
    }

    let company = companyByKey.get(key);
    const companyIsNew = company === undefined;
    if (!company) {
      company = await nodes.create({
        type: 'COMPANY',
        name: prospect.name,
        source: 'import',
        tags: ['imported', 'prospect'],
        data: {
          industry: prospect.category,
          segment: prospect.category_group,
          location: prospect.location,
          website: prospect.website,
          size: prospect.size,
          entity_type: prospect.entity_type,
        },
      });
      companyByKey.set(key, company);
    }
    if (companyIsNew) createdCompanies++;

    const opportunityType = opportunityTypeForProspect(prospect.name);
    const opportunity = await nodes.create({
      type: 'OPPORTUNITY',
      name: `${prospect.name} — ${opportunityType === 'WEBSITE' ? 'Website' : 'Consultancy'} opportunity`,
      status: 'PROBLEM_IDENTIFIED',
      opportunity_type: opportunityType,
      score: prospect.opportunity_score,
      source: 'import',
      tags: ['imported', 'prospect'],
      data: {
        company: prospect.name,
        company_id: company.id,
        sub_scores: prospect.sub_scores,
        band: prospect.band,
        segment: prospect.category_group,
        agentic_fit: prospect.agentic_fit,
        suggested_agentic_offer: prospect.suggested_agentic_offer,
        source_url: prospect.source,
        fit_reason: prospect.fit_reason,
        problems_detected: [prospect.fit_reason],
        rank: prospect.rank,
        import_file: BASE_FILE_NAME,
      },
    });
    createdOpportunities++;

    await edges.belongsTo(opportunity.id, company.id);
    await edges.ensure(opportunity.id, owner.razisurfId, 'offered_by');
    createdEdges += 2;

    await events.record({
      type: 'opportunity_imported',
      node_id: opportunity.id,
      summary: `Imported ${opportunityType.toLowerCase()} prospect ${prospect.name} (rank ${prospect.rank}, ${prospect.band})`,
      data: {
        file: BASE_FILE_NAME,
        company_id: company.id,
        opportunity_type: opportunityType,
        band: prospect.band,
        rank: prospect.rank,
      },
    });
  }

  const report: ImportReportData = {
    ran_at: nowIso(),
    files: [
      {
        path: `${BASE_FILE_NAME} (+ ${AGENTIC_FILE_NAME})`,
        format: 'json',
        raw_records: prospects.length,
        normalized: prospects.length,
        flagged: [],
        duplicates,
      },
    ],
    created: { opportunities: createdOpportunities, companies: createdCompanies, edges: createdEdges },
    totals: {
      raw_records: prospects.length,
      normalized: prospects.length,
      flagged: 0,
      duplicates: duplicates.length,
    },
  };

  await events.record({
    type: 'import_run',
    summary: `Prospect import run: ${report.totals.raw_records} prospects → ${createdOpportunities} created, ${report.totals.duplicates} already existing`,
    data: report as unknown as Record<string, unknown>,
  });

  return report;
}
