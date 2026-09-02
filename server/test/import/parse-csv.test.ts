import { describe, it, expect } from 'vitest';
import { parseCsv } from '../../src/import/parse-csv.ts';

describe('parse-csv', () => {
  it('parses a simple header + rows', () => {
    const csv = 'Company,Role,Salary\n"Acme","SSE","RM12k"\n"Beta","FE","RM10k"';
    const records = parseCsv(csv);
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({ Company: 'Acme', Role: 'SSE', Salary: 'RM12k' });
    expect(records[1]!['Company']).toBe('Beta');
  });

  it('handles quoted fields with embedded commas and double-quote escapes', () => {
    const csv = 'Company,Role,Notes\n"Acme, Inc.","SSE","Uses ""agents"" daily, hybrid"';
    const records = parseCsv(csv);
    expect(records).toHaveLength(1);
    expect(records[0]!['Company']).toBe('Acme, Inc.');
    expect(records[0]!['Notes']).toBe('Uses "agents" daily, hybrid');
  });

  it('handles embedded newlines inside quoted fields', () => {
    const csv = 'Company,Role,Notes\n"Acme","SSE","line one\nline two"\n"Beta","FE","plain"';
    const records = parseCsv(csv);
    expect(records).toHaveLength(2);
    expect(records[0]!['Notes']).toBe('line one\nline two');
  });

  it('tolerates a BOM and CRLF line endings', () => {
    const csv = '﻿Company,Role\r\n"Acme","SSE"\r\n"Beta","FE"';
    const records = parseCsv(csv);
    expect(records).toHaveLength(2);
    expect(records[0]!['Company']).toBe('Acme');
  });

  it('keeps numbers as strings (normalization coerces later)', () => {
    const csv = 'Company,Role,Salary\n"Acme","SSE",12000';
    const records = parseCsv(csv);
    expect(records[0]!['Salary']).toBe('12000');
  });

  it('skips blank lines and returns [] when no header exists', () => {
    expect(parseCsv('Company,Role\n"Acme","SSE"\n\n"Beta","FE"')).toHaveLength(2);
    expect(parseCsv('https://example.com/job1\nhttps://example.com/job2')).toHaveLength(0);
    expect(parseCsv('')).toHaveLength(0);
  });
});
