import { Hono } from 'hono';
import { getCtx } from './http-util.ts';

export const healthRoute = new Hono().get('/', (c) => {
  const { db } = getCtx(c);
  let dbStatus = 'connected';
  try {
    db.prepare('SELECT 1').get();
  } catch {
    dbStatus = 'error';
  }
  return c.json({ ok: true, version: '0.1.0', db: dbStatus });
});
