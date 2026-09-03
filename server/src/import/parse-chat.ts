/**
 * Agent-conversation importer (T1.1.3) — extracts job entries from chat exports.
 *
 * Accepted shapes:
 *   A. JSON exports:  [ {role, content}, ... ] · { messages: [...] } · { conversations: [{ messages: [...] }] }
 *   B. Transcript text (.md/.txt): "User:" / "Assistant:" speaker lines.
 *
 * Extraction = pattern mining over message text: numbered/bulleted entries and
 * free lines carrying a company+role signal ("Role at Company", "Company — Role",
 * "Company: Role"), enriched by nearby Location:/Salary:/URL lines. Role-first
 * entries ("Role — Location — Salary") are captured without a company so
 * normalization flags them as incomplete instead of dropping the lead.
 * Unmatched job-ish text is preserved in notes.
 */
import type { RawRecord } from './types.ts';

const KV_RE = /^[-*]?\s*(?:\*\*)?([A-Za-z][A-Za-z /&]{0,30}?)(?:\*\*)?\s*:\s+(.+?)\s*$/;
const NUMBERED_RE = /^\s*(?:\d+[.)]\s+|[-*]\s+)(.+?)\s*$/;
const AT_PATTERN_RE = /^(.+?)\s+at\s+(.+)$/i;
const DASH_PATTERN_RE = /^(.+?)\s+(?:—|–|-)\s+(.+)$/;
const URL_RE = /https?:\/\/[^\s)>\]]+/i;
const SALARY_HINT_RE = /(?:RM|MYR)\s*[\d.,]+\s*[kK]?|\bsalary\b/i;
const LOCATION_HINT_RE = /\b(cyberjaya|kuala lumpur|\bkl\b|putrajaya|bangsar|mont kiara|petaling jaya|\bpj\b|remote|hybrid)\b/i;
const ROLE_WORDS_RE =
  /\b(engineer|developer|architect|lead|manager|designer|analyst|scientist|consultant|specialist|programmer|devops|qa|sre|head of|intern)\b/i;

const NOISE_PREFIXES = [
  'here are', 'here is', 'i found', "i've found", 'found ', 'let me know', 'hope this helps',
  'below are', 'these are', 'summary', 'the following', 'i searched', 'search results',
  'would you like', 'do you want', 'anything else', 'good luck',
];

export function parseChat(content: string): RawRecord[] {
  const messages = extractMessages(content.replace(/^﻿/, ''));
  const records: RawRecord[] = [];
  for (const message of messages) {
    records.push(...mineMessage(message));
  }
  return records;
}

// ── Message extraction ───────────────────────────────────────────────────────

function extractMessages(content: string): string[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const doc: unknown = JSON.parse(trimmed);
      const msgs = flattenJsonMessages(doc);
      if (msgs.length > 0) return msgs;
    } catch {
      // not JSON after all — treat as transcript below
    }
  }

  // Transcript: "User:" / "Assistant:" speaker lines.
  const messages: string[] = [];
  let current: string[] = [];
  let sawSpeaker = false;
  for (const line of trimmed.split(/\r?\n/)) {
    const speaker = /^\s*(User|Human|Assistant|Agent|AI|Hermes|System)\s*:\s*(.*)$/i.exec(line);
    if (speaker) {
      if (sawSpeaker) messages.push(current.join('\n'));
      sawSpeaker = true;
      current = speaker[2] ? [speaker[2]] : [];
    } else if (sawSpeaker) {
      current.push(line);
    }
  }
  if (sawSpeaker) messages.push(current.join('\n'));
  return messages.map((m) => m.trim()).filter((m) => m.length > 0);
}

function flattenJsonMessages(doc: unknown): string[] {
  const out: string[] = [];
  const pushMessage = (m: unknown) => {
    if (m !== null && typeof m === 'object' && !Array.isArray(m)) {
      const content = (m as Record<string, unknown>)['content'];
      if (typeof content === 'string' && content.trim()) out.push(content);
    }
  };
  if (Array.isArray(doc)) {
    for (const item of doc) pushMessage(item);
    return out;
  }
  if (doc !== null && typeof doc === 'object') {
    const obj = doc as Record<string, unknown>;
    for (const key of ['messages', 'conversation', 'thread', 'history'] as const) {
      if (Array.isArray(obj[key])) {
        for (const item of obj[key] as unknown[]) pushMessage(item);
        return out;
      }
    }
    if (Array.isArray(obj['conversations'])) {
      for (const convo of obj['conversations'] as unknown[]) {
        if (convo !== null && typeof convo === 'object') {
          const msgs = (convo as Record<string, unknown>)['messages'];
          if (Array.isArray(msgs)) for (const m of msgs) pushMessage(m);
        }
      }
    }
  }
  return out;
}

// ── Pattern mining ───────────────────────────────────────────────────────────

function mineMessage(message: string): RawRecord[] {
  const records: RawRecord[] = [];
  const lines = message.split(/\r?\n/);
  let current: RawRecord | null = null;
  let notes: string[] = [];

  const flush = () => {
    if (!current) return;
    if (notes.length > 0) {
      const existing = Array.isArray(current['notes']) ? (current['notes'] as string[]) : [];
      current['notes'] = [...existing, ...notes];
    }
    records.push(current);
    current = null;
    notes = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const numbered = NUMBERED_RE.exec(line);
    const candidateText = numbered ? numbered[1]! : line;

    if (numbered) {
      const rec = parseCandidate(candidateText);
      if (rec) {
        flush();
        current = rec;
        continue;
      }
      // Numbered/bulleted line that's not a job lead — attach as context.
      (current ? notes : (notes = notes)).push(candidateText);
      continue;
    }

    // Indented / key:value enrichment under the current entry.
    const kv = KV_RE.exec(line);
    if (kv && current) {
      const key = kv[1]!.toLowerCase().replace(/[^a-z_]/g, '');
      const value = kv[2]!.trim();
      if (key === 'location' || key === 'loc') current['location'] = value;
      else if (key === 'salary' || key === 'pay') current['salary'] = value;
      else if (key === 'url' || key === 'link' || key === 'apply') current['url'] = value;
      else if (key === 'source' || key === 'via') current['source'] = value;
      else if (key === 'stack' || key === 'tech') current['stack'] = value;
      else if (key === 'contact' || key === 'recruiter') current['contact'] = value;
      else notes.push(line);
      continue;
    }

    // Free line with a job signal → start a new entry even without a bullet.
    if (!current) {
      const rec = looksLikeJobLead(candidateText) ? parseCandidate(candidateText) : null;
      if (rec) {
        current = rec;
        continue;
      }
    } else {
      // Continuation of the current entry: harvest URLs and hints.
      const url = URL_RE.exec(line);
      if (url && current['url'] === undefined) {
        current['url'] = url[0];
        continue;
      }
      if (SALARY_HINT_RE.test(line) && current['salary'] === undefined) {
        current['salary'] = line;
        continue;
      }
      if (LOCATION_HINT_RE.test(line) && current['location'] === undefined && line.length <= 60) {
        current['location'] = line;
        continue;
      }
      if (ROLE_WORDS_RE.test(line) || SALARY_HINT_RE.test(line) || LOCATION_HINT_RE.test(line)) {
        notes.push(line);
        continue;
      }
    }
    // Noise (agent filler) is dropped; anything else under an entry is kept.
    if (current && !isNoise(line)) notes.push(line);
  }
  flush();
  return records;
}

function looksLikeJobLead(text: string): boolean {
  if (isNoise(text)) return false;
  return (ROLE_WORDS_RE.test(text) && (AT_PATTERN_RE.test(text) || DASH_PATTERN_RE.test(text))) || false;
}

/**
 * Parse "Role at Company …" / "Company — Role …" / "Company: Role …" into a record.
 * Returns null when no company+role structure can be found.
 */
function parseCandidate(text: string): RawRecord | null {
  const clean = text.replace(/\*\*(.+?)\*\*/g, '$1').trim();
  if (!clean || isNoise(clean)) return null;

  // "Senior Frontend Engineer at Finexus — KL — RM10k-14k"
  const at = AT_PATTERN_RE.exec(clean);
  if (at && ROLE_WORDS_RE.test(at[1]!)) {
    const rec: RawRecord = { role: at[1]!.trim() };
    splitRemainder(at[2]!, rec, 'company');
    return rec;
  }

  // "Company — Role — extra" or "Company: Role"
  const dash = DASH_PATTERN_RE.exec(clean) ?? /^(.+?):\s+(.+)$/.exec(clean);
  if (dash) {
    const first = dash[1]!.trim();
    const rest = dash[2]!.trim();
    if (first.length >= 2 && first.length <= 80 && ROLE_WORDS_RE.test(rest)) {
      const rec: RawRecord = { company: first };
      splitRemainder(rest, rec, 'role');
      return rec;
    }
    // Role-first entry: "Role — Location — Salary" (company unknown). Captured
    // without a company so normalization flags it as incomplete (T1.1.4) —
    // a partial lead is never dropped on the floor. The first tail segment is
    // a location, not a company — split it as such.
    if (ROLE_WORDS_RE.test(first) && (LOCATION_HINT_RE.test(rest) || SALARY_HINT_RE.test(rest))) {
      const rec: RawRecord = { role: first };
      splitRemainder(rest, rec, 'location');
      return rec;
    }
  }
  return null;
}

/** Split "Value — Location — RM…" style tails into the record. */
function splitRemainder(text: string, rec: RawRecord, firstKey: 'company' | 'role' | 'location'): void {
  const parts = text.split(/\s+(?:—|–)\s+/).map((p) => p.trim()).filter(Boolean);
  const first = parts.shift();
  if (first) rec[firstKey] = first.replace(/\s+-\s+.*$/, '').trim();
  for (const part of parts) {
    if (SALARY_HINT_RE.test(part) && rec['salary'] === undefined) rec['salary'] = part;
    else if (LOCATION_HINT_RE.test(part) && rec['location'] === undefined) rec['location'] = part;
    else if (URL_RE.test(part) && rec['url'] === undefined) rec['url'] = URL_RE.exec(part)![0];
    else {
      const existing = Array.isArray(rec['notes']) ? (rec['notes'] as string[]) : [];
      rec['notes'] = [...existing, part];
    }
  }
  // A location captured for a company-less (role-first) record can't attach to
  // a company — move it into notes so the hint survives for the analyst.
  if (rec['company'] === undefined && typeof rec['location'] === 'string') {
    const existing = Array.isArray(rec['notes']) ? (rec['notes'] as string[]) : [];
    rec['notes'] = [...existing, rec['location'] as string];
    delete rec['location'];
  }
}

function isNoise(text: string): boolean {
  const lower = text.toLowerCase();
  return NOISE_PREFIXES.some((p) => lower.startsWith(p));
}
