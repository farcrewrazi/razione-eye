import type { Context } from 'hono';
import type { ErrorEnvelope } from '@razione-eye/shared';
import type { AppContext } from './context.ts';

export function getCtx(c: Context): AppContext {
  return c.get('ctx');
}

export function err(c: Context, status: 400 | 404 | 409 | 422 | 500, code: string, message: string) {
  const body: ErrorEnvelope = { error: { code, message } };
  return c.json(body, status);
}
