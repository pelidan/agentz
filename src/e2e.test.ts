import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "path";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { AgentzDB } from "./db/index";
import { createSchema } from "./db/schema";
import { processRecommendations } from "./dispatch/recommendations";
import { buildWorkingView } from "./hooks/working-view";
import { executeQuery } from "./query/index";
import { validateCompletionReport } from "./protocol/validator";
import { classifyError, composeSystemPrompt } from "./dispatch/index";
import { formatTriageReport, formatFailureReport } from "./dispatch/report";
import type { Recommendation } from "./protocol/types";

/**
 * E2E integration tests covering the full session lifecycle.
 * Uses a real in-memory SQLite database — no mocks.
 */
describe("E2E: full session lifecycle", () => {
  let raw: Database;
  let db: AgentzDB;
  const sessionId = "e2e-session-001";
  const skillsDir = join(import.meta.dir, "..", "skills");
  const e2eTmpDir = join(tmpdir(), "agentz-e2e-test");

  beforeEach(() => {
    raw = new Database(":memory:");
    createSchema(raw);
    db = new AgentzDB(raw);
    mkdirSync(e2eTmpDir, { recursive: true });
  });

  afterEach(() => {
    raw.close();
    rmSync(e2eTmpDir, { recursive: true, force: true });
  });

  test("full lifecycle: session -> triage -> task -> working view -> query", () => {
    // === 1. Create session ===
    const session = db.createSession({
      id: sessionId,
      goal: "Build a REST API for user management",
    });
    expect(session.id).toBe(sessionId);
    expect(session.goal).toBe("Build a REST API for user management");
    expect(session.status).toBe("active");

    // === 2. Simulate triage dispatch ===
    // In real flow, triage-analyst runs and produces recommendations.
    // Here we exercise processRecommendations directly.
    const triageTodo = db.addTodo({
      sessionId,
      description: "Triage: decompose goal into tasks",
      priority: "high",
      category: "triage",
    });
    const triageTaskId = db.getNextTaskId(sessionId);
    expect(triageTaskId).toBe("task-001");
    db.createTask({
      id: triageTaskId,
      sessionId,
      todoId: triageTodo.id,
      skill: "triage-analyst",
      tier: "balanced",
      iteration: 1,
    });
    db.updateTodoStatus(triageTodo.id, "in_progress");
    db.updateTaskStatus(triageTaskId, "running");

    // Triage produces recommendations that create todos
    const triageRecs: Recommendation[] = [
      {
        type: "ADD_TODO",
        description: "Design database schema for users",
        priority: "high",
        category: "database",
      },
      {
        type: "ADD_TODO",
        description: "Implement CRUD endpoints",
        priority: "high",
        category: "backend",
      },
      {
        type: "ADD_TODO",
        description: "Write integration tests",
        priority: "medium",
        category: "test-backend",
      },
      {
        type: "ADD_NOTE",
        description: "User requested PostgreSQL as database",
      },
      {
        type: "ADD_GLOBAL_NOTE",
        description: "Project uses PostgreSQL 15 with pgvector",
        category: "tech-stack",
      },
    ];

    const triageResult = processRecommendations(
      db,
      sessionId,
      triageTaskId,
      triageRecs,
    );
    expect(triageResult.todosAdded).toBe(3);
    expect(triageResult.notesRecorded).toBe(1);
    expect(triageResult.globalNotesDrafted).toBe(1);

    // Complete triage task
    db.completeTask(triageTaskId, {
      outputSummary: "Decomposed goal into 3 tasks",
      outputPath: "/tmp/e2e/triage-output.md",
      finalTier: "balanced",
      recommendations: JSON.stringify(triageRecs),
    });
    db.completeTodo(triageTodo.id, triageTaskId);

    // Record iteration
    db.addIteration({
      sessionId,
      iterationNumber: 1,
      summary: "Triage complete. 3 work items created.",
      decisions: "Using PostgreSQL for persistence",
    });

    // Verify triage report formatter works
    const triageReport = formatTriageReport({
      goalSummary: "Build a REST API for user management",
      complexity: "medium",
      rationale: "Standard CRUD with auth layer",
      todosAdded: 3,
      priorityBreakdown: { high: 2, medium: 1 },
    });
    expect(triageReport).toContain("Triage:");
    expect(triageReport).toContain("Todos added: 3");

    // === 2b. Working view after triage ===
    const postTriageView = buildWorkingView(db, sessionId);
    expect(postTriageView).toContain("Build a REST API for user management");
    expect(postTriageView).toContain("Design database schema for users");
    expect(postTriageView).toMatch(/\d+\s+remaining/);

    // === 3. Simulate task dispatch ===
    const nextTodo = db.getNextPendingTodo(sessionId);
    expect(nextTodo).not.toBeNull();
    expect(nextTodo!.priority).toBe("high");

    const taskId = db.getNextTaskId(sessionId);
    expect(taskId).toBe("task-002");
    db.createTask({
      id: taskId,
      sessionId,
      todoId: nextTodo!.id,
      skill: "database-architect",
      tier: "balanced",
      iteration: 2,
    });
    db.updateTodoStatus(nextTodo!.id, "in_progress");
    db.updateTaskStatus(taskId, "running");

    // Simulate task completing with recommendations
    const taskRecs: Recommendation[] = [
      {
        type: "ADD_NOTE",
        description: "Schema uses UUID primary keys",
      },
      {
        type: "NEEDS_REVIEW",
        description: "Consider adding indexes on email column",
      },
    ];

    const taskRecResult = processRecommendations(
      db,
      sessionId,
      taskId,
      taskRecs,
    );
    expect(taskRecResult.notesRecorded).toBe(1);
    expect(taskRecResult.reviewItemsAdded).toBe(1);

    // === 3b. Write actual output file to disk ===
    const outputPath = join(e2eTmpDir, "schema-output.md");
    writeFileSync(
      outputPath,
      [
        "## Summary",
        "Designed the user management database schema with UUID primary keys.",
        "The schema includes users, roles, and sessions tables.",
        "",
        "## Details",
        "All tables use UUID v4 primary keys for distributed-friendly IDs.",
        "Email column has a unique constraint. Created_at/updated_at timestamps on all tables.",
        "",
        "## Artifacts",
        "- schema.sql: Full DDL for PostgreSQL 15",
        "",
        "## Recommendations",
        "- ADD_NOTE: Schema uses UUID primary keys",
        "- NEEDS_REVIEW: Consider adding indexes on email column",
      ].join("\n"),
    );

    // === 3c. Validate completion report ===
    const rawResponse = [
      "STATUS: completed",
      `OUTPUT: ${outputPath}`,
      "SUMMARY: Designed user schema with UUID PKs. Email has unique constraint.",
      "RECOMMENDATIONS:",
      "- ADD_NOTE: Schema uses UUID primary keys",
      "- NEEDS_REVIEW: Consider adding indexes on email column",
    ].join("\n");

    const validationResult = validateCompletionReport(rawResponse);
    expect(validationResult.valid).toBe(true);
    expect(validationResult.report!.status).toBe("completed");
    expect(validationResult.report!.recommendations.length).toBeGreaterThan(0);

    // Use the validated report's recommendations for processRecommendations
    const validatedRecs = validationResult.report!.recommendations;

    db.completeTask(taskId, {
      outputSummary: "Designed user schema with UUID PKs",
      outputPath,
      finalTier: "balanced",
      recommendations: JSON.stringify(validatedRecs),
    });
    db.completeTodo(nextTodo!.id, taskId);

    db.addIteration({
      sessionId,
      iterationNumber: 2,
      summary: "Database schema designed. Review items flagged.",
    });

    // === 4. Working view generation ===
    const workingView = buildWorkingView(db, sessionId);
    expect(workingView).toContain(sessionId);
    expect(workingView).toContain("Build a REST API for user management");
    // Should show completed count and remaining
    expect(workingView).toContain("2 completed");
    expect(workingView).toContain("remaining");
    // Should show iterations
    expect(workingView).toContain("Triage complete");
    expect(workingView).toContain("Database schema designed");
    // Should show notes
    expect(workingView).toContain("User requested PostgreSQL");
    expect(workingView).toContain("Schema uses UUID primary keys");
    // Should show last completed task
    expect(workingView).toContain("task-002");
    expect(workingView).toContain("Designed user schema");
    // Should show review items count
    expect(workingView).toContain("1 unsurfaced");

    // === 5. Query functionality ===
    // Todos query
    const todosQuery = executeQuery(db, sessionId, { section: "todos" });
    expect(todosQuery).toContain("Design database schema");
    expect(todosQuery).toContain("Implement CRUD endpoints");
    expect(todosQuery).toContain("Write integration tests");
    // Completed triage todo
    expect(todosQuery).toContain("Triage: decompose goal");

    // Iterations query
    const iterQuery = executeQuery(db, sessionId, { section: "iterations" });
    expect(iterQuery).toContain("Iteration 1");
    expect(iterQuery).toContain("Iteration 2");
    expect(iterQuery).toContain("Triage complete");

    // Task detail query
    const taskQuery = executeQuery(db, sessionId, {
      section: "task",
      taskId: "task-002",
    });
    expect(taskQuery).toContain("database-architect");
    expect(taskQuery).toContain("completed");
    expect(taskQuery).toContain("Designed user schema");

    // Notes query
    const notesQuery = executeQuery(db, sessionId, { section: "notes" });
    expect(notesQuery).toContain("PostgreSQL");
    expect(notesQuery).toContain("UUID primary keys");

    // Notes with keyword filter
    const filteredNotes = executeQuery(db, sessionId, {
      section: "notes",
      keyword: "UUID",
    });
    expect(filteredNotes).toContain("UUID");
    expect(filteredNotes).not.toContain("PostgreSQL");

    // Global notes query
    const globalQuery = executeQuery(db, sessionId, {
      section: "global_notes",
    });
    expect(globalQuery).toContain("PostgreSQL 15");
    expect(globalQuery).toContain("tech-stack");

    // === 6. System prompt composition (verifies skill loading) ===
    const systemPrompt = composeSystemPrompt(
      "test-skill",
      {
        sessionId,
        taskId: "task-003",
        outputPath: "/tmp/e2e/output.md",
        ancestryChain: [],
        priorOutputPaths: ["/tmp/e2e/schema-output.md"],
        globalNotes: [{ content: "Project uses PostgreSQL 15", stale: false }],
      },
      skillsDir,
    );
    expect(systemPrompt).toContain("Protocol");
    expect(systemPrompt).toContain("Task Context");
    expect(systemPrompt).toContain("task-003");
    expect(systemPrompt).toContain("/tmp/e2e/schema-output.md");
    expect(systemPrompt).toContain("PostgreSQL 15");
  });

  test("error classification covers all categories", () => {
    // Transient errors
    expect(classifyError(new Error("network timeout"))).toBe("transient");
    expect(classifyError(new Error("ECONNREFUSED"))).toBe("transient");
    expect(classifyError(new Error("rate limit exceeded"))).toBe("transient");
    expect(classifyError(new Error("request aborted"))).toBe("transient");

    // Capability errors (validation failures)
    expect(classifyError(null, { valid: false })).toBe("capability");
    expect(classifyError(new Error("something"), { valid: false })).toBe(
      "capability",
    );

    // Capability (default for unknown errors)
    expect(classifyError(new Error("unexpected output"))).toBe("capability");
    expect(classifyError("string error")).toBe("capability");

    // Validation passing does NOT override error classification
    expect(classifyError(new Error("timeout"), { valid: true })).toBe(
      "transient",
    );
  });

  test("validation failure path with task fail recording", () => {
    // Create session and todo
    db.createSession({
      id: sessionId,
      goal: "Test validation failure",
    });
    const todo = db.addTodo({
      sessionId,
      description: "A task that will fail validation",
      priority: "medium",
    });
    const todoId = todo.id;
    const taskId = db.getNextTaskId(sessionId);

    db.createTask({
      id: taskId,
      sessionId,
      todoId,
      skill: "backend-developer",
      tier: "balanced",
      iteration: 1,
    });
    db.updateTodoStatus(todoId, "in_progress");
    db.updateTaskStatus(taskId, "running");

    // Validate a malformed completion report
    const badReport = "This is not a valid completion report at all.";
    const result = validateCompletionReport(badReport);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);

    // Classify the error
    const errorClass = classifyError(null, result);
    expect(errorClass).toBe("capability");

    // Record the failure using the correct failTask signature
    db.failTask(taskId, {
      failureClassification: errorClass,
      errorDetail: result.errors.map((e) => `${e.field}: ${e.error}`).join("; "),
      retries: 1,
      finalTier: "balanced",
    });
    db.updateTodoStatus(todoId, "failed");

    // Verify the task was recorded as failed
    const failedTask = db.getTask(taskId);
    expect(failedTask).not.toBeNull();
    expect(failedTask!.status).toBe("failed");
    expect(failedTask!.failure_classification).toBe("capability");
    expect(failedTask!.error_detail).toContain("STATUS");
    expect(failedTask!.retries).toBe(1);
    expect(failedTask!.final_tier).toBe("balanced");

    // Verify the todo is in failed state
    const todos = db.getTodos(sessionId);
    const failedTodo = todos.find((t) => t.id === todoId);
    expect(failedTodo).not.toBeNull();
    expect(failedTodo!.status).toBe("failed");

    // Verify failure report generation
    const failureReport = formatFailureReport({
      todoDescription: "A task that will fail validation",
      errorType: errorClass,
      errorDetail: "validation failed",
      attempts: 1,
      tiersTried: ["balanced"],
    });
    expect(failureReport).toContain("failed");
    expect(failureReport).toContain("capability");
    expect(failureReport).toContain("balanced");
  });
});
