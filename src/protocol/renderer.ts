import {
  TASK_STATUSES,
  RECOMMENDATION_TYPES,
  PRIORITY_LEVELS,
  OUTPUT_SECTIONS,
  PROTOCOL_CONSTRAINTS,
} from "./types";

/**
 * Generates LLM-facing prose from protocol types.
 * Deterministic — same types always produce identical output.
 * ~300-400 tokens of clear, imperative instructions.
 */
export function renderProtocol(): string {
  const sections: string[] = [];

  // --- Output File Format ---
  sections.push(`## Output Protocol

Write your full output to the designated output path. The file MUST contain these sections in this exact order:

${OUTPUT_SECTIONS.map((s) => `## ${s}`).join("\n")}

The **## Summary** section MUST be first and MUST be:
- ${PROTOCOL_CONSTRAINTS.summary.minSentences}-${PROTOCOL_CONSTRAINTS.summary.maxSentences} sentences
- ${PROTOCOL_CONSTRAINTS.summary.requirement}

The **## Recommendations** section uses this format (one per line):
${RECOMMENDATION_TYPES.map((t) => {
  switch (t) {
    case "ADD_TODO":
      return `- ${t}: <description> [priority: ${PRIORITY_LEVELS.join("|")}] [category: <task-category>]`;
    case "ADD_NOTE":
      return `- ${t}: <durable insight or constraint>`;
    case "NEEDS_REVIEW":
      return `- ${t}: <what needs human review and why>`;
    case "ADD_GLOBAL_NOTE":
      return `- ${t}: <durable project-level fact> [category: <knowledge-category>]`;
  }
}).join("\n")}

Leave the section empty if you have no recommendations.`);

  // --- Note Quality ---
  sections.push(`## Note Quality Guidelines

Notes (ADD_NOTE) must be ${PROTOCOL_CONSTRAINTS.notes.guidance}.

Good notes:
${PROTOCOL_CONSTRAINTS.notes.goodExamples.map((e) => `- "${e}"`).join("\n")}

Bad notes (do NOT write these):
${PROTOCOL_CONSTRAINTS.notes.badExamples.map((e) => `- "${e}"`).join("\n")}

Global notes (ADD_GLOBAL_NOTE) must be ${PROTOCOL_CONSTRAINTS.globalNotes.guidance}.

Good global notes:
${PROTOCOL_CONSTRAINTS.globalNotes.goodExamples.map((e) => `- "${e}"`).join("\n")}

Bad global notes:
${PROTOCOL_CONSTRAINTS.globalNotes.badExamples.map((e) => `- "${e}"`).join("\n")}`);

  // --- Completion Report ---
  sections.push(`## Completion Report

After writing the output file, end your response with this exact format:

STATUS: ${TASK_STATUSES.join("|")}
OUTPUT: <path to your output file>
SUMMARY: <${PROTOCOL_CONSTRAINTS.summary.minSentences}-${PROTOCOL_CONSTRAINTS.summary.maxSentences} sentence summary matching the output file's ## Summary>
RECOMMENDATIONS:
<one recommendation per line, or empty>
QUESTIONS:
<only if STATUS is needs_input — list your questions, one per line>`);

  // --- Direct Tools vs Leaf Agents ---
  sections.push(`## Direct Tools vs. Leaf Agents

You have direct tool access (grep, glob, read, webfetch, write, edit, bash) AND can spawn leaf agents for information gathering.

**Use direct tools when:** the operation is targeted (specific file, specific search term), the result is small enough to process directly, or you need a quick factual lookup.

**Spawn a leaf agent when:** you need broad exploration across many files/directories, the raw results would be too large for your context and need compression, or the research requires multi-step navigation with judgment calls.

**Rule of thumb:** if you can get the answer with 1-3 direct tool calls, use direct tools. If you need 5+ tool calls with intermediate reasoning, spawn a leaf agent.`);

  return sections.join("\n\n");
}
