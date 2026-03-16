import { describe, expect, test, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createSchema, SCHEMA_SQL } from "./schema";

describe("database schema", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("SCHEMA_SQL is a non-empty string", () => {
    expect(typeof SCHEMA_SQL).toBe("string");
    expect(SCHEMA_SQL.length).toBeGreaterThan(100);
  });

  test("createSchema creates all 7 tables", () => {
    db = new Database(":memory:");
    createSchema(db);

    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain("sessions");
    expect(tableNames).toContain("todos");
    expect(tableNames).toContain("tasks");
    expect(tableNames).toContain("iterations");
    expect(tableNames).toContain("notes");
    expect(tableNames).toContain("review_items");
    expect(tableNames).toContain("global_notes");
  });

  test("createSchema is idempotent (can run twice)", () => {
    db = new Database(":memory:");
    createSchema(db);
    createSchema(db); // Should not throw
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table'")
      .all();
    expect(tables.length).toBeGreaterThanOrEqual(7);
  });

  test("sessions table has correct columns", () => {
    db = new Database(":memory:");
    createSchema(db);
    const info = db.query("PRAGMA table_info(sessions)").all() as {
      name: string;
    }[];
    const cols = info.map((c) => c.name);
    expect(cols).toContain("id");
    expect(cols).toContain("opencode_session_id");
    expect(cols).toContain("goal");
    expect(cols).toContain("status");
    expect(cols).toContain("config");
    expect(cols).toContain("review_cycles");
    expect(cols).toContain("max_review_cycles");
    expect(cols).toContain("created_at");
    expect(cols).toContain("updated_at");
  });

  test("todos table has correct columns", () => {
    db = new Database(":memory:");
    createSchema(db);
    const info = db.query("PRAGMA table_info(todos)").all() as {
      name: string;
    }[];
    const cols = info.map((c) => c.name);
    expect(cols).toContain("id");
    expect(cols).toContain("session_id");
    expect(cols).toContain("description");
    expect(cols).toContain("status");
    expect(cols).toContain("priority");
    expect(cols).toContain("category");
    expect(cols).toContain("added_by");
    expect(cols).toContain("completed_by");
    expect(cols).toContain("rework_of");
    expect(cols).toContain("sort_order");
    expect(cols).toContain("depends_on");
  });

  test("tasks table has correct columns", () => {
    db = new Database(":memory:");
    createSchema(db);
    const info = db.query("PRAGMA table_info(tasks)").all() as {
      name: string;
    }[];
    const cols = info.map((c) => c.name);
    expect(cols).toContain("id");
    expect(cols).toContain("session_id");
    expect(cols).toContain("todo_id");
    expect(cols).toContain("skill");
    expect(cols).toContain("tier");
    expect(cols).toContain("final_tier");
    expect(cols).toContain("status");
    expect(cols).toContain("retries");
    expect(cols).toContain("failure_classification");
    expect(cols).toContain("error_detail");
    expect(cols).toContain("input_summary");
    expect(cols).toContain("output_summary");
    expect(cols).toContain("output_path");
    expect(cols).toContain("recommendations");
    expect(cols).toContain("needs_review_count");
    expect(cols).toContain("pending_questions");
    expect(cols).toContain("child_session_id");
    expect(cols).toContain("iteration");
  });

  test("global_notes table has correct columns", () => {
    db = new Database(":memory:");
    createSchema(db);
    const info = db.query("PRAGMA table_info(global_notes)").all() as {
      name: string;
    }[];
    const cols = info.map((c) => c.name);
    expect(cols).toContain("id");
    expect(cols).toContain("content");
    expect(cols).toContain("category");
    expect(cols).toContain("status");
    expect(cols).toContain("source_session_id");
    expect(cols).toContain("source_task_id");
    expect(cols).toContain("last_confirmed");
    expect(cols).toContain("confirmed_count");
    expect(cols).toContain("superseded_by");
  });
});
