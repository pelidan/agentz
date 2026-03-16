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
