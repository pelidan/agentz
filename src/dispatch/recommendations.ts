import type { AgentzDB } from "../db/index";
import type { Recommendation } from "../protocol/types";

export interface RecommendationProcessingResult {
  todosAdded: number;
  notesRecorded: number;
  reviewItemsAdded: number;
  globalNotesDrafted: number;
}

/**
 * Processes agent recommendations programmatically.
 * Writes ADD_TODO → todos table, ADD_NOTE → notes table,
 * NEEDS_REVIEW → review_items table, ADD_GLOBAL_NOTE → global_notes table.
 */
export function processRecommendations(
  db: AgentzDB,
  sessionId: string,
  taskId: string,
  recommendations: Recommendation[]
): RecommendationProcessingResult {
  const result: RecommendationProcessingResult = {
    todosAdded: 0,
    notesRecorded: 0,
    reviewItemsAdded: 0,
    globalNotesDrafted: 0,
  };

  for (const rec of recommendations) {
    switch (rec.type) {
      case "ADD_TODO":
        db.addTodo({
          sessionId,
          description: rec.description,
          priority: rec.priority ?? "medium",
          category: rec.category,
          addedBy: taskId,
        });
        result.todosAdded++;
        break;

      case "ADD_NOTE":
        db.addNote({
          sessionId,
          content: rec.description,
          addedBy: taskId,
        });
        result.notesRecorded++;
        break;

      case "NEEDS_REVIEW":
        db.addReviewItem({
          taskId,
          sessionId,
          content: rec.description,
        });
        result.reviewItemsAdded++;
        break;

      case "ADD_GLOBAL_NOTE":
        db.addGlobalNote({
          content: rec.description,
          category: rec.category,
          sourceSessionId: sessionId,
          sourceTaskId: taskId,
        });
        result.globalNotesDrafted++;
        break;
    }
  }

  return result;
}
