/**
 * Markdown/notes importer (T1.1.2) — semi-structured job notes.
 *
 * Job entry = `## Company — Role` heading (also -, –, :, |, @ separators),
 * followed by `Key: value` lines (Location/Salary/URL/Source/Stack/Contact…)
 * and bullet lists (→ stack hints + notes). Anything unparsable is preserved
 * in `notes` — best-effort, never silently dropped (D-003).
 */
import type { RawRecord } from './types.ts';

const HEADING_RE = /^#{2,4}\s+(.+?)\s*#*\s*$/;
const SEPARATOR_RE = /\s+(?:—|–|-|\||@)\s+/;
const COLON_SPLIT_RE = /:\s+/;
const ROLE_WORDS_RE =
  /\b(engineer|developer|architect|lead|manager|designer|analyst|scientist|consultant|specialist|programmer|devops|qa|sre|head|intern|technologist)\b/i;
const KV_RE = /^[-*]?\s*(?:\*\*)?([A-Za-z][A-Za-z /&]{0,30}?)(?:\*\*)?\s*:\s+(.+?)\s*$/;
const BULLET_RE = /^[-*]\s+(.+?)\s*$/;
const URL_RE = /https?:\/\/[^\s)>\]]+/i;

const KEY_MAP: Record<string, string> = {
  location: 'location',
  loc: 'location',
  salary: 'salary',
  pay: 'salary',
  compensation: 'salary',
  url: 'url',
  link: 'url',
  apply: 'url',
  source: 'source',
  via: 'source',
  stack: 'stack',
  tech: 'stack',
  techstack: 'stack',
  tech_stack: 'stack',
  contact: 'contact',
  recruiter: 'contact',
  posted: 'discovered_at',
  discovered: 'discovered_at',
  date: 'discovered_at',
  found: 'discovered_at',
  role: 'role',
  title: 'role',
  position: 'role',
  company: 'company',
};

export function parseMd(content: string): RawRecord[] {
  const lines = content.replace(/^﻿/, '').split(/\r?\n/);
  const records: RawRecord[] = [];
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

  for (const line of lines) {
    const trimmed = line.trim();
    const heading = HEADING_RE.exec(trimmed);
    if (heading) {
      flush();
      const title = stripMd(heading[1]!);
      current = {};
      let parts = title.split(SEPARATOR_RE).map((p) => p.trim()).filter(Boolean);
      if (parts.length < 2) {
        // "Company: Role" — only split on a colon when the right side looks like a role
        // (avoids mangling "Location: KL"-style headings).
        const colonParts = title.split(COLON_SPLIT_RE).map((p) => p.trim()).filter(Boolean);
        if (colonParts.length >= 2 && ROLE_WORDS_RE.test(colonParts.slice(1).join(' '))) {
          parts = colonParts;
        }
      }
      if (parts.length >= 2) {
        current['company'] = parts[0]!;
        current['role'] = parts.slice(1).join(' — ');
      } else {
        current['title'] = title; // normalization flags if it can't resolve company/role
      }
      continue;
    }
    if (!current) continue; // preamble before the first job heading — ignored
    if (!trimmed) continue;

    const kv = KV_RE.exec(trimmed);
    if (kv) {
      const key = KEY_MAP[kv[1]!.toLowerCase().replace(/[^a-z_]/g, '')];
      const value = stripMd(kv[2]!);
      if (key === 'stack') {
        current['stack'] = value;
      } else if (key) {
        current[key] = value;
      } else {
        notes.push(trimmed.replace(/^[-*]\s+/, ''));
      }
      continue;
    }

    const bullet = BULLET_RE.exec(trimmed);
    if (bullet) {
      const text = stripMd(bullet[1]!);
      // A bullet that's just a URL fills a missing url field.
      if (URL_RE.test(text) && !/\s/.test(text) && current['url'] === undefined) {
        current['url'] = text;
      } else {
        notes.push(text);
      }
      continue;
    }

    // Freeform line inside a job block — preserve it.
    notes.push(stripMd(trimmed));
  }
  flush();
  return records;
}

function stripMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[(.+?)\]\((https?:\/\/[^)]+)\)/g, (_m, label: string, url: string) =>
      label.trim().toLowerCase() === 'apply' || label.trim().toLowerCase() === 'link' ? url : label,
    )
    .trim();
}
