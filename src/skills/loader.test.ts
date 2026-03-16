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
