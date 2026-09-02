/**
 * App context — shared per-request services.
 */
import type { DatabaseSync } from 'node:sqlite';
import { NodesRepo } from './nodes.ts';
import { EdgesRepo } from './edges.ts';

export interface AppContext {
  db: DatabaseSync;
  nodes: NodesRepo;
  edges: EdgesRepo;
}

export function makeContext(db: DatabaseSync): AppContext {
  return { db, nodes: new NodesRepo(db), edges: new EdgesRepo(db) };
}
