import { Database } from "bun:sqlite";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  opencode_session_id TEXT,
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  config TEXT,
  review_cycles INTEGER NOT NULL DEFAULT 0,
  max_review_cycles INTEGER NOT NULL DEFAULT 2,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  category TEXT,
  added_by TEXT,
  completed_by TEXT,
  rework_of INTEGER REFERENCES todos(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  depends_on TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  todo_id INTEGER REFERENCES todos(id),
  skill TEXT NOT NULL,
  tier TEXT NOT NULL,
  final_tier TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  retries INTEGER NOT NULL DEFAULT 0,
  failure_classification TEXT,
  error_detail TEXT,
  input_summary TEXT,
  output_summary TEXT,
  output_path TEXT,
  recommendations TEXT,
  needs_review_count INTEGER NOT NULL DEFAULT 0,
  pending_questions TEXT,
  child_session_id TEXT,
  iteration INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS iterations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  iteration_number INTEGER NOT NULL,
  summary TEXT NOT NULL,
  decisions TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  content TEXT NOT NULL,
  added_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS review_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  content TEXT NOT NULL,
  surfaced BOOLEAN NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS global_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  source_session_id TEXT REFERENCES sessions(id),
  source_task_id TEXT,
  last_confirmed TEXT,
  confirmed_count INTEGER NOT NULL DEFAULT 0,
  superseded_by INTEGER REFERENCES global_notes(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * Creates all tables and enables WAL mode.
 * Idempotent — safe to call multiple times.
 */
export function createSchema(db: Database): void {
  db.exec("PRAGMA journal_mode=WAL;");
  db.exec("PRAGMA foreign_keys=ON;");
  db.exec(SCHEMA_SQL);
}
