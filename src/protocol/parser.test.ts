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
