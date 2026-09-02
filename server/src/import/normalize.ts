/**
 * Normalization (T1.1.4) — RawRecord[] → NormalizedJob[] + flagged stragglers.
 * Incomplete records (missing company OR role) are flagged, never guessed (D-003).
 */
import { normalizedJobSchema, type FlaggedRecord, type NormalizedJob, type RawRecord } from './types.ts';

const ALIASES: Record<string, keyof NormalizedJob | 'ignore'> = {
  company: 'company',
  company_name: 'company',
  employer: 'company',
  org: 'company',
  organization: 'company',
  organisation: 'company',
  role: 'role',
  job_title: 'role',
  title: 'role',
  position: 'role',
  job: 'role',
  location: 'location',
  loc: 'location',
  city: 'location',
  area: 'location',
  salary: 'salary',
  pay: 'salary',
  compensation: 'salary',
  salary_range: 'salary',
  url: 'url',
  link: 'url',
  apply_url: 'url',
  apply: 'url',
  posting_url: 'url',
  job_url: 'url',
  source: 'source',
  via: 'source',
  platform: 'source',
  found_on: 'source',
  stack: 'stack',
  tech: 'stack',
  tech_stack: 'stack',
  techstack: 'stack',
  technologies: 'stack',
  skills: 'stack',
  notes: 'notes',
  note: 'notes',
  remarks: 'notes',
  comments: 'notes',
  description: 'notes',
  discovered_at: 'discovered_at',
  date_found: 'discovered_at',
  posted: 'discovered_at',
  posted_at: 'discovered_at',
  date: 'discovered_at',
  found: 'discovered_at',
  contact: 'contact',
  recruiter: 'contact',
  contact_person: 'contact',
  salary_min: 'salary_min',
  salary_max: 'salary_max',
  min_salary: 'salary_min',
  max_salary: 'salary_max',
};

export interface NormalizeResult {
  jobs: NormalizedJob[];
  flagged: FlaggedRecord[];
}

export function normalizeRecords(records: RawRecord[], file?: string): NormalizeResult {
  const jobs: NormalizedJob[] = [];
  const flagged: FlaggedRecord[] = [];

  for (const raw of records) {
    const mapped = mapRecord(raw);
    const reasons: string[] = [];

    const company = cleanString(mapped['company']);
    const role = cleanString(mapped['role']);
    if (!company) reasons.push('missing company');
    if (!role) reasons.push('missing role');

    if (reasons.length > 0) {
      flagged.push({ record: raw, reason: reasons.join('; '), ...(file ? { file } : {}) });
      continue;
    }

    const job: Record<string, unknown> = { company: company!, role: role! };

    const location = cleanString(mapped['location']);
    if (location) job['location'] = location;

    const salaryRaw = cleanString(mapped['salary']);
    if (salaryRaw) job['salary'] = salaryRaw;
    const range = parseSalary(salaryRaw);
    const explicitMin = toNumber(mapped['salary_min']);
    const explicitMax = toNumber(mapped['salary_max']);
    const salaryMin = explicitMin ?? range?.min;
    const salaryMax = explicitMax ?? range?.max;
    if (salaryMin !== undefined) job['salary_min'] = salaryMin;
    if (salaryMax !== undefined) job['salary_max'] = salaryMax;

    const url = cleanString(mapped['url']);
    if (url && /^https?:\/\//i.test(url)) job['url'] = url;

    const source = cleanString(mapped['source']);
    if (source) job['source'] = source;

    const stack = splitStack(mapped['stack']);
    if (stack.length > 0) job['stack'] = stack;

    const notes = splitNotes(mapped['notes']);
    if (notes.length > 0) job['notes'] = notes;

    const discoveredAt = cleanString(mapped['discovered_at']);
    if (discoveredAt) job['discovered_at'] = discoveredAt;

    const contact = cleanContact(mapped['contact']);
    if (contact) job['contact'] = contact;

    const parsed = normalizedJobSchema.safeParse(job);
    if (parsed.success) {
      jobs.push(parsed.data);
    } else {
      flagged.push({
        record: raw,
        reason: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        ...(file ? { file } : {}),
      });
    }
  }

  return { jobs, flagged };
}

// ── Field mapping ────────────────────────────────────────────────────────────

function mapRecord(raw: RawRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const norm = key.toLowerCase().trim().replace(/[\s-]+/g, '_');
    const target = ALIASES[norm];
    if (!target || target === 'ignore') continue;
    // First non-empty wins; merge notes-ish fields.
    if (out[target] === undefined || out[target] === '') {
      out[target] = value;
    } else if (target === 'notes' && value !== '') {
      const prev = Array.isArray(out[target]) ? (out[target] as unknown[]) : [out[target]];
      out[target] = [...prev, value];
    }
  }
  return out;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    if (typeof value === 'number') return String(value);
    return undefined;
  }
  const v = value.trim();
  return v.length > 0 ? v : undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.trunc(value);
  if (typeof value === 'string') {
    const parsed = parseSalary(value);
    if (parsed) return parsed.min;
    const n = Number(value.replace(/[^\d.]/g, ''));
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  return undefined;
}

// ── Salary parsing ───────────────────────────────────────────────────────────

export interface SalaryRange {
  min: number;
  max?: number;
}

/**
 * "RM12k-RM16k" → {12000,16000} · "RM12,000 – RM16,000" → same · "12k" → {12000} ·
 * "RM 15,000/month" → {15000}. Returns null when no number is found (flagged upstream,
 * never guessed).
 */
export function parseSalary(raw: string | undefined): SalaryRange | null {
  if (!raw) return null;
  const text = raw.toLowerCase().replace(/,/g, '');

  const amounts: number[] = [];
  const re = /(?:rm|myr)?\s*(\d+(?:\.\d+)?)\s*(k)?\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const base = Number(m[1]!);
    if (!Number.isFinite(base) || base <= 0) continue;
    const hasK = m[2] === 'k';
    // Bare small numbers without a currency marker are ambiguous ("12 000" vs "12") —
    // treat ≤100 as k-notation only when a currency hint exists in the string.
    const hasCurrency = /rm|myr/.test(text);
    const value = hasK || (base <= 100 && hasCurrency) || (base <= 100 && /k/.test(text)) ? base * 1000 : base;
    amounts.push(Math.trunc(value));
    if (amounts.length >= 2) break;
  }

  if (amounts.length === 0) return null;
  const first = amounts[0]!;
  if (amounts.length === 1) {
    return first > 0 ? { min: first } : null;
  }
  const second = amounts[1]!;
  return second > first ? { min: first, max: second } : { min: second, max: first };
}

// ── Stack / notes splitting ──────────────────────────────────────────────────

const STACK_SPLIT_RE = /\s*(?:,|;|•|\||\/|\band\b)\s*/i;

export function splitStack(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((v) => splitStack(v));
  }
  if (typeof value !== 'string') return [];
  return value
    .split(STACK_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 60);
}

function splitNotes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((v) => splitNotes(v));
  }
  if (typeof value !== 'string') return [];
  const v = value.trim();
  return v ? [v] : [];
}

function cleanContact(value: unknown): NormalizedJob['contact'] | undefined {
  if (typeof value === 'string') {
    const v = value.trim();
    return v ? { recruiter: v } : undefined;
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const contact: Record<string, string> = {};
    for (const key of ['recruiter', 'linkedin', 'email'] as const) {
      const v = cleanString(obj[key]);
      if (v) contact[key] = v;
    }
    return Object.keys(contact).length > 0 ? contact : undefined;
  }
  return undefined;
}
