import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { AgentzDB } from "../db/index";
import { createSchema } from "../db/schema";
import { executeQuery } from "./index";

describe("executeQuery", () => {
  let raw: Database;
  let db: AgentzDB;

  beforeEach(() => {
    raw = new Database(":memory:");
    createSchema(raw);
    db = new AgentzDB(raw);
    db.createSession({ id: "s-001", goal: "Build auth system" });
    db.addTodo({
      sessionId: "s-001",
      description: "Design schema",
      priority: "high",
      category: "architect-db",
    });
    db.addTodo({
      sessionId: "s-001",
      description: "Implement API",
      priority: "medium",
    });
    db.addNote({
      sessionId: "s-001",
      content: "Auth uses JWT",
      addedBy: "task-001",
    });
  });

  afterEach(() => {
    raw.close();
  });

  test("queries todos section", () => {
    const result = executeQuery(db, "s-001", {
      section: "todos",
    });
    expect(result).toContain("Design schema");
    expect(result).toContain("Implement API");
    expect(result).toContain("high");
  });

  test("queries iterations section", () => {
    db.addIteration({
      sessionId: "s-001",
      iterationNumber: 1,
      summary: "Dispatched triage",
    });
    const result = executeQuery(db, "s-001", {
      section: "iterations",
    });
    expect(result).toContain("Dispatched triage");
  });

  test("queries task section", () => {
    db.addTodo({ sessionId: "s-001", description: "Dummy" });
    db.createTask({
      id: "task-001",
      sessionId: "s-001",
      todoId: 1,
      skill: "backend-developer",
      tier: "balanced",
      inputSummary: "Build the API",
      iteration: 1,
    });
    const result = executeQuery(db, "s-001", {
      section: "task",
      taskId: "task-001",
    });
    expect(result).toContain("backend-developer");
    expect(result).toContain("Build the API");
  });

  test("queries notes section", () => {
    const result = executeQuery(db, "s-001", {
      section: "notes",
    });
    expect(result).toContain("Auth uses JWT");
  });

  test("queries notes with keyword filter", () => {
    db.addNote({ sessionId: "s-001", content: "Uses PostgreSQL" });
    const result = executeQuery(db, "s-001", {
      section: "notes",
      keyword: "PostgreSQL",
    });
    expect(result).toContain("PostgreSQL");
    expect(result).not.toContain("JWT");
  });

  test("queries global_notes section", () => {
    db.addGlobalNote({
      content: "Global fact",
      sourceSessionId: "s-001",
    });
    const result = executeQuery(db, "s-001", {
      section: "global_notes",
    });
    expect(result).toContain("Global fact");
  });

  test("returns error for missing session", () => {
    const result = executeQuery(db, "nonexistent", {
      section: "todos",
    });
    expect(result).toContain("No active agentz session");
  });

  test("returns error for task query without task_id", () => {
    const result = executeQuery(db, "s-001", {
      section: "task",
    });
    expect(result).toContain("task_id is required");
  });
});
