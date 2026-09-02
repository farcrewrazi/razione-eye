import { describe, it, expect } from 'vitest';
import { parseJson } from '../../src/import/parse-json.ts';

describe('parse-json', () => {
  it('parses a plain array of job objects', () => {
    const records = parseJson('[{"company":"Acme","role":"SSE"},{"company":"Beta","role":"FE"}]');
    expect(records).toHaveLength(2);
    expect(records[0]!['company']).toBe('Acme');
  });

  it('parses envelope shapes ({jobs:[...]}, {results:[...]})', () => {
    const jobs = parseJson('{"jobs":[{"company":"Acme","role":"SSE"}]}');
    expect(jobs).toHaveLength(1);
    const results = parseJson('{"results":[{"company":"Beta"},{"company":"Gamma"}],"total":2}');
    expect(results).toHaveLength(2);
    expect(results[1]!['company']).toBe('Gamma');
  });

  it('parses NDJSON (one object per line)', () => {
    const ndjson = '{"company":"Acme","role":"SSE"}\n{"company":"Beta","role":"FE"}\n';
    const records = parseJson(ndjson);
    expect(records).toHaveLength(2);
    expect(records[1]!['role']).toBe('FE');
  });

  it('treats a single object as one record', () => {
    const records = parseJson('{"company":"Acme","role":"SSE"}');
    expect(records).toHaveLength(1);
  });

  it('ignores non-object entries inside arrays', () => {
    const records = parseJson('[{"company":"Acme"}, 42, "nope", null, ["nested"]]');
    expect(records).toHaveLength(1);
  });

  it('tolerates a BOM and returns [] for empty input', () => {
    expect(parseJson('﻿[{"company":"Acme"}]')).toHaveLength(1);
    expect(parseJson('   ')).toHaveLength(0);
  });

  it('throws on unparseable content (caller flags it)', () => {
    expect(() => parseJson('this is not json\nat all')).toThrow();
  });
});
