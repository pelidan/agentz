import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { AgentzDB } from "../db/index";
import { createSchema } from "../db/schema";
import { processRecommendations } from "./recommendations";
import type { Recommendation } from "../protocol/types";

describe("processRecommendations", () => {
  let raw: Database;
  let db: AgentzDB;

  beforeEach(() => {
    raw = new Database(":memory:");
    createSchema(raw);
    db = new AgentzDB(raw);
    db.createSession({ id: "s-001", goal: "Test" });
  });

  afterEach(() => {
    raw.close();
  });

  test("processes ADD_TODO recommendations", () => {
    const recs: Recommendation[] = [
      {
        type: "ADD_TODO",
        description: "Write integration tests",
        priority: "medium",
        category: "test-backend",
      },
    ];
    const result = processRecommendations(db, "s-001", "task-001", recs);
    expect(result.todosAdded).toBe(1);
    const todos = db.getTodos("s-001");
    expect(todos).toHaveLength(1);
    expect(todos[0].description).toBe("Write integration tests");
    expect(todos[0].category).toBe("test-backend");
    expect(todos[0].added_by).toBe("task-001");
  });

  test("processes ADD_NOTE recommendations", () => {
    const recs: Recommendation[] = [
      { type: "ADD_NOTE", description: "Auth uses JWT with RS256" },
    ];
    const result = processRecommendations(db, "s-001", "task-001", recs);
    expect(result.notesRecorded).toBe(1);
    const notes = db.getNotes("s-001");
    expect(notes).toHaveLength(1);
    expect(notes[0].content).toBe("Auth uses JWT with RS256");
  });

  test("processes NEEDS_REVIEW recommendations", () => {
    db.addTodo({ sessionId: "s-001", description: "Dummy" });
    db.createTask({
      id: "task-001",
      sessionId: "s-001",
      todoId: 1,
      skill: "code-reviewer",
      tier: "balanced",
      iteration: 1,
    });
    const recs: Recommendation[] = [
      {
        type: "NEEDS_REVIEW",
        description: "Admin routes skip auth check",
      },
    ];
    const result = processRecommendations(db, "s-001", "task-001", recs);
    expect(result.reviewItemsAdded).toBe(1);
    const items = db.getUnsurfacedReviewItems("s-001");
    expect(items).toHaveLength(1);
  });

  test("processes ADD_GLOBAL_NOTE recommendations", () => {
    const recs: Recommendation[] = [
      {
        type: "ADD_GLOBAL_NOTE",
        description: "Project uses PostgreSQL 15",
        category: "tech-stack",
      },
    ];
    const result = processRecommendations(db, "s-001", "task-001", recs);
    expect(result.globalNotesDrafted).toBe(1);
    const notes = db.getGlobalNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].status).toBe("draft");
    expect(notes[0].category).toBe("tech-stack");
  });

  test("processes mixed recommendations", () => {
    db.addTodo({ sessionId: "s-001", description: "Dummy" });
    db.createTask({
      id: "task-001",
      sessionId: "s-001",
      todoId: 1,
      skill: "backend-developer",
      tier: "balanced",
      iteration: 1,
    });
    const recs: Recommendation[] = [
      { type: "ADD_TODO", description: "New task", priority: "high" },
      { type: "ADD_NOTE", description: "A note" },
      { type: "NEEDS_REVIEW", description: "Review this" },
      { type: "ADD_GLOBAL_NOTE", description: "Global fact" },
    ];
    const result = processRecommendations(db, "s-001", "task-001", recs);
    expect(result.todosAdded).toBe(1);
    expect(result.notesRecorded).toBe(1);
    expect(result.reviewItemsAdded).toBe(1);
    expect(result.globalNotesDrafted).toBe(1);
  });

  test("handles empty recommendations", () => {
    const result = processRecommendations(db, "s-001", "task-001", []);
    expect(result.todosAdded).toBe(0);
    expect(result.notesRecorded).toBe(0);
    expect(result.reviewItemsAdded).toBe(0);
    expect(result.globalNotesDrafted).toBe(0);
  });
});
