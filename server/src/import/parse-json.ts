/**
 * JSON importer (T1.1.1) — structured job data in three shapes:
 *   1. Array of job objects:               [ {...}, {...} ]
 *   2. Envelope:                           { "jobs": [...] } (also: results/items/data/listings/postings/records)
 *   3. NDJSON:                             one JSON object per line
 * Chat-thread exports ({conversations:[...]} / {messages:[...]}) are NOT handled
 * here — that's parse-chat's job.
 */
import type { RawRecord } from './types.ts';

const ENVELOPE_KEYS = ['jobs', 'results', 'items', 'data', 'listings', 'postings', 'records'] as const;

export function parseJson(content: string): RawRecord[] {
  const trimmed = content.replace(/^﻿/, '').trim();
  if (!trimmed) return [];

  // 1) Whole-document JSON.
  try {
    const doc: unknown = JSON.parse(trimmed);
    return extractRecords(doc);
  } catch {
    // fall through to NDJSON
  }

  // 2) NDJSON — one object per non-empty line.
  const records: RawRecord[] = [];
  let parsedAny = false;
  for (const line of trimmed.split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    const obj: unknown = JSON.parse(l); // throws → not NDJSON either
    if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
      records.push(obj as RawRecord);
      parsedAny = true;
    }
  }
  if (parsedAny) return records;
  throw new Error('unrecognized JSON shape: not an array, envelope, or NDJSON');
}

function extractRecords(doc: unknown): RawRecord[] {
  if (Array.isArray(doc)) {
    return doc.filter((r): r is RawRecord => r !== null && typeof r === 'object' && !Array.isArray(r));
  }
  if (doc !== null && typeof doc === 'object') {
    const obj = doc as Record<string, unknown>;
    for (const key of ENVELOPE_KEYS) {
      const inner = obj[key];
      if (Array.isArray(inner)) return extractRecords(inner);
    }
    // Single job object.
    return [obj];
  }
  return [];
}
