/**
 * Shared fixture loader for import tests — reads every importable file in
 * `server/fixtures/` (the ~30-job mixed-format corpus, T1.2) as ImportFileInput[].
 */
import { readFileSync, readdirSync } from 'node:fs';
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

export function loadFixtures(): ImportFileInput[] {
  return readdirSync(FIXTURES_DIR)
    .sort()
    .filter((name) => FORMAT_BY_EXT[name.slice(name.lastIndexOf('.'))] !== undefined)
    .map((name) => ({
      name,
      format: FORMAT_BY_EXT[name.slice(name.lastIndexOf('.'))]!,
      content: readFileSync(resolve(FIXTURES_DIR, name), 'utf8'),
    }));
}
