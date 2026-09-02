/**
 * CSV importer (T1.1.1) — hand-rolled, zero deps.
 * RFC-4180-ish: quoted fields ("" escapes), embedded commas/newlines, BOM tolerance,
 * header-row detection. Values stay strings — normalization does the coercion.
 */
import type { RawRecord } from './types.ts';

/** Columns that clearly never appear in a header row. */
const NON_HEADER_RE = /^https?:\/\//i;

export function parseCsv(content: string): RawRecord[] {
  const text = content.replace(/^﻿/, '');
  const rows = parseRows(text);
  if (rows.length === 0) return [];

  const headerIdx = rows.findIndex(looksLikeHeader);
  if (headerIdx === -1) return [];
  const header = rows[headerIdx]!.map((h) => h.trim());

  const records: RawRecord[] = [];
  for (const row of rows.slice(headerIdx + 1)) {
    if (row.every((cell) => cell.trim() === '')) continue; // blank line
    const record: RawRecord = {};
    for (let i = 0; i < header.length; i++) {
      const key = header[i]!;
      if (!key) continue;
      record[key] = row[i] ?? '';
    }
    records.push(record);
  }
  return records;
}

/** A header row has no URL/empty cells and mostly non-numeric short labels. */
function looksLikeHeader(row: string[]): boolean {
  if (row.length < 2) return false;
  let labelish = 0;
  for (const cell of row) {
    const c = cell.trim();
    if (!c || NON_HEADER_RE.test(c)) return false;
    if (!/^\d+([.,]\d+)?$/.test(c) && c.length <= 40) labelish++;
  }
  return labelish / row.length >= 0.6;
}

/** Split CSV text into rows of string cells, honoring quoted fields. */
function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      // Skip a stray \r or \n that immediately follows a quoted field (",\n" artifacts).
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // Trailing field/row (no final newline).
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
