import type { AgentzDB } from "../db/index";
import { buildWorkingView } from "./working-view";

export interface HookState {
  db: AgentzDB;
  sessionAgentMap: Map<string, string>;
  compactedSessions: Set<string>;
}

/**
 * Handles incoming events (interruption detection, compaction).
 */
export function handleEvent(
  state: HookState,
  event: any
): void {
  // Interruption detection
  if (event.type === "session.error") {
    const err = event.properties?.error;
    if (err?.name === "MessageAbortedError") {
      const sessionID = event.properties?.sessionID;
      if (!sessionID) return;

      // Find agentz session linked to this OpenCode session
      const session = state.db.getActiveSessionByOpenCodeId(sessionID);
      if (!session) return;

      const runningTask = state.db.getRunningTask(session.id);
      if (runningTask) {
        state.db.updateTaskStatus(runningTask.id, "interrupted");
        // Find the todo for this task and mark it interrupted
        if (runningTask.todo_id) {
          state.db.updateTodoStatus(runningTask.todo_id, "interrupted");
        }
      }
    }
  }

  // Compaction detection
  if (event.type === "session.compacted") {
    const sessionID = event.properties?.sessionID;
    if (sessionID) {
      state.compactedSessions.add(sessionID);
    }
  }
}

/**
 * Injects agentz working view into the orchestrator's system prompt.
 * Only fires when the active agent is "agentz".
 */
export function handleSystemTransform(
  state: HookState,
  sessionID: string | undefined,
  output: { system: string[] }
): void {
  if (!sessionID) return;
  const activeAgent = state.sessionAgentMap.get(sessionID);
  if (activeAgent !== "agentz") return;

  const session = state.db.getActiveSessionByOpenCodeId(sessionID);
  if (!session) return;

  output.system.push(buildWorkingView(state.db, session.id));
}

/**
 * Enriches compaction context with agentz state so the
 * compaction summary preserves orchestration awareness.
 */
export function handleCompacting(
  state: HookState,
  sessionID: string | undefined,
  output: { context: string[] }
): void {
  if (!sessionID) return;
  const session = state.db.getActiveSessionByOpenCodeId(sessionID);
  if (!session) return;

  const todos = state.db.getTodos(session.id);
  const completedCount = todos.filter((t) => t.status === "completed").length;
  const runningTask = state.db.getRunningTask(session.id);

  output.context.push(
    `AGENTZ ORCHESTRATION SESSION ACTIVE: ${session.id}`,
    `Goal: ${session.goal}`,
    `Progress: ${completedCount}/${todos.length} todos completed`,
    `Current task: ${runningTask ? `${runningTask.id} (${runningTask.skill})` : "none"}`,
    `IMPORTANT: After compaction, the orchestrator must continue by loading state from the agentz database and resuming the iteration loop.`
  );
}
