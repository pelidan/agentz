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
