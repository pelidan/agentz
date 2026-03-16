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
      expect(content).toContain("## Domain Instructions");
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
