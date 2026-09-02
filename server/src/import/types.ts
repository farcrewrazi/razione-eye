/**
 * Import pipeline types (T1.1) — RawRecord is the loose per-format parser output;
 * NormalizedJob is the strict shape every format converges to before dedup/persist.
 */
import { z } from 'zod';

/** Loose superset — parsers emit this; unknown extra fields are preserved. */
export type RawRecord = Record<string, unknown>;

/** Strict normalized job record — the target of every parser. */
export const normalizedJobSchema = z
  .object({
    company: z.string().min(1),
    role: z.string().min(1),
    location: z.string().optional(),
    salary: z.string().optional(),
    salary_min: z.number().int().nonnegative().optional(),
    salary_max: z.number().int().nonnegative().optional(),
    url: z.string().optional(),
    source: z.string().optional(),
    stack: z.array(z.string()).optional(),
    notes: z.array(z.string()).optional(),
    discovered_at: z.string().optional(),
    contact: z
      .object({
        recruiter: z.string().optional(),
        linkedin: z.string().optional(),
        email: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type NormalizedJob = z.infer<typeof normalizedJobSchema>;

/** Incomplete record — flagged, never guessed (D-003). */
export interface FlaggedRecord {
  record: RawRecord;
  reason: string;
  signal_id?: string;
  file?: string;
}

export interface DuplicateEntry {
  /** Description of the kept (richest) record: "Company — Role". */
  kept: string;
  /** Description of the dropped duplicate. */
  dropped: string;
  file?: string;
  /**
   * 'batch' = duplicate within this import run (default, may be omitted);
   * 'existing' = matched an OPPORTUNITY already in the graph — skipped and merged
   * into it instead of creating a new node (idempotent re-import, T1.2).
   */
  reason?: 'batch' | 'existing';
}

export interface FileReport {
  path: string;
  format: 'json' | 'csv' | 'md' | 'chat';
  raw_records: number;
  normalized: number;
  flagged: FlaggedRecord[];
  duplicates: DuplicateEntry[];
}

export interface ImportReportData {
  ran_at: string;
  files: FileReport[];
  created: { opportunities: number; companies: number; edges: number };
  totals: { raw_records: number; normalized: number; flagged: number; duplicates: number };
}

export interface ImportFileInput {
  name: string;
  format: 'json' | 'csv' | 'md' | 'chat';
  content: string;
}
