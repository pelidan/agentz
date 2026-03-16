import type { AgentzDB } from "../db/index";

export interface QueryArgs {
  section: "todos" | "iterations" | "task" | "notes" | "global_notes";
  taskId?: string;
  keyword?: string;
}

/**
 * Executes an agentz_query request against the database.
 * Returns formatted text for the orchestrator.
 */
export function executeQuery(
  db: AgentzDB,
  sessionId: string,
  args: QueryArgs
): string {
  const session = db.getSession(sessionId);
  if (!session) {
    return "No active agentz session.";
  }

  switch (args.section) {
    case "todos": {
      const todos = db.getTodos(sessionId);
      if (todos.length === 0) return "No todos in this session.";
      return todos
        .map(
          (t) =>
            `[${t.id}] ${t.description} — status: ${t.status}, priority: ${t.priority}${t.category ? `, category: ${t.category}` : ""}${t.completed_by ? `, completed by: ${t.completed_by}` : ""}`
        )
        .join("\n");
    }

    case "iterations": {
      const iterations = db.getIterations(sessionId);
      if (iterations.length === 0) return "No iterations recorded yet.";
      return iterations
        .map(
          (i) =>
            `[Iteration ${i.iteration_number}] ${i.summary}${i.decisions ? `\n  Decisions: ${i.decisions}` : ""}`
        )
        .join("\n");
    }

    case "task": {
      if (!args.taskId) {
        return "Error: task_id is required when section is 'task'.";
      }
      const task = db.getTask(args.taskId);
      if (!task) return `Task ${args.taskId} not found.`;
      return `Task: ${task.id}
Skill: ${task.skill}
Tier: ${task.tier}${task.final_tier ? ` → ${task.final_tier}` : ""}
Status: ${task.status}
Input: ${task.input_summary ?? "N/A"}
Output: ${task.output_summary ?? "N/A"}
Output Path: ${task.output_path ?? "N/A"}
Retries: ${task.retries}${task.failure_classification ? `\nFailure: ${task.failure_classification} — ${task.error_detail}` : ""}`;
    }

    case "notes": {
      const notes = db.getNotes(sessionId, args.keyword);
      if (notes.length === 0)
        return args.keyword
          ? `No notes matching "${args.keyword}".`
          : "No notes in this session.";
      return notes
        .map(
          (n) =>
            `[${n.id}] ${n.content}${n.added_by ? ` (from: ${n.added_by})` : ""}`
        )
        .join("\n");
    }

    case "global_notes": {
      const notes = db.getGlobalNotes(args.keyword);
      if (notes.length === 0)
        return args.keyword
          ? `No global notes matching "${args.keyword}".`
          : "No global notes.";
      return notes
        .map(
          (n) =>
            `[${n.id}] [${n.status}] ${n.content}${n.category ? ` (${n.category})` : ""}${n.confirmed_count > 0 ? ` — confirmed ${n.confirmed_count}x` : ""}`
        )
        .join("\n");
    }

    default: {
      const _exhaustive: never = args.section;
      return `Unknown section: ${args.section}`;
    }
  }
}
