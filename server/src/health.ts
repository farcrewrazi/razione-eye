import { Hono } from 'hono';
import { getCtx } from './http-util.ts';

export const healthRoute = new Hono().get('/', async (c) => {
  const { db } = getCtx(c);
  let dbStatus = 'connected';
  try {
    await db.query('SELECT 1');
  } catch {
    dbStatus = 'error';
  }
  return c.json({ ok: true, version: '0.1.0', db: dbStatus });
});
