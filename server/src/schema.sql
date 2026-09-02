-- RaziOne Eye — SQLite property-graph schema (Phase 0, D-008).
-- All timestamps are ISO-8601 UTC strings. All ids are ULIDs.

CREATE TABLE IF NOT EXISTS nodes (
  id               TEXT PRIMARY KEY,      -- ULID
  type             TEXT NOT NULL,          -- PERSON|COMPANY|OPPORTUNITY|PROJECT|TASK|SIGNAL|CONTENT|AGENT|SKILL|LOCATION|PROBLEM|SOLUTION|SOURCE
  name             TEXT,                  -- display name/title (companies, persons, skills…)
  status           TEXT,                  -- pipeline stage / task status / signal disposition
  opportunity_type TEXT,                  -- JOB|WEBSITE|CONSULTANCY|AFFILIATE|CRYPTO (OPPORTUNITY only)
  score            INTEGER,               -- 0-100 opportunity score
  due_at           TEXT,                  -- TASK due date / next_action due (ISO or null)
  source           TEXT,
  tags             TEXT NOT NULL DEFAULT '[]',  -- JSON string[]
  notes            TEXT NOT NULL DEFAULT '[]',  -- JSON array of (string | {text, created_at})
  data             TEXT NOT NULL,          -- JSON blob: type-specific payload per doc 02
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
CREATE INDEX IF NOT EXISTS idx_nodes_optype ON nodes(opportunity_type);
CREATE INDEX IF NOT EXISTS idx_nodes_due ON nodes(due_at);

CREATE TABLE IF NOT EXISTS edges (
  id         TEXT PRIMARY KEY,
  from_id    TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  to_id      TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  edge_type  TEXT NOT NULL,   -- open vocabulary; known types validated by zod enum
  data       TEXT,            -- JSON, e.g. {"score": 91} on matches edges
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id, edge_type);
CREATE INDEX IF NOT EXISTS idx_edges_to   ON edges(to_id, edge_type);

-- Wave 2 (T1.1/T1.2): append-only activity log — status changes, notes, import runs,
-- agent runs, gate decisions. Feeds the Daily Brief ("what changed") + detail activity logs.
CREATE TABLE IF NOT EXISTS events (
  id         TEXT PRIMARY KEY,      -- ULID
  at         TEXT NOT NULL,          -- ISO-8601 UTC
  type       TEXT NOT NULL,          -- see EVENT_TYPES in packages/shared
  node_id    TEXT REFERENCES nodes(id) ON DELETE CASCADE,  -- nullable (e.g. import_run)
  summary    TEXT NOT NULL,
  data       TEXT                    -- JSON payload (e.g. full ImportReport on import_run)
);
CREATE INDEX IF NOT EXISTS idx_events_node ON events(node_id, at);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, at);
