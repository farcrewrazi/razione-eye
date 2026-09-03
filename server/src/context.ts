/**
 * App context — shared per-request services.
 */
import type { DatabaseSync } from 'node:sqlite';
import { NodesRepo } from './nodes.ts';
import { EdgesRepo } from './edges.ts';
import { EventsRepo } from './events.ts';
import { GateRepo } from './gate-repo.ts';

export interface AppContext {
  db: DatabaseSync;
  nodes: NodesRepo;
  edges: EdgesRepo;
  events: EventsRepo;
  gate: GateRepo;
}

export function makeContext(db: DatabaseSync): AppContext {
  return { db, nodes: new NodesRepo(db), edges: new EdgesRepo(db), events: new EventsRepo(db), gate: new GateRepo(db) };
}
