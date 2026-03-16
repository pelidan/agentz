export interface AncestryEntry {
  skill: string;
  sessionId: string;
}

export interface GlobalNoteEntry {
  content: string;
  stale: boolean;
}

export interface TaskDispatchContext {
  sessionId: string;
  taskId: string;
  outputPath: string;
  ancestryChain: AncestryEntry[];
  priorOutputPaths: string[];
  globalNotes: GlobalNoteEntry[];
}

/**
 * Generates the task-specific context block appended to the agent's system prompt.
 * Includes session/task identifiers, output path, spawning rules, ancestry, and global notes.
 */
export function renderTaskContext(ctx: TaskDispatchContext): string {
  const sections: string[] = [];

  // --- Identity ---
  sections.push(`## Task Context

**Session ID:** ${ctx.sessionId}
**Task ID:** ${ctx.taskId}
**Output Path:** ${ctx.outputPath}

Write your full output to the output path above.`);

  // --- Spawning Rules ---
  sections.push(`## Spawning Rules

You may spawn leaf agents (local-explorer, web-explorer) for information gathering — they compress large results into summaries.
You may also spawn one non-leaf agent if your task requires delegating a sub-problem.
Use direct tools (grep, glob, read, write, edit, bash) for targeted operations that need 1-3 tool calls.`);

  // --- Ancestry Chain ---
  if (ctx.ancestryChain.length > 0) {
    const chain = ctx.ancestryChain
      .map((a) => `- ${a.skill} (session: ${a.sessionId})`)
      .join("\n");
    sections.push(`## Ancestry Chain

You were spawned by this chain of agents:
${chain}

Do NOT spawn a non-leaf agent with a skill already in your ancestry (cycle prevention).`);
  }

  // --- Prior Output Paths ---
  if (ctx.priorOutputPaths.length > 0) {
    const paths = ctx.priorOutputPaths.map((p) => `- ${p}`).join("\n");
    sections.push(`## Prior Task Outputs

These output files from earlier tasks may be relevant to your work:
${paths}`);
  }

  // --- Global Notes (Project Knowledge) ---
  if (ctx.globalNotes.length > 0) {
    const notes = ctx.globalNotes
      .map((n) => `- ${n.stale ? "[stale] " : ""}${n.content}`)
      .join("\n");
    sections.push(`## Project Knowledge

Known project-level facts (use these to inform your work):
${notes}`);
  }

  return sections.join("\n\n");
}
