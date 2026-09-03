import { describe, it, expect } from 'vitest';
import { parseChat } from '../../src/import/parse-chat.ts';

describe('parse-chat', () => {
  it('extracts jobs from a JSON message array export', () => {
    const json = JSON.stringify([
      { role: 'user', content: 'Find backend jobs in Cyberjaya' },
      {
        role: 'assistant',
        content: 'Here are the matches:\n\n1. Acme Corp — Senior Backend Engineer — Cyberjaya — RM12k-RM16k\n   URL: https://example.com/1\n2. Beta Labs — Full Stack Developer — Kuala Lumpur — RM10k-RM13k\n   URL: https://example.com/2',
      },
    ]);
    const records = parseChat(json);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ company: 'Acme Corp', role: 'Senior Backend Engineer', location: 'Cyberjaya' });
    expect(records[0]!['url']).toBe('https://example.com/1');
    expect(records[1]!['company']).toBe('Beta Labs');
  });

  it('flattens {conversations:[{messages:[...]}]} exports', () => {
    const json = JSON.stringify({
      conversations: [
        { messages: [{ role: 'assistant', content: '1. Acme — Backend Engineer — KL — RM9k' }] },
        { messages: [{ role: 'assistant', content: '1. Beta — Frontend Engineer — PJ — RM8k' }] },
      ],
    });
    const records = parseChat(json);
    expect(records).toHaveLength(2);
  });

  it('extracts jobs from a User:/Assistant: transcript', () => {
    const transcript = [
      'User: find me jobs',
      'Assistant: Here are the strongest matches:',
      '',
      '1. Veloxa Systems — Senior Backend Engineer — Cyberjaya — RM12k-RM16k',
      '   Source: JobStreet',
      '   URL: https://www.jobstreet.com.my/job/83412011',
      '   Stack: Node.js, TypeScript, PostgreSQL',
      '   Logistics-tech scale-up.',
      '',
      '2. TrueNorth Tech — Full Stack Engineer — Kuala Lumpur — RM10k-RM14k',
      '   URL: https://www.linkedin.com/jobs/view/40201009',
      'User: thanks',
      'Assistant: Done. Let me know if you want more.',
    ].join('\n');
    const records = parseChat(transcript);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      company: 'Veloxa Systems',
      role: 'Senior Backend Engineer',
      location: 'Cyberjaya',
      source: 'JobStreet',
      url: 'https://www.jobstreet.com.my/job/83412011',
      stack: 'Node.js, TypeScript, PostgreSQL',
    });
    const notes = records[0]!['notes'] as string[];
    expect(notes).toContain('Logistics-tech scale-up.');
  });

  it('handles "Role at Company" phrasing', () => {
    const transcript = 'Assistant:\n1. Senior Platform Engineer at NexaCommerce — Cyberjaya — RM13k-RM17k';
    const records = parseChat(transcript);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ company: 'NexaCommerce', role: 'Senior Platform Engineer' });
  });

  it('captures role-first entries (no company) so normalization flags the incomplete lead', () => {
    const transcript = [
      'Assistant: One partial lead:',
      '',
      '9. Backend Engineer (AI Platform) — Cyberjaya — RM12k-RM15k',
      '   Source: LinkedIn',
      '   Stack: Node.js, TypeScript',
    ].join('\n');
    const records = parseChat(transcript);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ role: 'Backend Engineer (AI Platform)', salary: 'RM12k-RM15k' });
    expect(records[0]!['company']).toBeUndefined(); // flagged downstream — never guessed
    // Location goes into notes for a role-first entry (no company to attach to).
    expect(records[0]!['notes']).toContain('Cyberjaya');
  });

  it('skips agent filler and never invents a job from noise', () => {
    const transcript = [
      'User: anything today?',
      'Assistant: I searched but found nothing new. Here are some tips instead:',
      '- Update your LinkedIn headline',
      '- Ask your network',
    ].join('\n');
    expect(parseChat(transcript)).toHaveLength(0);
  });
});
