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

  // === Tasks ===

  createTask(params: {
    id: string;
    sessionId: string;
    todoId: number;
    skill: string;
    tier: string;
    inputSummary?: string;
    iteration: number;
  }): TaskRow {
    this.db
      .query(
        `INSERT INTO tasks (id, session_id, todo_id, skill, tier, input_summary, iteration)
         VALUES ($id, $sessionId, $todoId, $skill, $tier, $inputSummary, $iteration)`
      )
      .run({
        $id: params.id,
        $sessionId: params.sessionId,
        $todoId: params.todoId,
        $skill: params.skill,
        $tier: params.tier,
        $inputSummary: params.inputSummary ?? null,
        $iteration: params.iteration,
      });
    return this.getTask(params.id)!;
  }

  getTask(id: string): TaskRow | null {
    return (
      (this.db
        .query("SELECT * FROM tasks WHERE id = $id")
        .get({ $id: id }) as TaskRow | null) ?? null
    );
  }

  updateTaskStatus(id: string, status: string): void {
    this.db
      .query("UPDATE tasks SET status = $status WHERE id = $id")
      .run({ $id: id, $status: status });
  }

  completeTask(
    id: string,
    params: {
      outputSummary: string;
      outputPath: string;
      finalTier: string;
      recommendations?: string;
      needsReviewCount?: number;
    }
  ): void {
    this.db
      .query(
        `UPDATE tasks SET
           status = 'completed',
           output_summary = $outputSummary,
           output_path = $outputPath,
           final_tier = $finalTier,
           recommendations = $recommendations,
           needs_review_count = $needsReviewCount,
           completed_at = datetime('now')
         WHERE id = $id`
      )
      .run({
        $id: id,
        $outputSummary: params.outputSummary,
        $outputPath: params.outputPath,
        $finalTier: params.finalTier,
        $recommendations: params.recommendations ?? null,
        $needsReviewCount: params.needsReviewCount ?? 0,
      });
  }

  failTask(
    id: string,
    params: {
      failureClassification: string;
      errorDetail: string;
      retries: number;
      finalTier: string;
    }
  ): void {
    this.db
      .query(
        `UPDATE tasks SET
           status = 'failed',
           failure_classification = $failureClassification,
           error_detail = $errorDetail,
           retries = $retries,
           final_tier = $finalTier,
           completed_at = datetime('now')
         WHERE id = $id`
      )
      .run({
        $id: id,
        $failureClassification: params.failureClassification,
        $errorDetail: params.errorDetail,
        $retries: params.retries,
        $finalTier: params.finalTier,
      });
  }

  getRunningTask(sessionId: string): TaskRow | null {
    return (
      (this.db
        .query(
          "SELECT * FROM tasks WHERE session_id = $sessionId AND status = 'running' LIMIT 1"
        )
        .get({ $sessionId: sessionId }) as TaskRow | null) ?? null
    );
  }

  getTasksBySession(sessionId: string): TaskRow[] {
    return this.db
      .query(
        "SELECT * FROM tasks WHERE session_id = $sessionId ORDER BY created_at ASC"
      )
      .all({ $sessionId: sessionId }) as TaskRow[];
  }

  getNextTaskId(sessionId: string): string {
    const count = this.db
      .query(
        "SELECT COUNT(*) as count FROM tasks WHERE session_id = $sessionId"
      )
      .get({ $sessionId: sessionId }) as { count: number };
    return `task-${String(count.count + 1).padStart(3, "0")}`;
  }

  // === Iterations ===

  addIteration(params: {
    sessionId: string;
    iterationNumber: number;
    summary: string;
    decisions?: string;
  }): IterationRow {
    const result = this.db
      .query(
        `INSERT INTO iterations (session_id, iteration_number, summary, decisions)
         VALUES ($sessionId, $iterationNumber, $summary, $decisions)`
      )
      .run({
        $sessionId: params.sessionId,
        $iterationNumber: params.iterationNumber,
        $summary: params.summary,
        $decisions: params.decisions ?? null,
      });
    return this.db
      .query("SELECT * FROM iterations WHERE id = $id")
      .get({ $id: result.lastInsertRowid }) as IterationRow;
  }

  getIterations(sessionId: string): IterationRow[] {
    return this.db
      .query(
        "SELECT * FROM iterations WHERE session_id = $sessionId ORDER BY iteration_number ASC"
      )
      .all({ $sessionId: sessionId }) as IterationRow[];
  }

  getLatestIterations(sessionId: string, limit: number): IterationRow[] {
    return this.db
      .query(
        `SELECT * FROM iterations WHERE session_id = $sessionId
         ORDER BY iteration_number DESC LIMIT $limit`
      )
      .all({ $sessionId: sessionId, $limit: limit })
      .reverse() as IterationRow[];
  }

  // === Notes ===

  addNote(params: {
    sessionId: string;
    content: string;
    addedBy?: string;
  }): NoteRow {
    const result = this.db
      .query(
        `INSERT INTO notes (session_id, content, added_by)
         VALUES ($sessionId, $content, $addedBy)`
      )
      .run({
        $sessionId: params.sessionId,
        $content: params.content,
        $addedBy: params.addedBy ?? null,
      });
    return this.db
      .query("SELECT * FROM notes WHERE id = $id")
      .get({ $id: result.lastInsertRowid }) as NoteRow;
  }

  getNotes(sessionId: string, keyword?: string): NoteRow[] {
    if (keyword) {
      return this.db
        .query(
          "SELECT * FROM notes WHERE session_id = $sessionId AND content LIKE $keyword ORDER BY created_at ASC"
        )
        .all({
          $sessionId: sessionId,
          $keyword: `%${keyword}%`,
        }) as NoteRow[];
    }
    return this.db
      .query(
        "SELECT * FROM notes WHERE session_id = $sessionId ORDER BY created_at ASC"
      )
      .all({ $sessionId: sessionId }) as NoteRow[];
  }

  // === Review Items ===

  addReviewItem(params: {
    taskId: string;
    sessionId: string;
    content: string;
  }): ReviewItemRow {
    const result = this.db
      .query(
        `INSERT INTO review_items (task_id, session_id, content)
         VALUES ($taskId, $sessionId, $content)`
      )
      .run({
        $taskId: params.taskId,
        $sessionId: params.sessionId,
        $content: params.content,
      });
    return this.db
      .query("SELECT * FROM review_items WHERE id = $id")
      .get({ $id: result.lastInsertRowid }) as ReviewItemRow;
  }

  getUnsurfacedReviewItems(sessionId: string): ReviewItemRow[] {
    return this.db
      .query(
        "SELECT * FROM review_items WHERE session_id = $sessionId AND surfaced = 0 ORDER BY created_at ASC"
      )
      .all({ $sessionId: sessionId }) as ReviewItemRow[];
  }

  markReviewItemSurfaced(id: number): void {
    this.db
      .query("UPDATE review_items SET surfaced = 1 WHERE id = $id")
      .run({ $id: id });
  }

  getReviewItemCount(sessionId: string): number {
    const result = this.db
      .query(
        "SELECT COUNT(*) as count FROM review_items WHERE session_id = $sessionId AND surfaced = 0"
      )
      .get({ $sessionId: sessionId }) as { count: number };
    return result.count;
  }

  // === Global Notes ===

  addGlobalNote(params: {
    content: string;
    category?: string;
    sourceSessionId?: string;
    sourceTaskId?: string;
  }): GlobalNoteRow {
    const result = this.db
      .query(
        `INSERT INTO global_notes (content, category, source_session_id, source_task_id)
         VALUES ($content, $category, $sourceSessionId, $sourceTaskId)`
      )
      .run({
        $content: params.content,
        $category: params.category ?? null,
        $sourceSessionId: params.sourceSessionId ?? null,
        $sourceTaskId: params.sourceTaskId ?? null,
      });
    return this.db
      .query("SELECT * FROM global_notes WHERE id = $id")
      .get({ $id: result.lastInsertRowid }) as GlobalNoteRow;
  }

  getGlobalNotes(keyword?: string): GlobalNoteRow[] {
    if (keyword) {
      return this.db
        .query(
          "SELECT * FROM global_notes WHERE content LIKE $keyword ORDER BY created_at ASC"
        )
        .all({ $keyword: `%${keyword}%` }) as GlobalNoteRow[];
    }
    return this.db
      .query("SELECT * FROM global_notes ORDER BY created_at ASC")
      .all() as GlobalNoteRow[];
  }

  getConfirmedGlobalNotes(): GlobalNoteRow[] {
    return this.db
      .query(
        "SELECT * FROM global_notes WHERE status = 'confirmed' ORDER BY confirmed_count DESC"
      )
      .all() as GlobalNoteRow[];
  }

  updateGlobalNoteStatus(id: number, status: string): void {
    this.db
      .query(
        "UPDATE global_notes SET status = $status, updated_at = datetime('now') WHERE id = $id"
      )
      .run({ $id: id, $status: status });
  }

  confirmGlobalNote(id: number): void {
    this.db
      .query(
        `UPDATE global_notes SET
           status = 'confirmed',
           last_confirmed = datetime('now'),
           confirmed_count = confirmed_count + 1,
           updated_at = datetime('now')
         WHERE id = $id`
      )
      .run({ $id: id });
  }

  supersedeGlobalNote(oldId: number, newId: number): void {
    this.db
      .query(
        "UPDATE global_notes SET status = 'superseded', superseded_by = $newId, updated_at = datetime('now') WHERE id = $oldId"
      )
      .run({ $oldId: oldId, $newId: newId });
  }

  /**
   * Returns confirmed global notes suitable for prompt injection.
   * Notes not reconfirmed for 5+ sessions have "[stale] " prefix.
   *
   * NOTE: Staleness tracking requires session counting infrastructure not yet built.
   * For v1, returns all confirmed notes without stale annotation.
   */
  getConfirmedGlobalNotesForInjection(): Array<
    GlobalNoteRow & { content: string }
  > {
    const confirmed = this.db
      .query(
        "SELECT * FROM global_notes WHERE status = 'confirmed' ORDER BY confirmed_count DESC"
      )
      .all() as GlobalNoteRow[];
    // For v1: return all confirmed notes without stale annotation.
    // Staleness tracking requires session counting infrastructure not yet built.
    return confirmed.map((note) => ({ ...note }));
  }
}
