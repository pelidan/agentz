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
