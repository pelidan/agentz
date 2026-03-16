/**
 * Formats a structured completion report for the orchestrator.
 * Domain-free — the orchestrator sees only status, summary, path, and action counts.
 */
export function formatCompletionReport(params: {
  todoDescription: string;
  summary: string;
  outputPath: string;
  todosAdded: number;
  notesRecorded: number;
  reviewItemsAdded: number;
  globalNotesDrafted: number;
}): string {
  return `Task "${params.todoDescription}" completed.
Summary: ${params.summary}
Output: ${params.outputPath}
Actions: ${params.todosAdded} todos added, ${params.notesRecorded} notes recorded, ${params.reviewItemsAdded} items flagged for review, ${params.globalNotesDrafted} global notes drafted.`;
}

/**
 * Formats a structured triage report for the orchestrator.
 */
export function formatTriageReport(params: {
  goalSummary: string;
  complexity: string;
  rationale: string;
  todosAdded: number;
  priorityBreakdown: Record<string, number>;
}): string {
  const breakdown = Object.entries(params.priorityBreakdown)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  return `Task "Triage: ${params.goalSummary}" completed.
Complexity: ${params.complexity}
Rationale: ${params.rationale}
Todos added: ${params.todosAdded} (priorities: ${breakdown})`;
}

/**
 * Formats a structured failure report for the orchestrator.
 * Generated entirely by plugin code from escalation ladder metadata.
 */
export function formatFailureReport(params: {
  todoDescription: string;
  errorType: string;
  errorDetail: string;
  attempts: number;
  tiersTried: string[];
}): string {
  return `Task "${params.todoDescription}" failed.
Error: ${params.errorType} — ${params.errorDetail}
Attempts: ${params.attempts} (tiers tried: ${params.tiersTried.join(", ")})`;
}
