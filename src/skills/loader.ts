import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Loads a skill file by name from the skills directory.
 * Skill files are pure markdown with no template variables.
 */
export function loadSkill(skillName: string, skillsDir: string): string {
  const filePath = join(skillsDir, `${skillName}.md`);
  if (!existsSync(filePath)) {
    throw new Error(
      `Skill file not found: ${skillName} (expected at ${filePath})`
    );
  }
  return readFileSync(filePath, "utf-8").trim();
}

/**
 * Checks if a skill file exists.
 */
export function skillExists(skillName: string, skillsDir: string): boolean {
  return existsSync(join(skillsDir, `${skillName}.md`));
}
