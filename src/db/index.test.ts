import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { AgentzDB } from "./index";
import { createSchema } from "./schema";

describe("AgentzDB", () => {
  let raw: Database;
  let db: AgentzDB;

  beforeEach(() => {
    raw = new Database(":memory:");
    createSchema(raw);
    db = new AgentzDB(raw);
  });

  afterEach(() => {
    raw.close();
  });

  // === Sessions ===
  describe("sessions", () => {
    test("createSession and getSession", () => {
      const session = db.createSession({
        id: "s-001",
        openCodeSessionId: "oc-123",
        goal: "Build the auth system",
      });
      expect(session.id).toBe("s-001");
      expect(session.goal).toBe("Build the auth system");
      expect(session.status).toBe("active");

      const fetched = db.getSession("s-001");
      expect(fetched).toBeDefined();
      expect(fetched!.goal).toBe("Build the auth system");
    });

    test("getActiveSessionByOpenCodeId", () => {
      db.createSession({
        id: "s-001",
        openCodeSessionId: "oc-123",
        goal: "Test",
      });
      const found = db.getActiveSessionByOpenCodeId("oc-123");
      expect(found).toBeDefined();
      expect(found!.id).toBe("s-001");
    });

    test("getActiveSessionByOpenCodeId returns null for non-active", () => {
      db.createSession({
        id: "s-001",
        openCodeSessionId: "oc-123",
        goal: "Test",
      });
      db.updateSessionStatus("s-001", "completed");
      const found = db.getActiveSessionByOpenCodeId("oc-123");
      expect(found).toBeNull();
    });

    test("updateSessionStatus", () => {
      db.createSession({ id: "s-001", goal: "Test" });
      db.updateSessionStatus("s-001", "completed");
      const session = db.getSession("s-001");
      expect(session!.status).toBe("completed");
    });

    test("incrementReviewCycles", () => {
      db.createSession({ id: "s-001", goal: "Test" });
      db.incrementReviewCycles("s-001");
      db.incrementReviewCycles("s-001");
      const session = db.getSession("s-001");
      expect(session!.review_cycles).toBe(2);
    });

    test("getMostRecentNonCompleted", () => {
      db.createSession({ id: "s-001", goal: "First" });
      db.createSession({ id: "s-002", goal: "Second" });
      db.updateSessionStatus("s-002", "completed");
      const found = db.getMostRecentNonCompleted();
      expect(found).toBeDefined();
      expect(found!.id).toBe("s-001");
    });
  });

  // === Todos ===
  describe("todos", () => {
    beforeEach(() => {
      db.createSession({ id: "s-001", goal: "Test" });
    });

    test("addTodo and getTodos", () => {
      db.addTodo({
        sessionId: "s-001",
        description: "Implement API",
        priority: "high",
        category: "develop-backend",
        addedBy: "triage-analyst",
      });
      db.addTodo({
        sessionId: "s-001",
        description: "Write tests",
        priority: "medium",
        category: "test-backend",
      });

      const todos = db.getTodos("s-001");
      expect(todos).toHaveLength(2);
      expect(todos[0].description).toBe("Implement API");
      expect(todos[0].priority).toBe("high");
      expect(todos[0].category).toBe("develop-backend");
    });

    test("updateTodoStatus", () => {
      const todo = db.addTodo({
        sessionId: "s-001",
        description: "Task 1",
      });
      db.updateTodoStatus(todo.id, "in_progress");
      const updated = db.getTodos("s-001");
      expect(updated[0].status).toBe("in_progress");
    });

    test("completeTodo sets completed_by", () => {
      const todo = db.addTodo({
        sessionId: "s-001",
        description: "Task 1",
      });
      db.completeTodo(todo.id, "task-001");
      const updated = db.getTodos("s-001");
      expect(updated[0].status).toBe("completed");
      expect(updated[0].completed_by).toBe("task-001");
    });

    test("getNextPendingTodo returns highest priority first", () => {
      db.addTodo({
        sessionId: "s-001",
        description: "Low priority",
        priority: "low",
        sortOrder: 1,
      });
      db.addTodo({
        sessionId: "s-001",
        description: "High priority",
        priority: "high",
        sortOrder: 0,
      });

      const next = db.getNextPendingTodo("s-001");
      expect(next).toBeDefined();
      expect(next!.description).toBe("High priority");
    });

    test("getNextPendingTodo returns null when all done", () => {
      const todo = db.addTodo({
        sessionId: "s-001",
        description: "Done",
      });
      db.updateTodoStatus(todo.id, "completed");
      const next = db.getNextPendingTodo("s-001");
      expect(next).toBeNull();
    });

    test("addTodo with rework_of reference", () => {
      const original = db.addTodo({
        sessionId: "s-001",
        description: "Original task",
      });
      const rework = db.addTodo({
        sessionId: "s-001",
        description: "Rework of original",
        reworkOf: original.id,
      });
      const todos = db.getTodos("s-001");
      const reworkTodo = todos.find((t) => t.id === rework.id);
      expect(reworkTodo!.rework_of).toBe(original.id);
    });
  });
});
