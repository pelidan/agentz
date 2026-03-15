# Agentz Phase 2: Protocol Layer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the pure protocol layer that defines, renders, parses, validates, and contextualizes Agentz worker output.

**Architecture:** This phase implements the shared protocol as deterministic TypeScript modules backed by focused tests. Most helpers (renderer, parser, context) are pure and side-effect-free. The one exception is the validator (`validator.ts`), which performs filesystem checks — it reads the referenced output path from disk to verify the file exists and contains the required sections. All other protocol helpers remain pure.

**Tech Stack:** TypeScript (strict), Bun runtime, `@opencode-ai/plugin` v1.2.22, `@opencode-ai/sdk` v1.2.22, `bun:sqlite`, `bun:test`, zod v4.1.8

**Prerequisites:** Phase 1 complete and committed.

---

## Scope

The protocol layer is pure functions with zero side effects — the most testable code in the project. Every type, constant, renderer output, parser extraction, and validator check is tested.

> **Note on `src/protocol/schema.ts`:** This file was scaffolded as a placeholder in the Phase 1 plan but is intentionally unused in Phase 2. It is not imported by any module in this phase. It should be removed during the Phase 1 scaffold cleanup pass rather than left as a dead placeholder. If a zod-based runtime schema is needed in a future phase, it can be added then.

## Tasks

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

${OUTPUT_SECTIONS.map((s) => `## ${s}`).join("\n")}

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
