import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { AgentzDB } from "../db/index";
import { createSchema } from "../db/schema";
import { handleEvent, handleSystemTransform, handleCompacting } from "./index";
import type { HookState } from "./index";

describe("handleEvent", () => {
  let raw: Database;
  let db: AgentzDB;
  let state: HookState;

  beforeEach(() => {
    raw = new Database(":memory:");
    createSchema(raw);
    db = new AgentzDB(raw);
    state = {
      db,
      sessionAgentMap: new Map(),
      compactedSessions: new Set(),
    };
  });

  afterEach(() => {
    raw.close();
  });

  test("marks running task and todo as interrupted on MessageAbortedError", () => {
    db.createSession({ id: "s-001", goal: "Test goal", openCodeSessionId: "oc-001" });
    const todo = db.addTodo({ sessionId: "s-001", description: "Some task" });
    db.createTask({ id: "t-001", sessionId: "s-001", todoId: todo.id, skill: "backend-developer", tier: "balanced", iteration: 1 });
    db.updateTaskStatus("t-001", "running");

    handleEvent(state, {
      type: "session.error",
      properties: {
        sessionID: "oc-001",
        error: { name: "MessageAbortedError" },
      },
    });

    const task = db.getTask("t-001");
    expect(task?.status).toBe("interrupted");
    const todos = db.getTodos("s-001");
    const updatedTodo = todos.find(t => t.id === todo.id);
    expect(updatedTodo?.status).toBe("interrupted");
  });

  test("ignores session.error for non-abort errors", () => {
    db.createSession({ id: "s-001", goal: "Test goal", openCodeSessionId: "oc-001" });
    const todo = db.addTodo({ sessionId: "s-001", description: "Some task" });
    db.createTask({ id: "t-001", sessionId: "s-001", todoId: todo.id, skill: "backend-developer", tier: "balanced", iteration: 1 });
    db.updateTaskStatus("t-001", "running");

    handleEvent(state, {
      type: "session.error",
      properties: {
        sessionID: "oc-001",
        error: { name: "SomeOtherError" },
      },
    });

    const task = db.getTask("t-001");
    expect(task?.status).toBe("running");
  });

  test("tracks compacted session IDs on session.compacted", () => {
    handleEvent(state, {
      type: "session.compacted",
      properties: { sessionID: "oc-999" },
    });

    expect(state.compactedSessions.has("oc-999")).toBe(true);
  });

  test("does not throw when sessionID is missing", () => {
    expect(() =>
      handleEvent(state, { type: "session.error", properties: { error: { name: "MessageAbortedError" } } })
    ).not.toThrow();
    expect(() =>
      handleEvent(state, { type: "session.compacted", properties: {} })
    ).not.toThrow();
  });
});

describe("handleSystemTransform", () => {
  let raw: Database;
  let db: AgentzDB;
  let state: HookState;

  beforeEach(() => {
    raw = new Database(":memory:");
    createSchema(raw);
    db = new AgentzDB(raw);
    state = {
      db,
      sessionAgentMap: new Map(),
      compactedSessions: new Set(),
    };
  });

  afterEach(() => {
    raw.close();
  });

  test("injects working view when active agent is agentz", () => {
    db.createSession({ id: "s-001", goal: "Build auth", openCodeSessionId: "oc-001" });
    state.sessionAgentMap.set("oc-001", "agentz");
    const output = { system: [] as string[] };

    handleSystemTransform(state, "oc-001", output);

    expect(output.system.length).toBeGreaterThan(0);
    expect(output.system[0]).toContain("Build auth");
  });

  test("does not inject when active agent is not agentz", () => {
    db.createSession({ id: "s-001", goal: "Build auth", openCodeSessionId: "oc-001" });
    state.sessionAgentMap.set("oc-001", "backend-developer");
    const output = { system: [] as string[] };

    handleSystemTransform(state, "oc-001", output);

    expect(output.system.length).toBe(0);
  });

  test("does not inject when sessionID is undefined", () => {
    const output = { system: [] as string[] };
    handleSystemTransform(state, undefined, output);
    expect(output.system.length).toBe(0);
  });
});

describe("handleCompacting", () => {
  let raw: Database;
  let db: AgentzDB;
  let state: HookState;

  beforeEach(() => {
    raw = new Database(":memory:");
    createSchema(raw);
    db = new AgentzDB(raw);
    state = {
      db,
      sessionAgentMap: new Map(),
      compactedSessions: new Set(),
    };
  });

  afterEach(() => {
    raw.close();
  });

  test("enriches compaction context with session info", () => {
    db.createSession({ id: "s-001", goal: "Build auth", openCodeSessionId: "oc-001" });
    db.addTodo({ sessionId: "s-001", description: "Todo 1" });
    const output = { context: [] as string[] };

    handleCompacting(state, "oc-001", output);

    expect(output.context.some((c) => c.includes("s-001"))).toBe(true);
    expect(output.context.some((c) => c.includes("Build auth"))).toBe(true);
  });

  test("does not enrich when sessionID is undefined", () => {
    const output = { context: [] as string[] };
    handleCompacting(state, undefined, output);
    expect(output.context.length).toBe(0);
  });
});
