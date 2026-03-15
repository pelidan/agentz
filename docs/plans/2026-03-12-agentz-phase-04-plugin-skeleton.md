# Agentz Phase 4: Plugin Skeleton Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create the top-level plugin scaffolding, tier configuration, prompts, and initial hook and tool registration structure.

**Architecture:** This phase wires the configuration layer, orchestrator and worker prompts, and the plugin entrypoint with stubbed tools and hooks. It establishes the runtime shell that later phases fill in with real dispatch and state behavior.

**Tech Stack:** TypeScript (strict), Bun runtime, `@opencode-ai/plugin` v1.2.22, `@opencode-ai/sdk` v1.2.22, `bun:sqlite`, `bun:test`, zod v4.1.8

**Prerequisites:** Phase 3 complete and committed.

---

## Tasks

### Task 4.1: Define tier mapping and configuration types

**Files:**
- Create: `src/config.ts`
- Test: `src/config.test.ts`

**Step 1: Write the test**

`src/config.test.ts`:
```typescript
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_TIER_CONFIG,
  CATEGORY_MAPPING,
  getTierForCategory,
  getSkillForCategory,
  getEscalationTier,
  type TierConfig,
  type CategoryMapping,
} from "./config";

describe("tier configuration", () => {
  test("DEFAULT_TIER_CONFIG has 4 tiers", () => {
    expect(Object.keys(DEFAULT_TIER_CONFIG)).toHaveLength(4);
    expect(DEFAULT_TIER_CONFIG["fast-cheap"]).toBeDefined();
    expect(DEFAULT_TIER_CONFIG["balanced"]).toBeDefined();
    expect(DEFAULT_TIER_CONFIG["powerful"]).toBeDefined();
    expect(DEFAULT_TIER_CONFIG["reasoning"]).toBeDefined();
  });

  test("each tier has model and escalate_to", () => {
    for (const [name, tier] of Object.entries(DEFAULT_TIER_CONFIG)) {
      expect(tier.model).toBeDefined();
      expect("escalate_to" in tier).toBe(true);
    }
  });

  test("escalation chain is finite", () => {
    let tier = DEFAULT_TIER_CONFIG["fast-cheap"];
    const visited = new Set<string>();
    while (tier.escalate_to) {
      expect(visited.has(tier.escalate_to)).toBe(false); // no cycles
      visited.add(tier.escalate_to);
      tier = DEFAULT_TIER_CONFIG[tier.escalate_to];
    }
  });
});

describe("category mapping", () => {
  test("CATEGORY_MAPPING has 16 categories", () => {
    expect(Object.keys(CATEGORY_MAPPING)).toHaveLength(16);
  });

  test("each category has tier and skill", () => {
    for (const [name, mapping] of Object.entries(CATEGORY_MAPPING)) {
      expect(mapping.tier).toBeDefined();
      expect(mapping.skill).toBeDefined();
      expect(DEFAULT_TIER_CONFIG[mapping.tier]).toBeDefined();
    }
  });

  test("getTierForCategory returns correct tier", () => {
    expect(getTierForCategory("explore-local")).toBe("fast-cheap");
    expect(getTierForCategory("develop-backend")).toBe("balanced");
    expect(getTierForCategory("architect-db")).toBe("powerful");
  });

  test("getTierForCategory returns balanced for unknown", () => {
    expect(getTierForCategory("unknown-category")).toBe("balanced");
  });

  test("getSkillForCategory returns correct skill", () => {
    expect(getSkillForCategory("explore-local")).toBe("local-explorer");
    expect(getSkillForCategory("develop-backend")).toBe("backend-developer");
    expect(getSkillForCategory("synthesize")).toBe("synthesizer");
  });

  test("getEscalationTier follows chain", () => {
    expect(getEscalationTier("fast-cheap")).toBe("balanced");
    expect(getEscalationTier("balanced")).toBe("powerful");
    expect(getEscalationTier("powerful")).toBeNull();
    expect(getEscalationTier("reasoning")).toBeNull();
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `bun test src/config.test.ts`
Expected: FAIL — cannot resolve imports

**Step 3: Implement config.ts**

`src/config.ts`:
```typescript
export interface TierDef {
  model: string;
  escalate_to: string | null;
}

export type TierConfig = Record<string, TierDef>;

export interface CategoryMappingEntry {
  tier: string;
  skill: string;
}

export type CategoryMapping = Record<string, CategoryMappingEntry>;

export const DEFAULT_TIER_CONFIG: TierConfig = {
  "fast-cheap": { model: "haiku", escalate_to: "balanced" },
  balanced: { model: "sonnet", escalate_to: "powerful" },
  powerful: { model: "opus", escalate_to: null },
  reasoning: { model: "o3", escalate_to: null },
};

export const CATEGORY_MAPPING: CategoryMapping = {
  "explore-local": { tier: "fast-cheap", skill: "local-explorer" },
  "explore-web": { tier: "fast-cheap", skill: "web-explorer" },
  "analyze-business": { tier: "balanced", skill: "business-analyst" },
  "analyze-technical": { tier: "balanced", skill: "technical-analyst" },
  "develop-backend": { tier: "balanced", skill: "backend-developer" },
  "develop-frontend": { tier: "balanced", skill: "frontend-developer" },
  "design-ui": { tier: "balanced", skill: "ui-ux-designer" },
  "test-backend": { tier: "balanced", skill: "backend-tester" },
  "test-frontend": { tier: "balanced", skill: "frontend-tester" },
  "review-code": { tier: "balanced", skill: "code-reviewer" },
  "architect-db": { tier: "powerful", skill: "database-architect" },
  "engineer-devops": { tier: "balanced", skill: "devops-engineer" },
  "audit-security": { tier: "powerful", skill: "security-auditor" },
  "write-docs": { tier: "balanced", skill: "technical-writer" },
  synthesize: { tier: "balanced", skill: "synthesizer" },
  verify: { tier: "balanced", skill: "backend-tester" },
};

export function getTierForCategory(category: string): string {
  return CATEGORY_MAPPING[category]?.tier ?? "balanced";
}

export function getSkillForCategory(category: string): string {
  return CATEGORY_MAPPING[category]?.skill ?? category;
}

export function getEscalationTier(
  currentTier: string,
  config: TierConfig = DEFAULT_TIER_CONFIG
): string | null {
  return config[currentTier]?.escalate_to ?? null;
}
```

**Step 4: Run the test to verify it passes**

Run: `bun test src/config.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: define tier configuration and category-to-skill mapping"
```

### Task 4.2: Define orchestrator and worker base prompts

**Files:**
- Modify: `src/prompts/index.ts`
- Test: `src/prompts/index.test.ts`

**Step 1: Write the test**

`src/prompts/index.test.ts`:
```typescript
import { describe, expect, test } from "bun:test";
import { ORCHESTRATOR_PROMPT, WORKER_BASE_PROMPT } from "./index";

describe("prompts", () => {
  test("ORCHESTRATOR_PROMPT is non-empty", () => {
    expect(ORCHESTRATOR_PROMPT.length).toBeGreaterThan(100);
  });

  test("ORCHESTRATOR_PROMPT mentions iteration loop", () => {
    expect(ORCHESTRATOR_PROMPT).toMatch(/iteration/i);
  });

  test("ORCHESTRATOR_PROMPT mentions agentz_dispatch", () => {
    expect(ORCHESTRATOR_PROMPT).toContain("agentz_dispatch");
  });

  test("ORCHESTRATOR_PROMPT mentions agentz_query", () => {
    expect(ORCHESTRATOR_PROMPT).toContain("agentz_query");
  });

  test("ORCHESTRATOR_PROMPT mentions complexity assessment", () => {
    expect(ORCHESTRATOR_PROMPT).toMatch(/complex/i);
  });

  test("WORKER_BASE_PROMPT is non-empty", () => {
    expect(WORKER_BASE_PROMPT.length).toBeGreaterThan(50);
  });

  test("WORKER_BASE_PROMPT mentions output format", () => {
    expect(WORKER_BASE_PROMPT).toMatch(/output/i);
  });

  test("WORKER_BASE_PROMPT mentions safety constraints", () => {
    expect(WORKER_BASE_PROMPT).toMatch(/scope|boundary|constraint/i);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `bun test src/prompts/index.test.ts`
Expected: FAIL — cannot resolve imports

**Step 3: Implement prompts**

`src/prompts/index.ts`:
```typescript
import { CATEGORY_MAPPING } from "../config";

const MAPPING_TABLE = Object.entries(CATEGORY_MAPPING)
  .map(([cat, { tier, skill }]) => `| ${cat} | ${tier} | ${skill} |`)
  .join("\n");

/**
 * Orchestrator system prompt — registered with the agentz agent.
 * Covers: role, iteration loop behavior, complexity assessment, dispatch rules.
 * Does NOT contain domain knowledge or protocol details.
 */
export const ORCHESTRATOR_PROMPT = `You are the Agentz orchestrator — a multi-agent task coordination system.

## Your Role

You coordinate complex tasks by breaking them into smaller pieces and dispatching skill-specialized agents to work on them. You do NOT do domain work yourself — you delegate to specialists.

## Iteration Loop

You operate in an iteration loop. Each iteration, your working view (injected into your system prompt) shows:
- The session goal
- Current todo list with statuses
- Recent iteration history
- Session notes
- Last completed task summary

Based on this state, you:
1. Assess the current situation
2. Pick the next pending todo (or decide on a different action)
3. Dispatch an agent using the \`agentz_dispatch\` tool
4. Process the result and continue to the next iteration

## First Iteration (Session Start)

On the first iteration (no todos yet), dispatch a \`triage-analyst\` to assess complexity and decompose the goal into todos. Use:
- \`agentz_dispatch\` with the appropriate todo

## Complexity Decision

For "low" complexity tasks (single, straightforward actions), consider handling them directly rather than through the full triage-dispatch cycle.

For "medium" to "very_high" complexity, always use triage + dispatch.

## Dispatch Rules

Use \`agentz_dispatch\` to dispatch agents. The tool handles:
- Creating child sessions
- Selecting models from tier config
- Composing prompts
- Validating outputs
- Processing recommendations

You provide the todo_id and skill name. Reference this mapping table for default skill assignments:

| Category | Tier | Skill |
|----------|------|-------|
${MAPPING_TABLE}

You may override the default mapping with justification.

## State Queries

Use \`agentz_query\` when the working view's pruned data is insufficient. It can retrieve:
- Full todo list with details
- Complete iteration history
- Specific task details
- Session notes (with keyword filtering)
- Global project knowledge notes

## Session Completion

When all todos are completed:
1. Dispatch a \`synthesizer\` for the final review
2. If synthesis passes, mark the session complete
3. If synthesis finds issues, add new todos and continue

## Handling Failures

When a task fails (escalation ladder exhausted), surface the failure to the user and pause for a decision.

When a task needs input (\`needs_input\`), relay the questions to the user and pause.
`;

/**
 * Worker base prompt — registered with the agentz-worker subagent.
 * Provides stable identity and universal constraints.
 * Skill-specific protocol, task context, and output format are injected via
 * the system parameter at dispatch time.
 */
export const WORKER_BASE_PROMPT = `You are an Agentz worker agent — a skill-specialized agent dispatched by the Agentz orchestrator to complete a specific task.

## Identity

You are part of a multi-agent system. You have been assigned a specific task with a specific skill focus. Your system prompt contains:
1. This base identity (you're reading it now)
2. The output protocol (how to format your output and completion report)
3. Your skill instructions (your domain expertise and constraints)
4. Task context (session ID, task ID, output path, and relevant background)

## Universal Constraints

- Stay within the scope of your assigned task
- Write your full output to the designated output path
- End your response with the completion report in the exact format specified
- If you cannot complete the task, report failure honestly — do not fabricate results
- If you need user input, use status "needs_input" with specific questions
- Respect the boundary between your skill and other skills — do not do work outside your domain

## Output Expectations

Your system prompt includes detailed output format instructions. Follow them exactly.
The orchestrator depends on your completion report being parseable and valid.
`;
```

**Step 4: Run the test to verify it passes**

Run: `bun test src/prompts/index.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/prompts/index.ts src/prompts/index.test.ts
git commit -m "feat: define orchestrator and worker base prompts"
```

### Task 4.3: Wire up plugin entry point with agent registration and hook stubs

**Files:**
- Modify: `src/index.ts`
- Test: `src/index.test.ts`

**Step 1: Write the test**

`src/index.test.ts`:
```typescript
import { describe, expect, test } from "bun:test";
import plugin from "./index";

describe("plugin entry point", () => {
  test("plugin is a function", () => {
    expect(typeof plugin).toBe("function");
  });

  test("plugin returns hooks object with expected keys", async () => {
    // Create a minimal mock input
    const mockInput = {
      client: {} as any,
      project: "test-project",
      directory: "/tmp/test",
      worktree: "/tmp/test",
      serverUrl: "http://localhost:3000",
      $: {} as any,
    };

    const hooks = await plugin(mockInput);
    expect(hooks).toBeDefined();

    // Check agent registrations
    expect(hooks.agent).toBeDefined();
    expect(hooks.agent!.agentz).toBeDefined();
    expect(hooks.agent!.agentz.mode).toBe("primary");
    expect(hooks.agent!["agentz-worker"]).toBeDefined();
    expect(hooks.agent!["agentz-worker"].mode).toBe("subagent");

    // Check tool registrations exist
    expect(hooks.tool).toBeDefined();
    expect(hooks.tool!.agentz_dispatch).toBeDefined();
    expect(hooks.tool!.agentz_query).toBeDefined();

    // Check hook registrations exist
    expect(hooks.event).toBeDefined();
    expect(hooks["experimental.chat.system.transform"]).toBeDefined();
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `bun test src/index.test.ts`
Expected: FAIL — hooks don't have expected structure yet

**Step 3: Implement plugin entry point**

> **⚠ API Verification Required:** Before writing or copying the code below, verify the actual exported types from the installed `@opencode-ai/plugin` package. Specifically check:
> - The signature of `tool(...)` (options object shape, field names)
> - Whether `tool.schema` is the correct accessor for the Zod-like schema builder, or if it is exposed under a different name
> - The exact hook names and their callback shapes (e.g. `event`, `chat.message`, `experimental.chat.system.transform`, `experimental.session.compacting`)
> - The slash-command registration shape (field names, handler signature)
>
> **The code snippet below must be adjusted to match the installed package API if the types differ.**

`src/index.ts`:
```typescript
import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { ORCHESTRATOR_PROMPT, WORKER_BASE_PROMPT } from "./prompts/index";

const plugin: Plugin = async (input) => {
  const { client, directory } = input;

  // Agent-identity tracking: maps OpenCode session ID → active agent name
  const sessionAgentMap = new Map<string, string>();

  // Track sessions that were compacted (for post-compaction hardening)
  const compactedSessions = new Set<string>();

  return {
    // === Agent Registrations ===
    agent: {
      agentz: {
        model: undefined, // uses whatever model the user has configured
        prompt: ORCHESTRATOR_PROMPT,
        description: "Agentz orchestrator — multi-agent task orchestration",
        mode: "primary" as const,
      },
      "agentz-worker": {
        model: undefined, // selected per-dispatch from tier config
        prompt: WORKER_BASE_PROMPT,
        description: "Agentz skill-specialized worker subagent",
        mode: "subagent" as const,
      },
    },

    // === Tool Registrations ===
    // Both tools are intentionally restricted to the primary `agentz` agent
    // via the `permission` field so that worker subagents and other plugins
    // cannot invoke orchestrator-level operations directly.
    tool: {
      agentz_dispatch: tool({
        description:
          "Dispatch a skill-specialized agent for a todo item. The tool creates a child session, composes the agent prompt, runs the agent, validates the output, and returns a structured result.",
        permission: "agentz",
        args: {
          todo_id: tool.schema
            .number()
            .describe("The todo ID to work on"),
          skill: tool.schema
            .string()
            .describe("The skill to use (from the category mapping table)"),
        },
        async execute(args, ctx) {
          // TODO: Implement in Phase 5
          return `[STUB] Dispatch requested: todo=${args.todo_id}, skill=${args.skill}`;
        },
      }),
      agentz_query: tool({
        description:
          "Query full session state from the database. Use when the working view's pruned data is insufficient.",
        permission: "agentz",
        args: {
          section: tool.schema
            .enum(["todos", "iterations", "task", "notes", "global_notes"])
            .describe("Which state section to retrieve"),
          task_id: tool.schema
            .string()
            .optional()
            .describe(
              "Task ID to retrieve details for (required when section is 'task')"
            ),
          keyword: tool.schema
            .string()
            .optional()
            .describe(
              "Keyword substring filter (only used when section is 'notes' or 'global_notes')"
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
    "chat.message": async ({ sessionID, agent }) => {
      if (agent) {
        sessionAgentMap.set(sessionID, agent);
      }
    },

    // === System Transform Hook ===
    "experimental.chat.system.transform": async ({ sessionID }, output) => {
      // Only inject for the agentz orchestrator agent
      const activeAgent = sessionAgentMap.get(sessionID ?? "");
      if (activeAgent !== "agentz") return;

      // TODO: Inject working view from DB in Phase 6
    },

    // === Compaction Hook ===
    "experimental.session.compacting": async ({ sessionID }, output) => {
      // TODO: Inject agentz state into compaction context in Phase 6
    },
  };
};

export default plugin;
```

**Step 4: Run the test to verify it passes**

Run: `bun test src/index.test.ts`
Expected: All tests PASS

**Step 5: Run full test suite and typecheck**

Run: `bun test && bun run typecheck`
Expected: All tests PASS, no type errors

**Step 6: Commit**

```bash
git add src/index.ts src/index.test.ts
git commit -m "feat: wire up plugin entry point with agents, tools, and hook stubs"
```

### Task 4.4: Register slash command stubs and verify the plugin surface

**Files:**
- Modify: `src/index.ts`
- Modify: `src/index.test.ts`

**Step 1: Write the failing test**

Extend the plugin registration test so it asserts slash command stubs exist for:
- `/agentz start`
- `/agentz-status`
- `/agentz-resume`
- `/agentz-pause`
- `/agentz-list`
- `/agentz-clean`
- `/agentz-notes`
- `/agentz-notes delete`
- `/agentz-notes edit`

Also assert both `agentz_dispatch` and `agentz_query` are permission-gated to `agentz`.

**Step 2: Run the test to verify it fails**

Run: `bun test src/index.test.ts`
Expected: FAIL because the slash commands and permission assertions do not exist yet

**Step 3: Write the minimal implementation**

Register slash-command stubs that return short `[STUB]` messages and keep all real behavior deferred to later phases.

**Step 4: Run the test to verify it passes**

Run: `bun test src/index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/index.ts src/index.test.ts
git commit -m "feat: add slash command stubs and permission-gated plugin surface"
```
