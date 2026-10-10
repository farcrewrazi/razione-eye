/**
 * Shared fixture loader for import tests — reads the T1.2 mixed-format corpus
 * (~30 jobs) as ImportFileInput[]. The corpus is pinned by filename so ad-hoc
 * fixture files (e.g. pending research imports) can live in `server/fixtures/`
 * without breaking the corpus-count assertions.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ImportFileInput } from '../../src/import/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = resolve(here, '../../fixtures');

export const FORMAT_BY_EXT: Record<string, ImportFileInput['format']> = {
  '.json': 'json',
  '.csv': 'csv',
  '.md': 'md',
  '.txt': 'chat',
};

const CORPUS_FILES = [
  'agent-chat-export.txt',
  'jobs-export.csv',
  'jobs-notes.md',
  'jobs-notes-2.md',
  'jobs-structured.json',
];

export function loadFixtures(): ImportFileInput[] {
  return CORPUS_FILES.map((name) => ({
    name,
    format: FORMAT_BY_EXT[name.slice(name.lastIndexOf('.'))]!,
    content: readFileSync(resolve(FIXTURES_DIR, name), 'utf8'),
  }));
}
