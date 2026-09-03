import { Hono } from 'hono';
import { getCtx } from './http-util.ts';
import { pipelineRanking } from './agents/run-service.ts';

/** T1.4 — ranked pipeline convenience projection for the FE (score DESC). */
export const pipelineRoute = new Hono().get('/ranking', (c) => {
  const ctx = getCtx(c);
  return c.json(pipelineRanking(ctx));
});
