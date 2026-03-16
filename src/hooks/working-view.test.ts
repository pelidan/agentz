import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { AgentzDB } from "../db/index";
import { createSchema } from "../db/schema";
import { buildWorkingView } from "./working-view";

describe("buildWorkingView", () => {
  let raw: Database;
  let db: AgentzDB;

  beforeEach(() => {
    raw = new Database(":memory:");
    createSchema(raw);
    db = new AgentzDB(raw);
    db.createSession({ id: "s-001", goal: "Build the authentication system" });
  });

  afterEach(() => {
    raw.close();
  });

  test("includes session goal", () => {
    const view = buildWorkingView(db, "s-001");
    expect(view).toContain("Build the authentication system");
  });

  test("includes incomplete todos", () => {
    db.addTodo({
      sessionId: "s-001",
      description: "Design API schema",
      priority: "high",
    });
    db.addTodo({
      sessionId: "s-001",
      description: "Write tests",
      priority: "medium",
    });
    const view = buildWorkingView(db, "s-001");
    expect(view).toContain("Design API schema");
    expect(view).toContain("Write tests");
  });

  test("shows completed count instead of completed todos", () => {
    const todo = db.addTodo({
      sessionId: "s-001",
      description: "Completed task",
    });
    db.updateTodoStatus(todo.id, "completed");
    db.addTodo({
      sessionId: "s-001",
      description: "Pending task",
    });
    const view = buildWorkingView(db, "s-001");
    expect(view).toContain("1 completed");
    expect(view).toContain("Pending task");
    // Should NOT show completed task details in the list
    expect(view).not.toMatch(/Completed task.*pending|in_progress/);
  });

  test("includes last 3 iterations", () => {
    for (let i = 1; i <= 5; i++) {
      db.addIteration({
        sessionId: "s-001",
        iterationNumber: i,
        summary: `Iteration ${i} summary`,
      });
    }
    const view = buildWorkingView(db, "s-001");
    expect(view).toContain("Iteration 3 summary");
    expect(view).toContain("Iteration 4 summary");
    expect(view).toContain("Iteration 5 summary");
    expect(view).not.toContain("Iteration 1 summary");
    expect(view).not.toContain("Iteration 2 summary");
  });

  test("includes all session notes", () => {
    db.addNote({ sessionId: "s-001", content: "Auth uses JWT" });
    db.addNote({ sessionId: "s-001", content: "CI requires Node 20" });
    const view = buildWorkingView(db, "s-001");
    expect(view).toContain("Auth uses JWT");
    expect(view).toContain("CI requires Node 20");
  });

  test("includes last completed task summary", () => {
    db.addTodo({ sessionId: "s-001", description: "Dummy" });
    db.createTask({
      id: "task-001",
      sessionId: "s-001",
      todoId: 1,
      skill: "backend-developer",
      tier: "balanced",
      iteration: 1,
    });
    db.completeTask("task-001", {
      outputSummary: "API endpoints implemented successfully",
      outputPath: "/tmp/output.md",
      finalTier: "balanced",
    });
    const view = buildWorkingView(db, "s-001");
    expect(view).toContain("API endpoints implemented successfully");
  });

  test("includes unsurfaced review item count", () => {
    db.addTodo({ sessionId: "s-001", description: "Dummy" });
    db.createTask({
      id: "task-001",
      sessionId: "s-001",
      todoId: 1,
      skill: "code-reviewer",
      tier: "balanced",
      iteration: 1,
    });
    db.addReviewItem({
      taskId: "task-001",
      sessionId: "s-001",
      content: "Issue found",
    });
    const view = buildWorkingView(db, "s-001");
    expect(view).toMatch(/review.*1/i);
  });

  test("handles empty session gracefully", () => {
    const view = buildWorkingView(db, "s-001");
    expect(view).toContain("Build the authentication system");
    expect(view).toContain("No todos yet");
  });

  test("does NOT include global notes", () => {
    db.addGlobalNote({
      content: "Project uses PostgreSQL",
      sourceSessionId: "s-001",
    });
    const gn = db.getGlobalNotes();
    db.confirmGlobalNote(gn[0].id);
    const view = buildWorkingView(db, "s-001");
    expect(view).not.toContain("PostgreSQL");
  });
});
