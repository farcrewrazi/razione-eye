/**
 * Dedup pass (T1.1.5) — same company+role+source → keep the richest record,
 * record the rest as duplicates (provenance goes onto the primary as a note).
 *
 * Company keys: lowercase, strip punctuation, strip legal suffixes (Sdn Bhd, Bhd,
 * Pty, Ltd, LLC, Inc, S/A, Corp, Co). Role keys: lowercase + seniority words removed.
 */
import type { DuplicateEntry, NormalizedJob } from './types.ts';

const COMPANY_SUFFIXES = [
  'sdn bhd',
  'sdn. bhd.',
  'bhd',
  'pty ltd',
  'pty',
  'ltd',
  'llc',
  'llp',
  'inc',
  's/a',
  'sa',
  'corp',
  'corporation',
  'co',
  'gmbh',
  'plc',
  'limited',
  'berhad',
] as const;

const SENIORITY_WORDS = new Set([
  'senior', 'sr', 'junior', 'jr', 'lead', 'principal', 'staff', 'mid', 'level',
  'head', 'chief', 'associate', 'intern', 'graduate',
]);

export function normalizeCompanyName(name: string): string {
  let key = name.toLowerCase();
  key = key.replace(/[.,'"()&@!]/g, ' ').replace(/[-_/]/g, ' ');
  key = key.replace(/\s+/g, ' ').trim();
  // Strip suffixes repeatedly ("Acme Sdn Bhd" → "acme", "Acme Corp Ltd" → "acme").
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of COMPANY_SUFFIXES) {
      const tail = ` ${suffix.replace(/[.]/g, '')}`;
      const plainSuffix = suffix.replace(/[.]/g, '');
      if (key === plainSuffix) break; // never strip the whole name
      if (key.endsWith(tail)) {
        key = key.slice(0, key.length - tail.length).trim();
        changed = true;
      }
    }
  }
  return key;
}

export function normalizeRoleTitle(role: string): string {
  const words = role
    .toLowerCase()
    .replace(/[.,'"()&]/g, ' ')
    .replace(/[-_/]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !SENIORITY_WORDS.has(w));
  return words.join(' ');
}

export function normalizeSourceName(source: string | undefined): string {
  if (!source) return 'unknown';
  return source.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function dedupKey(job: NormalizedJob): string {
  return [
    normalizeCompanyName(job.company),
    normalizeRoleTitle(job.role),
    normalizeSourceName(job.source),
  ].join('|');
}

/** Field-richness score — the richest record wins. */
export function richness(job: NormalizedJob): number {
  let score = 0;
  const fields: Array<unknown> = [
    job.location,
    job.salary,
    job.salary_min,
    job.salary_max,
    job.url,
    job.source,
    job.discovered_at,
    job.contact,
  ];
  for (const f of fields) if (f !== undefined && f !== null && f !== '') score++;
  if (job.stack && job.stack.length > 0) score += job.stack.length;
  if (job.notes && job.notes.length > 0) score += job.notes.length;
  return score;
}

export interface DedupResult {
  kept: NormalizedJob[];
  duplicates: DuplicateEntry[];
}

export function dedupJobs(jobs: NormalizedJob[], file?: string): DedupResult {
  const byKey = new Map<string, NormalizedJob[]>();
  for (const job of jobs) {
    const key = dedupKey(job);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(job);
    else byKey.set(key, [job]);
  }

  const kept: NormalizedJob[] = [];
  const duplicates: DuplicateEntry[] = [];

  for (const bucket of byKey.values()) {
    if (bucket.length === 1) {
      kept.push(bucket[0]!);
      continue;
    }
    const sorted = [...bucket].sort((a, b) => richness(b) - richness(a));
    const primary = sorted[0]!;
    kept.push(primary);
    for (const dup of sorted.slice(1)) {
      duplicates.push({
        kept: describe(primary),
        dropped: describe(dup),
        reason: 'batch',
        ...(file ? { file } : {}),
      });
    }
  }

  return { kept, duplicates };
}

export function describe(job: NormalizedJob): string {
  return `${job.company} — ${job.role}`;
}
