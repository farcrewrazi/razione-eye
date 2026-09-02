import { describe, it, expect } from 'vitest';
import {
  dedupJobs,
  normalizeCompanyName,
  normalizeRoleTitle,
  richness,
} from '../../src/import/dedup.ts';
import type { NormalizedJob } from '../../src/import/types.ts';

function job(partial: Partial<NormalizedJob> & { company: string; role: string }): NormalizedJob {
  return partial as NormalizedJob;
}

describe('dedup: company name normalization', () => {
  it('strips legal suffixes, punctuation and case', () => {
    expect(normalizeCompanyName('Acme Sdn Bhd')).toBe('acme');
    expect(normalizeCompanyName('Acme Sdn. Bhd.')).toBe('acme');
    expect(normalizeCompanyName('ACME')).toBe('acme');
    expect(normalizeCompanyName('Stellar Dynamics Sdn Bhd')).toBe(normalizeCompanyName('Stellar Dynamics'));
    expect(normalizeCompanyName('Globex, Inc.')).toBe('globex');
    expect(normalizeCompanyName('Initech Pty Ltd')).toBe('initech');
  });

  it('never strips the whole name away', () => {
    expect(normalizeCompanyName('Bhd')).toBe('bhd');
  });
});

describe('dedup: role equivalence', () => {
  it('ignores seniority words and punctuation', () => {
    expect(normalizeRoleTitle('Senior Software Engineer')).toBe('software engineer');
    expect(normalizeRoleTitle('Software Engineer')).toBe('software engineer');
    expect(normalizeRoleTitle('Sr. Software Engineer')).toBe('software engineer');
    expect(normalizeRoleTitle('Lead Backend Engineer')).toBe('backend engineer');
  });
});

describe('dedup: pass', () => {
  it('merges same company+role+source; keeps the richest record', () => {
    const rich = job({
      company: 'Stellar Dynamics Sdn Bhd',
      role: 'Senior Software Engineer',
      source: 'JobStreet',
      salary: 'RM12k-RM16k',
      location: 'KL',
      url: 'https://example.com/1',
      stack: ['Node.js'],
    });
    const poor = job({ company: 'Stellar Dynamics', role: 'Software Engineer', source: 'jobstreet' });
    const { kept, duplicates } = dedupJobs([poor, rich]);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toBe(rich);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]!.kept).toBe('Stellar Dynamics Sdn Bhd — Senior Software Engineer');
    expect(duplicates[0]!.dropped).toBe('Stellar Dynamics — Software Engineer');
  });

  it('different source → NOT a duplicate', () => {
    const a = job({ company: 'Acme', role: 'SSE', source: 'LinkedIn' });
    const b = job({ company: 'Acme', role: 'SSE', source: 'JobStreet' });
    const { kept, duplicates } = dedupJobs([a, b]);
    expect(kept).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });

  it('different role → NOT a duplicate', () => {
    const a = job({ company: 'Acme', role: 'Backend Engineer' });
    const b = job({ company: 'Acme', role: 'Frontend Engineer' });
    expect(dedupJobs([a, b]).kept).toHaveLength(2);
  });

  it('richness scoring prefers populated records', () => {
    const sparse = job({ company: 'A', role: 'R' });
    const dense = job({ company: 'A', role: 'R', location: 'KL', salary: 'RM10k', notes: ['x'] });
    expect(richness(dense)).toBeGreaterThan(richness(sparse));
  });
});
