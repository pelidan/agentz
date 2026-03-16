import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { ORCHESTRATOR_PROMPT, WORKER_BASE_PROMPT } from "./prompts/index";

const plugin: Plugin = async (_input) => {
  // Agent-identity tracking: maps OpenCode session ID → active agent name
  // TODO: Evict entries on session close (Phase 6)
  const sessionAgentMap = new Map<string, string>();

  return {
    // === Agent Registrations (via config hook) ===
    config: async (config) => {
      config.agent = config.agent ?? {};
      config.agent["agentz"] = {
        prompt: ORCHESTRATOR_PROMPT,
        description: "Agentz orchestrator — multi-agent task orchestration",
        mode: "primary",
      };
      config.agent["agentz-worker"] = {
        prompt: WORKER_BASE_PROMPT,
        description: "Agentz skill-specialized worker subagent",
        mode: "subagent",
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
          // TODO: Implement in Phase 5
          return `[STUB] Dispatch requested: todo=${args.todo_id}, skill=${args.skill}`;
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
          // TODO: Implement in Phase 5
          return `[STUB] Query requested: section=${args.section}`;
        },
      }),
    },

    // === Event Hook ===
    event: async ({ event }) => {
      // TODO: Implement interruption detection, compaction detection in Phase 5-6
    },

    // === Chat Message Hook (agent identity tracking) ===
    "chat.message": async (input, output) => {
      if (input.agent) {
        sessionAgentMap.set(input.sessionID, input.agent);
      }
    },

    // === System Transform Hook ===
    "experimental.chat.system.transform": async (input, output) => {
      // Only inject for the agentz orchestrator agent
      const activeAgent = sessionAgentMap.get(input.sessionID ?? "");
      if (activeAgent !== "agentz") return;

      // TODO: Inject working view from DB in Phase 6
    },

    // === Compaction Hook ===
    "experimental.session.compacting": async (input, output) => {
      // TODO: Inject agentz state into compaction context in Phase 6
    },
  };
};

export default plugin;
