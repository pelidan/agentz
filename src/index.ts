import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { join } from "path";
import { ORCHESTRATOR_PROMPT, WORKER_BASE_PROMPT } from "./prompts/index";
import { initDatabase } from "./db/init";
import { executeDispatch } from "./dispatch/index";
import { executeQuery } from "./query/index";
import { handleEvent, handleSystemTransform, handleCompacting } from "./hooks/index";
import type { HookState } from "./hooks/index";

const plugin: Plugin = async (input) => {
  const directory = input.directory;
  // TODO: db.close() is never called — add shutdown hook in Phase 6
  const db = initDatabase(join(directory, ".agentz", "agentz.db"));
  const skillsDir = join(directory, "skills");
  const outputBaseDir = join(directory, ".agentz");

  // Agent-identity tracking: maps OpenCode session ID → active agent name
  // TODO: Evict entries on session close (Phase 6)
  const sessionAgentMap = new Map<string, string>();
  const compactedSessions = new Set<string>();

  // Hook lookups via getActiveSessionByOpenCodeId depend on opencode_session_id being
  // populated on the session row; sessions created without this field will not be found by the hooks
  const hookState: HookState = { db, sessionAgentMap, compactedSessions };

  // "interrupted" is an intentional task/todo status used by the interruption path —
  // do not filter or reassign it on resume without deliberate logic

  return {
    // === Agent Registrations (via config hook) ===
    config: async (config) => {
      // --- Agent registrations ---
      config.agent = config.agent ?? {};
      config.agent["agentz"] = {
        prompt: ORCHESTRATOR_PROMPT,
        description: "Agentz orchestrator — multi-agent task orchestration",
        mode: "primary",
        tools: {
          agentz_dispatch: true,
          agentz_query: true,
        },
      };
      config.agent["agentz-worker"] = {
        prompt: WORKER_BASE_PROMPT,
        description: "Agentz skill-specialized worker subagent",
        mode: "subagent",
      };

      // --- Slash command registrations (stubs) ---
      config.command = config.command ?? {};
      config.command["agentz start"] = {
        template: "[STUB] Start orchestration for a new task",
        description: "Begin multi-agent orchestration for a task",
        agent: "agentz",
      };
      config.command["agentz-status"] = {
        template: "[STUB] Show current orchestration status",
        description: "Display status of the current orchestration session",
        agent: "agentz",
      };
      config.command["agentz-resume"] = {
        template: "[STUB] Resume a paused orchestration",
        description: "Resume a previously paused orchestration session",
        agent: "agentz",
      };
      config.command["agentz-pause"] = {
        template: "[STUB] Pause the current orchestration",
        description: "Pause the active orchestration session",
        agent: "agentz",
      };
      config.command["agentz-list"] = {
        template: "[STUB] List all orchestration sessions",
        description: "List all tracked orchestration sessions",
        agent: "agentz",
      };
      config.command["agentz-clean"] = {
        template: "[STUB] Clean up completed orchestration sessions",
        description: "Remove completed or stale orchestration data",
        agent: "agentz",
      };
      config.command["agentz-notes"] = {
        template: "[STUB] Show orchestration notes",
        description: "Display notes for the current orchestration",
        agent: "agentz",
      };
      config.command["agentz-notes delete"] = {
        template: "[STUB] Delete an orchestration note",
        description: "Delete a specific orchestration note",
        agent: "agentz",
      };
      config.command["agentz-notes edit"] = {
        template: "[STUB] Edit an orchestration note",
        description: "Edit an existing orchestration note",
        agent: "agentz",
      };
    },

    // === Tool Registrations ===
    tool: {
      agentz_dispatch: tool({
        description:
          "Dispatch a skill-specialized agent for a todo item. The tool creates a child session, composes the agent prompt, runs the agent, validates the output, and returns a structured result.",
        args: {
          todo_id: tool.schema
            .number()
            .describe("The todo ID to work on"),
          skill: tool.schema
            .string()
            .describe(
              "The skill to use (from the category mapping table)",
            ),
        },
        async execute(args, ctx) {
          const session = db.getActiveSessionByOpenCodeId(ctx.sessionID);
          if (!session) {
            return "No active agentz session.";
          }
          const result = await executeDispatch({
            db,
            client: (ctx as any).client,
            sessionId: session.id,
            todoId: args.todo_id,
            skill: args.skill,
            skillsDir,
            outputBaseDir,
            metadata: ctx.metadata,
          });
          return result.report;
        },
      }),
      agentz_query: tool({
        description:
          "Query full session state from the database. Use when the working view's pruned data is insufficient.",
        args: {
          section: tool.schema
            .enum(["todos", "iterations", "task", "notes", "global_notes"])
            .describe("Which state section to retrieve"),
          task_id: tool.schema
            .string()
            .optional()
            .describe(
              "Task ID to retrieve details for (required when section is 'task')",
            ),
          keyword: tool.schema
            .string()
            .optional()
            .describe(
              "Keyword substring filter (only used when section is 'notes' or 'global_notes')",
            ),
        },
        async execute(args, ctx) {
          const session = db.getActiveSessionByOpenCodeId(ctx.sessionID);
          if (!session) {
            return "No active agentz session.";
          }
          return executeQuery(db, session.id, {
            section: args.section,
            taskId: args.task_id,
            keyword: args.keyword,
          });
        },
      }),
    },

    // === Event Hook ===
    event: async ({ event }) => {
      handleEvent(hookState, event);
    },

    // === Chat Message Hook (agent identity tracking) ===
    "chat.message": async (input, output) => {
      if (input.agent) {
        sessionAgentMap.set(input.sessionID, input.agent);
      }
    },

    // === System Transform Hook ===
    "experimental.chat.system.transform": async (input, output) => {
      handleSystemTransform(hookState, input.sessionID, output);
    },

    // === Compaction Hook ===
    "experimental.session.compacting": async (input, output) => {
      handleCompacting(hookState, input.sessionID, output);
    },
  };
};

export default plugin;
