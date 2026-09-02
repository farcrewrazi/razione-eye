import { describe, it, expect } from 'vitest';
import { normalizeRecords, parseSalary, splitStack } from '../../src/import/normalize.ts';

describe('normalize: salary parsing', () => {
  it('"RM12k-RM16k" → {min:12000,max:16000}', () => {
    expect(parseSalary('RM12k-RM16k')).toEqual({ min: 12000, max: 16000 });
  });

  it('"RM12,000 – RM16,000" → {min:12000,max:16000}', () => {
    expect(parseSalary('RM12,000 – RM16,000')).toEqual({ min: 12000, max: 16000 });
  });

  it('"12k" → {min:12000} (single-sided)', () => {
    expect(parseSalary('12k')).toEqual({ min: 12000 });
  });

  it('"RM 15,000/month" → {min:15000}', () => {
    expect(parseSalary('RM 15,000/month')).toEqual({ min: 15000 });
  });

  it('swapped ranges are ordered; junk returns null (never guessed)', () => {
    expect(parseSalary('RM16k - RM12k')).toEqual({ min: 12000, max: 16000 });
    expect(parseSalary('competitive')).toBeNull();
    expect(parseSalary(undefined)).toBeNull();
  });
});

describe('normalize: stack splitting', () => {
  it('splits comma/semicolon/pipe/slash lists and arrays', () => {
    expect(splitStack('Node.js, React; PostgreSQL')).toEqual(['Node.js', 'React', 'PostgreSQL']);
    expect(splitStack('AWS | Docker / Kubernetes')).toEqual(['AWS', 'Docker', 'Kubernetes']);
    expect(splitStack(['Node.js', ['React, Vite']])).toEqual(['Node.js', 'React', 'Vite']);
    expect(splitStack(undefined)).toEqual([]);
  });
});

describe('normalize: records', () => {
  it('maps alias keys (job_title/employer/link/tech_stack) into the strict shape', () => {
    const { jobs, flagged } = normalizeRecords([
      { job_title: 'SSE', employer: 'Acme', link: 'https://example.com/j/1', tech_stack: 'Node.js, React', salary: 'RM12k-RM14k' },
    ]);
    expect(flagged).toHaveLength(0);
    expect(jobs[0]).toMatchObject({
      company: 'Acme',
      role: 'SSE',
      url: 'https://example.com/j/1',
      stack: ['Node.js', 'React'],
      salary: 'RM12k-RM14k',
      salary_min: 12000,
      salary_max: 14000,
    });
  });

  it('flags records missing company OR role with reasons (D-003: never guessed)', () => {
    const { jobs, flagged } = normalizeRecords([
      { company: '', role: 'Backend Engineer', location: 'KL' },
      { company: 'Acme', role: '' },
      { company: 'Beta', role: 'FE' },
    ]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!['company']).toBe('Beta');
    expect(flagged).toHaveLength(2);
    expect(flagged[0]!.reason).toBe('missing company');
    expect(flagged[1]!.reason).toBe('missing role');
  });

  it('flags a lone title with no company/role structure', () => {
    const { jobs, flagged } = normalizeRecords([{ title: 'Principal Software Engineer', location: 'Remote' }]);
    expect(jobs).toHaveLength(0);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.reason).toBe('missing company');
  });

  it('drops invalid URLs but keeps the rest of the record', () => {
    const { jobs } = normalizeRecords([{ company: 'Acme', role: 'SSE', url: 'not-a-url' }]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!['url']).toBeUndefined();
  });

  it('parses contact strings and objects', () => {
    const { jobs } = normalizeRecords([
      { company: 'Acme', role: 'SSE', contact: 'Aina (aina@acme.my)' },
      { company: 'Beta', role: 'FE', contact: { recruiter: 'John', linkedin: 'https://linkedin.com/in/john' } },
    ]);
    expect(jobs[0]!['contact']).toEqual({ recruiter: 'Aina (aina@acme.my)' });
    expect(jobs[1]!['contact']).toMatchObject({ recruiter: 'John' });
  });
});
