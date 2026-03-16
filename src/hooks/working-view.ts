import type { AgentzDB } from "../db/index";

/**
 * Builds the pruned working view injected into the orchestrator's system prompt.
 * Contains: goal, incomplete todos + completed count, last 3 iterations,
 * all notes, last completed task summary, review item count.
 *
 * Does NOT include global notes (orchestrator stays domain-free).
 */
export function buildWorkingView(db: AgentzDB, sessionId: string): string {
  const session = db.getSession(sessionId);
  if (!session) return "No active agentz session.";

  const sections: string[] = [];

  // --- Goal ---
  sections.push(`## Agentz Session: ${session.id}
**Goal:** ${session.goal}
**Status:** ${session.status}`);

  // --- Todos ---
  const todos = db.getTodos(sessionId);
  const completedCount = todos.filter((t) => t.status === "completed").length;
  const incompleteTodos = todos.filter(
    (t) => t.status !== "completed" && t.status !== "cancelled"
  );

  if (todos.length === 0) {
    sections.push(`## Todos
No todos yet. Dispatch a triage-analyst to decompose the goal.`);
  } else {
    const todoLines = incompleteTodos
      .map(
        (t) =>
          `- [${t.id}] ${t.description} — ${t.status}, priority: ${t.priority}${t.category ? `, category: ${t.category}` : ""}`
      )
      .join("\n");
    sections.push(`## Todos (${completedCount} completed, ${incompleteTodos.length} remaining)
${todoLines || "All todos completed!"}`);
  }

  // --- Recent Iterations (last 3) ---
  const iterations = db.getLatestIterations(sessionId, 3);
  if (iterations.length > 0) {
    const iterLines = iterations
      .map((i) => `- [${i.iteration_number}] ${i.summary}`)
      .join("\n");
    sections.push(`## Recent Iterations
${iterLines}`);
  }

  // --- Notes ---
  const notes = db.getNotes(sessionId);
  if (notes.length > 0) {
    const noteLines = notes.map((n) => `- ${n.content}`).join("\n");
    sections.push(`## Session Notes
${noteLines}`);
  }

  // --- Last Completed Task ---
  const tasks = db.getTasksBySession(sessionId);
  const lastCompleted = tasks
    .filter((t) => t.status === "completed")
    .pop();
  if (lastCompleted) {
    sections.push(`## Last Completed Task
**${lastCompleted.id}** (${lastCompleted.skill}): ${lastCompleted.output_summary ?? "No summary"}`);
  }

  // --- Review Items Count ---
  const reviewCount = db.getReviewItemCount(sessionId);
  if (reviewCount > 0) {
    sections.push(`## Pending Review Items: ${reviewCount} unsurfaced`);
  }

  return sections.join("\n\n");
}
