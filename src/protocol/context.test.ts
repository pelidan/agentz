import { describe, expect, test } from "bun:test";
import { renderTaskContext, type TaskDispatchContext } from "./context";

describe("renderTaskContext", () => {
  const baseContext: TaskDispatchContext = {
    sessionId: "session-001",
    taskId: "task-001",
    outputPath: "/tmp/agentz/sessions/session-001/tasks/task-001/output.md",
    ancestryChain: [],
    priorOutputPaths: [],
    globalNotes: [],
  };

  test("includes session and task IDs", () => {
    const output = renderTaskContext(baseContext);
    expect(output).toContain("session-001");
    expect(output).toContain("task-001");
  });

  test("includes output path", () => {
    const output = renderTaskContext(baseContext);
    expect(output).toContain(baseContext.outputPath);
  });

  test("includes spawning rules", () => {
    const output = renderTaskContext(baseContext);
    expect(output).toMatch(/leaf agent/i);
  });

  test("includes ancestry chain when non-empty", () => {
    const ctx: TaskDispatchContext = {
      ...baseContext,
      ancestryChain: [
        { skill: "backend-developer", sessionId: "s-parent" },
      ],
    };
    const output = renderTaskContext(ctx);
    expect(output).toContain("backend-developer");
    expect(output).toContain("s-parent");
  });

  test("includes prior output paths", () => {
    const ctx: TaskDispatchContext = {
      ...baseContext,
      priorOutputPaths: [
        "/tmp/agentz/sessions/session-001/tasks/task-000/output.md",
      ],
    };
    const output = renderTaskContext(ctx);
    expect(output).toContain("task-000");
  });

  test("includes global notes when present", () => {
    const ctx: TaskDispatchContext = {
      ...baseContext,
      globalNotes: [
        { content: "Project uses PostgreSQL 15", stale: false },
        { content: "Team prefers tabs over spaces", stale: true },
      ],
    };
    const output = renderTaskContext(ctx);
    expect(output).toContain("PostgreSQL 15");
    expect(output).toContain("[stale]");
    expect(output).toContain("Project Knowledge");
  });

  test("omits Project Knowledge section when no global notes", () => {
    const output = renderTaskContext(baseContext);
    expect(output).not.toContain("Project Knowledge");
  });

  test("is deterministic", () => {
    const output1 = renderTaskContext(baseContext);
    const output2 = renderTaskContext(baseContext);
    expect(output1).toBe(output2);
  });
});
