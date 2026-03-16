import type { AgentzDB } from "../db/index";
import { renderProtocol } from "../protocol/renderer";
import { renderTaskContext, type TaskDispatchContext } from "../protocol/context";
import { validateCompletionReport } from "../protocol/validator";
import { loadSkill } from "../skills/loader";
import { processRecommendations } from "./recommendations";
import {
  formatCompletionReport,
  formatFailureReport,
} from "./report";
import {
  getTierForCategory,
  getEscalationTier,
  type TierConfig,
  DEFAULT_TIER_CONFIG,
} from "../config";
import { mkdirSync } from "fs";
import { dirname, join } from "path";

export interface DispatchContext {
  db: AgentzDB;
  /** Narrow local interface matching the subset of the SDK client used by dispatch.
   *  Replace with the real SDK client type once confirmed against installed types. */
  client: {
    session: {
      create(opts: { parentID?: string }): Promise<{ id: string }>;
      prompt(opts: {
        sessionID: string;
        agent?: string;
        model?: string;
        system?: string;
        parts: Array<{ type: string; text: string }>;
      }): Promise<unknown>;
    };
  };
  sessionId: string;
  todoId: number;
  skill: string;
  skillsDir: string;
  outputBaseDir: string;
  tierConfig?: TierConfig;
  metadata?: (input: any) => void; // ctx.metadata from tool context
}

export interface DispatchResult {
  success: boolean;
  report: string; // Structured report for the orchestrator
  taskId: string;
}

/**
 * Composes the system prompt from three layers:
 * 1. Protocol (shared, from types)
 * 2. Skill (domain-specific, from .md file)
 * 3. Task context (session/task specific, from DB)
 */
export function composeSystemPrompt(
  skill: string,
  taskContext: TaskDispatchContext,
  skillsDir: string,
): string {
  const protocol = renderProtocol();
  const skillContent = loadSkill(skill, skillsDir);
  const context = renderTaskContext(taskContext);
  return `## Protocol\n\n${protocol}\n\n${skillContent}\n\n${context}`;
}

/**
 * Classifies a dispatch failure for the escalation ladder.
 */
export function classifyError(
  error: unknown,
  validationResult?: { valid: boolean },
): "transient" | "capability" | "systematic" {
  // Validation failure = capability (model can't follow protocol)
  if (validationResult && !validationResult.valid) {
    return "capability";
  }

  // Check for known transient errors
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("timeout") ||
      msg.includes("abort") ||
      msg.includes("network") ||
      msg.includes("econnrefused") ||
      msg.includes("rate limit")
    ) {
      return "transient";
    }
  }

  // Default: capability (model produced unexpected output)
  return "capability";
}

/**
 * Executes the full dispatch cycle:
 * 1. Create child session
 * 2. Compose system prompt
 * 3. Call session.prompt()
 * 4. Validate output
 * 5. On failure: escalation ladder
 * 6. Process recommendations
 * 7. Return structured report
 */
export async function executeDispatch(
  ctx: DispatchContext,
): Promise<DispatchResult> {
  const { db, client, sessionId, todoId, skill, skillsDir, outputBaseDir } =
    ctx;
  const tierConfig = ctx.tierConfig ?? DEFAULT_TIER_CONFIG;

  // Get the todo
  const todos = db.getTodos(sessionId);
  const todo = todos.find((t) => t.id === todoId);
  if (!todo) {
    return {
      success: false,
      report: `Error: Todo ${todoId} not found in session ${sessionId}`,
      taskId: "",
    };
  }

  // Determine tier from category
  const category = todo.category ?? skill;
  let currentTier = getTierForCategory(category);

  // Create task record
  const taskId = db.getNextTaskId(sessionId);
  const iterationCount = db.getIterations(sessionId).length + 1;
  const outputPath = join(
    outputBaseDir,
    "sessions",
    sessionId,
    "tasks",
    taskId,
    "output.md",
  );

  db.createTask({
    id: taskId,
    sessionId,
    todoId,
    skill,
    tier: currentTier,
    inputSummary: todo.description,
    iteration: iterationCount,
  });

  // Mark todo and task as in-progress
  db.updateTodoStatus(todoId, "in_progress");
  db.updateTaskStatus(taskId, "running");

  // Ensure output directory exists
  mkdirSync(dirname(outputPath), { recursive: true });

  // Build task context
  const taskContext: TaskDispatchContext = {
    sessionId,
    taskId,
    outputPath,
    ancestryChain: [], // Top-level dispatch has no ancestry
    priorOutputPaths: db
      .getTasksBySession(sessionId)
      .filter((t) => t.output_path && t.status === "completed")
      .map((t) => t.output_path!),
    globalNotes: db.getConfirmedGlobalNotesForInjection().map((n) => ({
      content: n.content,
      stale: false, // TODO: calculate staleness from confirmed_count/last_confirmed
    })),
  };

  // Update metadata for TUI progress
  const totalTodos = todos.filter(
    (t) => !["cancelled"].includes(t.status),
  ).length;
  const completedTodos = todos.filter(
    (t) => t.status === "completed",
  ).length;
  const progress = `${completedTodos + 1}/${totalTodos}`;

  if (ctx.metadata) {
    ctx.metadata({
      title: `${todo.description} [${progress}]`,
      metadata: {
        todo: todo.description,
        tier: currentTier,
        skill,
        progress,
      },
    });
  }

  // Escalation ladder: up to 3 attempts
  const tiersTried: string[] = [];
  let lastError: string = "";
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    tiersTried.push(currentTier);

    try {
      // 1. Create child session
      const childSession = await client.session.create({
        parentID: undefined, // Will be linked to agentz session
      });

      // 2. Compose system prompt
      const system = composeSystemPrompt(skill, taskContext, skillsDir);

      // 3. Call session.prompt()
      if (ctx.metadata) {
        ctx.metadata({
          title: `${todo.description} [${progress}]${attempt > 1 ? ` — retry ${attempt} (tier: ${currentTier})` : ""}`,
          metadata: { tier: currentTier, skill, progress, attempt },
        });
      }

      const response = await client.session.prompt({
        sessionID: childSession.id,
        agent: "agentz-worker",
        model: tierConfig[currentTier]?.model,
        system,
        parts: [
          {
            type: "text",
            text: `Task: ${todo.description}`,
          },
        ],
      });

      // 4. Extract raw text from response
      const rawText = extractResponseText(response);

      // 5. Validate
      const validationResult = validateCompletionReport(rawText);

      if (validationResult.valid && validationResult.report) {
        // Success! Process recommendations and return
        const report = validationResult.report;
        const recResult = processRecommendations(
          db,
          sessionId,
          taskId,
          report.recommendations,
        );

        // Update task as completed
        db.completeTask(taskId, {
          outputSummary: report.summary,
          outputPath: report.outputPath,
          finalTier: currentTier,
          recommendations: JSON.stringify(report.recommendations),
          needsReviewCount: recResult.reviewItemsAdded,
        });

        // Update todo as completed
        db.completeTodo(todoId, taskId);

        const structured = formatCompletionReport({
          todoDescription: todo.description,
          summary: report.summary,
          outputPath: report.outputPath,
          ...recResult,
        });

        return { success: true, report: structured, taskId };
      }

      // Validation failed — classify and potentially escalate
      const errorClass = classifyError(null, validationResult);
      lastError = validationResult.errors
        .map((e) => `${e.field}: ${e.error}`)
        .join("; ");

      if (errorClass === "systematic") {
        break; // No retries for systematic errors
      }

      // Escalate tier for capability errors (skip same-config retry)
      if (errorClass === "capability") {
        const nextTier = getEscalationTier(currentTier, tierConfig);
        if (nextTier) {
          currentTier = nextTier;
        } else {
          break; // No further escalation available
        }
      }

      // Transient: retry same config first, then escalate
      if (errorClass === "transient" && attempt >= 2) {
        const nextTier = getEscalationTier(currentTier, tierConfig);
        if (nextTier) {
          currentTier = nextTier;
        } else {
          break;
        }
      }
    } catch (error) {
      const errorClass = classifyError(error);
      lastError = error instanceof Error ? error.message : String(error);

      if (errorClass === "systematic") {
        break;
      }

      if (errorClass === "transient" && attempt < 2) {
        continue; // Retry same config
      }

      // Escalate
      const nextTier = getEscalationTier(currentTier, tierConfig);
      if (nextTier) {
        currentTier = nextTier;
      } else {
        break;
      }
    }
  }

  // All attempts exhausted — fail
  db.failTask(taskId, {
    failureClassification: classifyError(new Error(lastError)).toString(),
    errorDetail: lastError,
    retries: tiersTried.length,
    finalTier: currentTier,
  });
  db.updateTodoStatus(todoId, "failed");

  const failureReport = formatFailureReport({
    todoDescription: todo.description,
    errorType: classifyError(new Error(lastError)),
    errorDetail: lastError,
    attempts: tiersTried.length,
    tiersTried,
  });

  return { success: false, report: failureReport, taskId };
}

/**
 * Extracts text content from a session.prompt() response.
 * The response may contain message parts — we extract text parts.
 *
 * NOTE: Before finalising this helper, verify the real
 * session.prompt() response shape against the installed SDK types
 * (@opencode-ai/sdk). The field names (parts, messages, text,
 * content) must match the actual runtime payload; adjust as needed.
 */
function extractResponseText(response: unknown): string {
  if (typeof response === "string") return response;

  const resp = response as Record<string, any>;

  // Handle structured response with parts
  if (resp?.parts) {
    return resp.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text || p.content || "")
      .join("\n");
  }

  // Handle response with messages
  if (resp?.messages) {
    return resp.messages
      .filter((m: any) => m.role === "assistant")
      .flatMap((m: any) => m.parts || [])
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text || p.content || "")
      .join("\n");
  }

  return String(response);
}
