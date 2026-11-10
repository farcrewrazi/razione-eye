/**
 * Single-operator session auth.
 *
 * The Eye dashboard is a private command centre, so every /api/* route needs a
 * signed session cookie. No browser popup, no third-party identity provider —
 * one operator, one password.
 *
 * Two deliberate exceptions keep the machine path alive:
 *   • /api/health stays public (container healthchecks, uptime probes).
 *   • Requests carrying X-Eye-Service-Token: EYE_SERVICE_TOKEN skip the cookie,
 *     because the Career Eye cron on RaziOneMainServer imports and scores jobs
 *     headlessly every morning and has no browser to log in with. A shared
 *     secret beats trusting a source IP — source addresses can be spoofed in a
 *     forwarded header, a 256-bit token cannot.
 *
 * Credentials come from env only (EYE_AUTH_USER, EYE_AUTH_PASSWORD, and
 * EYE_SESSION_SECRET for signing). When they are absent the API refuses every
 * login instead of falling back to a default password.
 */
import { Hono, type MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'eye_session';

/** 7 days — long enough not to nag daily, short enough to age out. */
const TTL_SECONDS = 60 * 60 * 24 * 7;
const ATTEMPT_LIMIT = 8;
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;

const AUTH_USER = (process.env.EYE_AUTH_USER ?? '').trim();
const AUTH_PASSWORD = process.env.EYE_AUTH_PASSWORD ?? '';
const SESSION_SECRET = process.env.EYE_SESSION_SECRET ?? '';
const SERVICE_TOKEN = (process.env.EYE_SERVICE_TOKEN ?? '').trim();

/** Reachable without a session: health only. */
const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/login', '/api/auth/logout']);

interface Session {
  user: string;
  exp: number;
}

interface Attempt {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, Attempt>();

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Compare two secrets without leaking length or prefix through timing. */
function constantTimeEquals(left: string, right: string): boolean {
  return timingSafeEqual(digest(left), digest(right));
}

function sign(body: string): string {
  return createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
}

export function issueToken(user: string, now: number = Date.now()): string {
  const body = Buffer.from(
    JSON.stringify({ user, exp: Math.floor(now / 1000) + TTL_SECONDS }),
    'utf8',
  ).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string): Session | null {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = sign(body);
  if (expected.length !== signature.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      user?: unknown;
      exp?: unknown;
    };
    if (typeof parsed.user !== 'string' || typeof parsed.exp !== 'number') return null;
    if (parsed.exp * 1000 < Date.now()) return null;
    return { user: parsed.user, exp: parsed.exp };
  } catch {
    return null;
  }
}

/** Best-effort client IP for throttling only — never used as a trust signal. */
function clientIp(headers: Headers): string {
  const real = headers.get('x-real-ip')?.trim();
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (real || forwarded || '').replace(/^::ffff:/, '');
}

/** Machine caller (the daily cron) proves itself with a shared secret. */
function hasServiceToken(headers: Headers): boolean {
  if (SERVICE_TOKEN === '') return false;
  const presented = headers.get('x-eye-service-token')?.trim() ?? '';
  return presented !== '' && constantTimeEquals(presented, SERVICE_TOKEN);
}

function isThrottled(ip: string): boolean {
  const entry = attempts.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    attempts.delete(ip);
    return false;
  }
  return entry.count >= ATTEMPT_LIMIT;
}

function recordFailure(ip: string): void {
  const entry = attempts.get(ip);
  if (!entry || Date.now() > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: Date.now() + ATTEMPT_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

function authConfigured(): boolean {
  return AUTH_USER !== '' && AUTH_PASSWORD !== '' && SESSION_SECRET !== '';
}

/**
 * Reject anything without a valid session, except health and trusted machine
 * callers. Mounted once, before the API routes.
 */
export function sessionGuard(): MiddlewareHandler {
  return async (c, next) => {
    if (PUBLIC_PATHS.has(c.req.path)) return next();
    if (hasServiceToken(c.req.raw.headers)) return next();

    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      const session = verifyToken(token);
      if (session) {
        c.set('session', session);
        return next();
      }
    }

    return c.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } },
      401,
    );
  };
}

export const authRoute = new Hono()
  .post('/login', async (c) => {
    if (!authConfigured()) {
      return c.json(
        {
          error: {
            code: 'AUTH_NOT_CONFIGURED',
            message: 'Login is not configured on this server (EYE_AUTH_* env missing).',
          },
        },
        503,
      );
    }

    const ip = clientIp(c.req.raw.headers) || 'unknown';
    if (isThrottled(ip)) {
      return c.json(
        {
          error: {
            code: 'TOO_MANY_ATTEMPTS',
            message: 'Too many attempts. Wait five minutes and try again.',
          },
        },
        429,
      );
    }

    const body = (await c.req.json().catch(() => null)) as {
      username?: unknown;
      password?: unknown;
    } | null;
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    const userOk = username !== '' && constantTimeEquals(username, AUTH_USER);
    const passOk = password !== '' && constantTimeEquals(password, AUTH_PASSWORD);
    if (!userOk || !passOk) {
      recordFailure(ip);
      return c.json(
        { error: { code: 'INVALID_CREDENTIALS', message: 'Wrong username or password.' } },
        401,
      );
    }

    attempts.delete(ip);
    setCookie(c, SESSION_COOKIE, issueToken(AUTH_USER), {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: TTL_SECONDS,
    });
    return c.json({ user: AUTH_USER });
  })
  .post('/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  })
  .get('/me', (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    const session = token ? verifyToken(token) : null;
    if (session) return c.json({ authenticated: true, user: session.user });
    if (hasServiceToken(c.req.raw.headers)) {
      return c.json({ authenticated: true, user: 'machine' });
    }
    return c.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Not signed in.' } },
      401,
    );
  });
