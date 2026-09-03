import { Hono } from 'hono';
import {
  STATUS_BY_OPPORTUNITY_TYPE,
  appendNoteSchema,
  bandForScore,
  createOpportunitySchema,
  jobOpportunityDataSchema,
  opportunityTypeSchema,
  scoreBandSchema,
  updateOpportunitySchema,
  updateOpportunityStatusSchema,
  type Node,
  type OpportunityType,
} from '@razione-eye/shared';
import { getCtx, err } from './http-util.ts';
import { nodeEventsHandler } from './events.ts';
import { linkExistingOpportunityToSignal } from './signal-promotion.ts';
import { nowIso } from './ulid.ts';
import { boardStatusesForEye, JOB_PIPELINE_STATUSES, OPPORTUNITY_TYPES_BY_EYE, parseEyeQuery } from './eye.ts';

/** Validate status against the pipeline for this opportunity_type. */
function statusValidForType(opportunityType: string, status: string): boolean {
  const valid = STATUS_BY_OPPORTUNITY_TYPE[opportunityType as keyof typeof STATUS_BY_OPPORTUNITY_TYPE];
  return valid ? valid.includes(status) : false;
}

function validateOpportunityData(opportunityType: string, data: Record<string, unknown>): string | null {
  if (opportunityType === 'JOB') {
    const r = jobOpportunityDataSchema.safeParse(data);
    if (!r.success) return r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  }
  return null;
}

function withBand(node: Node): Node & { band: string } {
  return { ...node, band: bandForScore(node.score) };
}

export const opportunitiesRoute = new Hono()
  .get('/', (c) => {
    const { nodes } = getCtx(c);
    const q = c.req.query();

    // Eye scoping (docs/07 §Eye scoping). Invalid eye → 400 BAD_QUERY.
    // Explicit ?type= wins when both are given (a type is always within an eye).
    const eyeParsed = parseEyeQuery(q['eye']);
    if ('error' in eyeParsed) return err(c, 400, 'BAD_QUERY', eyeParsed.error);
    const eye = eyeParsed.eye;

    const oppTypeRaw = q['type'];
    if (oppTypeRaw && !opportunityTypeSchema.safeParse(oppTypeRaw).success) {
      return err(c, 400, 'BAD_QUERY', `invalid type: ${oppTypeRaw}`);
    }
    const oppType = (oppTypeRaw ?? null) as OpportunityType | null;
    const band = q['band'];
    if (band && !scoreBandSchema.safeParse(band).success) {
      return err(c, 400, 'BAD_QUERY', `invalid band: ${band}`);
    }

    // Band filtering is score-derived — over-fetch then filter in memory (fine for single-user scale).
    const limit = q['limit'] ? Number(q['limit']) : 50;
    const offset = q['offset'] ? Number(q['offset']) : 0;
    const overfetch = band ? { limit: 200, offset: 0 } : { limit, offset };

    // Scope: explicit type wins; otherwise the eye's opportunity types
    // (career/all/control with no type → no IN filter = legacy "everything").
    const eyeTypes = OPPORTUNITY_TYPES_BY_EYE[eye];
    const useTypesFilter = !oppType && eyeTypes.length > 0 && eye !== 'all' && eye !== 'control';

    const { items, total: _total } = nodes.list({
      type: 'OPPORTUNITY',
      ...(oppType ? { opportunity_type: oppType } : useTypesFilter ? { opportunity_types: eyeTypes } : {}),
      ...(q['status'] ? { status: q['status'] } : {}),
      ...(q['q'] ? { q: q['q'] } : {}),
      ...(q['sort'] ? { sort: q['sort'] } : {}),
      ...overfetch,
    });

    let filtered = items.map(withBand);
    if (band) filtered = filtered.filter((n: Node & { band: string }) => n.band === band);

    const paged = band ? filtered.slice(offset, offset + limit) : filtered;

    // board=true → grouped-by-status columns for the FE pipeline board.
    // Columns follow the explicit type when given, otherwise the eye's slice
    // (career/all/control default to JOB statuses — backward compatible).
    if (q['board'] === 'true') {
      const jobBoardDefault = eye === 'career' || eye === 'all' || eye === 'control';
      const statuses = oppType
        ? STATUS_BY_OPPORTUNITY_TYPE[oppType]
        : jobBoardDefault
          ? JOB_PIPELINE_STATUSES
          : boardStatusesForEye(eye);
      const columns = statuses.map((status) => ({
        status,
        items: filtered.filter((n) => n.status === status),
      }));
      return c.json({ columns, total: filtered.length });
    }

    return c.json({ items: paged, total: band ? filtered.length : _total });
  })
  .get('/:id/events', nodeEventsHandler('OPPORTUNITY'))
  .post('/:id/notes', async (c) => {
    const { nodes, events } = getCtx(c);
    const node = nodes.getById(c.req.param('id'));
    if (!node || node.type !== 'OPPORTUNITY') return err(c, 404, 'NOT_FOUND', 'opportunity not found');

    const body: unknown = await c.req.json().catch(() => null);
    const parsed = appendNoteSchema.safeParse(body);
    if (!parsed.success) {
      return err(c, 422, 'VALIDATION', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const note = { text: parsed.data.text, created_at: nowIso() };
    const updated = nodes.update(node.id, { notes: [...node.notes, note] });
    events.record({
      type: 'note_added',
      node_id: node.id,
      summary: `Note added to "${node.name ?? node.id}"`,
      data: { text: parsed.data.text },
    });
    return c.json(updated, 201);
  })
  .get('/:id', (c) => {
    const { nodes, edges } = getCtx(c);
    const node = nodes.getById(c.req.param('id'));
    if (!node || node.type !== 'OPPORTUNITY') return err(c, 404, 'NOT_FOUND', 'opportunity not found');

    const out = edges.outgoing(node.id);
    const inc = edges.incoming(node.id);
    const allEdges = [...out, ...inc];
    const neighbors = allEdges
      .map((e) => nodes.getById(e.from_id === node.id ? e.to_id : e.from_id))
      .filter((n): n is Node => n !== null);

    return c.json({ ...withBand(node), edges: allEdges, neighbors });
  })
  .post('/', async (c) => {
    const { nodes, edges, events } = getCtx(c);
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = createOpportunitySchema.safeParse(body);
    if (!parsed.success) {
      return err(c, 422, 'VALIDATION', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const input = parsed.data;

    const status = input.status ?? (input.opportunity_type === 'JOB' ? 'DISCOVERED' : input.opportunity_type === 'WEBSITE' || input.opportunity_type === 'CONSULTANCY' ? 'DISCOVERED_BUSINESS' : input.opportunity_type === 'AFFILIATE' ? 'IDEAS' : 'SIGNAL');
    if (!statusValidForType(input.opportunity_type, status)) {
      return err(c, 422, 'INVALID_STATUS', `status ${status} is not valid for opportunity_type ${input.opportunity_type}`);
    }
    const dataErr = validateOpportunityData(input.opportunity_type, input.data);
    if (dataErr) return err(c, 422, 'VALIDATION', dataErr);

    const score = input.score ?? (typeof input.data['opportunity_score'] === 'number' ? input.data['opportunity_score'] as number : null);
    const companyId = typeof input.data['company_id'] === 'string' ? input.data['company_id'] : null;

    const node = nodes.create({
      type: 'OPPORTUNITY',
      name: input.name ?? (typeof input.data['role'] === 'string' ? input.data['role'] : null),
      status,
      opportunity_type: input.opportunity_type,
      score,
      due_at: input.due_at ?? null,
      source: input.source ?? 'manual',
      tags: input.tags ?? [],
      notes: input.notes ?? [],
      data: input.data,
    });

    if (companyId) {
      const company = nodes.getById(companyId);
      if (company && company.type === 'COMPANY') {
        edges.belongsTo(node.id, company.id);
      }
    }

    events.record({
      type: 'opportunity_created',
      node_id: node.id,
      summary: `Opportunity "${node.name ?? node.id}" created (${status})`,
      data: { status, opportunity_type: input.opportunity_type, source: node.source },
    });

    // T1.1.6-BE: optional signal link-back — mark the source signal PROMOTED.
    if (input.signal_id) {
      const signal = nodes.getById(input.signal_id);
      if (!signal || signal.type !== 'SIGNAL') {
        return err(c, 422, 'VALIDATION', `signal_id ${input.signal_id} does not reference a SIGNAL node`);
      }
      linkExistingOpportunityToSignal(getCtx(c), signal, node);
    }

    return c.json(withBand(node), 201);
  })
  .patch('/:id', async (c) => {
    const { nodes } = getCtx(c);
    const node = nodes.getById(c.req.param('id'));
    if (!node || node.type !== 'OPPORTUNITY') return err(c, 404, 'NOT_FOUND', 'opportunity not found');

    const body: unknown = await c.req.json().catch(() => null);
    const parsed = updateOpportunitySchema.safeParse(body);
    if (!parsed.success) {
      return err(c, 422, 'VALIDATION', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const input = parsed.data;

    const newType = input.opportunity_type ?? node.opportunity_type!;
    const newStatus = input.status ?? node.status!;
    if (!statusValidForType(newType, newStatus)) {
      return err(c, 422, 'INVALID_STATUS', `status ${newStatus} is not valid for opportunity_type ${newType}`);
    }
    const mergedData = input.data ? { ...node.data, ...input.data } : node.data;
    const dataErr = validateOpportunityData(newType, mergedData);
    if (dataErr) return err(c, 422, 'VALIDATION', dataErr);

    const updated = nodes.update(node.id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.opportunity_type !== undefined ? { opportunity_type: input.opportunity_type } : {}),
      ...(input.score !== undefined ? { score: input.score } : {}),
      ...(input.due_at !== undefined ? { due_at: input.due_at } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      data: mergedData,
    });
    return c.json(withBand(updated!));
  })
  .patch('/:id/status', async (c) => {
    const { nodes, events } = getCtx(c);
    const node = nodes.getById(c.req.param('id'));
    if (!node || node.type !== 'OPPORTUNITY') return err(c, 404, 'NOT_FOUND', 'opportunity not found');

    const body: unknown = await c.req.json().catch(() => null);
    const parsed = updateOpportunityStatusSchema.safeParse(body);
    if (!parsed.success) {
      return err(c, 422, 'VALIDATION', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    if (!statusValidForType(node.opportunity_type!, parsed.data.status)) {
      return err(c, 422, 'INVALID_STATUS', `status ${parsed.data.status} is not valid for opportunity_type ${node.opportunity_type}`);
    }
    const previous = node.status;
    const updated = nodes.update(node.id, { status: parsed.data.status });
    events.record({
      type: 'status_changed',
      node_id: node.id,
      summary: `"${node.name ?? node.id}": ${previous} → ${parsed.data.status}`,
      data: { from: previous, to: parsed.data.status },
    });
    return c.json(withBand(updated!));
  });
