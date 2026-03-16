import { Database } from "bun:sqlite";

// === Row types ===
export interface SessionRow {
  id: string;
  opencode_session_id: string | null;
  goal: string;
  status: string;
  config: string | null;
  review_cycles: number;
  max_review_cycles: number;
  created_at: string;
  updated_at: string;
}

export interface TodoRow {
  id: number;
  session_id: string;
  description: string;
  status: string;
  priority: string;
  category: string | null;
  added_by: string | null;
  completed_by: string | null;
  rework_of: number | null;
  sort_order: number;
  depends_on: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  session_id: string;
  todo_id: number | null;
  skill: string;
  tier: string;
  final_tier: string | null;
  status: string;
  retries: number;
  failure_classification: string | null;
  error_detail: string | null;
  input_summary: string | null;
  output_summary: string | null;
  output_path: string | null;
  recommendations: string | null;
  needs_review_count: number;
  pending_questions: string | null;
  child_session_id: string | null;
  iteration: number;
  created_at: string;
  completed_at: string | null;
}

export interface IterationRow {
  id: number;
  session_id: string;
  iteration_number: number;
  summary: string;
  decisions: string | null;
  created_at: string;
}

export interface NoteRow {
  id: number;
  session_id: string;
  content: string;
  added_by: string | null;
  created_at: string;
}

export interface ReviewItemRow {
  id: number;
  task_id: string;
  session_id: string;
  content: string;
  surfaced: number;
  created_at: string;
}

export interface GlobalNoteRow {
  id: number;
  content: string;
  category: string | null;
  status: string;
  source_session_id: string | null;
  source_task_id: string | null;
  last_confirmed: string | null;
  confirmed_count: number;
  superseded_by: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Database client wrapping all CRUD operations for agentz state.
 * All methods are synchronous (bun:sqlite is synchronous).
 *
 * Note: `depends_on` on todos is stored as a JSON string and is intentionally
 * not interpreted or resolved by AgentzDB in v1.
 */
export class AgentzDB {
  constructor(private db: Database) {}

  /** Closes the underlying SQLite database connection. */
  close(): void {
    this.db.close();
  }

  // === Sessions ===

  createSession(params: {
    id: string;
    openCodeSessionId?: string;
    goal: string;
    config?: string;
    maxReviewCycles?: number;
  }): SessionRow {
    this.db
      .query(
        `INSERT INTO sessions (id, opencode_session_id, goal, config, max_review_cycles)
         VALUES ($id, $openCodeSessionId, $goal, $config, $maxReviewCycles)`
      )
      .run({
        $id: params.id,
        $openCodeSessionId: params.openCodeSessionId ?? null,
        $goal: params.goal,
        $config: params.config ?? null,
        $maxReviewCycles: params.maxReviewCycles ?? 2,
      });
    return this.getSession(params.id)!;
  }

  getSession(id: string): SessionRow | null {
    return (
      (this.db
        .query("SELECT * FROM sessions WHERE id = $id")
        .get({ $id: id }) as SessionRow | null) ?? null
    );
  }

  getActiveSessionByOpenCodeId(openCodeSessionId: string): SessionRow | null {
    return (
      (this.db
        .query(
          "SELECT * FROM sessions WHERE opencode_session_id = $oid AND status = 'active'"
        )
        .get({ $oid: openCodeSessionId }) as SessionRow | null) ?? null
    );
  }

  updateSessionStatus(id: string, status: string): void {
    this.db
      .query(
        "UPDATE sessions SET status = $status, updated_at = datetime('now') WHERE id = $id"
      )
      .run({ $id: id, $status: status });
  }

  incrementReviewCycles(id: string): void {
    this.db
      .query(
        "UPDATE sessions SET review_cycles = review_cycles + 1, updated_at = datetime('now') WHERE id = $id"
      )
      .run({ $id: id });
  }

  getMostRecentNonCompleted(): SessionRow | null {
    return (
      (this.db
        .query(
          "SELECT * FROM sessions WHERE status != 'completed' ORDER BY created_at DESC LIMIT 1"
        )
        .get() as SessionRow | null) ?? null
    );
  }

  // === Todos ===

  addTodo(params: {
    sessionId: string;
    description: string;
    priority?: string;
    category?: string;
    addedBy?: string;
    reworkOf?: number;
    sortOrder?: number;
  }): TodoRow {
    const result = this.db
      .query(
        `INSERT INTO todos (session_id, description, priority, category, added_by, rework_of, sort_order)
         VALUES ($sessionId, $description, $priority, $category, $addedBy, $reworkOf, $sortOrder)`
      )
      .run({
        $sessionId: params.sessionId,
        $description: params.description,
        $priority: params.priority ?? "medium",
        $category: params.category ?? null,
        $addedBy: params.addedBy ?? null,
        $reworkOf: params.reworkOf ?? null,
        $sortOrder: params.sortOrder ?? 0,
      });
    return this.db
      .query("SELECT * FROM todos WHERE id = $id")
      .get({ $id: result.lastInsertRowid }) as TodoRow;
  }

  getTodos(sessionId: string): TodoRow[] {
    return this.db
      .query(
        "SELECT * FROM todos WHERE session_id = $sessionId ORDER BY sort_order ASC, id ASC"
      )
      .all({ $sessionId: sessionId }) as TodoRow[];
  }

  updateTodoStatus(id: number, status: string): void {
    this.db
      .query(
        "UPDATE todos SET status = $status, updated_at = datetime('now') WHERE id = $id"
      )
      .run({ $id: id, $status: status });
  }

  completeTodo(id: number, completedBy: string): void {
    this.db
      .query(
        "UPDATE todos SET status = 'completed', completed_by = $completedBy, updated_at = datetime('now') WHERE id = $id"
      )
      .run({ $id: id, $completedBy: completedBy });
  }

  getNextPendingTodo(sessionId: string): TodoRow | null {
    return (
      (this.db
        .query(
          `SELECT * FROM todos
           WHERE session_id = $sessionId AND status = 'pending'
           ORDER BY
             CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END ASC,
             sort_order ASC,
             id ASC
           LIMIT 1`
        )
        .get({ $sessionId: sessionId }) as TodoRow | null) ?? null
    );
  }
}
