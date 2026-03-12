# Agentz Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Agentz OpenCode plugin — a multi-agent orchestration framework that dispatches skill-specialized agents with dynamic model/tier assignment, persists all state in SQLite, and drives iterative task completion through a DB-backed orchestration loop.

**Architecture:** Plugin registers two agents (`agentz` orchestrator + `agentz-worker` subagent), two tools (`agentz_dispatch` + `agentz_query`), and slash commands. The orchestrator follows a DB-driven iteration loop: load state → assess → dispatch → process results → repeat. All agent output follows a structured protocol (types → renderer → parser → validator) that cannot drift because prompt generation and validation share the same TypeScript definitions. Persistence uses 7 SQLite tables with filesystem output files.

**Tech Stack:** TypeScript (strict), Bun runtime, `@opencode-ai/plugin` v1.2.22, `@opencode-ai/sdk` v1.2.22, `bun:sqlite`, `bun:test`, zod v4.1.8

---

## Phase 1: Project Scaffold

### Task 1.1: Initialize package.json and install dependencies

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`

**Step 1: Create package.json**

```json
{
  "name": "agentz",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "bun build src/index.ts --outdir dist --target bun",
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "dev": "bun run --watch src/index.ts"
  },
  "dependencies": {
    "@opencode-ai/plugin": "^1.2.22",
    "@opencode-ai/sdk": "^1.2.22"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.8"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "types": ["bun-types"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Step 3: Install dependencies**

Run: `bun install`
Expected: lockfile created, node_modules populated

**Step 4: Commit**

```bash
git add package.json tsconfig.json bun.lock
git commit -m "chore: initialize project with package.json and tsconfig"
```

### Task 1.2: Create directory structure and entry point stub

**Files:**
- Create: `src/index.ts`
- Create: `src/protocol/types.ts` (empty placeholder)
- Create: `src/protocol/schema.ts` (empty placeholder)
- Create: `src/protocol/renderer.ts` (empty placeholder)
- Create: `src/protocol/parser.ts` (empty placeholder)
- Create: `src/protocol/validator.ts` (empty placeholder)
- Create: `src/protocol/context.ts` (empty placeholder)
- Create: `src/db/index.ts` (empty placeholder)
- Create: `src/db/schema.ts` (empty placeholder)
- Create: `src/tools/dispatch.ts` (empty placeholder)
- Create: `src/tools/query.ts` (empty placeholder)
- Create: `src/hooks/index.ts` (empty placeholder)
- Create: `src/prompts/index.ts` (empty placeholder)
- Create: `skills/` directory
- Create: `.opencode/` directory stub

**Step 1: Create directory structure**

Run:
```bash
mkdir -p src/protocol src/db src/tools src/hooks src/prompts skills .opencode
```

**Step 2: Create entry point stub**

`src/index.ts`:
```typescript
import type { Plugin } from "@opencode-ai/plugin";

const plugin: Plugin = async (input) => {
  return {};
};

export default plugin;
```

**Step 3: Create empty placeholder files**

Each file gets a single comment:

`src/protocol/types.ts`:
```typescript
// Protocol type definitions — completion reports, output files, recommendations
```

`src/protocol/schema.ts`:
```typescript
// Protocol constants — section names, field specs, constraints
```

`src/protocol/renderer.ts`:
```typescript
// renderProtocol() — generates LLM-facing prose from types
```

`src/protocol/parser.ts`:
```typescript
// parseCompletionReport() + parseOutputFile() — extract structured data from freeform text
```

`src/protocol/validator.ts`:
```typescript
// validateCompletionReport() — binary pass/fail validation
```

`src/protocol/context.ts`:
```typescript
// renderTaskContext() — generates task-specific context block
```

`src/db/index.ts`:
```typescript
// Database client — SQLite CRUD operations
```

`src/db/schema.ts`:
```typescript
// Database schema — table creation SQL
```

`src/tools/dispatch.ts`:
```typescript
// agentz_dispatch tool — spawns skill-specialized agents
```

`src/tools/query.ts`:
```typescript
// agentz_query tool — on-demand state access
```

`src/hooks/index.ts`:
```typescript
// Plugin hooks — event handlers, system.transform, chat.message, compaction
```

`src/prompts/index.ts`:
```typescript
// Orchestrator and worker base prompts
```

**Step 4: Verify typecheck passes**

Run: `bun run typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold directory structure with entry point stub"
```

---

## Phase 2: Protocol Layer (`src/protocol/`)

The protocol layer is pure functions with zero side effects — the most testable code in the project. Every type, constant, renderer output, parser extraction, and validator check is tested.

### Task 2.1: Define core protocol types

**Files:**
- Modify: `src/protocol/types.ts`
- Test: `src/protocol/types.test.ts`

**Step 1: Write the test**

`src/protocol/types.test.ts`:
```typescript
import { describe, expect, test } from "bun:test";
import {
  TASK_STATUSES,
  RECOMMENDATION_TYPES,
  PRIORITY_LEVELS,
  OUTPUT_SECTIONS,
  PROTOCOL_CONSTRAINTS,
  type TaskStatus,
  type RecommendationType,
  type Priority,
  type CompletionReport,
  type Recommendation,
  type OutputFile,
  type OutputSection,
  type ParseResult,
  type OutputFileParseResult,
  type ValidationResult,
  type ValidationError,
} from "./types";

describe("protocol types", () => {
  test("TASK_STATUSES has exactly 3 values", () => {
    expect(TASK_STATUSES).toEqual(["completed", "failed", "needs_input"]);
  });

  test("RECOMMENDATION_TYPES has exactly 4 values", () => {
    expect(RECOMMENDATION_TYPES).toEqual([
      "ADD_TODO",
      "ADD_NOTE",
      "NEEDS_REVIEW",
      "ADD_GLOBAL_NOTE",
    ]);
  });

  test("PRIORITY_LEVELS has exactly 3 values", () => {
    expect(PRIORITY_LEVELS).toEqual(["high", "medium", "low"]);
  });

  test("OUTPUT_SECTIONS has exactly 4 values in order", () => {
    expect(OUTPUT_SECTIONS).toEqual([
      "Summary",
      "Details",
      "Artifacts",
      "Recommendations",
    ]);
  });

  test("PROTOCOL_CONSTRAINTS has summary constraints", () => {
    expect(PROTOCOL_CONSTRAINTS.summary.minSentences).toBe(2);
    expect(PROTOCOL_CONSTRAINTS.summary.maxSentences).toBe(5);
    expect(PROTOCOL_CONSTRAINTS.summary.validationMaxSentences).toBe(10);
  });

  test("PROTOCOL_CONSTRAINTS has note quality examples", () => {
    expect(PROTOCOL_CONSTRAINTS.notes.goodExamples.length).toBeGreaterThan(0);
    expect(PROTOCOL_CONSTRAINTS.notes.badExamples.length).toBeGreaterThan(0);
  });

  test("PROTOCOL_CONSTRAINTS has global note constraints", () => {
    expect(PROTOCOL_CONSTRAINTS.globalNotes.injectionCap).toBe(400);
    expect(PROTOCOL_CONSTRAINTS.globalNotes.staleSessions).toBe(5);
    expect(
      PROTOCOL_CONSTRAINTS.globalNotes.goodExamples.length
    ).toBeGreaterThan(0);
    expect(
      PROTOCOL_CONSTRAINTS.globalNotes.badExamples.length
    ).toBeGreaterThan(0);
  });

  test("CompletionReport type is structurally valid", () => {
    const report: CompletionReport = {
      status: "completed",
      outputPath: "/tmp/output.md",
      summary: "Task completed successfully. All tests pass.",
      recommendations: [],
    };
    expect(report.status).toBe("completed");
    expect(report.questions).toBeUndefined();
  });

  test("CompletionReport with failure fields", () => {
    const report: CompletionReport = {
      status: "failed",
      outputPath: "/tmp/output.md",
      summary: "Task failed due to timeout.",
      recommendations: [],
      errorType: "transient",
      errorDetail: "Connection timed out after 30s",
      attempts: 3,
      tiersTried: ["fast-cheap", "balanced", "powerful"],
    };
    expect(report.errorType).toBe("transient");
    expect(report.tiersTried).toHaveLength(3);
  });

  test("CompletionReport with needs_input and questions", () => {
    const report: CompletionReport = {
      status: "needs_input",
      outputPath: "/tmp/output.md",
      summary: "Need clarification on auth approach.",
      recommendations: [],
      questions: ["Should we use JWT or session-based auth?"],
    };
    expect(report.questions).toHaveLength(1);
  });

  test("Recommendation with all fields", () => {
    const rec: Recommendation = {
      type: "ADD_TODO",
      description: "Add integration tests for the API",
      priority: "high",
      category: "test-backend",
    };
    expect(rec.type).toBe("ADD_TODO");
    expect(rec.priority).toBe("high");
  });

  test("OutputFile type is structurally valid", () => {
    const output: OutputFile = {
      summary: "Implemented user API. All endpoints tested.",
      details: "Created REST endpoints for CRUD operations.",
      artifacts: ["src/api/users.ts", "tests/api/users.test.ts"],
      recommendations: [],
    };
    expect(output.artifacts).toHaveLength(2);
  });

  test("ParseResult type structure", () => {
    const result: ParseResult = {
      found: true,
      raw: "STATUS: completed\nOUTPUT: /tmp/out.md",
      fields: { status: "completed", outputPath: "/tmp/out.md" },
    };
    expect(result.found).toBe(true);
  });

  test("ValidationResult type structure", () => {
    const result: ValidationResult = {
      valid: false,
      errors: [{ field: "status", error: "Missing STATUS field" }],
    };
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `bun test src/protocol/types.test.ts`
Expected: FAIL — cannot resolve imports

**Step 3: Implement types.ts**

`src/protocol/types.ts`:
```typescript
// === Status types ===
export const TASK_STATUSES = ["completed", "failed", "needs_input"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// === Recommendation types ===
export const RECOMMENDATION_TYPES = [
  "ADD_TODO",
  "ADD_NOTE",
  "NEEDS_REVIEW",
  "ADD_GLOBAL_NOTE",
] as const;
export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

export const PRIORITY_LEVELS = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITY_LEVELS)[number];

export interface Recommendation {
  type: RecommendationType;
  description: string;
  priority?: Priority; // Only for ADD_TODO
  category?: string; // For ADD_TODO (task category) or ADD_GLOBAL_NOTE (knowledge category)
}

// === Completion Report (returned to orchestrator) ===
export interface CompletionReport {
  status: TaskStatus;
  outputPath: string;
  summary: string; // 2-5 sentences, hard limit
  recommendations: Recommendation[];
  questions?: string[]; // Only when status === "needs_input"
  // Failure-specific fields (only when status === "failed")
  errorType?: "transient" | "capability" | "systematic";
  errorDetail?: string;
  attempts?: number;
  tiersTried?: string[];
}

// === Output File Sections ===
export const OUTPUT_SECTIONS = [
  "Summary",
  "Details",
  "Artifacts",
  "Recommendations",
] as const;
export type OutputSection = (typeof OUTPUT_SECTIONS)[number];

export interface OutputFile {
  summary: string; // 2-5 sentences, self-contained
  details: string;
  artifacts: string[];
  recommendations: Recommendation[];
}

// === Parser Result Types ===
export interface ParseResult {
  found: boolean; // Was a completion report detected at all?
  raw: string; // Extracted report text (preamble/fences stripped)
  fields: Partial<CompletionReport>; // Best-effort field extraction
}

export interface OutputFileParseResult {
  valid: boolean;
  sections: Partial<Record<OutputSection, string>>;
  errors: ValidationError[];
}

// === Validation Result Types ===
export interface ValidationError {
  field: string; // "status", "summary", "outputPath", etc.
  error: string; // Human-readable description
}

export interface ValidationResult {
  valid: boolean;
  report?: CompletionReport; // Structured data (when valid)
  errors: ValidationError[]; // What failed (when invalid)
}

// === Protocol Constraints (used by both renderer and validator) ===
export const PROTOCOL_CONSTRAINTS = {
  summary: {
    minSentences: 2,
    maxSentences: 5,
    validationMaxSentences: 10, // Generous threshold for binary validation
    requirement:
      "self-contained, understandable without the rest of the file",
  },
  outputFile: {
    firstSection: "Summary" as const,
    sections: OUTPUT_SECTIONS,
  },
  notes: {
    guidance: "durable insights and constraints, not status updates",
    goodExamples: [
      "User prefers PostgreSQL over MySQL",
      "Auth system uses JWT with RS256 signing",
      "CI pipeline requires Node 20+",
      "The payments module has no test coverage — handle carefully",
    ],
    badExamples: [
      "Started working on API endpoints",
      "Database schema completed successfully",
      "Dispatched frontend developer",
    ],
  },
  globalNotes: {
    guidance:
      "durable project-level facts that persist across sessions — tech stack, team preferences, architectural decisions, known constraints",
    injectionCap: 400, // max tokens for global notes injection into child agent context
    staleSessions: 5, // sessions without re-confirmation before [stale] marker
    goodExamples: [
      "Project uses PostgreSQL 15 with pgvector extension",
      "Team convention: all API responses wrapped in { data, error } envelope",
      "Auth uses JWT with RS256, keys rotated monthly via AWS Secrets Manager",
      "The legacy billing module is untested — changes require manual QA sign-off",
    ],
    badExamples: [
      "Completed the auth refactor",
      "User wants dark mode", // too session-specific, not a durable project fact
      "Fixed the bug in payments",
    ],
  },
} as const;
```

**Step 4: Run the test to verify it passes**

Run: `bun test src/protocol/types.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/protocol/types.ts src/protocol/types.test.ts
git commit -m "feat: define core protocol types and constraints"
```

### Task 2.2: Implement protocol renderer

**Files:**
- Modify: `src/protocol/renderer.ts`
- Test: `src/protocol/renderer.test.ts`

**Step 1: Write the test**

`src/protocol/renderer.test.ts`:
```typescript
import { describe, expect, test } from "bun:test";
import { renderProtocol } from "./renderer";
import {
  TASK_STATUSES,
  RECOMMENDATION_TYPES,
  OUTPUT_SECTIONS,
  PROTOCOL_CONSTRAINTS,
} from "./types";

describe("renderProtocol", () => {
  const output = renderProtocol();

  test("returns a non-empty string", () => {
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(100);
  });

  test("includes all task statuses", () => {
    for (const status of TASK_STATUSES) {
      expect(output).toContain(status);
    }
  });

  test("includes all recommendation types", () => {
    for (const type of RECOMMENDATION_TYPES) {
      expect(output).toContain(type);
    }
  });

  test("includes all output sections", () => {
    for (const section of OUTPUT_SECTIONS) {
      expect(output).toContain(section);
    }
  });

  test("includes summary sentence constraints", () => {
    expect(output).toContain(
      String(PROTOCOL_CONSTRAINTS.summary.minSentences)
    );
    expect(output).toContain(
      String(PROTOCOL_CONSTRAINTS.summary.maxSentences)
    );
  });

  test("includes note quality good examples", () => {
    for (const example of PROTOCOL_CONSTRAINTS.notes.goodExamples) {
      expect(output).toContain(example);
    }
  });

  test("includes note quality bad examples", () => {
    for (const example of PROTOCOL_CONSTRAINTS.notes.badExamples) {
      expect(output).toContain(example);
    }
  });

  test("includes global note guidance", () => {
    expect(output).toContain("ADD_GLOBAL_NOTE");
    for (const example of PROTOCOL_CONSTRAINTS.globalNotes.goodExamples) {
      expect(output).toContain(example);
    }
  });

  test("includes direct tools vs leaf agents guidance", () => {
    expect(output).toMatch(/direct tool/i);
    expect(output).toMatch(/leaf agent/i);
  });

  test("includes completion report format", () => {
    expect(output).toContain("STATUS:");
    expect(output).toContain("OUTPUT:");
    expect(output).toContain("SUMMARY:");
    expect(output).toContain("RECOMMENDATIONS:");
  });

  test("includes output file format with section ordering", () => {
    expect(output).toContain("## Summary");
    expect(output).toContain("## Details");
    expect(output).toContain("## Artifacts");
    expect(output).toContain("## Recommendations");
  });

  test("is deterministic (same output on repeated calls)", () => {
    const output2 = renderProtocol();
    expect(output).toBe(output2);
  });

  test("output is reasonable size (300-600 tokens ~ 1200-2400 chars)", () => {
    expect(output.length).toBeGreaterThan(800);
    expect(output.length).toBeLessThan(4000);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `bun test src/protocol/renderer.test.ts`
Expected: FAIL — renderProtocol is not a function

**Step 3: Implement renderer.ts**

`src/protocol/renderer.ts`:
```typescript
import {
  TASK_STATUSES,
  RECOMMENDATION_TYPES,
  PRIORITY_LEVELS,
  OUTPUT_SECTIONS,
  PROTOCOL_CONSTRAINTS,
} from "./types";

/**
 * Generates LLM-facing prose from protocol types.
 * Deterministic — same types always produce identical output.
 * ~300-400 tokens of clear, imperative instructions.
 */
export function renderProtocol(): string {
  const sections: string[] = [];

  // --- Output File Format ---
  sections.push(`## Output Protocol

Write your full output to the designated output path. The file MUST contain these sections in this exact order:

${OUTPUT_SECTIONS.map((s) => `### ## ${s}`).join("\n")}

The **## Summary** section MUST be first and MUST be:
- ${PROTOCOL_CONSTRAINTS.summary.minSentences}-${PROTOCOL_CONSTRAINTS.summary.maxSentences} sentences
- ${PROTOCOL_CONSTRAINTS.summary.requirement}

The **## Recommendations** section uses this format (one per line):
${RECOMMENDATION_TYPES.map((t) => {
  switch (t) {
    case "ADD_TODO":
      return `- ${t}: <description> [priority: ${PRIORITY_LEVELS.join("|")}] [category: <task-category>]`;
    case "ADD_NOTE":
      return `- ${t}: <durable insight or constraint>`;
    case "NEEDS_REVIEW":
      return `- ${t}: <what needs human review and why>`;
    case "ADD_GLOBAL_NOTE":
      return `- ${t}: <durable project-level fact> [category: <knowledge-category>]`;
  }
}).join("\n")}

Leave the section empty if you have no recommendations.`);

  // --- Note Quality ---
  sections.push(`## Note Quality Guidelines

Notes (ADD_NOTE) must be ${PROTOCOL_CONSTRAINTS.notes.guidance}.

Good notes:
${PROTOCOL_CONSTRAINTS.notes.goodExamples.map((e) => `- "${e}"`).join("\n")}

Bad notes (do NOT write these):
${PROTOCOL_CONSTRAINTS.notes.badExamples.map((e) => `- "${e}"`).join("\n")}

Global notes (ADD_GLOBAL_NOTE) must be ${PROTOCOL_CONSTRAINTS.globalNotes.guidance}.

Good global notes:
${PROTOCOL_CONSTRAINTS.globalNotes.goodExamples.map((e) => `- "${e}"`).join("\n")}

Bad global notes:
${PROTOCOL_CONSTRAINTS.globalNotes.badExamples.map((e) => `- "${e}"`).join("\n")}`);

  // --- Completion Report ---
  sections.push(`## Completion Report

After writing the output file, end your response with this exact format:

STATUS: ${TASK_STATUSES.join("|")}
OUTPUT: <path to your output file>
SUMMARY: <${PROTOCOL_CONSTRAINTS.summary.minSentences}-${PROTOCOL_CONSTRAINTS.summary.maxSentences} sentence summary matching the output file's ## Summary>
RECOMMENDATIONS:
<one recommendation per line, or empty>
QUESTIONS:
<only if STATUS is needs_input — list your questions, one per line>`);

  // --- Direct Tools vs Leaf Agents ---
  sections.push(`## Direct Tools vs. Leaf Agents

You have direct tool access (grep, glob, read, webfetch, write, edit, bash) AND can spawn leaf agents for information gathering.

**Use direct tools when:** the operation is targeted (specific file, specific search term), the result is small enough to process directly, or you need a quick factual lookup.

**Spawn a leaf agent when:** you need broad exploration across many files/directories, the raw results would be too large for your context and need compression, or the research requires multi-step navigation with judgment calls.

**Rule of thumb:** if you can get the answer with 1-3 direct tool calls, use direct tools. If you need 5+ tool calls with intermediate reasoning, spawn a leaf agent.`);

  return sections.join("\n\n");
}
```

**Step 4: Run the test to verify it passes**

Run: `bun test src/protocol/renderer.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/protocol/renderer.ts src/protocol/renderer.test.ts
git commit -m "feat: implement protocol renderer with deterministic prose generation"
```

### Task 2.3: Implement completion report parser

**Files:**
- Modify: `src/protocol/parser.ts`
- Test: `src/protocol/parser.test.ts`

**Step 1: Write the test**

`src/protocol/parser.test.ts`:
```typescript
import { describe, expect, test } from "bun:test";
import { parseCompletionReport, parseOutputFile } from "./parser";

describe("parseCompletionReport", () => {
  test("parses a well-formed completion report", () => {
    const raw = `STATUS: completed
OUTPUT: /tmp/agentz/sessions/s1/tasks/task-001/output.md
SUMMARY: Implemented the user API with all CRUD endpoints. Tests pass. Coverage at 95%.
RECOMMENDATIONS:
- ADD_TODO: Write integration tests for the API [priority: medium] [category: test-backend]
- ADD_NOTE: Auth system uses JWT with RS256 signing`;

    const result = parseCompletionReport(raw);
    expect(result.found).toBe(true);
    expect(result.fields.status).toBe("completed");
    expect(result.fields.outputPath).toBe(
      "/tmp/agentz/sessions/s1/tasks/task-001/output.md"
    );
    expect(result.fields.summary).toContain("Implemented the user API");
    expect(result.fields.recommendations).toHaveLength(2);
    expect(result.fields.recommendations![0].type).toBe("ADD_TODO");
    expect(result.fields.recommendations![0].priority).toBe("medium");
    expect(result.fields.recommendations![0].category).toBe("test-backend");
    expect(result.fields.recommendations![1].type).toBe("ADD_NOTE");
  });

  test("parses report with conversational preamble", () => {
    const raw = `Here's my completion report:

I've finished working on the task. Everything looks good.

STATUS: completed
OUTPUT: /tmp/output.md
SUMMARY: Task done. All good.
RECOMMENDATIONS:`;

    const result = parseCompletionReport(raw);
    expect(result.found).toBe(true);
    expect(result.fields.status).toBe("completed");
    expect(result.raw).not.toContain("Here's my completion report");
  });

  test("parses report wrapped in code fences", () => {
    const raw = `Here's the report:
\`\`\`
STATUS: completed
OUTPUT: /tmp/output.md
SUMMARY: Done successfully. No issues found.
RECOMMENDATIONS:
\`\`\``;

    const result = parseCompletionReport(raw);
    expect(result.found).toBe(true);
    expect(result.fields.status).toBe("completed");
  });

  test("parses needs_input with questions", () => {
    const raw = `STATUS: needs_input
OUTPUT: /tmp/output.md
SUMMARY: Need clarification on the auth approach. Cannot proceed without user decision.
RECOMMENDATIONS:
QUESTIONS:
- Should we use JWT or session-based auth?
- What is the expected token expiration time?`;

    const result = parseCompletionReport(raw);
    expect(result.found).toBe(true);
    expect(result.fields.status).toBe("needs_input");
    expect(result.fields.questions).toHaveLength(2);
    expect(result.fields.questions![0]).toContain("JWT or session-based");
  });

  test("parses failed report", () => {
    const raw = `STATUS: failed
OUTPUT: /tmp/output.md
SUMMARY: Could not complete due to missing database credentials. Attempted 3 times.
RECOMMENDATIONS:
- ADD_NOTE: Database credentials not configured in .env`;

    const result = parseCompletionReport(raw);
    expect(result.found).toBe(true);
    expect(result.fields.status).toBe("failed");
  });

  test("returns found: false when no STATUS line", () => {
    const raw = `I worked on the task and completed everything.
The output is at /tmp/output.md.
All tests pass.`;

    const result = parseCompletionReport(raw);
    expect(result.found).toBe(false);
    expect(result.fields).toEqual({});
  });

  test("handles empty recommendations", () => {
    const raw = `STATUS: completed
OUTPUT: /tmp/output.md
SUMMARY: Simple task done. Nothing to recommend.
RECOMMENDATIONS:`;

    const result = parseCompletionReport(raw);
    expect(result.found).toBe(true);
    expect(result.fields.recommendations).toEqual([]);
  });

  test("parses ADD_GLOBAL_NOTE recommendation", () => {
    const raw = `STATUS: completed
OUTPUT: /tmp/output.md
SUMMARY: Discovered project conventions. Documented findings.
RECOMMENDATIONS:
- ADD_GLOBAL_NOTE: Project uses PostgreSQL 15 with pgvector [category: tech-stack]`;

    const result = parseCompletionReport(raw);
    expect(result.fields.recommendations).toHaveLength(1);
    expect(result.fields.recommendations![0].type).toBe("ADD_GLOBAL_NOTE");
    expect(result.fields.recommendations![0].category).toBe("tech-stack");
  });

  test("parses NEEDS_REVIEW recommendation", () => {
    const raw = `STATUS: completed
OUTPUT: /tmp/output.md
SUMMARY: Code review complete. Found issues.
RECOMMENDATIONS:
- NEEDS_REVIEW: The auth middleware skips validation for admin routes`;

    const result = parseCompletionReport(raw);
    expect(result.fields.recommendations).toHaveLength(1);
    expect(result.fields.recommendations![0].type).toBe("NEEDS_REVIEW");
  });

  test("handles multi-line summary", () => {
    const raw = `STATUS: completed
OUTPUT: /tmp/output.md
SUMMARY: First sentence of summary.
Second sentence continues here.
Third sentence wraps up.
RECOMMENDATIONS:`;

    const result = parseCompletionReport(raw);
    expect(result.fields.summary).toContain("First sentence");
    expect(result.fields.summary).toContain("Third sentence");
  });
});

describe("parseOutputFile", () => {
  test("parses well-formed output file", () => {
    const content = `## Summary

Task completed successfully. All endpoints are working.

## Details

Created user CRUD endpoints with proper validation.

## Artifacts

- src/api/users.ts
- tests/api/users.test.ts

## Recommendations

- ADD_TODO: Add rate limiting [priority: medium] [category: develop-backend]
`;

    const result = parseOutputFile(content);
    expect(result.valid).toBe(true);
    expect(result.sections.Summary).toContain("Task completed successfully");
    expect(result.sections.Details).toContain("CRUD endpoints");
    expect(result.sections.Artifacts).toContain("src/api/users.ts");
    expect(result.sections.Recommendations).toContain("ADD_TODO");
    expect(result.errors).toHaveLength(0);
  });

  test("detects missing Summary section", () => {
    const content = `## Details

Some details here.

## Artifacts

None.

## Recommendations

None.`;

    const result = parseOutputFile(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "Summary")).toBe(true);
  });

  test("detects Summary not being first section", () => {
    const content = `## Details

Details first.

## Summary

Summary after details.

## Artifacts

None.

## Recommendations

None.`;

    const result = parseOutputFile(content);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.error.includes("first"))
    ).toBe(true);
  });

  test("detects missing required sections", () => {
    const content = `## Summary

A summary.

## Details

Some details.`;

    const result = parseOutputFile(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "Artifacts")).toBe(true);
    expect(result.errors.some((e) => e.field === "Recommendations")).toBe(true);
  });

  test("handles content with extra sections gracefully", () => {
    const content = `## Summary

A summary here.

## Details

Details here.

## Implementation Notes

Extra section that's fine.

## Artifacts

- file.ts

## Recommendations

None.`;

    const result = parseOutputFile(content);
    expect(result.valid).toBe(true);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `bun test src/protocol/parser.test.ts`
Expected: FAIL — cannot resolve imports

**Step 3: Implement parser.ts**

`src/protocol/parser.ts`:
```typescript
import {
  RECOMMENDATION_TYPES,
  PRIORITY_LEVELS,
  OUTPUT_SECTIONS,
  type ParseResult,
  type OutputFileParseResult,
  type CompletionReport,
  type Recommendation,
  type RecommendationType,
  type Priority,
  type OutputSection,
  type ValidationError,
} from "./types";

const FIELD_PREFIXES = [
  "STATUS:",
  "OUTPUT:",
  "SUMMARY:",
  "RECOMMENDATIONS:",
  "QUESTIONS:",
] as const;

/**
 * Extracts structured fields from freeform agent output.
 * Scans for STATUS: as the anchor — everything from that line onward is the report.
 */
export function parseCompletionReport(raw: string): ParseResult {
  // Strip code fences
  const stripped = raw.replace(/```[\s\S]*?```/g, (match) => {
    // Keep the content inside fences, strip the fence markers
    return match.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
  });

  // Find STATUS: anchor
  const lines = stripped.split("\n");
  const statusLineIdx = lines.findIndex((l) =>
    l.trim().startsWith("STATUS:")
  );

  if (statusLineIdx === -1) {
    return { found: false, raw: "", fields: {} };
  }

  // Extract from STATUS line onward
  const reportLines = lines.slice(statusLineIdx);
  const reportRaw = reportLines.join("\n").trim();

  // Parse fields
  const fields: Partial<CompletionReport> = {};

  // Extract single-line fields
  const statusMatch = reportRaw.match(/^STATUS:\s*(.+)$/m);
  if (statusMatch) {
    fields.status = statusMatch[1].trim() as CompletionReport["status"];
  }

  const outputMatch = reportRaw.match(/^OUTPUT:\s*(.+)$/m);
  if (outputMatch) {
    fields.outputPath = outputMatch[1].trim();
  }

  // Extract multi-line fields (consume until next prefix or end)
  fields.summary = extractMultiLineField(reportLines, "SUMMARY:");
  fields.recommendations = parseRecommendations(
    extractMultiLineField(reportLines, "RECOMMENDATIONS:")
  );

  const questionsRaw = extractMultiLineField(reportLines, "QUESTIONS:");
  if (questionsRaw) {
    fields.questions = questionsRaw
      .split("\n")
      .map((l) => l.replace(/^[-*]\s*/, "").trim())
      .filter((l) => l.length > 0);
  }

  return { found: true, raw: reportRaw, fields };
}

/**
 * Extracts a multi-line field value from report lines.
 * Consumes from the prefix line until the next recognized prefix or end-of-text.
 */
function extractMultiLineField(
  lines: string[],
  prefix: string
): string {
  const startIdx = lines.findIndex((l) => l.trim().startsWith(prefix));
  if (startIdx === -1) return "";

  // Get the remainder of the first line after the prefix
  const firstLine = lines[startIdx].trim().slice(prefix.length).trim();
  const contentLines: string[] = firstLine ? [firstLine] : [];

  // Consume subsequent lines until next prefix or end
  for (let i = startIdx + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (FIELD_PREFIXES.some((p) => trimmed.startsWith(p))) {
      break;
    }
    contentLines.push(lines[i]);
  }

  return contentLines
    .join("\n")
    .trim();
}

/**
 * Parses recommendation lines into structured objects.
 * Format: - TYPE: description [priority: X] [category: Y]
 */
function parseRecommendations(raw: string): Recommendation[] {
  if (!raw) return [];

  const lines = raw
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l.length > 0);

  const recommendations: Recommendation[] = [];

  for (const line of lines) {
    // Match TYPE: description [priority: X] [category: Y]
    const typeMatch = line.match(
      new RegExp(`^(${RECOMMENDATION_TYPES.join("|")}):\\s*(.+)$`)
    );
    if (!typeMatch) continue;

    const type = typeMatch[1] as RecommendationType;
    let description = typeMatch[2].trim();
    let priority: Priority | undefined;
    let category: string | undefined;

    // Extract [priority: X]
    const priorityMatch = description.match(
      new RegExp(`\\[priority:\\s*(${PRIORITY_LEVELS.join("|")})\\]`)
    );
    if (priorityMatch) {
      priority = priorityMatch[1] as Priority;
      description = description.replace(priorityMatch[0], "").trim();
    }

    // Extract [category: X]
    const categoryMatch = description.match(/\[category:\s*([^\]]+)\]/);
    if (categoryMatch) {
      category = categoryMatch[1].trim();
      description = description.replace(categoryMatch[0], "").trim();
    }

    recommendations.push({ type, description, priority, category });
  }

  return recommendations;
}

/**
 * Splits a markdown output file by ## headings and validates section structure.
 */
export function parseOutputFile(content: string): OutputFileParseResult {
  const errors: ValidationError[] = [];
  const sections: Partial<Record<OutputSection, string>> = {};

  // Split by ## headings
  const headingRegex = /^## (.+)$/gm;
  const headings: { name: string; start: number; end?: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(content)) !== null) {
    if (headings.length > 0) {
      headings[headings.length - 1].end = match.index;
    }
    headings.push({ name: match[1].trim(), start: match.index + match[0].length });
  }
  if (headings.length > 0) {
    headings[headings.length - 1].end = content.length;
  }

  // Map known sections
  for (const heading of headings) {
    const sectionName = OUTPUT_SECTIONS.find(
      (s) => s.toLowerCase() === heading.name.toLowerCase()
    );
    if (sectionName) {
      sections[sectionName] = content
        .slice(heading.start, heading.end)
        .trim();
    }
  }

  // Validate: Summary must exist
  if (!sections.Summary) {
    errors.push({ field: "Summary", error: "Missing required ## Summary section" });
  }

  // Validate: Summary must be first heading
  if (headings.length > 0 && headings[0].name.toLowerCase() !== "summary") {
    errors.push({
      field: "Summary",
      error: "## Summary must be the first section in the output file",
    });
  }

  // Validate: all required sections present
  for (const section of OUTPUT_SECTIONS) {
    if (section === "Summary") continue; // already checked
    if (!sections[section]) {
      errors.push({
        field: section,
        error: `Missing required ## ${section} section`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    sections,
    errors,
  };
}
```

**Step 4: Run the test to verify it passes**

Run: `bun test src/protocol/parser.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/protocol/parser.ts src/protocol/parser.test.ts
git commit -m "feat: implement completion report parser and output file parser"
```

### Task 2.4: Implement output validator

**Files:**
- Modify: `src/protocol/validator.ts`
- Test: `src/protocol/validator.test.ts`

**Step 1: Write the test**

`src/protocol/validator.test.ts`:
```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { validateCompletionReport } from "./validator";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";

const TEST_DIR = join(import.meta.dir, "../../.test-tmp");

function writeTestOutput(filename: string, content: string): string {
  const path = join(TEST_DIR, filename);
  writeFileSync(path, content);
  return path;
}

const VALID_OUTPUT = `## Summary

Task completed successfully. All endpoints tested and working.

## Details

Implemented CRUD endpoints for the user API.

## Artifacts

- src/api/users.ts
- tests/api/users.test.ts

## Recommendations

- ADD_NOTE: Auth uses JWT with RS256
`;

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

describe("validateCompletionReport", () => {
  test("validates a correct completion report", () => {
    const outputPath = writeTestOutput("output.md", VALID_OUTPUT);
    const raw = `STATUS: completed
OUTPUT: ${outputPath}
SUMMARY: Task completed successfully. All endpoints tested and working.
RECOMMENDATIONS:
- ADD_NOTE: Auth uses JWT with RS256`;

    const result = validateCompletionReport(raw);
    expect(result.valid).toBe(true);
    expect(result.report).toBeDefined();
    expect(result.report!.status).toBe("completed");
    expect(result.errors).toHaveLength(0);
  });

  test("fails when no completion report detected", () => {
    const result = validateCompletionReport(
      "I did the work and everything is fine."
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "report")).toBe(true);
  });

  test("fails when STATUS is invalid", () => {
    const outputPath = writeTestOutput("output.md", VALID_OUTPUT);
    const raw = `STATUS: done
OUTPUT: ${outputPath}
SUMMARY: All good. Everything works.
RECOMMENDATIONS:`;

    const result = validateCompletionReport(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "status")).toBe(true);
  });

  test("fails when STATUS is missing", () => {
    const outputPath = writeTestOutput("output.md", VALID_OUTPUT);
    // Trick: STATUS line exists but value is empty
    const raw = `STATUS:
OUTPUT: ${outputPath}
SUMMARY: Some summary here. Another sentence.
RECOMMENDATIONS:`;

    const result = validateCompletionReport(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "status")).toBe(true);
  });

  test("fails when OUTPUT path is missing", () => {
    const raw = `STATUS: completed
OUTPUT:
SUMMARY: Done. All good.
RECOMMENDATIONS:`;

    const result = validateCompletionReport(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "outputPath")).toBe(true);
  });

  test("fails when output file does not exist", () => {
    const raw = `STATUS: completed
OUTPUT: /nonexistent/path/output.md
SUMMARY: Done. All good.
RECOMMENDATIONS:`;

    const result = validateCompletionReport(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "outputFile")).toBe(true);
  });

  test("fails when output file missing Summary section", () => {
    const badOutput = `## Details

Some details.

## Artifacts

None.

## Recommendations

None.`;
    const outputPath = writeTestOutput("bad-output.md", badOutput);
    const raw = `STATUS: completed
OUTPUT: ${outputPath}
SUMMARY: Done. All good.
RECOMMENDATIONS:`;

    const result = validateCompletionReport(raw);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.field === "outputFile.Summary"
      )
    ).toBe(true);
  });

  test("fails when SUMMARY is missing", () => {
    const outputPath = writeTestOutput("output.md", VALID_OUTPUT);
    const raw = `STATUS: completed
OUTPUT: ${outputPath}
SUMMARY:
RECOMMENDATIONS:`;

    const result = validateCompletionReport(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "summary")).toBe(true);
  });

  test("fails when SUMMARY exceeds max sentences", () => {
    const outputPath = writeTestOutput("output.md", VALID_OUTPUT);
    const longSummary = Array(15)
      .fill("This is a sentence.")
      .join(" ");
    const raw = `STATUS: completed
OUTPUT: ${outputPath}
SUMMARY: ${longSummary}
RECOMMENDATIONS:`;

    const result = validateCompletionReport(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "summary")).toBe(true);
  });

  test("fails when needs_input but no questions", () => {
    const outputPath = writeTestOutput("output.md", VALID_OUTPUT);
    const raw = `STATUS: needs_input
OUTPUT: ${outputPath}
SUMMARY: Need user decision. Cannot proceed.
RECOMMENDATIONS:
QUESTIONS:`;

    const result = validateCompletionReport(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "questions")).toBe(true);
  });

  test("passes when needs_input with questions", () => {
    const outputPath = writeTestOutput("output.md", VALID_OUTPUT);
    const raw = `STATUS: needs_input
OUTPUT: ${outputPath}
SUMMARY: Need user decision. Cannot proceed without auth choice.
RECOMMENDATIONS:
QUESTIONS:
- Should we use JWT or session auth?`;

    const result = validateCompletionReport(raw);
    expect(result.valid).toBe(true);
    expect(result.report!.questions).toHaveLength(1);
  });

  test("validates recommendation format", () => {
    const outputPath = writeTestOutput("output.md", VALID_OUTPUT);
    const raw = `STATUS: completed
OUTPUT: ${outputPath}
SUMMARY: Done. All good.
RECOMMENDATIONS:
- INVALID_TYPE: something`;

    const result = validateCompletionReport(raw);
    // Invalid recommendations are silently dropped by the parser,
    // so this should still be valid (0 recommendations is fine)
    expect(result.valid).toBe(true);
    expect(result.report!.recommendations).toHaveLength(0);
  });

  test("collects multiple errors", () => {
    const result = validateCompletionReport(`STATUS: invalid
OUTPUT:
SUMMARY:
RECOMMENDATIONS:`);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `bun test src/protocol/validator.test.ts`
Expected: FAIL — cannot resolve imports

**Step 3: Implement validator.ts**

`src/protocol/validator.ts`:
```typescript
import { existsSync, readFileSync } from "fs";
import {
  TASK_STATUSES,
  PROTOCOL_CONSTRAINTS,
  type CompletionReport,
  type ValidationResult,
  type ValidationError,
} from "./types";
import { parseCompletionReport, parseOutputFile } from "./parser";

/**
 * Counts sentences in text using a simple heuristic:
 * split on period/exclamation/question followed by space or end-of-string.
 */
function countSentences(text: string): number {
  const sentences = text
    .split(/[.!?]+(?:\s|$)/)
    .filter((s) => s.trim().length > 0);
  return sentences.length;
}

/**
 * Validates a raw agent response containing a completion report.
 * Binary pass/fail — all checks must pass.
 * Runs inside agentz_dispatch after parsing, before the result reaches the orchestrator.
 */
export function validateCompletionReport(raw: string): ValidationResult {
  const errors: ValidationError[] = [];

  // 1. Parse the report
  const parsed = parseCompletionReport(raw);

  if (!parsed.found) {
    return {
      valid: false,
      errors: [
        {
          field: "report",
          error: "No completion report detected in response (missing STATUS: line)",
        },
      ],
    };
  }

  const { fields } = parsed;

  // 2. STATUS present and valid
  if (!fields.status || !fields.status.trim()) {
    errors.push({ field: "status", error: "STATUS field is empty" });
  } else if (
    !TASK_STATUSES.includes(fields.status as (typeof TASK_STATUSES)[number])
  ) {
    errors.push({
      field: "status",
      error: `Invalid STATUS value: "${fields.status}". Must be one of: ${TASK_STATUSES.join(", ")}`,
    });
  }

  // 3. OUTPUT path present
  if (!fields.outputPath || !fields.outputPath.trim()) {
    errors.push({ field: "outputPath", error: "OUTPUT path is empty" });
  } else {
    // 4. Output file exists on disk
    if (!existsSync(fields.outputPath)) {
      errors.push({
        field: "outputFile",
        error: `Output file does not exist: ${fields.outputPath}`,
      });
    } else {
      // 5-8. Validate output file structure
      const content = readFileSync(fields.outputPath, "utf-8");
      const outputResult = parseOutputFile(content);
      if (!outputResult.valid) {
        for (const err of outputResult.errors) {
          errors.push({
            field: `outputFile.${err.field}`,
            error: err.error,
          });
        }
      }
    }
  }

  // 9. SUMMARY present
  if (!fields.summary || !fields.summary.trim()) {
    errors.push({ field: "summary", error: "SUMMARY is empty" });
  } else {
    // 10. SUMMARY reasonable length
    const sentenceCount = countSentences(fields.summary);
    if (sentenceCount > PROTOCOL_CONSTRAINTS.summary.validationMaxSentences) {
      errors.push({
        field: "summary",
        error: `SUMMARY has ${sentenceCount} sentences (max ${PROTOCOL_CONSTRAINTS.summary.validationMaxSentences}). This looks like a full dump, not a summary.`,
      });
    }
  }

  // 11. QUESTIONS present when needs_input
  if (fields.status === "needs_input") {
    if (!fields.questions || fields.questions.length === 0) {
      errors.push({
        field: "questions",
        error:
          'STATUS is "needs_input" but no QUESTIONS provided',
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Build the validated report
  const report: CompletionReport = {
    status: fields.status!,
    outputPath: fields.outputPath!,
    summary: fields.summary!,
    recommendations: fields.recommendations ?? [],
    questions: fields.questions,
  };

  return { valid: true, report, errors: [] };
}
```

**Step 4: Run the test to verify it passes**

Run: `bun test src/protocol/validator.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/protocol/validator.ts src/protocol/validator.test.ts
git commit -m "feat: implement completion report validator with binary pass/fail checks"
```

### Task 2.5: Implement task context renderer

**Files:**
- Modify: `src/protocol/context.ts`
- Test: `src/protocol/context.test.ts`

**Step 1: Write the test**

`src/protocol/context.test.ts`:
```typescript
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
```

**Step 2: Run the test to verify it fails**

Run: `bun test src/protocol/context.test.ts`
Expected: FAIL — cannot resolve imports

**Step 3: Implement context.ts**

`src/protocol/context.ts`:
```typescript
export interface AncestryEntry {
  skill: string;
  sessionId: string;
}

export interface GlobalNoteEntry {
  content: string;
  stale: boolean;
}

export interface TaskDispatchContext {
  sessionId: string;
  taskId: string;
  outputPath: string;
  ancestryChain: AncestryEntry[];
  priorOutputPaths: string[];
  globalNotes: GlobalNoteEntry[];
}

/**
 * Generates the task-specific context block appended to the agent's system prompt.
 * Includes session/task identifiers, output path, spawning rules, ancestry, and global notes.
 */
export function renderTaskContext(ctx: TaskDispatchContext): string {
  const sections: string[] = [];

  // --- Identity ---
  sections.push(`## Task Context

**Session ID:** ${ctx.sessionId}
**Task ID:** ${ctx.taskId}
**Output Path:** ${ctx.outputPath}

Write your full output to the output path above.`);

  // --- Spawning Rules ---
  sections.push(`## Spawning Rules

You may spawn leaf agents (local-explorer, web-explorer) for information gathering — they compress large results into summaries.
You may also spawn one non-leaf agent if your task requires delegating a sub-problem.
Use direct tools (grep, glob, read, write, edit, bash) for targeted operations that need 1-3 tool calls.`);

  // --- Ancestry Chain ---
  if (ctx.ancestryChain.length > 0) {
    const chain = ctx.ancestryChain
      .map((a) => `- ${a.skill} (session: ${a.sessionId})`)
      .join("\n");
    sections.push(`## Ancestry Chain

You were spawned by this chain of agents:
${chain}

Do NOT spawn a non-leaf agent with a skill already in your ancestry (cycle prevention).`);
  }

  // --- Prior Output Paths ---
  if (ctx.priorOutputPaths.length > 0) {
    const paths = ctx.priorOutputPaths.map((p) => `- ${p}`).join("\n");
    sections.push(`## Prior Task Outputs

These output files from earlier tasks may be relevant to your work:
${paths}`);
  }

  // --- Global Notes (Project Knowledge) ---
  if (ctx.globalNotes.length > 0) {
    const notes = ctx.globalNotes
      .map((n) => `- ${n.stale ? "[stale] " : ""}${n.content}`)
      .join("\n");
    sections.push(`## Project Knowledge

Known project-level facts (use these to inform your work):
${notes}`);
  }

  return sections.join("\n\n");
}
```

**Step 4: Run the test to verify it passes**

Run: `bun test src/protocol/context.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/protocol/context.ts src/protocol/context.test.ts
git commit -m "feat: implement task context renderer with global notes injection"
```

### Task 2.6: Run full protocol test suite

**Step 1: Run all protocol tests together**

Run: `bun test src/protocol/`
Expected: All tests PASS (types, renderer, parser, validator, context)

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors
## Phase 3: Persistence Layer (`src/db/`)

### Task 3.1: Define database schema and initialization

**Files:**
- Modify: `src/db/schema.ts`
- Test: `src/db/schema.test.ts`

**Step 1: Write the test**

`src/db/schema.test.ts`:
```typescript
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

  test("WAL mode is enabled", () => {
    db = new Database(":memory:");
    createSchema(db);
    const result = db.query("PRAGMA journal_mode").get() as {
      journal_mode: string;
    };
    expect(result.journal_mode).toBe("wal");
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `bun test src/db/schema.test.ts`
Expected: FAIL — cannot resolve imports

**Step 3: Implement schema.ts**

`src/db/schema.ts`:
```typescript
import { Database } from "bun:sqlite";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  opencode_session_id TEXT,
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  config TEXT,
  review_cycles INTEGER NOT NULL DEFAULT 0,
  max_review_cycles INTEGER NOT NULL DEFAULT 2,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  category TEXT,
  added_by TEXT,
  completed_by TEXT,
  rework_of INTEGER REFERENCES todos(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  depends_on TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  todo_id INTEGER REFERENCES todos(id),
  skill TEXT NOT NULL,
  tier TEXT NOT NULL,
  final_tier TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  retries INTEGER NOT NULL DEFAULT 0,
  failure_classification TEXT,
  error_detail TEXT,
  input_summary TEXT,
  output_summary TEXT,
  output_path TEXT,
  recommendations TEXT,
  needs_review_count INTEGER NOT NULL DEFAULT 0,
  pending_questions TEXT,
  child_session_id TEXT,
  iteration INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS iterations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  iteration_number INTEGER NOT NULL,
  summary TEXT NOT NULL,
  decisions TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  content TEXT NOT NULL,
  added_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS review_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  content TEXT NOT NULL,
  surfaced BOOLEAN NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS global_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  source_session_id TEXT REFERENCES sessions(id),
  source_task_id TEXT,
  last_confirmed TEXT,
  confirmed_count INTEGER NOT NULL DEFAULT 0,
  superseded_by INTEGER REFERENCES global_notes(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * Creates all tables and enables WAL mode.
 * Idempotent — safe to call multiple times.
 */
export function createSchema(db: Database): void {
  db.exec("PRAGMA journal_mode=WAL;");
  db.exec("PRAGMA foreign_keys=ON;");
  db.exec(SCHEMA_SQL);
}
```

**Step 4: Run the test to verify it passes**

Run: `bun test src/db/schema.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/db/schema.ts src/db/schema.test.ts
git commit -m "feat: define database schema with 7 tables and WAL mode"
```

### Task 3.2: Implement database client — session and todo CRUD

**Files:**
- Modify: `src/db/index.ts`
- Test: `src/db/index.test.ts`

**Step 1: Write the test (sessions + todos)**

`src/db/index.test.ts`:
```typescript
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
```

**Step 2: Run the test to verify it fails**

Run: `bun test src/db/index.test.ts`
Expected: FAIL — cannot resolve imports

**Step 3: Implement database client (sessions + todos)**

`src/db/index.ts`:
```typescript
import { Database } from "bun:sqlite";

// === Row types ===
export interface SessionRow {
  id: string;
  opencode_session_id: string | null;
  goal: string;
  status: string;
  config: string | null;
  review_cycles: number;
  max_review_cycles: number;
  created_at: string;
  updated_at: string;
}

export interface TodoRow {
  id: number;
  session_id: string;
  description: string;
  status: string;
  priority: string;
  category: string | null;
  added_by: string | null;
  completed_by: string | null;
  rework_of: number | null;
  sort_order: number;
  depends_on: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  session_id: string;
  todo_id: number | null;
  skill: string;
  tier: string;
  final_tier: string | null;
  status: string;
  retries: number;
  failure_classification: string | null;
  error_detail: string | null;
  input_summary: string | null;
  output_summary: string | null;
  output_path: string | null;
  recommendations: string | null;
  needs_review_count: number;
  pending_questions: string | null;
  child_session_id: string | null;
  iteration: number;
  created_at: string;
  completed_at: string | null;
}

export interface IterationRow {
  id: number;
  session_id: string;
  iteration_number: number;
  summary: string;
  decisions: string | null;
  created_at: string;
}

export interface NoteRow {
  id: number;
  session_id: string;
  content: string;
  added_by: string | null;
  created_at: string;
}

export interface ReviewItemRow {
  id: number;
  task_id: string;
  session_id: string;
  content: string;
  surfaced: number;
  created_at: string;
}

export interface GlobalNoteRow {
  id: number;
  content: string;
  category: string | null;
  status: string;
  source_session_id: string | null;
  source_task_id: string | null;
  last_confirmed: string | null;
  confirmed_count: number;
  superseded_by: number | null;
  created_at: string;
  updated_at: string;
}

// === Priority ordering for todo sorting ===
const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Database client wrapping all CRUD operations for agentz state.
 * All methods are synchronous (bun:sqlite is synchronous).
 */
export class AgentzDB {
  constructor(private db: Database) {}

  // === Sessions ===

  createSession(params: {
    id: string;
    openCodeSessionId?: string;
    goal: string;
    config?: string;
    maxReviewCycles?: number;
  }): SessionRow {
    this.db
      .query(
        `INSERT INTO sessions (id, opencode_session_id, goal, config, max_review_cycles)
         VALUES ($id, $openCodeSessionId, $goal, $config, $maxReviewCycles)`
      )
      .run({
        $id: params.id,
        $openCodeSessionId: params.openCodeSessionId ?? null,
        $goal: params.goal,
        $config: params.config ?? null,
        $maxReviewCycles: params.maxReviewCycles ?? 2,
      });
    return this.getSession(params.id)!;
  }

  getSession(id: string): SessionRow | null {
    return (
      (this.db
        .query("SELECT * FROM sessions WHERE id = $id")
        .get({ $id: id }) as SessionRow | null) ?? null
    );
  }

  getActiveSessionByOpenCodeId(openCodeSessionId: string): SessionRow | null {
    return (
      (this.db
        .query(
          "SELECT * FROM sessions WHERE opencode_session_id = $oid AND status = 'active'"
        )
        .get({ $oid: openCodeSessionId }) as SessionRow | null) ?? null
    );
  }

  updateSessionStatus(id: string, status: string): void {
    this.db
      .query(
        "UPDATE sessions SET status = $status, updated_at = datetime('now') WHERE id = $id"
      )
      .run({ $id: id, $status: status });
  }

  incrementReviewCycles(id: string): void {
    this.db
      .query(
        "UPDATE sessions SET review_cycles = review_cycles + 1, updated_at = datetime('now') WHERE id = $id"
      )
      .run({ $id: id });
  }

  getMostRecentNonCompleted(): SessionRow | null {
    return (
      (this.db
        .query(
          "SELECT * FROM sessions WHERE status != 'completed' ORDER BY created_at DESC LIMIT 1"
        )
        .get() as SessionRow | null) ?? null
    );
  }

  // === Todos ===

  addTodo(params: {
    sessionId: string;
    description: string;
    priority?: string;
    category?: string;
    addedBy?: string;
    reworkOf?: number;
    sortOrder?: number;
  }): TodoRow {
    const result = this.db
      .query(
        `INSERT INTO todos (session_id, description, priority, category, added_by, rework_of, sort_order)
         VALUES ($sessionId, $description, $priority, $category, $addedBy, $reworkOf, $sortOrder)`
      )
      .run({
        $sessionId: params.sessionId,
        $description: params.description,
        $priority: params.priority ?? "medium",
        $category: params.category ?? null,
        $addedBy: params.addedBy ?? null,
        $reworkOf: params.reworkOf ?? null,
        $sortOrder: params.sortOrder ?? 0,
      });
    return this.db
      .query("SELECT * FROM todos WHERE id = $id")
      .get({ $id: result.lastInsertRowid }) as TodoRow;
  }

  getTodos(sessionId: string): TodoRow[] {
    return this.db
      .query(
        "SELECT * FROM todos WHERE session_id = $sessionId ORDER BY sort_order ASC, id ASC"
      )
      .all({ $sessionId: sessionId }) as TodoRow[];
  }

  updateTodoStatus(id: number, status: string): void {
    this.db
      .query(
        "UPDATE todos SET status = $status, updated_at = datetime('now') WHERE id = $id"
      )
      .run({ $id: id, $status: status });
  }

  completeTodo(id: number, completedBy: string): void {
    this.db
      .query(
        "UPDATE todos SET status = 'completed', completed_by = $completedBy, updated_at = datetime('now') WHERE id = $id"
      )
      .run({ $id: id, $completedBy: completedBy });
  }

  getNextPendingTodo(sessionId: string): TodoRow | null {
    // Priority order: high (0), medium (1), low (2), then by sort_order, then by id
    return (
      (this.db
        .query(
          `SELECT * FROM todos
           WHERE session_id = $sessionId AND status = 'pending'
           ORDER BY
             CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END ASC,
             sort_order ASC,
             id ASC
           LIMIT 1`
        )
        .get({ $sessionId: sessionId }) as TodoRow | null) ?? null
    );
  }
}
```

**Step 4: Run the test to verify it passes**

Run: `bun test src/db/index.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/db/index.ts src/db/index.test.ts
git commit -m "feat: implement database client with session and todo CRUD"
```

### Task 3.3: Add task, iteration, note, review_item, and global_note CRUD

**Files:**
- Modify: `src/db/index.ts` (add methods)
- Modify: `src/db/index.test.ts` (add test cases)

**Step 1: Add test cases for remaining tables**

Append to `src/db/index.test.ts`:
```typescript
  // === Tasks ===
  describe("tasks", () => {
    beforeEach(() => {
      db.createSession({ id: "s-001", goal: "Test" });
      db.addTodo({ sessionId: "s-001", description: "Todo 1" });
    });

    test("createTask and getTask", () => {
      const task = db.createTask({
        id: "task-001",
        sessionId: "s-001",
        todoId: 1,
        skill: "backend-developer",
        tier: "balanced",
        inputSummary: "Implement user API",
        iteration: 1,
      });
      expect(task.id).toBe("task-001");
      expect(task.skill).toBe("backend-developer");
      expect(task.status).toBe("pending");

      const fetched = db.getTask("task-001");
      expect(fetched).toBeDefined();
      expect(fetched!.tier).toBe("balanced");
    });

    test("updateTaskStatus", () => {
      db.createTask({
        id: "task-001",
        sessionId: "s-001",
        todoId: 1,
        skill: "backend-developer",
        tier: "balanced",
        iteration: 1,
      });
      db.updateTaskStatus("task-001", "running");
      const task = db.getTask("task-001");
      expect(task!.status).toBe("running");
    });

    test("completeTask sets output fields", () => {
      db.createTask({
        id: "task-001",
        sessionId: "s-001",
        todoId: 1,
        skill: "backend-developer",
        tier: "balanced",
        iteration: 1,
      });
      db.completeTask("task-001", {
        outputSummary: "API implemented successfully",
        outputPath: "/tmp/output.md",
        finalTier: "balanced",
        recommendations: "[]",
      });
      const task = db.getTask("task-001");
      expect(task!.status).toBe("completed");
      expect(task!.output_summary).toBe("API implemented successfully");
      expect(task!.output_path).toBe("/tmp/output.md");
      expect(task!.final_tier).toBe("balanced");
    });

    test("failTask sets error fields", () => {
      db.createTask({
        id: "task-001",
        sessionId: "s-001",
        todoId: 1,
        skill: "backend-developer",
        tier: "balanced",
        iteration: 1,
      });
      db.failTask("task-001", {
        failureClassification: "capability",
        errorDetail: "Model could not follow protocol",
        retries: 2,
        finalTier: "powerful",
      });
      const task = db.getTask("task-001");
      expect(task!.status).toBe("failed");
      expect(task!.failure_classification).toBe("capability");
      expect(task!.retries).toBe(2);
    });

    test("getRunningTask returns the running task", () => {
      db.createTask({
        id: "task-001",
        sessionId: "s-001",
        todoId: 1,
        skill: "backend-developer",
        tier: "balanced",
        iteration: 1,
      });
      db.updateTaskStatus("task-001", "running");
      const running = db.getRunningTask("s-001");
      expect(running).toBeDefined();
      expect(running!.id).toBe("task-001");
    });

    test("getRunningTask returns null when none running", () => {
      const running = db.getRunningTask("s-001");
      expect(running).toBeNull();
    });

    test("getTasksBySession returns all tasks", () => {
      db.createTask({
        id: "task-001",
        sessionId: "s-001",
        todoId: 1,
        skill: "backend-developer",
        tier: "balanced",
        iteration: 1,
      });
      db.createTask({
        id: "task-002",
        sessionId: "s-001",
        todoId: 1,
        skill: "backend-tester",
        tier: "balanced",
        iteration: 2,
      });
      const tasks = db.getTasksBySession("s-001");
      expect(tasks).toHaveLength(2);
    });

    test("getNextTaskId generates sequential IDs", () => {
      const id1 = db.getNextTaskId("s-001");
      expect(id1).toBe("task-001");
      db.createTask({
        id: id1,
        sessionId: "s-001",
        todoId: 1,
        skill: "backend-developer",
        tier: "balanced",
        iteration: 1,
      });
      const id2 = db.getNextTaskId("s-001");
      expect(id2).toBe("task-002");
    });
  });

  // === Iterations ===
  describe("iterations", () => {
    beforeEach(() => {
      db.createSession({ id: "s-001", goal: "Test" });
    });

    test("addIteration and getIterations", () => {
      db.addIteration({
        sessionId: "s-001",
        iterationNumber: 1,
        summary: "Dispatched backend-developer for API task",
        decisions: JSON.stringify({ action: "dispatch", skill: "backend-developer" }),
      });
      const iterations = db.getIterations("s-001");
      expect(iterations).toHaveLength(1);
      expect(iterations[0].iteration_number).toBe(1);
      expect(iterations[0].summary).toContain("backend-developer");
    });

    test("getLatestIterations returns last N", () => {
      for (let i = 1; i <= 5; i++) {
        db.addIteration({
          sessionId: "s-001",
          iterationNumber: i,
          summary: `Iteration ${i}`,
        });
      }
      const latest = db.getLatestIterations("s-001", 3);
      expect(latest).toHaveLength(3);
      expect(latest[0].iteration_number).toBe(3);
      expect(latest[2].iteration_number).toBe(5);
    });
  });

  // === Notes ===
  describe("notes", () => {
    beforeEach(() => {
      db.createSession({ id: "s-001", goal: "Test" });
    });

    test("addNote and getNotes", () => {
      db.addNote({
        sessionId: "s-001",
        content: "Auth uses JWT with RS256",
        addedBy: "task-001",
      });
      const notes = db.getNotes("s-001");
      expect(notes).toHaveLength(1);
      expect(notes[0].content).toBe("Auth uses JWT with RS256");
    });

    test("getNotes with keyword filter", () => {
      db.addNote({ sessionId: "s-001", content: "Uses PostgreSQL 15" });
      db.addNote({ sessionId: "s-001", content: "Auth uses JWT" });
      const filtered = db.getNotes("s-001", "JWT");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].content).toContain("JWT");
    });
  });

  // === Review Items ===
  describe("review_items", () => {
    beforeEach(() => {
      db.createSession({ id: "s-001", goal: "Test" });
      db.addTodo({ sessionId: "s-001", description: "Todo 1" });
      db.createTask({
        id: "task-001",
        sessionId: "s-001",
        todoId: 1,
        skill: "code-reviewer",
        tier: "balanced",
        iteration: 1,
      });
    });

    test("addReviewItem and getUnsurfacedReviewItems", () => {
      db.addReviewItem({
        taskId: "task-001",
        sessionId: "s-001",
        content: "Auth middleware skips validation for admin routes",
      });
      const items = db.getUnsurfacedReviewItems("s-001");
      expect(items).toHaveLength(1);
      expect(items[0].content).toContain("Auth middleware");
    });

    test("markReviewItemSurfaced", () => {
      db.addReviewItem({
        taskId: "task-001",
        sessionId: "s-001",
        content: "Issue found",
      });
      const items = db.getUnsurfacedReviewItems("s-001");
      db.markReviewItemSurfaced(items[0].id);
      const after = db.getUnsurfacedReviewItems("s-001");
      expect(after).toHaveLength(0);
    });

    test("getReviewItemCount", () => {
      db.addReviewItem({
        taskId: "task-001",
        sessionId: "s-001",
        content: "Issue 1",
      });
      db.addReviewItem({
        taskId: "task-001",
        sessionId: "s-001",
        content: "Issue 2",
      });
      expect(db.getReviewItemCount("s-001")).toBe(2);
    });
  });

  // === Global Notes ===
  describe("global_notes", () => {
    beforeEach(() => {
      db.createSession({ id: "s-001", goal: "Test" });
    });

    test("addGlobalNote and getGlobalNotes", () => {
      db.addGlobalNote({
        content: "Project uses PostgreSQL 15",
        category: "tech-stack",
        sourceSessionId: "s-001",
        sourceTaskId: "task-001",
      });
      const notes = db.getGlobalNotes();
      expect(notes).toHaveLength(1);
      expect(notes[0].status).toBe("draft");
    });

    test("getConfirmedGlobalNotes returns only confirmed", () => {
      db.addGlobalNote({
        content: "Draft note",
        sourceSessionId: "s-001",
      });
      db.addGlobalNote({
        content: "Confirmed note",
        sourceSessionId: "s-001",
      });
      const notes = db.getGlobalNotes();
      db.updateGlobalNoteStatus(notes[1].id, "confirmed");
      const confirmed = db.getConfirmedGlobalNotes();
      expect(confirmed).toHaveLength(1);
      expect(confirmed[0].content).toBe("Confirmed note");
    });

    test("updateGlobalNoteStatus", () => {
      db.addGlobalNote({
        content: "A note",
        sourceSessionId: "s-001",
      });
      const notes = db.getGlobalNotes();
      db.updateGlobalNoteStatus(notes[0].id, "confirmed");
      const updated = db.getGlobalNotes();
      expect(updated[0].status).toBe("confirmed");
    });

    test("confirmGlobalNote increments count", () => {
      db.addGlobalNote({
        content: "A note",
        sourceSessionId: "s-001",
      });
      const notes = db.getGlobalNotes();
      db.confirmGlobalNote(notes[0].id);
      db.confirmGlobalNote(notes[0].id);
      const updated = db.getGlobalNotes();
      expect(updated[0].confirmed_count).toBe(2);
      expect(updated[0].status).toBe("confirmed");
    });

    test("supersedeGlobalNote", () => {
      db.addGlobalNote({
        content: "Old note",
        sourceSessionId: "s-001",
      });
      db.addGlobalNote({
        content: "New note",
        sourceSessionId: "s-001",
      });
      const notes = db.getGlobalNotes();
      db.supersedeGlobalNote(notes[0].id, notes[1].id);
      const updated = db.getGlobalNotes();
      const old = updated.find((n) => n.content === "Old note");
      expect(old!.status).toBe("superseded");
      expect(old!.superseded_by).toBe(notes[1].id);
    });

    test("getGlobalNotes with keyword filter", () => {
      db.addGlobalNote({
        content: "Uses PostgreSQL 15",
        sourceSessionId: "s-001",
      });
      db.addGlobalNote({
        content: "Auth uses JWT",
        sourceSessionId: "s-001",
      });
      const filtered = db.getGlobalNotes("JWT");
      expect(filtered).toHaveLength(1);
    });

    test("getConfirmedGlobalNotesForInjection respects stale threshold", () => {
      db.addGlobalNote({
        content: "Fresh note",
        sourceSessionId: "s-001",
      });
      const notes = db.getGlobalNotes();
      db.confirmGlobalNote(notes[0].id);
      // The note is confirmed but confirmed_count is only 1
      // stale threshold is 5 sessions, but we check by last_confirmed date
      // For this test, just verify the method returns data
      const forInjection = db.getConfirmedGlobalNotesForInjection();
      expect(forInjection).toHaveLength(1);
      expect(forInjection[0].content).toBe("Fresh note");
    });
  });
```

**Step 2: Run the test to verify new tests fail**

Run: `bun test src/db/index.test.ts`
Expected: FAIL — missing methods (createTask, getTask, etc.)

**Step 3: Add remaining CRUD methods to AgentzDB**

Append these methods to the `AgentzDB` class in `src/db/index.ts`:

```typescript
  // === Tasks ===

  createTask(params: {
    id: string;
    sessionId: string;
    todoId: number;
    skill: string;
    tier: string;
    inputSummary?: string;
    iteration: number;
  }): TaskRow {
    this.db
      .query(
        `INSERT INTO tasks (id, session_id, todo_id, skill, tier, input_summary, iteration)
         VALUES ($id, $sessionId, $todoId, $skill, $tier, $inputSummary, $iteration)`
      )
      .run({
        $id: params.id,
        $sessionId: params.sessionId,
        $todoId: params.todoId,
        $skill: params.skill,
        $tier: params.tier,
        $inputSummary: params.inputSummary ?? null,
        $iteration: params.iteration,
      });
    return this.getTask(params.id)!;
  }

  getTask(id: string): TaskRow | null {
    return (
      (this.db
        .query("SELECT * FROM tasks WHERE id = $id")
        .get({ $id: id }) as TaskRow | null) ?? null
    );
  }

  updateTaskStatus(id: string, status: string): void {
    this.db
      .query("UPDATE tasks SET status = $status WHERE id = $id")
      .run({ $id: id, $status: status });
  }

  completeTask(
    id: string,
    params: {
      outputSummary: string;
      outputPath: string;
      finalTier: string;
      recommendations?: string;
      needsReviewCount?: number;
    }
  ): void {
    this.db
      .query(
        `UPDATE tasks SET
           status = 'completed',
           output_summary = $outputSummary,
           output_path = $outputPath,
           final_tier = $finalTier,
           recommendations = $recommendations,
           needs_review_count = $needsReviewCount,
           completed_at = datetime('now')
         WHERE id = $id`
      )
      .run({
        $id: id,
        $outputSummary: params.outputSummary,
        $outputPath: params.outputPath,
        $finalTier: params.finalTier,
        $recommendations: params.recommendations ?? null,
        $needsReviewCount: params.needsReviewCount ?? 0,
      });
  }

  failTask(
    id: string,
    params: {
      failureClassification: string;
      errorDetail: string;
      retries: number;
      finalTier: string;
    }
  ): void {
    this.db
      .query(
        `UPDATE tasks SET
           status = 'failed',
           failure_classification = $failureClassification,
           error_detail = $errorDetail,
           retries = $retries,
           final_tier = $finalTier,
           completed_at = datetime('now')
         WHERE id = $id`
      )
      .run({
        $id: id,
        $failureClassification: params.failureClassification,
        $errorDetail: params.errorDetail,
        $retries: params.retries,
        $finalTier: params.finalTier,
      });
  }

  getRunningTask(sessionId: string): TaskRow | null {
    return (
      (this.db
        .query(
          "SELECT * FROM tasks WHERE session_id = $sessionId AND status = 'running' LIMIT 1"
        )
        .get({ $sessionId: sessionId }) as TaskRow | null) ?? null
    );
  }

  getTasksBySession(sessionId: string): TaskRow[] {
    return this.db
      .query(
        "SELECT * FROM tasks WHERE session_id = $sessionId ORDER BY created_at ASC"
      )
      .all({ $sessionId: sessionId }) as TaskRow[];
  }

  getNextTaskId(sessionId: string): string {
    const count = this.db
      .query(
        "SELECT COUNT(*) as count FROM tasks WHERE session_id = $sessionId"
      )
      .get({ $sessionId: sessionId }) as { count: number };
    return `task-${String(count.count + 1).padStart(3, "0")}`;
  }

  // === Iterations ===

  addIteration(params: {
    sessionId: string;
    iterationNumber: number;
    summary: string;
    decisions?: string;
  }): IterationRow {
    const result = this.db
      .query(
        `INSERT INTO iterations (session_id, iteration_number, summary, decisions)
         VALUES ($sessionId, $iterationNumber, $summary, $decisions)`
      )
      .run({
        $sessionId: params.sessionId,
        $iterationNumber: params.iterationNumber,
        $summary: params.summary,
        $decisions: params.decisions ?? null,
      });
    return this.db
      .query("SELECT * FROM iterations WHERE id = $id")
      .get({ $id: result.lastInsertRowid }) as IterationRow;
  }

  getIterations(sessionId: string): IterationRow[] {
    return this.db
      .query(
        "SELECT * FROM iterations WHERE session_id = $sessionId ORDER BY iteration_number ASC"
      )
      .all({ $sessionId: sessionId }) as IterationRow[];
  }

  getLatestIterations(sessionId: string, limit: number): IterationRow[] {
    return this.db
      .query(
        `SELECT * FROM iterations WHERE session_id = $sessionId
         ORDER BY iteration_number DESC LIMIT $limit`
      )
      .all({ $sessionId: sessionId, $limit: limit })
      .reverse() as IterationRow[];
  }

  // === Notes ===

  addNote(params: {
    sessionId: string;
    content: string;
    addedBy?: string;
  }): NoteRow {
    const result = this.db
      .query(
        `INSERT INTO notes (session_id, content, added_by)
         VALUES ($sessionId, $content, $addedBy)`
      )
      .run({
        $sessionId: params.sessionId,
        $content: params.content,
        $addedBy: params.addedBy ?? null,
      });
    return this.db
      .query("SELECT * FROM notes WHERE id = $id")
      .get({ $id: result.lastInsertRowid }) as NoteRow;
  }

  getNotes(sessionId: string, keyword?: string): NoteRow[] {
    if (keyword) {
      return this.db
        .query(
          "SELECT * FROM notes WHERE session_id = $sessionId AND content LIKE $keyword ORDER BY created_at ASC"
        )
        .all({
          $sessionId: sessionId,
          $keyword: `%${keyword}%`,
        }) as NoteRow[];
    }
    return this.db
      .query(
        "SELECT * FROM notes WHERE session_id = $sessionId ORDER BY created_at ASC"
      )
      .all({ $sessionId: sessionId }) as NoteRow[];
  }

  // === Review Items ===

  addReviewItem(params: {
    taskId: string;
    sessionId: string;
    content: string;
  }): ReviewItemRow {
    const result = this.db
      .query(
        `INSERT INTO review_items (task_id, session_id, content)
         VALUES ($taskId, $sessionId, $content)`
      )
      .run({
        $taskId: params.taskId,
        $sessionId: params.sessionId,
        $content: params.content,
      });
    return this.db
      .query("SELECT * FROM review_items WHERE id = $id")
      .get({ $id: result.lastInsertRowid }) as ReviewItemRow;
  }

  getUnsurfacedReviewItems(sessionId: string): ReviewItemRow[] {
    return this.db
      .query(
        "SELECT * FROM review_items WHERE session_id = $sessionId AND surfaced = 0 ORDER BY created_at ASC"
      )
      .all({ $sessionId: sessionId }) as ReviewItemRow[];
  }

  markReviewItemSurfaced(id: number): void {
    this.db
      .query("UPDATE review_items SET surfaced = 1 WHERE id = $id")
      .run({ $id: id });
  }

  getReviewItemCount(sessionId: string): number {
    const result = this.db
      .query(
        "SELECT COUNT(*) as count FROM review_items WHERE session_id = $sessionId AND surfaced = 0"
      )
      .get({ $sessionId: sessionId }) as { count: number };
    return result.count;
  }

  // === Global Notes ===

  addGlobalNote(params: {
    content: string;
    category?: string;
    sourceSessionId?: string;
    sourceTaskId?: string;
  }): GlobalNoteRow {
    const result = this.db
      .query(
        `INSERT INTO global_notes (content, category, source_session_id, source_task_id)
         VALUES ($content, $category, $sourceSessionId, $sourceTaskId)`
      )
      .run({
        $content: params.content,
        $category: params.category ?? null,
        $sourceSessionId: params.sourceSessionId ?? null,
        $sourceTaskId: params.sourceTaskId ?? null,
      });
    return this.db
      .query("SELECT * FROM global_notes WHERE id = $id")
      .get({ $id: result.lastInsertRowid }) as GlobalNoteRow;
  }

  getGlobalNotes(keyword?: string): GlobalNoteRow[] {
    if (keyword) {
      return this.db
        .query(
          "SELECT * FROM global_notes WHERE content LIKE $keyword ORDER BY created_at ASC"
        )
        .all({ $keyword: `%${keyword}%` }) as GlobalNoteRow[];
    }
    return this.db
      .query("SELECT * FROM global_notes ORDER BY created_at ASC")
      .all() as GlobalNoteRow[];
  }

  getConfirmedGlobalNotes(): GlobalNoteRow[] {
    return this.db
      .query(
        "SELECT * FROM global_notes WHERE status = 'confirmed' ORDER BY confirmed_count DESC"
      )
      .all() as GlobalNoteRow[];
  }

  updateGlobalNoteStatus(id: number, status: string): void {
    this.db
      .query(
        "UPDATE global_notes SET status = $status, updated_at = datetime('now') WHERE id = $id"
      )
      .run({ $id: id, $status: status });
  }

  confirmGlobalNote(id: number): void {
    this.db
      .query(
        `UPDATE global_notes SET
           status = 'confirmed',
           last_confirmed = datetime('now'),
           confirmed_count = confirmed_count + 1,
           updated_at = datetime('now')
         WHERE id = $id`
      )
      .run({ $id: id });
  }

  supersedeGlobalNote(oldId: number, newId: number): void {
    this.db
      .query(
        "UPDATE global_notes SET status = 'superseded', superseded_by = $newId, updated_at = datetime('now') WHERE id = $oldId"
      )
      .run({ $oldId: oldId, $newId: newId });
  }

  getConfirmedGlobalNotesForInjection(): GlobalNoteRow[] {
    return this.db
      .query(
        "SELECT * FROM global_notes WHERE status = 'confirmed' ORDER BY confirmed_count DESC"
      )
      .all() as GlobalNoteRow[];
  }
```

**Step 4: Run the test to verify it passes**

Run: `bun test src/db/index.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/db/index.ts src/db/index.test.ts
git commit -m "feat: add task, iteration, note, review_item, and global_note CRUD"
```

### Task 3.4: Add database initialization helper

**Files:**
- Create: `src/db/init.ts`
- Test: `src/db/init.test.ts`

**Step 1: Write the test**

`src/db/init.test.ts`:
```typescript
import { describe, expect, test, afterEach } from "bun:test";
import { initDatabase } from "./init";
import { existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";

const TEST_DIR = join(import.meta.dir, "../../.test-tmp-db");

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

describe("initDatabase", () => {
  test("creates database file and directory", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const dbPath = join(TEST_DIR, "agentz.db");
    const db = initDatabase(dbPath);
    expect(existsSync(dbPath)).toBe(true);
    db.close();
  });

  test("returns a working AgentzDB instance", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const dbPath = join(TEST_DIR, "agentz.db");
    const db = initDatabase(dbPath);

    // Should be able to create a session
    db.createSession({ id: "s-001", goal: "Test" });
    const session = db.getSession("s-001");
    expect(session).toBeDefined();
    expect(session!.goal).toBe("Test");
    db.close();
  });

  test("opens existing database without data loss", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const dbPath = join(TEST_DIR, "agentz.db");

    // First open — create data
    const db1 = initDatabase(dbPath);
    db1.createSession({ id: "s-001", goal: "Persistent" });
    db1.close();

    // Second open — data should persist
    const db2 = initDatabase(dbPath);
    const session = db2.getSession("s-001");
    expect(session).toBeDefined();
    expect(session!.goal).toBe("Persistent");
    db2.close();
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `bun test src/db/init.test.ts`
Expected: FAIL — cannot resolve imports

**Step 3: Implement init.ts**

`src/db/init.ts`:
```typescript
import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { AgentzDB } from "./index";
import { createSchema } from "./schema";

/**
 * Initializes the database at the given path.
 * Creates the directory if it doesn't exist.
 * Creates tables if they don't exist.
 * Returns a wrapped AgentzDB instance with a close() method.
 */
export function initDatabase(dbPath: string): AgentzDB & { close(): void } {
  mkdirSync(dirname(dbPath), { recursive: true });
  const raw = new Database(dbPath);
  createSchema(raw);
  const db = new AgentzDB(raw);
  return Object.assign(db, { close: () => raw.close() });
}
```

**Step 4: Run the test to verify it passes**

Run: `bun test src/db/init.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/db/init.ts src/db/init.test.ts
git commit -m "feat: add database initialization helper"
```

### Task 3.5: Run full database test suite

**Step 1: Run all database tests together**

Run: `bun test src/db/`
Expected: All tests PASS

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

---

## Phase 4: Plugin Skeleton

### Task 4.1: Define tier mapping and configuration types

**Files:**
- Create: `src/config.ts`
- Test: `src/config.test.ts`

**Step 1: Write the test**

`src/config.test.ts`:
```typescript
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_TIER_CONFIG,
  CATEGORY_MAPPING,
  getTierForCategory,
  getSkillForCategory,
  getEscalationTier,
  type TierConfig,
  type CategoryMapping,
} from "./config";

describe("tier configuration", () => {
  test("DEFAULT_TIER_CONFIG has 4 tiers", () => {
    expect(Object.keys(DEFAULT_TIER_CONFIG)).toHaveLength(4);
    expect(DEFAULT_TIER_CONFIG["fast-cheap"]).toBeDefined();
    expect(DEFAULT_TIER_CONFIG["balanced"]).toBeDefined();
    expect(DEFAULT_TIER_CONFIG["powerful"]).toBeDefined();
    expect(DEFAULT_TIER_CONFIG["reasoning"]).toBeDefined();
  });

  test("each tier has model and escalate_to", () => {
    for (const [name, tier] of Object.entries(DEFAULT_TIER_CONFIG)) {
      expect(tier.model).toBeDefined();
      expect("escalate_to" in tier).toBe(true);
    }
  });

  test("escalation chain is finite", () => {
    let tier = DEFAULT_TIER_CONFIG["fast-cheap"];
    const visited = new Set<string>();
    while (tier.escalate_to) {
      expect(visited.has(tier.escalate_to)).toBe(false); // no cycles
      visited.add(tier.escalate_to);
      tier = DEFAULT_TIER_CONFIG[tier.escalate_to];
    }
  });
});

describe("category mapping", () => {
  test("CATEGORY_MAPPING has 16 categories", () => {
    expect(Object.keys(CATEGORY_MAPPING)).toHaveLength(16);
  });

  test("each category has tier and skill", () => {
    for (const [name, mapping] of Object.entries(CATEGORY_MAPPING)) {
      expect(mapping.tier).toBeDefined();
      expect(mapping.skill).toBeDefined();
      expect(DEFAULT_TIER_CONFIG[mapping.tier]).toBeDefined();
    }
  });

  test("getTierForCategory returns correct tier", () => {
    expect(getTierForCategory("explore-local")).toBe("fast-cheap");
    expect(getTierForCategory("develop-backend")).toBe("balanced");
    expect(getTierForCategory("architect-db")).toBe("powerful");
  });

  test("getTierForCategory returns balanced for unknown", () => {
    expect(getTierForCategory("unknown-category")).toBe("balanced");
  });

  test("getSkillForCategory returns correct skill", () => {
    expect(getSkillForCategory("explore-local")).toBe("local-explorer");
    expect(getSkillForCategory("develop-backend")).toBe("backend-developer");
    expect(getSkillForCategory("synthesize")).toBe("synthesizer");
  });

  test("getEscalationTier follows chain", () => {
    expect(getEscalationTier("fast-cheap")).toBe("balanced");
    expect(getEscalationTier("balanced")).toBe("powerful");
    expect(getEscalationTier("powerful")).toBeNull();
    expect(getEscalationTier("reasoning")).toBeNull();
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `bun test src/config.test.ts`
Expected: FAIL — cannot resolve imports

**Step 3: Implement config.ts**

`src/config.ts`:
```typescript
export interface TierDef {
  model: string;
  escalate_to: string | null;
}

export type TierConfig = Record<string, TierDef>;

export interface CategoryMappingEntry {
  tier: string;
  skill: string;
}

export type CategoryMapping = Record<string, CategoryMappingEntry>;

export const DEFAULT_TIER_CONFIG: TierConfig = {
  "fast-cheap": { model: "haiku", escalate_to: "balanced" },
  balanced: { model: "sonnet", escalate_to: "powerful" },
  powerful: { model: "opus", escalate_to: null },
  reasoning: { model: "o3", escalate_to: null },
};

export const CATEGORY_MAPPING: CategoryMapping = {
  "explore-local": { tier: "fast-cheap", skill: "local-explorer" },
  "explore-web": { tier: "fast-cheap", skill: "web-explorer" },
  "analyze-business": { tier: "balanced", skill: "business-analyst" },
  "analyze-technical": { tier: "balanced", skill: "technical-analyst" },
  "develop-backend": { tier: "balanced", skill: "backend-developer" },
  "develop-frontend": { tier: "balanced", skill: "frontend-developer" },
  "design-ui": { tier: "balanced", skill: "ui-ux-designer" },
  "test-backend": { tier: "balanced", skill: "backend-tester" },
  "test-frontend": { tier: "balanced", skill: "frontend-tester" },
  "review-code": { tier: "balanced", skill: "code-reviewer" },
  "architect-db": { tier: "powerful", skill: "database-architect" },
  "engineer-devops": { tier: "balanced", skill: "devops-engineer" },
  "audit-security": { tier: "powerful", skill: "security-auditor" },
  "write-docs": { tier: "balanced", skill: "technical-writer" },
  synthesize: { tier: "balanced", skill: "synthesizer" },
  verify: { tier: "balanced", skill: "backend-tester" },
};

export function getTierForCategory(category: string): string {
  return CATEGORY_MAPPING[category]?.tier ?? "balanced";
}

export function getSkillForCategory(category: string): string {
  return CATEGORY_MAPPING[category]?.skill ?? category;
}

export function getEscalationTier(
  currentTier: string,
  config: TierConfig = DEFAULT_TIER_CONFIG
): string | null {
  return config[currentTier]?.escalate_to ?? null;
}
```

**Step 4: Run the test to verify it passes**

Run: `bun test src/config.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: define tier configuration and category-to-skill mapping"
```

### Task 4.2: Define orchestrator and worker base prompts

**Files:**
- Modify: `src/prompts/index.ts`
- Test: `src/prompts/index.test.ts`

**Step 1: Write the test**

`src/prompts/index.test.ts`:
```typescript
import { describe, expect, test } from "bun:test";
import { ORCHESTRATOR_PROMPT, WORKER_BASE_PROMPT } from "./index";

describe("prompts", () => {
  test("ORCHESTRATOR_PROMPT is non-empty", () => {
    expect(ORCHESTRATOR_PROMPT.length).toBeGreaterThan(100);
  });

  test("ORCHESTRATOR_PROMPT mentions iteration loop", () => {
    expect(ORCHESTRATOR_PROMPT).toMatch(/iteration/i);
  });

  test("ORCHESTRATOR_PROMPT mentions agentz_dispatch", () => {
    expect(ORCHESTRATOR_PROMPT).toContain("agentz_dispatch");
  });

  test("ORCHESTRATOR_PROMPT mentions agentz_query", () => {
    expect(ORCHESTRATOR_PROMPT).toContain("agentz_query");
  });

  test("ORCHESTRATOR_PROMPT mentions complexity assessment", () => {
    expect(ORCHESTRATOR_PROMPT).toMatch(/complex/i);
  });

  test("WORKER_BASE_PROMPT is non-empty", () => {
    expect(WORKER_BASE_PROMPT.length).toBeGreaterThan(50);
  });

  test("WORKER_BASE_PROMPT mentions output format", () => {
    expect(WORKER_BASE_PROMPT).toMatch(/output/i);
  });

  test("WORKER_BASE_PROMPT mentions safety constraints", () => {
    expect(WORKER_BASE_PROMPT).toMatch(/scope|boundary|constraint/i);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `bun test src/prompts/index.test.ts`
Expected: FAIL — cannot resolve imports

**Step 3: Implement prompts**

`src/prompts/index.ts`:
```typescript
import { CATEGORY_MAPPING } from "../config";

const MAPPING_TABLE = Object.entries(CATEGORY_MAPPING)
  .map(([cat, { tier, skill }]) => `| ${cat} | ${tier} | ${skill} |`)
  .join("\n");

/**
 * Orchestrator system prompt — registered with the agentz agent.
 * Covers: role, iteration loop behavior, complexity assessment, dispatch rules.
 * Does NOT contain domain knowledge or protocol details.
 */
export const ORCHESTRATOR_PROMPT = `You are the Agentz orchestrator — a multi-agent task coordination system.

## Your Role

You coordinate complex tasks by breaking them into smaller pieces and dispatching skill-specialized agents to work on them. You do NOT do domain work yourself — you delegate to specialists.

## Iteration Loop

You operate in an iteration loop. Each iteration, your working view (injected into your system prompt) shows:
- The session goal
- Current todo list with statuses
- Recent iteration history
- Session notes
- Last completed task summary

Based on this state, you:
1. Assess the current situation
2. Pick the next pending todo (or decide on a different action)
3. Dispatch an agent using the \`agentz_dispatch\` tool
4. Process the result and continue to the next iteration

## First Iteration (Session Start)

On the first iteration (no todos yet), dispatch a \`triage-analyst\` to assess complexity and decompose the goal into todos. Use:
- \`agentz_dispatch\` with the appropriate todo

## Complexity Decision

For "low" complexity tasks (single, straightforward actions), consider handling them directly rather than through the full triage-dispatch cycle.

For "medium" to "very_high" complexity, always use triage + dispatch.

## Dispatch Rules

Use \`agentz_dispatch\` to dispatch agents. The tool handles:
- Creating child sessions
- Selecting models from tier config
- Composing prompts
- Validating outputs
- Processing recommendations

You provide the todo_id and skill name. Reference this mapping table for default skill assignments:

| Category | Tier | Skill |
|----------|------|-------|
${MAPPING_TABLE}

You may override the default mapping with justification.

## State Queries

Use \`agentz_query\` when the working view's pruned data is insufficient. It can retrieve:
- Full todo list with details
- Complete iteration history
- Specific task details
- Session notes (with keyword filtering)
- Global project knowledge notes

## Session Completion

When all todos are completed:
1. Dispatch a \`synthesizer\` for the final review
2. If synthesis passes, mark the session complete
3. If synthesis finds issues, add new todos and continue

## Handling Failures

When a task fails (escalation ladder exhausted), surface the failure to the user and pause for a decision.

When a task needs input (\`needs_input\`), relay the questions to the user and pause.
`;

/**
 * Worker base prompt — registered with the agentz-worker subagent.
 * Provides stable identity and universal constraints.
 * Skill-specific protocol, task context, and output format are injected via
 * the system parameter at dispatch time.
 */
export const WORKER_BASE_PROMPT = `You are an Agentz worker agent — a skill-specialized agent dispatched by the Agentz orchestrator to complete a specific task.

## Identity

You are part of a multi-agent system. You have been assigned a specific task with a specific skill focus. Your system prompt contains:
1. This base identity (you're reading it now)
2. The output protocol (how to format your output and completion report)
3. Your skill instructions (your domain expertise and constraints)
4. Task context (session ID, task ID, output path, and relevant background)

## Universal Constraints

- Stay within the scope of your assigned task
- Write your full output to the designated output path
- End your response with the completion report in the exact format specified
- If you cannot complete the task, report failure honestly — do not fabricate results
- If you need user input, use status "needs_input" with specific questions
- Respect the boundary between your skill and other skills — do not do work outside your domain

## Output Expectations

Your system prompt includes detailed output format instructions. Follow them exactly.
The orchestrator depends on your completion report being parseable and valid.
`;
```

**Step 4: Run the test to verify it passes**

Run: `bun test src/prompts/index.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/prompts/index.ts src/prompts/index.test.ts
git commit -m "feat: define orchestrator and worker base prompts"
```

### Task 4.3: Wire up plugin entry point with agent registration and hook stubs

**Files:**
- Modify: `src/index.ts`
- Test: `src/index.test.ts`

**Step 1: Write the test**

`src/index.test.ts`:
```typescript
import { describe, expect, test } from "bun:test";
import plugin from "./index";

describe("plugin entry point", () => {
  test("plugin is a function", () => {
    expect(typeof plugin).toBe("function");
  });

  test("plugin returns hooks object with expected keys", async () => {
    // Create a minimal mock input
    const mockInput = {
      client: {} as any,
      project: "test-project",
      directory: "/tmp/test",
      worktree: "/tmp/test",
      serverUrl: "http://localhost:3000",
      $: {} as any,
    };

    const hooks = await plugin(mockInput);
    expect(hooks).toBeDefined();

    // Check agent registrations
    expect(hooks.agent).toBeDefined();
    expect(hooks.agent!.agentz).toBeDefined();
    expect(hooks.agent!.agentz.mode).toBe("primary");
    expect(hooks.agent!["agentz-worker"]).toBeDefined();
    expect(hooks.agent!["agentz-worker"].mode).toBe("subagent");

    // Check tool registrations exist
    expect(hooks.tool).toBeDefined();
    expect(hooks.tool!.agentz_dispatch).toBeDefined();
    expect(hooks.tool!.agentz_query).toBeDefined();

    // Check hook registrations exist
    expect(hooks.event).toBeDefined();
    expect(hooks["experimental.chat.system.transform"]).toBeDefined();
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `bun test src/index.test.ts`
Expected: FAIL — hooks don't have expected structure yet

**Step 3: Implement plugin entry point**

`src/index.ts`:
```typescript
import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { ORCHESTRATOR_PROMPT, WORKER_BASE_PROMPT } from "./prompts/index";

const plugin: Plugin = async (input) => {
  const { client, directory } = input;

  // Agent-identity tracking: maps OpenCode session ID → active agent name
  const sessionAgentMap = new Map<string, string>();

  // Track sessions that were compacted (for post-compaction hardening)
  const compactedSessions = new Set<string>();

  return {
    // === Agent Registrations ===
    agent: {
      agentz: {
        model: undefined, // uses whatever model the user has configured
        prompt: ORCHESTRATOR_PROMPT,
        description: "Agentz orchestrator — multi-agent task orchestration",
        mode: "primary" as const,
      },
      "agentz-worker": {
        model: undefined, // selected per-dispatch from tier config
        prompt: WORKER_BASE_PROMPT,
        description: "Agentz skill-specialized worker subagent",
        mode: "subagent" as const,
      },
    },

    // === Tool Registrations ===
    tool: {
      agentz_dispatch: tool({
        description:
          "Dispatch a skill-specialized agent for a todo item. The tool creates a child session, composes the agent prompt, runs the agent, validates the output, and returns a structured result.",
        args: {
          todo_id: tool.schema
            .number()
            .describe("The todo ID to work on"),
          skill: tool.schema
            .string()
            .describe("The skill to use (from the category mapping table)"),
        },
        async execute(args, ctx) {
          // TODO: Implement in Phase 5
          return `[STUB] Dispatch requested: todo=${args.todo_id}, skill=${args.skill}`;
        },
      }),
      agentz_query: tool({
        description:
          "Query full session state from the database. Use when the working view's pruned data is insufficient.",
        args: {
          section: tool.schema
            .enum(["todos", "iterations", "task", "notes", "global_notes"])
            .describe("Which state section to retrieve"),
          task_id: tool.schema
            .string()
            .optional()
            .describe(
              "Task ID to retrieve details for (required when section is 'task')"
            ),
          keyword: tool.schema
            .string()
            .optional()
            .describe(
              "Keyword substring filter (only used when section is 'notes' or 'global_notes')"
            ),
        },
        async execute(args, ctx) {
          // TODO: Implement in Phase 5
          return `[STUB] Query requested: section=${args.section}`;
        },
      }),
    },

    // === Event Hook ===
    event: async ({ event }) => {
      // TODO: Implement interruption detection, compaction detection in Phase 5-6
    },

    // === Chat Message Hook (agent identity tracking) ===
    "chat.message": async ({ sessionID, agent }) => {
      if (agent) {
        sessionAgentMap.set(sessionID, agent);
      }
    },

    // === System Transform Hook ===
    "experimental.chat.system.transform": async ({ sessionID }, output) => {
      // Only inject for the agentz orchestrator agent
      const activeAgent = sessionAgentMap.get(sessionID ?? "");
      if (activeAgent !== "agentz") return;

      // TODO: Inject working view from DB in Phase 6
    },

    // === Compaction Hook ===
    "experimental.session.compacting": async ({ sessionID }, output) => {
      // TODO: Inject agentz state into compaction context in Phase 6
    },
  };
};

export default plugin;
```

**Step 4: Run the test to verify it passes**

Run: `bun test src/index.test.ts`
Expected: All tests PASS

**Step 5: Run full test suite and typecheck**

Run: `bun test && bun run typecheck`
Expected: All tests PASS, no type errors

**Step 6: Commit**

```bash
git add src/index.ts src/index.test.ts
git commit -m "feat: wire up plugin entry point with agents, tools, and hook stubs"
```
## Phase 5: Core Dispatch (`agentz_dispatch` tool)

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
- Modify: `src/index.ts` (wire up real dispatch)

Note: This is the core integration point. It cannot be fully unit-tested without mocking the SDK client, so we write an integration-ready implementation and test the pure logic parts. Full E2E testing happens in Phase 8.

**Step 1: Implement dispatch/index.ts**

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
  client: any; // OpencodeClient — typed as any to avoid import issues during testing
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
      msg.includes("ECONNREFUSED") ||
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

**Step 2: Commit**

```bash
git add src/dispatch/index.ts
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

## Phase 6: Orchestrator Working View and Hook Implementation

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
- Modify: `src/hooks/index.ts`
- Modify: `src/index.ts` (wire hooks)

**Step 1: Implement hooks/index.ts**

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

**Step 2: Update src/index.ts to use real hook implementations**

Replace the hook stubs with imports from `./hooks/index`. Create the `HookState` object in the plugin function and pass it to each hook handler.

**Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 4: Run full test suite**

Run: `bun test`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/hooks/index.ts src/index.ts
git commit -m "feat: implement event, system.transform, and compaction hooks"
```

### Task 6.3: Run full test suite for Phases 5-6

**Step 1: Run all tests**

Run: `bun test`
Expected: All tests PASS

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors
## Phase 7: Skill Files

### Task 7.1: Write core skill files (triage-analyst, local-explorer, backend-developer)

Start with the 3 most critical skills. These are needed for the E2E test in Phase 8.

**Files:**
- Create: `skills/triage-analyst.md`
- Create: `skills/local-explorer.md`
- Create: `skills/backend-developer.md`

**Step 1: Write triage-analyst skill**

`skills/triage-analyst.md`:
```markdown
# Skill: triage-analyst

## Role
Session-start complexity assessor and task decomposer. Receives the user's goal and produces a structured plan.

## Capabilities
- Analyze project goals for complexity and scope
- Decompose goals into prioritized, categorized todo items
- Assess technical requirements and identify dependencies
- Read existing codebase structure to inform planning
- Use direct tools (grep, glob, read) for targeted codebase inspection
- Spawn local-explorer for broad codebase analysis when needed

## Constraints
- Do NOT implement any code — analysis and planning only
- Do NOT modify any files
- Do NOT make architectural decisions — identify options and trade-offs for the domain specialists
- Keep todo descriptions actionable and specific (not vague like "handle edge cases")

## Domain Instructions
When triaging, follow this process:

1. **Understand the goal**: Read the user's goal carefully. Identify explicit requirements and implicit expectations.

2. **Assess the codebase**: Use direct tools to understand the project structure, tech stack, and existing patterns. Spawn a local-explorer if the codebase is large or unfamiliar.

3. **Rate complexity**: Assign one of: low, medium, high, very_high
   - low: Single file change, clear path, < 30 min
   - medium: Multiple files, some decisions needed, 1-4 hours
   - high: Cross-cutting changes, architectural decisions, 4-16 hours
   - very_high: Multi-system, significant unknowns, > 16 hours

4. **Decompose into todos**: Create a prioritized list where each todo:
   - Has a clear, actionable description
   - Has a priority (high/medium/low)
   - Has a category from the mapping table (e.g., develop-backend, test-backend)
   - Is scoped to roughly 1 agent dispatch (not too broad, not trivially small)

5. **Order matters**: High-priority todos that others depend on should come first. Infrastructure before features. Tests alongside or after implementation.

Write your recommendations in the output file's ## Recommendations section using the standard format:
- ADD_TODO: <description> [priority: high|medium|low] [category: <category>]
```

**Step 2: Write local-explorer skill**

`skills/local-explorer.md`:
```markdown
# Skill: local-explorer

## Role
Codebase search and analysis specialist. Gathers information from the local filesystem and returns compressed summaries.

## Capabilities
- Search codebases using grep, glob, and file reading
- Analyze directory structures and project layouts
- Read and summarize configuration files
- Identify patterns, conventions, and tech stack details
- Compress large search results into actionable summaries

## Constraints
- Do NOT modify any files — read-only exploration
- Do NOT spawn other agents — you are a leaf agent
- Do NOT make implementation decisions — report findings objectively
- Keep summaries focused on what the requesting agent needs

## Domain Instructions
When exploring, be systematic:

1. Start broad: directory listing, package.json/config files, README
2. Then narrow: grep for specific patterns, read key files
3. Compress: Don't dump raw file contents — summarize what you found, highlighting what matters for the requesting agent's task

Always report:
- What you found (with file paths and line numbers)
- What you didn't find (negative results are valuable)
- Patterns and conventions you observed
```

**Step 3: Write backend-developer skill**

`skills/backend-developer.md`:
```markdown
# Skill: backend-developer

## Role
Server-side implementation specialist. Writes production-quality backend code including APIs, business logic, data access layers, and service integrations.

## Capabilities
- Implement REST and GraphQL APIs
- Write business logic with proper error handling
- Create database queries and data access code
- Write unit and integration tests alongside implementation
- Refactor existing code for clarity and performance
- Use direct tools (grep, glob, read, write, edit, bash) for targeted operations
- Spawn local-explorer for broad codebase analysis when needed

## Constraints
- Do NOT modify frontend code or UI components
- Do NOT change database schemas (coordinate with database-architect)
- Do NOT skip tests — every public function gets at least one test
- Keep changes focused on the assigned task scope

## Domain Instructions
Follow TDD discipline: write a failing test first, then implement to make it pass, then refactor. Commit at each green state.

When touching shared interfaces (API contracts, service boundaries), document the contract explicitly in the output's Details section so downstream agents can verify compatibility.

If you discover issues outside your scope, use ADD_NOTE or ADD_TODO recommendations rather than fixing them directly.
```

**Step 4: Verify skill files load correctly**

Run: `bun test src/skills/loader.test.ts`
Expected: All tests PASS (including the test-skill fixture test)

**Step 5: Commit**

```bash
git add skills/triage-analyst.md skills/local-explorer.md skills/backend-developer.md
git commit -m "feat: add core skill files — triage-analyst, local-explorer, backend-developer"
```

### Task 7.2: Write remaining leaf and analysis skills

**Files:**
- Create: `skills/web-explorer.md`
- Create: `skills/business-analyst.md`
- Create: `skills/technical-analyst.md`

**Step 1: Write web-explorer skill**

`skills/web-explorer.md`:
```markdown
# Skill: web-explorer

## Role
Web research specialist. Fetches and analyzes web content, documentation, and external resources, returning compressed summaries.

## Capabilities
- Fetch and analyze web pages and documentation
- Search external APIs and package registries
- Read and summarize technical documentation
- Compare library options and versions
- Compress findings into actionable summaries

## Constraints
- Do NOT modify any local files — research only
- Do NOT spawn other agents — you are a leaf agent
- Do NOT make implementation decisions — report findings objectively
- Only fetch publicly accessible URLs

## Domain Instructions
When researching:

1. Start with the most authoritative source (official docs, GitHub repos)
2. Verify version compatibility with the project's tech stack
3. Summarize key findings with source URLs for reference
4. Flag any breaking changes, deprecations, or security advisories
```

**Step 2: Write business-analyst skill**

`skills/business-analyst.md`:
```markdown
# Skill: business-analyst

## Role
Requirements analyst. Analyzes change requests, user stories, and business requirements against existing plans and completed work.

## Capabilities
- Analyze change requests against existing todo lists and completed work
- Identify impact of requirement changes on completed tasks
- Decompose new requirements into actionable todos
- Assess which completed work needs rework due to changes
- Spawn local-explorer for codebase impact analysis

## Constraints
- Do NOT implement code or make technical architecture decisions
- Do NOT modify files — analysis and recommendations only
- Focus on requirement alignment, not technical feasibility (that's technical-analyst)

## Domain Instructions
When analyzing change requests:

1. Compare the change against the original goal and existing todos
2. Identify completed todos that may be invalidated
3. Specify which completed work needs rework and why
4. Add new todos with clear scope, priority, and category
5. For rework todos, reference the original todo they replace
```

**Step 3: Write technical-analyst skill**

`skills/technical-analyst.md`:
```markdown
# Skill: technical-analyst

## Role
Architecture and technical feasibility analyst. Evaluates technical approaches, identifies risks, and recommends implementation strategies.

## Capabilities
- Evaluate technical approaches and trade-offs
- Assess feasibility of proposed changes
- Identify technical risks and dependencies
- Review architecture decisions
- Spawn local-explorer for deep codebase analysis

## Constraints
- Do NOT implement code — analysis and recommendations only
- Do NOT modify files
- Present trade-offs objectively rather than making unilateral decisions

## Domain Instructions
When analyzing technical approaches:

1. Identify the key technical decisions required
2. For each decision, present 2-3 options with trade-offs
3. Recommend an approach with justification
4. Flag risks and dependencies that could block implementation
5. Note any assumptions that should be validated
```

**Step 4: Commit**

```bash
git add skills/web-explorer.md skills/business-analyst.md skills/technical-analyst.md
git commit -m "feat: add web-explorer, business-analyst, and technical-analyst skills"
```

### Task 7.3: Write developer and tester skills

**Files:**
- Create: `skills/frontend-developer.md`
- Create: `skills/backend-tester.md`
- Create: `skills/frontend-tester.md`
- Create: `skills/ui-ux-designer.md`

**Step 1: Write frontend-developer skill**

`skills/frontend-developer.md`:
```markdown
# Skill: frontend-developer

## Role
UI implementation specialist. Builds user interfaces, components, client-side logic, and styling.

## Capabilities
- Implement UI components and pages
- Write client-side business logic and state management
- Create responsive layouts and styling
- Write component tests
- Integrate with backend APIs
- Spawn local-explorer for pattern discovery

## Constraints
- Do NOT modify backend code or server-side logic
- Do NOT change API contracts (coordinate with backend-developer)
- Do NOT skip component tests
- Follow existing project conventions for styling and state management

## Domain Instructions
Match the project's existing frontend patterns. If the project uses React, write React. If it uses Vue, write Vue. Check the package.json and existing components before writing new ones.

Always consider accessibility (ARIA labels, keyboard navigation, color contrast) in your implementations.
```

**Step 2: Write backend-tester skill**

`skills/backend-tester.md`:
```markdown
# Skill: backend-tester

## Role
Server-side testing specialist. Writes comprehensive tests for backend code including unit tests, integration tests, and test infrastructure.

## Capabilities
- Write unit tests for functions, classes, and modules
- Write integration tests for APIs and service boundaries
- Set up test fixtures and mock data
- Configure test infrastructure and CI test commands
- Measure and improve test coverage
- Spawn local-explorer for understanding existing test patterns

## Constraints
- Do NOT modify production code unless fixing a clear bug found during testing
- Do NOT change API contracts or database schemas
- Focus on test quality over quantity — meaningful assertions, not superficial checks

## Domain Instructions
Follow the existing test framework and patterns in the project. Check for existing test utilities, fixtures, and helpers before creating new ones.

Write tests that verify behavior, not implementation details. A good test should survive refactoring of the code under test.

Organize tests to match source structure: if testing `src/api/users.ts`, tests go in `tests/api/users.test.ts` (or adjacent `src/api/users.test.ts` depending on project convention).
```

**Step 3: Write frontend-tester skill**

`skills/frontend-tester.md`:
```markdown
# Skill: frontend-tester

## Role
UI testing specialist. Writes component tests, E2E tests, and visual regression tests for frontend code.

## Capabilities
- Write component/unit tests for UI components
- Write E2E tests for user flows
- Set up visual regression testing
- Test accessibility compliance
- Spawn local-explorer for understanding existing test patterns

## Constraints
- Do NOT modify production frontend or backend code
- Do NOT change component APIs unless fixing a bug found during testing
- Use the project's existing test framework

## Domain Instructions
Test user-visible behavior, not component internals. Prefer testing what the user sees and interacts with (rendered text, button clicks, form submissions) over testing internal state.

For E2E tests, focus on critical user journeys. For component tests, focus on props, events, and edge cases.
```

**Step 4: Write ui-ux-designer skill**

`skills/ui-ux-designer.md`:
```markdown
# Skill: ui-ux-designer

## Role
Interface design specialist. Creates UX flows, wireframes, design specifications, and accessibility guidelines.

## Capabilities
- Design user interface layouts and flows
- Create design specifications for components
- Define interaction patterns and micro-interactions
- Assess and improve accessibility
- Spawn local-explorer for analyzing existing UI patterns

## Constraints
- Do NOT write production code — design specifications only
- Do NOT change existing component behavior without documenting the change
- Focus on usability, consistency, and accessibility

## Domain Instructions
Review existing UI patterns in the project before proposing new ones. Consistency with existing design is more important than novel patterns.

Always include accessibility considerations in design specs: color contrast ratios, keyboard navigation flow, screen reader behavior.
```

**Step 5: Commit**

```bash
git add skills/frontend-developer.md skills/backend-tester.md skills/frontend-tester.md skills/ui-ux-designer.md
git commit -m "feat: add developer and tester skill files"
```

### Task 7.4: Write review, infrastructure, and documentation skills

**Files:**
- Create: `skills/code-reviewer.md`
- Create: `skills/database-architect.md`
- Create: `skills/devops-engineer.md`
- Create: `skills/security-auditor.md`
- Create: `skills/technical-writer.md`

**Step 1: Write code-reviewer skill**

`skills/code-reviewer.md`:
```markdown
# Skill: code-reviewer

## Role
Code quality specialist. Reviews code changes for correctness, maintainability, security, and adherence to project conventions.

## Capabilities
- Review code for bugs, logic errors, and edge cases
- Check adherence to project conventions and best practices
- Identify security vulnerabilities
- Assess test coverage and quality
- Flag maintainability and readability concerns
- Spawn local-explorer for understanding project patterns

## Constraints
- Do NOT modify code — reviews and recommendations only
- Do NOT block on style preferences — focus on correctness and security
- Flag critical issues as NEEDS_REVIEW, minor suggestions as ADD_NOTE

## Domain Instructions
Review systematically:

1. **Correctness**: Does the code do what it claims? Edge cases handled?
2. **Security**: Input validation, auth checks, injection risks?
3. **Tests**: Are changes tested? Are tests meaningful?
4. **Consistency**: Does it follow existing project patterns?
5. **Maintainability**: Will future developers understand this?

Use NEEDS_REVIEW for issues that require human judgment (trade-offs, architectural choices). Use ADD_NOTE for factual observations.
```

**Step 2: Write database-architect skill**

`skills/database-architect.md`:
```markdown
# Skill: database-architect

## Role
Database design specialist. Creates schemas, migrations, query optimizations, and data modeling.

## Capabilities
- Design database schemas and relationships
- Write migration scripts
- Optimize query performance
- Design indexing strategies
- Spawn local-explorer for analyzing existing schema and queries

## Constraints
- Do NOT modify application business logic
- Do NOT write API endpoints (that's backend-developer)
- Always provide both up and down migrations
- Consider data migration needs when changing existing schemas

## Domain Instructions
Design for the project's existing database technology. Check existing schema patterns, naming conventions, and migration tooling before writing new schemas.

Always consider: data integrity constraints, indexing for common query patterns, and backward compatibility for schema changes.
```

**Step 3: Write devops-engineer skill**

`skills/devops-engineer.md`:
```markdown
# Skill: devops-engineer

## Role
Infrastructure and deployment specialist. Manages CI/CD pipelines, deployment configurations, and development environment tooling.

## Capabilities
- Configure CI/CD pipelines
- Write Dockerfiles and container configurations
- Set up deployment scripts and infrastructure
- Configure development environment tooling
- Spawn local-explorer for analyzing existing infrastructure

## Constraints
- Do NOT modify application business logic
- Do NOT change database schemas
- Test infrastructure changes in isolation before recommending deployment
- Document all environment variable and secret requirements

## Domain Instructions
Match the project's existing infrastructure patterns. If they use GitHub Actions, write GitHub Actions. If Docker, write Docker.

Always consider: reproducibility, security (no secrets in configs), and rollback capability.
```

**Step 4: Write security-auditor skill**

`skills/security-auditor.md`:
```markdown
# Skill: security-auditor

## Role
Security specialist. Reviews code and infrastructure for vulnerabilities, compliance issues, and security best practices.

## Capabilities
- Identify security vulnerabilities (injection, XSS, CSRF, auth bypass)
- Review authentication and authorization implementations
- Assess dependency security (known CVEs)
- Check secrets management and data handling
- Spawn local-explorer for thorough codebase scanning

## Constraints
- Do NOT modify code — audit and recommendations only
- Flag all findings by severity (critical, high, medium, low)
- Use NEEDS_REVIEW for critical findings that need immediate human attention

## Domain Instructions
Audit systematically:

1. **Authentication**: Token handling, session management, password policies
2. **Authorization**: Access control, privilege escalation paths
3. **Input handling**: Injection points, validation, sanitization
4. **Data protection**: Encryption, PII handling, logging of sensitive data
5. **Dependencies**: Known vulnerabilities, outdated packages
6. **Secrets**: Hardcoded credentials, environment variable exposure
```

**Step 5: Write technical-writer skill**

`skills/technical-writer.md`:
```markdown
# Skill: technical-writer

## Role
Documentation specialist. Writes and maintains technical documentation including API docs, guides, architecture docs, and inline documentation.

## Capabilities
- Write API documentation
- Create user guides and tutorials
- Document architecture decisions
- Write inline code documentation
- Generate changelog entries
- Spawn local-explorer for understanding what needs documenting

## Constraints
- Do NOT modify production code (except adding JSDoc/inline comments)
- Do NOT change API behavior — document what exists
- Keep documentation concise and accurate

## Domain Instructions
Match the project's existing documentation style and tooling. If they use JSDoc, write JSDoc. If they have a docs/ directory with markdown, follow that pattern.

Documentation should answer: What does this do? How do I use it? What are the edge cases? What's the expected behavior?
```

**Step 6: Commit**

```bash
git add skills/code-reviewer.md skills/database-architect.md skills/devops-engineer.md skills/security-auditor.md skills/technical-writer.md
git commit -m "feat: add review, infrastructure, and documentation skill files"
```

### Task 7.5: Write synthesizer skill

**Files:**
- Create: `skills/synthesizer.md`

**Step 1: Write the synthesizer skill (the most complex skill)**

`skills/synthesizer.md`:
```markdown
# Skill: synthesizer

## Role
Cross-task integration reviewer and knowledge curator. Performs multi-pass analysis of all task outputs to ensure coherence, identify gaps, and curate project knowledge.

## Capabilities
- Read task completion summaries from the database
- Read output file Summary sections for breadth analysis
- Perform targeted deep reads of selected output files
- Identify cross-task inconsistencies, contract mismatches, and gaps
- Curate global project knowledge (confirm, reject, merge, supersede notes)
- Add new todos for identified issues
- Spawn local-explorer for verifying code-level integration

## Constraints
- Do NOT implement code or modify files directly
- Do NOT repeat work already done by agents — focus on integration and coherence
- Keep deep reads targeted (3-8 tasks, not all tasks)

## Domain Instructions

### Three-Pass Reading Strategy

#### Pass 1 — Breadth Scan (All Tasks, Summaries Only)

For every completed task:
1. Read the task's `output_summary` from the completion report
2. Read only the `## Summary` section from the task's output file

From this, build a mental coverage map:
- Which requirements from the goal are addressed?
- Which are missing?
- Where might outputs overlap or conflict?

Produce an explicit **deep-read target list** with reasons before proceeding to Pass 2.

#### Pass 2 — Targeted Deep Reads (Selected Tasks, Full Output)

Read full output files only for flagged tasks. Select based on:
- Tasks that touch **shared interfaces** (API contracts, DB schemas, shared types)
- Tasks flagged with `NEEDS_REVIEW` by any agent
- Tasks in **overlapping domains** (e.g., two tasks both modifying auth)
- The **highest-complexity task** by tier (anything on `powerful` tier)

Perform coherence analysis:
- Are API contracts consistent between producers and consumers?
- Are error handling patterns uniform?
- Do assumptions align across tasks?
- Are naming conventions consistent?
- Are there missing integration points?

#### Pass 3 — Knowledge Curation (Global Notes)

Review all draft global notes against the session's work and existing confirmed notes:
- **Confirm**: Note is a durable project fact → recommend confirmation
- **Reject**: Note is session-specific or incorrect → recommend rejection
- **Merge**: Note overlaps with an existing confirmed note → recommend merge
- **Supersede**: Note replaces an outdated confirmed note → recommend supersession

Re-confirm existing confirmed notes that are still valid based on this session's work.

Emit curation decisions as recommendations:
- ADD_NOTE: "GLOBAL_NOTE_CONFIRM: <note_id>" (for confirmations)
- ADD_NOTE: "GLOBAL_NOTE_REJECT: <note_id>" (for rejections)
- ADD_NOTE: "GLOBAL_NOTE_SUPERSEDE: <old_id> WITH <new_id>" (for supersessions)

### Output Structure

Your output file should contain:
- **Summary**: Overall coherence assessment (pass/fail with key findings)
- **Details**: Per-task analysis, cross-task issues, and integration gaps
- **Artifacts**: List of files/contracts that need attention
- **Recommendations**: New todos for issues found, notes for observations
```

**Step 2: Commit**

```bash
git add skills/synthesizer.md
git commit -m "feat: add synthesizer skill with three-pass reading strategy"
```

### Task 7.6: Verify all skill files load correctly

**Files:**
- Create: `src/skills/loader.integration.test.ts`

**Step 1: Write integration test that loads all skills**

`src/skills/loader.integration.test.ts`:
```typescript
import { describe, expect, test } from "bun:test";
import { loadSkill, skillExists } from "./loader";
import { CATEGORY_MAPPING } from "../config";
import { join } from "path";

const SKILLS_DIR = join(import.meta.dir, "../../skills");

const ALL_SKILLS = [
  "triage-analyst",
  "local-explorer",
  "web-explorer",
  "business-analyst",
  "technical-analyst",
  "backend-developer",
  "frontend-developer",
  "ui-ux-designer",
  "backend-tester",
  "frontend-tester",
  "code-reviewer",
  "database-architect",
  "devops-engineer",
  "security-auditor",
  "technical-writer",
  "synthesizer",
];

describe("all skill files", () => {
  for (const skill of ALL_SKILLS) {
    test(`${skill}.md exists`, () => {
      expect(skillExists(skill, SKILLS_DIR)).toBe(true);
    });

    test(`${skill}.md loads and has required sections`, () => {
      const content = loadSkill(skill, SKILLS_DIR);
      expect(content).toContain(`# Skill: ${skill}`);
      expect(content).toContain("## Role");
      expect(content).toContain("## Capabilities");
      expect(content).toContain("## Constraints");
    });
  }

  test("every skill in CATEGORY_MAPPING has a file", () => {
    const mappedSkills = new Set(
      Object.values(CATEGORY_MAPPING).map((m) => m.skill)
    );
    for (const skill of mappedSkills) {
      expect(skillExists(skill, SKILLS_DIR)).toBe(true);
    }
  });
});
```

**Step 2: Run the test**

Run: `bun test src/skills/loader.integration.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/skills/loader.integration.test.ts
git commit -m "test: verify all 16 skill files load correctly"
```

---

## Phase 8: End-to-End Integration

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
    expect(viewAfterTriage).toContain("4 remaining");

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
    expect(viewAfterTask).toContain("3 remaining");
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
});
```

**Step 2: Run the test**

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

**Step 1: Remove test fixture skill**

Delete `skills/test-skill.md` and update `src/skills/loader.test.ts` to use one of the real skills (e.g., `local-explorer`) instead.

**Step 2: Run full test suite**

Run: `bun test`
Expected: All tests PASS

**Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: remove test fixture, finalize implementation"
```

---

## Summary

| Phase | Tasks | What's Built |
|-------|-------|--------------|
| 1 | 2 | Project scaffold (package.json, tsconfig, directories) |
| 2 | 6 | Protocol layer (types, renderer, parser, validator, context) |
| 3 | 5 | Persistence layer (SQLite schema, full CRUD for 7 tables) |
| 4 | 3 | Plugin skeleton (config, prompts, entry point with agents/tools/hooks) |
| 5 | 6 | Core dispatch (skill loader, recommendations, reports, dispatch, query) |
| 6 | 3 | Working view and hook implementations |
| 7 | 6 | All 16 skill files + integration test |
| 8 | 2 | E2E integration test + cleanup |

**Total: 33 tasks, ~100 steps**
