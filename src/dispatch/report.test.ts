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
