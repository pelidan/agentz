# Agentz Phase 8: End-to-End Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Validate the complete orchestration flow with an end-to-end test and finish cleanup needed for a usable v1 implementation plan.

**Architecture:** This phase exercises the system as an integrated whole, covering session setup, todo creation, task execution flow, working view generation, and final cleanup. It serves as the final confidence gate before broader usage.

**Tech Stack:** TypeScript (strict), Bun runtime, `@opencode-ai/plugin` v1.2.22, `@opencode-ai/sdk` v1.2.22, `bun:sqlite`, `bun:test`, zod v4.1.8

**Prerequisites:** Phase 7 complete and committed.

---

## Tasks

### Task 8.1: Write E2E integration test

This test verifies the full dispatch cycle with a mock SDK client. It tests:
1. Session creation
2. Triage dispatch (creates todos)
3. Task dispatch (creates output, processes recommendations)
4. Working view generation
5. Query functionality

**Files:**
- Create: `src/e2e.test.ts`

**Step 1: Write the E2E test**

`src/e2e.test.ts`:
```typescript
import {
  describe,
  expect,
  test,
  beforeEach,
  afterEach,
} from "bun:test";
import { Database } from "bun:sqlite";
import { AgentzDB } from "./db/index";
import { createSchema } from "./db/schema";
import { buildWorkingView } from "./hooks/working-view";
import { executeQuery } from "./query/index";
import { processRecommendations } from "./dispatch/recommendations";
import { composeSystemPrompt, classifyError } from "./dispatch/index";
import { validateCompletionReport } from "./protocol/validator";
import {
  formatCompletionReport,
  formatTriageReport,
  formatFailureReport,
} from "./dispatch/report";
import type { Recommendation } from "./protocol/types";
import { join } from "path";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";

const TEST_DIR = join(import.meta.dir, "../.test-tmp-e2e");
const SKILLS_DIR = join(import.meta.dir, "../skills");

describe("E2E integration", () => {
  let raw: Database;
  let db: AgentzDB;

  beforeEach(() => {
    raw = new Database(":memory:");
    createSchema(raw);
    db = new AgentzDB(raw);
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    raw.close();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("full session lifecycle: create → triage → dispatch → synthesize", () => {
    // 1. Create session
    const session = db.createSession({
      id: "e2e-001",
      openCodeSessionId: "oc-e2e",
      goal: "Add user authentication to the API",
    });
    expect(session.status).toBe("active");

    // 2. Simulate triage — add todos as if triage-analyst ran
    const triageRecs: Recommendation[] = [
      {
        type: "ADD_TODO",
        description: "Design auth database schema",
        priority: "high",
        category: "architect-db",
      },
      {
        type: "ADD_TODO",
        description: "Implement JWT auth middleware",
        priority: "high",
        category: "develop-backend",
      },
      {
        type: "ADD_TODO",
        description: "Write auth tests",
        priority: "medium",
        category: "test-backend",
      },
      {
        type: "ADD_TODO",
        description: "Review auth implementation",
        priority: "low",
        category: "review-code",
      },
    ];
    const triageResult = processRecommendations(
      db,
      "e2e-001",
      "task-triage",
      triageRecs
    );
    expect(triageResult.todosAdded).toBe(4);

    // 3. Verify working view after triage
    const viewAfterTriage = buildWorkingView(db, "e2e-001");
    expect(viewAfterTriage).toContain("Add user authentication");
    expect(viewAfterTriage).toContain("Design auth database schema");
    // Check that a remaining-count indicator is present (exact number may vary with formatting)
    expect(viewAfterTriage).toMatch(/\d+\s+remaining/);

    // 4. Simulate first task dispatch — pick next todo
    const nextTodo = db.getNextPendingTodo("e2e-001");
    expect(nextTodo).toBeDefined();
    expect(nextTodo!.description).toBe("Design auth database schema");

    // Create task
    const taskId = db.getNextTaskId("e2e-001");
    expect(taskId).toBe("task-001");

    db.createTask({
      id: taskId,
      sessionId: "e2e-001",
      todoId: nextTodo!.id,
      skill: "database-architect",
      tier: "powerful",
      inputSummary: nextTodo!.description,
      iteration: 1,
    });
    db.updateTodoStatus(nextTodo!.id, "in_progress");
    db.updateTaskStatus(taskId, "running");

    // 5. Simulate agent output — write output file
    const outputDir = join(TEST_DIR, "tasks", taskId);
    mkdirSync(outputDir, { recursive: true });
    const outputPath = join(outputDir, "output.md");
    writeFileSync(
      outputPath,
      `## Summary

Designed JWT-based auth schema with users, sessions, and refresh_tokens tables. Uses bcrypt for password hashing and RS256 for JWT signing.

## Details

Created three tables:
- users: id, email, password_hash, created_at
- sessions: id, user_id, token, expires_at
- refresh_tokens: id, session_id, token, expires_at

## Artifacts

- migrations/001_auth_schema.sql

## Recommendations

- ADD_NOTE: Auth uses JWT with RS256 signing
- ADD_GLOBAL_NOTE: Project auth uses JWT with RS256 signing, bcrypt for passwords [category: tech-stack]
`
    );

    // 6. Validate the simulated output
    const rawResponse = `I've completed the database schema design.

STATUS: completed
OUTPUT: ${outputPath}
SUMMARY: Designed JWT-based auth schema with users, sessions, and refresh_tokens tables. Uses bcrypt for password hashing.
RECOMMENDATIONS:
- ADD_NOTE: Auth uses JWT with RS256 signing
- ADD_GLOBAL_NOTE: Project auth uses JWT with RS256 signing, bcrypt for passwords [category: tech-stack]`;

    const validation = validateCompletionReport(rawResponse);
    expect(validation.valid).toBe(true);
    expect(validation.report!.status).toBe("completed");
    expect(validation.report!.recommendations).toHaveLength(2);

    // 7. Process recommendations
    const recResult = processRecommendations(
      db,
      "e2e-001",
      taskId,
      validation.report!.recommendations
    );
    expect(recResult.notesRecorded).toBe(1);
    expect(recResult.globalNotesDrafted).toBe(1);

    // 8. Complete task and todo
    db.completeTask(taskId, {
      outputSummary: validation.report!.summary,
      outputPath,
      finalTier: "powerful",
      recommendations: JSON.stringify(validation.report!.recommendations),
    });
    db.completeTodo(nextTodo!.id, taskId);

    // 9. Add iteration
    db.addIteration({
      sessionId: "e2e-001",
      iterationNumber: 1,
      summary: "Dispatched database-architect for auth schema design. Completed successfully.",
    });

    // 10. Verify working view after first task
    const viewAfterTask = buildWorkingView(db, "e2e-001");
    expect(viewAfterTask).toContain("1 completed");
    // Verify a remaining-count indicator is still present (exact number may vary)
    expect(viewAfterTask).toMatch(/\d+\s+remaining/);
    expect(viewAfterTask).toContain("Designed JWT-based auth schema");

    // 11. Verify notes were stored
    const notes = db.getNotes("e2e-001");
    expect(notes).toHaveLength(1);
    expect(notes[0].content).toContain("JWT with RS256");

    // 12. Verify global notes were created as draft
    const globalNotes = db.getGlobalNotes();
    expect(globalNotes).toHaveLength(1);
    expect(globalNotes[0].status).toBe("draft");

    // 13. Verify query tool works
    const todoQuery = executeQuery(db, "e2e-001", { section: "todos" });
    expect(todoQuery).toContain("Design auth database schema");
    expect(todoQuery).toContain("completed");

    const noteQuery = executeQuery(db, "e2e-001", {
      section: "notes",
      keyword: "JWT",
    });
    expect(noteQuery).toContain("JWT with RS256");

    // 14. Test triage report formatting
    const triageReport = formatTriageReport({
      goalSummary: "Add user authentication",
      complexity: "high",
      rationale: "Requires JWT, database schema, middleware, and tests.",
      todosAdded: 4,
      priorityBreakdown: { high: 2, medium: 1, low: 1 },
    });
    expect(triageReport).toContain("Complexity: high");

    // 15. Test failure report formatting
    const failureReport = formatFailureReport({
      todoDescription: "Failed task",
      errorType: "capability",
      errorDetail: "Model could not follow protocol",
      attempts: 3,
      tiersTried: ["fast-cheap", "balanced", "powerful"],
    });
    expect(failureReport).toContain("capability");

    // 16. Test system prompt composition
    const systemPrompt = composeSystemPrompt(
      "backend-developer",
      {
        sessionId: "e2e-001",
        taskId: "task-002",
        outputPath: "/tmp/output.md",
        ancestryChain: [],
        priorOutputPaths: [outputPath],
        globalNotes: [],
      },
      SKILLS_DIR
    );
    expect(systemPrompt).toContain("## Output Protocol"); // from renderer
    expect(systemPrompt).toContain("# Skill: backend-developer"); // from skill
    expect(systemPrompt).toContain("task-002"); // from context
  });

  test("error classification", () => {
    expect(classifyError(new Error("timeout"))).toBe("transient");
    expect(classifyError(new Error("network error"))).toBe("transient");
    expect(classifyError(new Error("unknown"))).toBe("capability");
    expect(classifyError(null, { valid: false })).toBe("capability");
  });

  test("validation failure leaves todo and task in failed state", () => {
    // 1. Create session and a single todo
    db.createSession({
      id: "e2e-fail-001",
      openCodeSessionId: "oc-fail",
      goal: "Test validation failure path",
    });
    processRecommendations(db, "e2e-fail-001", "task-triage", [
      {
        type: "ADD_TODO",
        description: "Implement feature X",
        priority: "high",
        category: "develop-backend",
      },
    ]);

    // 2. Dispatch the todo
    const nextTodo = db.getNextPendingTodo("e2e-fail-001");
    expect(nextTodo).toBeDefined();
    const taskId = db.getNextTaskId("e2e-fail-001");
    db.createTask({
      id: taskId,
      sessionId: "e2e-fail-001",
      todoId: nextTodo!.id,
      skill: "backend-developer",
      tier: "fast-cheap",
      inputSummary: nextTodo!.description,
      iteration: 1,
    });
    db.updateTodoStatus(nextTodo!.id, "in_progress");
    db.updateTaskStatus(taskId, "running");

    // 3. Agent returns a malformed response that fails validation
    const badResponse = "I did some stuff but forgot the required STATUS line.";
    const validation = validateCompletionReport(badResponse);
    expect(validation.valid).toBe(false);

    // 4. Record the failed task in the database
    const errorType = classifyError(null, validation);
    db.failTask(taskId, {
      errorType,
      errorDetail: "Agent response did not contain a valid STATUS line",
    });
    db.updateTodoStatus(nextTodo!.id, "failed");

    // 5. Assert DB state reflects the failed task path cleanly
    const failedTask = db.getTask(taskId);
    expect(failedTask).toBeDefined();
    expect(failedTask!.status).toBe("failed");
    expect(failedTask!.errorType).toBe("capability");

    const failedTodo = db.getTodo(nextTodo!.id);
    expect(failedTodo!.status).toBe("failed");

    // 6. No notes or global notes should have been written
    const notes = db.getNotes("e2e-fail-001");
    expect(notes).toHaveLength(0);
    const globalNotes = db.getGlobalNotes();
    expect(globalNotes).toHaveLength(0);
  });
});
```

**Step 1b: Add plugin-entry smoke test**

Append the following smoke test to `src/e2e.test.ts` (or create a separate `src/plugin-entry.test.ts`):

```typescript
import { describe, test, expect } from "bun:test";

describe("plugin entry smoke test", () => {
  test("src/index.ts loads without throwing", async () => {
    // Dynamic import ensures module-level side effects are also exercised.
    // No live SDK calls are made; this is purely a load/parse check.
    const mod = await import("./index");
    // The plugin entry must export a default (the plugin definition object).
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("object");
  });
});
```

Run: `bun test src/plugin-entry.test.ts` (or the file you appended to)
Expected: Test PASSES (module loads, default export is present)

**Step 2: Run the E2E test**

Run: `bun test src/e2e.test.ts`
Expected: All tests PASS

**Step 3: Run the full test suite**

Run: `bun test`
Expected: All tests PASS

**Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add src/e2e.test.ts
git commit -m "test: add E2E integration test covering full session lifecycle"
```

### Task 8.2: Final verification and cleanup

**Step 1: Delete the test fixture skill file**

Run:
```bash
rm skills/test-skill.md
```

Verify it is gone:
```bash
ls skills/test-skill.md 2>&1 || echo "deleted OK"
```

**Step 2: Retarget `src/skills/loader.test.ts` to the real `local-explorer` skill**

Open `src/skills/loader.test.ts` and apply the following exact edits:

1. Replace every occurrence of `"test-skill"` with `"local-explorer"`.
2. Replace every occurrence of `"test-skill.md"` with `"local-explorer.md"`.
3. Update any assertion that checks an expected heading or title string.
   - Old: anything matching `Test Skill` or `# Test Skill`
   - New: `# Skill: local-explorer` (match the actual H1 in `skills/local-explorer.md`)
4. Update any fixture string that references content unique to `test-skill.md` to reference content that actually exists in `skills/local-explorer.md` (e.g. a real section heading from that file).

After edits, the loader test must no longer reference `test-skill` anywhere.

**Step 3: Run full test suite**

Run: `bun test`
Expected: All tests PASS

**Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: remove test-skill fixture, retarget loader test to local-explorer"
```

---
