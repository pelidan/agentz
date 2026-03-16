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
    const prompt = composeSystemPrompt("local-explorer", taskContext, SKILLS_DIR);
    // Protocol layer must appear before skill layer
    const protocolIdx = prompt.indexOf("## Protocol");
    const skillIdx = prompt.indexOf("# Skill: local-explorer");
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
