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
