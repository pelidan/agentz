# Agentz Phase 6: Working View and Hooks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Inject a compact orchestrator working view and implement the runtime hooks that preserve Agentz state across interruptions and compaction.

**Architecture:** This phase derives a pruned DB-backed session view for the orchestrator and wires the event, system transform, and compaction hooks to use it. It completes the state rehydration story for iterative orchestration.

**Tech Stack:** TypeScript (strict), Bun runtime, `@opencode-ai/plugin` v1.2.22, `@opencode-ai/sdk` v1.2.22, `bun:sqlite`, `bun:test`, zod v4.1.8

**Prerequisites:** Phase 5 complete and committed.

---

## Tasks

### Task 6.1: Implement buildWorkingView

**Files:**
- Create: `src/hooks/working-view.ts`
- Test: `src/hooks/working-view.test.ts`

**Step 1: Write the test**

`src/hooks/working-view.test.ts`:
```typescript
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
```

**Step 2: Run the test to verify it fails**

Run: `bun test src/hooks/working-view.test.ts`
Expected: FAIL — cannot resolve imports

**Step 3: Implement buildWorkingView**

`src/hooks/working-view.ts`:
```typescript
import type { AgentzDB } from "../db/index";

/**
 * Builds the pruned working view injected into the orchestrator's system prompt.
 * Contains: goal, incomplete todos + completed count, last 3 iterations,
 * all notes, last completed task summary, review item count.
 *
 * Does NOT include global notes (orchestrator stays domain-free).
 */
export function buildWorkingView(db: AgentzDB, sessionId: string): string {
  const session = db.getSession(sessionId);
  if (!session) return "No active agentz session.";

  const sections: string[] = [];

  // --- Goal ---
  sections.push(`## Agentz Session: ${session.id}
**Goal:** ${session.goal}
**Status:** ${session.status}`);

  // --- Todos ---
  const todos = db.getTodos(sessionId);
  const completedCount = todos.filter((t) => t.status === "completed").length;
  const incompleteTodos = todos.filter(
    (t) => t.status !== "completed" && t.status !== "cancelled"
  );

  if (todos.length === 0) {
    sections.push(`## Todos
No todos yet. Dispatch a triage-analyst to decompose the goal.`);
  } else {
    const todoLines = incompleteTodos
      .map(
        (t) =>
          `- [${t.id}] ${t.description} — ${t.status}, priority: ${t.priority}${t.category ? `, category: ${t.category}` : ""}`
      )
      .join("\n");
    sections.push(`## Todos (${completedCount} completed, ${incompleteTodos.length} remaining)
${todoLines || "All todos completed!"}`);
  }

  // --- Recent Iterations (last 3) ---
  const iterations = db.getLatestIterations(sessionId, 3);
  if (iterations.length > 0) {
    const iterLines = iterations
      .map((i) => `- [${i.iteration_number}] ${i.summary}`)
      .join("\n");
    sections.push(`## Recent Iterations
${iterLines}`);
  }

  // --- Notes ---
  const notes = db.getNotes(sessionId);
  if (notes.length > 0) {
    const noteLines = notes.map((n) => `- ${n.content}`).join("\n");
    sections.push(`## Session Notes
${noteLines}`);
  }

  // --- Last Completed Task ---
  const tasks = db.getTasksBySession(sessionId);
  const lastCompleted = tasks
    .filter((t) => t.status === "completed")
    .pop();
  if (lastCompleted) {
    sections.push(`## Last Completed Task
**${lastCompleted.id}** (${lastCompleted.skill}): ${lastCompleted.output_summary ?? "No summary"}`);
  }

  // --- Review Items Count ---
  const reviewCount = db.getReviewItemCount(sessionId);
  if (reviewCount > 0) {
    sections.push(`## Pending Reviews
${reviewCount} item(s) flagged for review (unsurfaced).`);
  }

  return sections.join("\n\n");
}
```

**Step 4: Run the test to verify it passes**

Run: `bun test src/hooks/working-view.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/hooks/working-view.ts src/hooks/working-view.test.ts
git commit -m "feat: implement buildWorkingView for orchestrator state injection"
```

### Task 6.2: Implement event and compaction hooks

**Files:**
- Create: `src/hooks/index.ts`
- Create: `src/hooks/index.test.ts`
- Modify: `src/index.ts`

**Step 1: Implement hooks/index.ts**

> **⚠ Event schema verification required:** Before implementing, confirm the real plugin event payload shapes for `session.error` and `session.compacted` against the `@opencode-ai/plugin` v1.2.22 type definitions. If the API remains loosely typed (i.e. event payloads typed as `any` or `unknown`), retain the runtime property guards shown below (`event.properties?.error`, `event.properties?.sessionID`, etc.) — do not remove them in pursuit of type brevity.

`src/hooks/index.ts`:
```typescript
import type { AgentzDB } from "../db/index";
import { buildWorkingView } from "./working-view";

export interface HookState {
  db: AgentzDB;
  sessionAgentMap: Map<string, string>;
  compactedSessions: Set<string>;
}

/**
 * Handles incoming events (interruption detection, compaction).
 */
export function handleEvent(
  state: HookState,
  event: any
): void {
  // Interruption detection
  if (event.type === "session.error") {
    const err = event.properties?.error;
    if (err?.name === "MessageAbortedError") {
      const sessionID = event.properties?.sessionID;
      if (!sessionID) return;

      // Find agentz session linked to this OpenCode session
      const session = state.db.getActiveSessionByOpenCodeId(sessionID);
      if (!session) return;

      const runningTask = state.db.getRunningTask(session.id);
      if (runningTask) {
        state.db.updateTaskStatus(runningTask.id, "interrupted");
        // Find the todo for this task and mark it interrupted
        if (runningTask.todo_id) {
          state.db.updateTodoStatus(runningTask.todo_id, "interrupted");
        }
      }
    }
  }

  // Compaction detection
  if (event.type === "session.compacted") {
    const sessionID = event.properties?.sessionID;
    if (sessionID) {
      state.compactedSessions.add(sessionID);
    }
  }
}

/**
 * Injects agentz working view into the orchestrator's system prompt.
 * Only fires when the active agent is "agentz".
 */
export function handleSystemTransform(
  state: HookState,
  sessionID: string | undefined,
  output: { system: string[] }
): void {
  if (!sessionID) return;
  const activeAgent = state.sessionAgentMap.get(sessionID);
  if (activeAgent !== "agentz") return;

  const session = state.db.getActiveSessionByOpenCodeId(sessionID);
  if (!session) return;

  output.system.push(buildWorkingView(state.db, session.id));
}

/**
 * Enriches compaction context with agentz state so the
 * compaction summary preserves orchestration awareness.
 */
export function handleCompacting(
  state: HookState,
  sessionID: string | undefined,
  output: { context: string[] }
): void {
  if (!sessionID) return;
  const session = state.db.getActiveSessionByOpenCodeId(sessionID);
  if (!session) return;

  const todos = state.db.getTodos(session.id);
  const completedCount = todos.filter((t) => t.status === "completed").length;
  const runningTask = state.db.getRunningTask(session.id);

  output.context.push(
    `AGENTZ ORCHESTRATION SESSION ACTIVE: ${session.id}`,
    `Goal: ${session.goal}`,
    `Progress: ${completedCount}/${todos.length} todos completed`,
    `Current task: ${runningTask ? `${runningTask.id} (${runningTask.skill})` : "none"}`,
    `IMPORTANT: After compaction, the orchestrator must continue by loading state from the agentz database and resuming the iteration loop.`
  );
}
```

**Step 2: Write tests for hooks/index.ts**

`src/hooks/index.test.ts`:
```typescript
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
    db.createSession({ id: "s-001", goal: "Test goal", opencode_session_id: "oc-001" });
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
    const updatedTodo = db.getTodo(todo.id);
    expect(updatedTodo?.status).toBe("interrupted");
  });

  test("ignores session.error for non-abort errors", () => {
    db.createSession({ id: "s-001", goal: "Test goal", opencode_session_id: "oc-001" });
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
    db.createSession({ id: "s-001", goal: "Build auth", opencode_session_id: "oc-001" });
    state.sessionAgentMap.set("oc-001", "agentz");
    const output = { system: [] as string[] };

    handleSystemTransform(state, "oc-001", output);

    expect(output.system.length).toBeGreaterThan(0);
    expect(output.system[0]).toContain("Build auth");
  });

  test("does not inject when active agent is not agentz", () => {
    db.createSession({ id: "s-001", goal: "Build auth", opencode_session_id: "oc-001" });
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
    db.createSession({ id: "s-001", goal: "Build auth", opencode_session_id: "oc-001" });
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
```

**Step 3: Run tests to verify they fail (no implementation yet)**

Run: `bun test src/hooks/index.test.ts`
Expected: FAIL — cannot resolve imports

**Step 4: Wire src/index.ts to use real hook implementations**

Update `src/index.ts` using the following checklist:

- [ ] Import `handleEvent`, `handleSystemTransform`, `handleCompacting`, and `HookState` from `./hooks/index` (not from inline stubs)
- [ ] Share the `AgentzDB` instance that was initialized in Phase 5 — do **not** create a second database connection
- [ ] Preserve `sessionAgentMap` (`Map<string, string>`) and `compactedSessions` (`Set<string>`) in plugin scope, outside any per-event handler
- [ ] Pass a single `HookState` object `{ db, sessionAgentMap, compactedSessions }` into each hook call
- [ ] Note in a comment that `"interrupted"` is an **intentional** task/todo status used by the interruption path — do not filter or reassign it on resume without deliberate logic
- [ ] Note in a comment that hook lookups via `getActiveSessionByOpenCodeId` depend on `opencode_session_id` being populated on the session row; sessions created without this field will not be found by the hooks

**Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 6: Run full test suite**

Run: `bun test`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/hooks/index.ts src/hooks/index.test.ts src/index.ts
git commit -m "feat: implement event, system.transform, and compaction hooks"
```

### Task 6.3: Run full test suite for Phases 5-6

**Step 1: Run all tests**

Run: `bun test`
Expected: All tests PASS

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors
