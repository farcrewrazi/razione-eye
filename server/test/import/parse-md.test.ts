import { describe, it, expect } from 'vitest';
import { parseMd } from '../../src/import/parse-md.ts';

describe('parse-md', () => {
  it('parses "## Company — Role" + key:value lines', () => {
    const md = [
      '# Shortlist',
      '',
      '## Acme Sdn Bhd — Senior Software Engineer',
      'Location: Cyberjaya',
      'Salary: RM12k-RM16k',
      'URL: https://example.com/job/1',
      'Source: LinkedIn',
      'Stack: Node.js, React',
      '',
      '## Beta Corp: Frontend Engineer',
      'Location: Kuala Lumpur',
    ].join('\n');
    const records = parseMd(md);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      company: 'Acme Sdn Bhd',
      role: 'Senior Software Engineer',
      location: 'Cyberjaya',
      salary: 'RM12k-RM16k',
      url: 'https://example.com/job/1',
      source: 'LinkedIn',
    });
    expect(records[1]).toMatchObject({ company: 'Beta Corp', role: 'Frontend Engineer' });
  });

  it('supports -, –, :, | separators between company and role', () => {
    const md = '## Acme - SSE\n## Beta – FE\n## Gamma : Backend Engineer\n## Delta | Full Stack Engineer';
    const records = parseMd(md);
    expect(records.map((r) => r['company'])).toEqual(['Acme', 'Beta', 'Gamma', 'Delta']);
  });

  it('only colon-splits when the right side looks like a role', () => {
    const records = parseMd('## Standup notes: Tuesday\nLocation: KL');
    expect(records[0]!['title']).toBe('Standup notes: Tuesday');
    expect(records[0]!['company']).toBeUndefined();
  });

  it('collects bullets and freeform lines into notes (content preserved)', () => {
    const md = [
      '## Acme — SSE',
      'Location: Cyberjaya',
      '- Hybrid 2 days',
      '- Uses AI coding agents',
      'Some unstructured remark about the team.',
    ].join('\n');
    const records = parseMd(md);
    expect(records).toHaveLength(1);
    const notes = records[0]!['notes'] as string[];
    expect(notes).toContain('Hybrid 2 days');
    expect(notes).toContain('Uses AI coding agents');
    expect(notes).toContain('Some unstructured remark about the team.');
  });

  it('keeps a heading without separator as title (flagged later, not dropped)', () => {
    const records = parseMd('## Principal Software Engineer\nLocation: Remote');
    expect(records).toHaveLength(1);
    expect(records[0]!['title']).toBe('Principal Software Engineer');
    expect(records[0]!['company']).toBeUndefined();
  });

  it('ignores preamble before the first heading', () => {
    const md = '# Notes\nRandom thoughts here.\n\n## Acme — SSE\nLocation: KL';
    const records = parseMd(md);
    expect(records).toHaveLength(1);
    expect(records[0]!['company']).toBe('Acme');
  });

  it('strips markdown emphasis from values', () => {
    const md = '## **Acme** — **SSE**\nLocation: **Cyberjaya**';
    const records = parseMd(md);
    expect(records[0]).toMatchObject({ company: 'Acme', role: 'SSE', location: 'Cyberjaya' });
  });
});
