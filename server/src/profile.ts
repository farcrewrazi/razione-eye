import { Hono } from 'hono';
import { personDataSchema, updateProfileSchema } from '@razione-eye/shared';
import { getCtx, err } from './http-util.ts';
import { nowIso } from './ulid.ts';

export const PROFILE_PERSON_NAME = 'Farcrew Razi';

export const profileRoute = new Hono()
  .get('/', (c) => {
    const { nodes } = getCtx(c);
    const profile = nodes.findByTypeAndName('PERSON', PROFILE_PERSON_NAME);
    if (!profile) return err(c, 404, 'NOT_FOUND', 'profile not found — run the seed');
    return c.json(profile);
  })
  .put('/', async (c) => {
    const { nodes } = getCtx(c);
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return err(c, 422, 'VALIDATION', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    let profile = nodes.findByTypeAndName('PERSON', PROFILE_PERSON_NAME);
    if (!profile) {
      // Find-or-create by convention (single profile owned by seed).
      const data = personDataSchema.parse({ full_name: PROFILE_PERSON_NAME, ...parsed.data });
      profile = nodes.create({
        type: 'PERSON',
        name: PROFILE_PERSON_NAME,
        source: 'manual',
        tags: parsed.data.tags ?? [],
        notes: parsed.data.notes ?? [],
        data,
      });
      return c.json(profile, 200);
    }
    const { tags, notes, ...dataPatch } = parsed.data;
    const mergedData = { ...profile.data, ...dataPatch };
    personDataSchema.parse(mergedData); // validate the merged result
    const updated = nodes.update(profile.id, {
      data: mergedData,
      name: (mergedData.full_name as string) ?? PROFILE_PERSON_NAME,
      ...(tags !== undefined ? { tags } : {}),
      ...(notes !== undefined ? { notes } : {}),
    });
    void nowIso; // updated_at maintained inside repo
    return c.json(updated);
  });
