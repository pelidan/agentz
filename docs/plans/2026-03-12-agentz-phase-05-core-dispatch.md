# Agentz Phase 5: Core Dispatch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the dispatch and query core that spawns worker sessions, validates results, and updates persistent state.

**Architecture:** This phase adds the skill loader, recommendation processor, report formatters, dispatch execution path, query handler, and plugin wiring. It is the bridge between prompt composition, model execution, and the database-backed orchestration loop.

**Tech Stack:** TypeScript (strict), Bun runtime, `@opencode-ai/plugin` v1.2.22, `@opencode-ai/sdk` v1.2.22, `bun:sqlite`, `bun:test`, zod v4.1.8

**Prerequisites:** Phase 4 complete and committed.

---

## Tasks

### Task 5.1: Implement skill file loader

**Files:**
- Create: `src/skills/loader.ts`
- Test: `src/skills/loader.test.ts`
- Create: `skills/test-skill.md` (test fixture)

**Step 1: Create test fixture skill file**

`skills/test-skill.md`:
```markdown
# Skill: test-skill

## Role
A test skill for unit testing the skill loader.

## Capabilities
- Testing skill loading

## Constraints
- Only used in tests

## Domain Instructions
Follow the test instructions carefully.
```

**Step 2: Write the test**

`src/skills/loader.test.ts`:
```typescript
import { describe, expect, test } from "bun:test";
import { loadSkill, skillExists } from "./loader";
import { join } from "path";

const SKILLS_DIR = join(import.meta.dir, "../../skills");

describe("skill loader", () => {
  test("loads a skill file by name", () => {
    const content = loadSkill("test-skill", SKILLS_DIR);
    expect(content).toContain("# Skill: test-skill");
    expect(content).toContain("## Role");
    expect(content).toContain("## Capabilities");
  });

  test("skillExists returns true for existing skill", () => {
    expect(skillExists("test-skill", SKILLS_DIR)).toBe(true);
  });

  test("skillExists returns false for non-existing skill", () => {
    expect(skillExists("nonexistent-skill", SKILLS_DIR)).toBe(false);
  });

  test("loadSkill throws for non-existing skill", () => {
    expect(() => loadSkill("nonexistent", SKILLS_DIR)).toThrow(
      /skill.*not found/i
    );
  });

  test("loaded content is trimmed", () => {
    const content = loadSkill("test-skill", SKILLS_DIR);
    expect(content).toBe(content.trim());
  });
});
```

**Step 3: Run the test to verify it fails**

Run: `bun test src/skills/loader.test.ts`
Expected: FAIL — cannot resolve imports

**Step 4: Implement loader**

`src/skills/loader.ts`:
```typescript
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Loads a skill file by name from the skills directory.
 * Skill files are pure markdown with no template variables.
 */
export function loadSkill(skillName: string, skillsDir: string): string {
  const filePath = join(skillsDir, `${skillName}.md`);
  if (!existsSync(filePath)) {
    throw new Error(
      `Skill file not found: ${skillName} (expected at ${filePath})`
    );
  }
  return readFileSync(filePath, "utf-8").trim();
}

/**
 * Checks if a skill file exists.
 */
export function skillExists(skillName: string, skillsDir: string): boolean {
  return existsSync(join(skillsDir, `${skillName}.md`));
}
```

**Step 5: Run the test to verify it passes**

Run: `bun test src/skills/loader.test.ts`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/skills/loader.ts src/skills/loader.test.ts skills/test-skill.md
git commit -m "feat: implement skill file loader"
```

### Task 5.2: Implement recommendation processor

**Files:**
- Create: `src/dispatch/recommendations.ts`
- Test: `src/dispatch/recommendations.test.ts`

**Step 1: Write the test**

`src/dispatch/recommendations.test.ts`:
```typescript
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
      iteration: 1, // orchestrator iteration number (loop cycle), not task sequence
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
      iteration: 1, // orchestrator iteration number (loop cycle), not task sequence
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
```

**Step 2: Run the test to verify it fails**

Run: `bun test src/dispatch/recommendations.test.ts`
Expected: FAIL — cannot resolve imports

**Step 3: Implement recommendation processor**

Create directory first:
```bash
mkdir -p src/dispatch
```

`src/dispatch/recommendations.ts`:
```typescript
import type { AgentzDB } from "../db/index";
import type { Recommendation } from "../protocol/types";

export interface RecommendationProcessingResult {
  todosAdded: number;
  notesRecorded: number;
  reviewItemsAdded: number;
  globalNotesDrafted: number;
}

/**
 * Processes agent recommendations programmatically.
 * Writes ADD_TODO → todos table, ADD_NOTE → notes table,
 * NEEDS_REVIEW → review_items table, ADD_GLOBAL_NOTE → global_notes table.
 */
export function processRecommendations(
  db: AgentzDB,
  sessionId: string,
  taskId: string,
  recommendations: Recommendation[]
): RecommendationProcessingResult {
  const result: RecommendationProcessingResult = {
    todosAdded: 0,
    notesRecorded: 0,
    reviewItemsAdded: 0,
    globalNotesDrafted: 0,
  };

  for (const rec of recommendations) {
    switch (rec.type) {
      case "ADD_TODO":
        db.addTodo({
          sessionId,
          description: rec.description,
          priority: rec.priority ?? "medium",
          category: rec.category,
          addedBy: taskId,
        });
        result.todosAdded++;
        break;

      case "ADD_NOTE":
        db.addNote({
          sessionId,
          content: rec.description,
          addedBy: taskId,
        });
        result.notesRecorded++;
        break;

      case "NEEDS_REVIEW":
        db.addReviewItem({
          taskId,
          sessionId,
          content: rec.description,
        });
        result.reviewItemsAdded++;
        break;

      case "ADD_GLOBAL_NOTE":
        db.addGlobalNote({
          content: rec.description,
          category: rec.category,
          sourceSessionId: sessionId,
          sourceTaskId: taskId,
        });
        result.globalNotesDrafted++;
        break;
    }
  }

  return result;
}
```

**Step 4: Run the test to verify it passes**

Run: `bun test src/dispatch/recommendations.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/dispatch/recommendations.ts src/dispatch/recommendations.test.ts
git commit -m "feat: implement programmatic recommendation processor"
```

### Task 5.3: Implement structured report formatters

**Files:**
- Create: `src/dispatch/report.ts`
- Test: `src/dispatch/report.test.ts`

**Step 1: Write the test**

`src/dispatch/report.test.ts`:
```typescript
import { describe, expect, test } from "bun:test";
import {
  formatCompletionReport,
  formatTriageReport,
  formatFailureReport,
} from "./report";

describe("formatCompletionReport", () => {
  test("formats a standard completion report", () => {
    const result = formatCompletionReport({
      todoDescription: "Implement user API",
      summary: "Implemented CRUD endpoints. All tests pass.",
      outputPath: "/tmp/output.md",
      todosAdded: 2,
      notesRecorded: 1,
      reviewItemsAdded: 0,
      globalNotesDrafted: 1,
    });
    expect(result).toContain('Task "Implement user API" completed.');
    expect(result).toContain("Summary: Implemented CRUD endpoints");
    expect(result).toContain("Output: /tmp/output.md");
    expect(result).toContain("2 todos added");
    expect(result).toContain("1 notes recorded");
    expect(result).toContain("1 global notes drafted");
  });

  test("formats report with zero actions", () => {
    const result = formatCompletionReport({
      todoDescription: "Simple task",
      summary: "Done.",
      outputPath: "/tmp/out.md",
      todosAdded: 0,
      notesRecorded: 0,
      reviewItemsAdded: 0,
      globalNotesDrafted: 0,
    });
    expect(result).toContain("0 todos added");
  });
});

describe("formatTriageReport", () => {
  test("formats a triage completion report", () => {
    const result = formatTriageReport({
      goalSummary: "Build auth system",
      complexity: "high",
      rationale: "Requires JWT, OAuth, and session management.",
      todosAdded: 5,
      priorityBreakdown: { high: 2, medium: 2, low: 1 },
    });
    expect(result).toContain('Task "Triage: Build auth system" completed.');
    expect(result).toContain("Complexity: high");
    expect(result).toContain("Rationale:");
    expect(result).toContain("Todos added: 5");
  });
});

describe("formatFailureReport", () => {
  test("formats a failure report", () => {
    const result = formatFailureReport({
      todoDescription: "Implement caching",
      errorType: "capability",
      errorDetail: "Model could not follow protocol",
      attempts: 3,
      tiersTried: ["fast-cheap", "balanced", "powerful"],
    });
    expect(result).toContain('Task "Implement caching" failed.');
    expect(result).toContain("Error: capability");
    expect(result).toContain("Attempts: 3");
    expect(result).toContain("fast-cheap, balanced, powerful");
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `bun test src/dispatch/report.test.ts`
Expected: FAIL — cannot resolve imports

**Step 3: Implement report formatters**

`src/dispatch/report.ts`:
```typescript
/**
 * Formats a structured completion report for the orchestrator.
 * Domain-free — the orchestrator sees only status, summary, path, and action counts.
 */
export function formatCompletionReport(params: {
  todoDescription: string;
  summary: string;
  outputPath: string;
  todosAdded: number;
  notesRecorded: number;
  reviewItemsAdded: number;
  globalNotesDrafted: number;
}): string {
  return `Task "${params.todoDescription}" completed.
Summary: ${params.summary}
Output: ${params.outputPath}
Actions: ${params.todosAdded} todos added, ${params.notesRecorded} notes recorded, ${params.reviewItemsAdded} items flagged for review, ${params.globalNotesDrafted} global notes drafted.`;
}

/**
 * Formats a structured triage report for the orchestrator.
 */
export function formatTriageReport(params: {
  goalSummary: string;
  complexity: string;
  rationale: string;
  todosAdded: number;
  priorityBreakdown: Record<string, number>;
}): string {
  const breakdown = Object.entries(params.priorityBreakdown)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  return `Task "Triage: ${params.goalSummary}" completed.
Complexity: ${params.complexity}
Rationale: ${params.rationale}
Todos added: ${params.todosAdded} (priorities: ${breakdown})`;
}

/**
 * Formats a structured failure report for the orchestrator.
 * Generated entirely by plugin code from escalation ladder metadata.
 */
export function formatFailureReport(params: {
  todoDescription: string;
  errorType: string;
  errorDetail: string;
  attempts: number;
  tiersTried: string[];
}): string {
  return `Task "${params.todoDescription}" failed.
Error: ${params.errorType} — ${params.errorDetail}
Attempts: ${params.attempts} (tiers tried: ${params.tiersTried.join(", ")})`;
}
```

**Step 4: Run the test to verify it passes**

Run: `bun test src/dispatch/report.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/dispatch/report.ts src/dispatch/report.test.ts
git commit -m "feat: implement structured report formatters for orchestrator"
```

### Task 5.4: Implement the agentz_dispatch execute function

**Files:**
- Create: `src/dispatch/index.ts`
- Create: `src/dispatch/dispatch-helpers.test.ts`
- Modify: `src/index.ts` (wire up real dispatch)

Note: This is the core integration point. The `executeDispatch` function requires the SDK client and cannot be fully unit-tested without mocking, so full E2E testing happens in Phase 8. However, the pure helper functions `composeSystemPrompt()` and `classifyError()` are fully testable and must have red-green coverage before the main implementation is committed.

**Step 1: Write tests for pure dispatch helpers**

`src/dispatch/dispatch-helpers.test.ts`:
```typescript
import { describe, expect, test } from "bun:test";
import { composeSystemPrompt, classifyError } from "./index";
import { join } from "path";

const SKILLS_DIR = join(import.meta.dir, "../../skills");

describe("composeSystemPrompt", () => {
  test("includes protocol, skill, and task-context layers in order", () => {
    const taskContext = {
      sessionId: "s-001",
      taskId: "task-001",
      outputPath: "/tmp/output.md",
      ancestryChain: [],
      priorOutputPaths: [],
      globalNotes: [],
    };
    const prompt = composeSystemPrompt("test-skill", taskContext, SKILLS_DIR);
    // Protocol layer must appear before skill layer
    const protocolIdx = prompt.indexOf("## Protocol");
    const skillIdx = prompt.indexOf("# Skill: test-skill");
    const contextIdx = prompt.indexOf("s-001");
    expect(protocolIdx).toBeGreaterThanOrEqual(0);
    expect(skillIdx).toBeGreaterThan(protocolIdx);
    expect(contextIdx).toBeGreaterThan(skillIdx);
  });
});

describe("classifyError", () => {
  test("validation failure classifies as capability", () => {
    const result = classifyError(null, { valid: false });
    expect(result).toBe("capability");
  });

  test("connection-refused message classifies as transient", () => {
    const result = classifyError(new Error("connect ECONNREFUSED 127.0.0.1:3000"));
    expect(result).toBe("transient");
  });

  test("timeout message classifies as transient", () => {
    const result = classifyError(new Error("Request timeout after 30s"));
    expect(result).toBe("transient");
  });

  test("unknown error falls back to capability", () => {
    const result = classifyError(new Error("some unexpected model output"));
    expect(result).toBe("capability");
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `bun test src/dispatch/dispatch-helpers.test.ts`
Expected: FAIL — cannot resolve imports

**Step 3: Implement dispatch/index.ts**

`src/dispatch/index.ts`:
```typescript
import type { AgentzDB, TaskRow, TodoRow } from "../db/index";
import type { CompletionReport } from "../protocol/types";
import { renderProtocol } from "../protocol/renderer";
import { renderTaskContext, type TaskDispatchContext } from "../protocol/context";
import { validateCompletionReport } from "../protocol/validator";
import { loadSkill } from "../skills/loader";
import { processRecommendations } from "./recommendations";
import {
  formatCompletionReport,
  formatTriageReport,
  formatFailureReport,
} from "./report";
import {
  getTierForCategory,
  getSkillForCategory,
  getEscalationTier,
  type TierConfig,
  DEFAULT_TIER_CONFIG,
} from "../config";
import { mkdirSync } from "fs";
import { dirname, join } from "path";

export interface DispatchContext {
  db: AgentzDB;
  /** Narrow local interface matching the subset of the SDK client used by dispatch.
   *  Replace with the real SDK client type once confirmed against installed types. */
  client: {
    session: {
      create(opts: { parentID?: string }): Promise<{ id: string }>;
      prompt(opts: {
        sessionID: string;
        agent?: string;
        model?: string;
        system?: string;
        parts: Array<{ type: string; text: string }>;
      }): Promise<unknown>;
    };
  };
  sessionId: string;
  todoId: number;
  skill: string;
  skillsDir: string;
  outputBaseDir: string;
  tierConfig?: TierConfig;
  metadata?: (input: any) => void; // ctx.metadata from tool context
}

export interface DispatchResult {
  success: boolean;
  report: string; // Structured report for the orchestrator
  taskId: string;
}

/**
 * Composes the system prompt from three layers:
 * 1. Protocol (shared, from types)
 * 2. Skill (domain-specific, from .md file)
 * 3. Task context (session/task specific, from DB)
 */
export function composeSystemPrompt(
  skill: string,
  taskContext: TaskDispatchContext,
  skillsDir: string
): string {
  const protocol = renderProtocol();
  const skillContent = loadSkill(skill, skillsDir);
  const context = renderTaskContext(taskContext);
  return `${protocol}\n\n${skillContent}\n\n${context}`;
}

/**
 * Classifies a dispatch failure for the escalation ladder.
 */
export function classifyError(
  error: unknown,
  validationResult?: { valid: boolean }
): "transient" | "capability" | "systematic" {
  // Validation failure = capability (model can't follow protocol)
  if (validationResult && !validationResult.valid) {
    return "capability";
  }

  // Check for known transient errors
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("timeout") ||
      msg.includes("abort") ||
      msg.includes("network") ||
      msg.includes("econnrefused") ||
      msg.includes("rate limit")
    ) {
      return "transient";
    }
  }

  // Default: capability (model produced unexpected output)
  return "capability";
}

/**
 * Executes the full dispatch cycle:
 * 1. Create child session
 * 2. Compose system prompt
 * 3. Call session.prompt()
 * 4. Validate output
 * 5. On failure: escalation ladder
 * 6. Process recommendations
 * 7. Return structured report
 */
export async function executeDispatch(
  ctx: DispatchContext
): Promise<DispatchResult> {
  const { db, client, sessionId, todoId, skill, skillsDir, outputBaseDir } = ctx;
  const tierConfig = ctx.tierConfig ?? DEFAULT_TIER_CONFIG;

  // Get the todo
  const todos = db.getTodos(sessionId);
  const todo = todos.find((t) => t.id === todoId);
  if (!todo) {
    return {
      success: false,
      report: `Error: Todo ${todoId} not found in session ${sessionId}`,
      taskId: "",
    };
  }

  // Determine tier from category
  const category = todo.category ?? skill;
  let currentTier = getTierForCategory(category);

  // Create task record
  // `iteration` here means the orchestrator iteration number (i.e. which
  // top-level orchestrator loop cycle spawned this task).  It does NOT mean
  // "task sequence number within the session" — use the task ID for ordering.
  const taskId = db.getNextTaskId(sessionId);
  const iterationCount =
    db.getIterations(sessionId).length + 1;
  const outputPath = join(
    outputBaseDir,
    "sessions",
    sessionId,
    "tasks",
    taskId,
    "output.md"
  );

  db.createTask({
    id: taskId,
    sessionId,
    todoId,
    skill,
    tier: currentTier,
    inputSummary: todo.description,
    iteration: iterationCount,
  });

  // Mark todo and task as in-progress
  db.updateTodoStatus(todoId, "in_progress");
  db.updateTaskStatus(taskId, "running");

  // Ensure output directory exists
  mkdirSync(dirname(outputPath), { recursive: true });

  // Build task context
  const taskContext: TaskDispatchContext = {
    sessionId,
    taskId,
    outputPath,
    ancestryChain: [], // Top-level dispatch has no ancestry
    priorOutputPaths: db
      .getTasksBySession(sessionId)
      .filter((t) => t.output_path && t.status === "completed")
      .map((t) => t.output_path!),
    globalNotes: db.getConfirmedGlobalNotesForInjection().map((n) => ({
      content: n.content,
      stale: false, // TODO: calculate staleness from confirmed_count/last_confirmed
    })),
  };

  // Update metadata for TUI progress
  const totalTodos = todos.filter(
    (t) => !["cancelled"].includes(t.status)
  ).length;
  const completedTodos = todos.filter(
    (t) => t.status === "completed"
  ).length;
  const progress = `${completedTodos + 1}/${totalTodos}`;

  if (ctx.metadata) {
    ctx.metadata({
      title: `${todo.description} [${progress}]`,
      metadata: {
        todo: todo.description,
        tier: currentTier,
        skill,
        progress,
      },
    });
  }

  // Escalation ladder: up to 3 attempts
  const tiersTried: string[] = [];
  let lastError: string = "";
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    tiersTried.push(currentTier);

    try {
      // 1. Create child session
      const childSession = await client.session.create({
        parentID: undefined, // Will be linked to agentz session
      });

      // 2. Compose system prompt
      const system = composeSystemPrompt(skill, taskContext, skillsDir);

      // 3. Call session.prompt()
      if (ctx.metadata) {
        ctx.metadata({
          title: `${todo.description} [${progress}]${attempt > 1 ? ` — retry ${attempt} (tier: ${currentTier})` : ""}`,
          metadata: { tier: currentTier, skill, progress, attempt },
        });
      }

      const response = await client.session.prompt({
        sessionID: childSession.id,
        agent: "agentz-worker",
        model: tierConfig[currentTier]?.model,
        system,
        parts: [
          {
            type: "text",
            text: `Task: ${todo.description}`,
          },
        ],
      });

      // 4. Extract raw text from response
      const rawText = extractResponseText(response);

      // 5. Validate
      const validationResult = validateCompletionReport(rawText);

      if (validationResult.valid && validationResult.report) {
        // Success! Process recommendations and return
        const report = validationResult.report;
        const recResult = processRecommendations(
          db,
          sessionId,
          taskId,
          report.recommendations
        );

        // Update task as completed
        db.completeTask(taskId, {
          outputSummary: report.summary,
          outputPath: report.outputPath,
          finalTier: currentTier,
          recommendations: JSON.stringify(report.recommendations),
          needsReviewCount: recResult.reviewItemsAdded,
        });

        // Update todo as completed
        db.completeTodo(todoId, taskId);

        const structured = formatCompletionReport({
          todoDescription: todo.description,
          summary: report.summary,
          outputPath: report.outputPath,
          ...recResult,
        });

        return { success: true, report: structured, taskId };
      }

      // Validation failed — classify and potentially escalate
      const errorClass = classifyError(null, validationResult);
      lastError = validationResult.errors
        .map((e) => `${e.field}: ${e.error}`)
        .join("; ");

      if (errorClass === "systematic") {
        break; // No retries for systematic errors
      }

      // Escalate tier for capability errors (skip same-config retry)
      if (errorClass === "capability") {
        const nextTier = getEscalationTier(currentTier, tierConfig);
        if (nextTier) {
          currentTier = nextTier;
        } else {
          break; // No further escalation available
        }
      }

      // Transient: retry same config first, then escalate
      if (errorClass === "transient" && attempt >= 2) {
        const nextTier = getEscalationTier(currentTier, tierConfig);
        if (nextTier) {
          currentTier = nextTier;
        } else {
          break;
        }
      }
    } catch (error) {
      const errorClass = classifyError(error);
      lastError =
        error instanceof Error ? error.message : String(error);

      if (errorClass === "systematic") {
        break;
      }

      if (errorClass === "transient" && attempt < 2) {
        continue; // Retry same config
      }

      // Escalate
      const nextTier = getEscalationTier(currentTier, tierConfig);
      if (nextTier) {
        currentTier = nextTier;
      } else {
        break;
      }
    }
  }

  // All attempts exhausted — fail
  db.failTask(taskId, {
    failureClassification: classifyError(new Error(lastError)).toString(),
    errorDetail: lastError,
    retries: tiersTried.length,
    finalTier: currentTier,
  });
  db.updateTodoStatus(todoId, "failed");

  const failureReport = formatFailureReport({
    todoDescription: todo.description,
    errorType: classifyError(new Error(lastError)),
    errorDetail: lastError,
    attempts: tiersTried.length,
    tiersTried,
  });

  return { success: false, report: failureReport, taskId };
}

/**
 * Extracts text content from a session.prompt() response.
 * The response may contain message parts — we extract text parts.
 *
 * NOTE (executor): Before finalising this helper, verify the real
 * `session.prompt()` response shape against the installed SDK types
 * (`@opencode-ai/sdk`). The field names (`parts`, `messages`, `text`,
 * `content`) must match the actual runtime payload; adjust as needed.
 */
function extractResponseText(response: any): string {
  // The response from session.prompt() contains message parts
  // We need to extract the text content
  if (typeof response === "string") return response;

  // Handle structured response with parts
  if (response?.parts) {
    return response.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text || p.content || "")
      .join("\n");
  }

  // Handle response with messages
  if (response?.messages) {
    return response.messages
      .filter((m: any) => m.role === "assistant")
      .flatMap((m: any) => m.parts || [])
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text || p.content || "")
      .join("\n");
  }

  return String(response);
}
```

**Step 4: Run helper tests to verify they pass**

Run: `bun test src/dispatch/dispatch-helpers.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/dispatch/index.ts src/dispatch/dispatch-helpers.test.ts
git commit -m "feat: implement core dispatch execution with escalation ladder"
```

### Task 5.5: Implement the agentz_query execute function

**Files:**
- Create: `src/query/index.ts`
- Test: `src/query/index.test.ts`

**Step 1: Write the test**

`src/query/index.test.ts`:
```typescript
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
      iteration: 1, // orchestrator iteration number (loop cycle), not task sequence
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
```

**Step 2: Run the test to verify it fails**

Run: `bun test src/query/index.test.ts`
Expected: FAIL — cannot resolve imports

**Step 3: Implement query/index.ts**

```bash
mkdir -p src/query
```

`src/query/index.ts`:
```typescript
import type { AgentzDB } from "../db/index";

export interface QueryArgs {
  section: "todos" | "iterations" | "task" | "notes" | "global_notes";
  taskId?: string;
  keyword?: string;
}

/**
 * Executes an agentz_query request against the database.
 * Returns formatted text for the orchestrator.
 */
export function executeQuery(
  db: AgentzDB,
  sessionId: string,
  args: QueryArgs
): string {
  const session = db.getSession(sessionId);
  if (!session) {
    return "No active agentz session.";
  }

  switch (args.section) {
    case "todos": {
      const todos = db.getTodos(sessionId);
      if (todos.length === 0) return "No todos in this session.";
      return todos
        .map(
          (t) =>
            `[${t.id}] ${t.description} — status: ${t.status}, priority: ${t.priority}${t.category ? `, category: ${t.category}` : ""}${t.completed_by ? `, completed by: ${t.completed_by}` : ""}`
        )
        .join("\n");
    }

    case "iterations": {
      const iterations = db.getIterations(sessionId);
      if (iterations.length === 0) return "No iterations recorded yet.";
      return iterations
        .map(
          (i) =>
            `[Iteration ${i.iteration_number}] ${i.summary}${i.decisions ? `\n  Decisions: ${i.decisions}` : ""}`
        )
        .join("\n");
    }

    case "task": {
      if (!args.taskId) {
        return "Error: task_id is required when section is 'task'.";
      }
      const task = db.getTask(args.taskId);
      if (!task) return `Task ${args.taskId} not found.`;
      return `Task: ${task.id}
Skill: ${task.skill}
Tier: ${task.tier}${task.final_tier ? ` → ${task.final_tier}` : ""}
Status: ${task.status}
Input: ${task.input_summary ?? "N/A"}
Output: ${task.output_summary ?? "N/A"}
Output Path: ${task.output_path ?? "N/A"}
Retries: ${task.retries}${task.failure_classification ? `\nFailure: ${task.failure_classification} — ${task.error_detail}` : ""}`;
    }

    case "notes": {
      const notes = db.getNotes(sessionId, args.keyword);
      if (notes.length === 0)
        return args.keyword
          ? `No notes matching "${args.keyword}".`
          : "No notes in this session.";
      return notes
        .map(
          (n) =>
            `[${n.id}] ${n.content}${n.added_by ? ` (from: ${n.added_by})` : ""}`
        )
        .join("\n");
    }

    case "global_notes": {
      const notes = db.getGlobalNotes(args.keyword);
      if (notes.length === 0)
        return args.keyword
          ? `No global notes matching "${args.keyword}".`
          : "No global notes.";
      return notes
        .map(
          (n) =>
            `[${n.id}] [${n.status}] ${n.content}${n.category ? ` (${n.category})` : ""}${n.confirmed_count > 0 ? ` — confirmed ${n.confirmed_count}x` : ""}`
        )
        .join("\n");
    }
  }
}
```

**Step 4: Run the test to verify it passes**

Run: `bun test src/query/index.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/query/index.ts src/query/index.test.ts
git commit -m "feat: implement agentz_query with all section handlers"
```

### Task 5.6: Wire dispatch and query into plugin entry point

**Files:**
- Modify: `src/index.ts`

**Step 1: Update src/index.ts to use real implementations**

Replace the tool stubs in `src/index.ts` with imports from the dispatch and query modules. The `agentz_dispatch` execute function should call `executeDispatch()` and the `agentz_query` should call `executeQuery()`. Initialize the database in the plugin function using `initDatabase()`.

Key changes:
- Import `initDatabase` from `./db/init`
- Import `executeDispatch` from `./dispatch/index`
- Import `executeQuery` from `./query/index`
- Create DB path: `join(directory, ".agentz", "agentz.db")`
- Skills dir: `join(directory, "skills")`
- Output base dir: `join(directory, ".agentz")`
- In `agentz_dispatch.execute`: call `executeDispatch()`
- In `agentz_query.execute`: look up session from DB using `ctx.sessionID`, then call `executeQuery()`

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire real dispatch and query implementations into plugin"
```

---

### Task 5.7: Run dispatch and query verification

**Files:**
- Modify: `docs/plans/2026-03-12-agentz-phase-05-core-dispatch.md`

**Step 1: Run targeted dispatch/query tests**

Run: `bun test src/dispatch src/query src/skills/loader.test.ts`
Expected: All tests PASS

**Step 2: Run the full test suite**

Run: `bun test`
Expected: All tests PASS

**Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add src/dispatch src/query src/index.ts
git commit -m "test: verify phase 5 dispatch and query integration"
```

---
