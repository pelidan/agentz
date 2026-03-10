# Agentz — Orchestration Framework for OpenCode

## 1. Overview

Agentz is an OpenCode plugin that enables multi-agent orchestration with dynamic model/skill assignment. It provides a persistence layer (SQLite + filesystem) so that complex, long-running tasks survive context limits and can be resumed across sessions.

**Core idea:** An orchestrator agent processes a user's goal iteratively — breaking it into todos, dispatching specialized agents (each with a tier-appropriate model and domain skill), collecting results, and updating state in a database. Each iteration starts with clean context loaded from DB, not accumulated conversation history.

**Inspired by** oh-my-opencode-slim but fundamentally different: agents divided by tier + dynamic skills (not fixed roles), persistence layer for state, clean orchestrator context per iteration, iterative processing with DB state.

## 2. Three-Layer Architecture

```
┌─────────────────────────────────────┐
│  Layer 1: OpenCode Plugin (TypeScript)  │
│  - Entry point, hooks, slash commands    │
│  - Agent spawning & ancestry tracking    │
│  - DB operations (SQLite)                │
│  - Filesystem I/O for outputs            │
└──────────────┬──────────────────────┘
               │ loads & injects
┌──────────────▼──────────────────────┐
│  Layer 2: Skills (.md files)            │
│  - Orchestrator skill                    │
│  - 15 agent skills (2 leaf, 13 non-leaf) │
│  - Mapping table (task→tier+skill)       │
└──────────────┬──────────────────────┘
               │ reads/writes
┌──────────────▼──────────────────────┐
│  Layer 3: Persistence                    │
│  - SQLite: sessions, tasks, todos,       │
│    iterations, notes                     │
│  - Filesystem: .agentz/sessions/<id>/    │
│    per-task output files                 │
└─────────────────────────────────────┘
```

## 3. Tier System

Semantic tier tags abstracted from concrete models. Users map tiers to models in config.

| Tier | Intent | Example Models |
|------|--------|----------------|
| `fast-cheap` | Quick lookups, simple transforms | haiku, gpt-4o-mini, gemini-flash |
| `balanced` | Most coding tasks, analysis | sonnet, gpt-4o, gemini-pro |
| `powerful` | Complex architecture, large refactors | opus, o1, gemini-ultra |
| `reasoning` | Multi-step logic, math, planning | o1, o3, deepseek-r1 |

**No cost multiplier in tier definition** — that's a config-time decision by the user.

### Default Mapping Table

The orchestrator sees this table in its prompt as a reference frame. It follows the table by default but can override with justification.

| Task Category | Default Tier | Default Skill |
|---------------|-------------|---------------|
| explore-local | fast-cheap | local-explorer |
| explore-web | fast-cheap | web-explorer |
| analyze-business | balanced | business-analyst |
| analyze-technical | balanced | technical-analyst |
| develop-backend | balanced | backend-developer |
| develop-frontend | balanced | frontend-developer |
| design-ui | balanced | ui-ux-designer |
| test-backend | balanced | backend-tester |
| test-frontend | balanced | frontend-tester |
| review-code | balanced | code-reviewer |
| architect-db | powerful | database-architect |
| engineer-devops | balanced | devops-engineer |
| audit-security | powerful | security-auditor |
| write-docs | balanced | technical-writer |
| synthesize | balanced | synthesizer |
| verify | balanced | backend-tester |

## 4. Agent Taxonomy

### Leaf Agents (Context Compressors)

Leaf agents are lightweight, freely spawnable by any agent. They gather information and return compressed summaries. They do NOT spawn other agents.

| Skill | Purpose |
|-------|---------|
| `local-explorer` | Codebase search: grep, glob, read files, summarize findings |
| `web-explorer` | Web research: fetch URLs, search docs, summarize findings |

### Non-Leaf Agents (Domain Specialists)

Non-leaf agents perform substantive work. They have direct tool access for simple operations and can spawn leaf agents for exploratory work.

| Skill | Purpose |
|-------|---------|
| `business-analyst` | Requirements analysis, user stories, acceptance criteria |
| `technical-analyst` | Architecture analysis, tech stack evaluation, feasibility |
| `backend-developer` | Server-side implementation, APIs, business logic |
| `frontend-developer` | UI implementation, components, client-side logic |
| `ui-ux-designer` | Interface design, UX flows, accessibility |
| `backend-tester` | Server-side tests, integration tests, test strategy |
| `frontend-tester` | UI tests, E2E tests, visual regression |
| `code-reviewer` | Code review, quality checks, best practices |
| `database-architect` | Schema design, migrations, query optimization |
| `devops-engineer` | CI/CD, deployment, infrastructure |
| `security-auditor` | Security review, vulnerability assessment |
| `technical-writer` | Documentation, API docs, guides |
| `synthesizer` | Reads all task outputs, identifies gaps/inconsistencies, consolidates review. Can add new todos, flag issues, or approve for verification. Adapts depth based on task complexity. |

## 5. Spawning Model

### Mechanism

All agent dispatch goes through the `agentz_dispatch` tool — a custom tool registered by the plugin via the `tool` hook. The orchestrator LLM calls this tool naturally; the tool's `execute` function handles all spawning mechanics:

1. Creates a child session via `client.session.create({ parentID })`
2. Selects a model from tier config based on skill requirements
3. Composes the system prompt (protocol template + skill content + task context)
4. Calls `session.prompt()` with per-prompt `model`, `system`, and `tools` overrides
5. Awaits completion, validates output, updates DB, returns completion report

The plugin registers a single `agentz` agent (mode: `"subagent"`) with a lean base prompt covering identity, safety boundaries, and general output format expectations. All skill-specific instructions are injected via the `system` parameter at dispatch time — the SDK **appends** this to the agent's base prompt (agent prompt first, then environment/instructions, then the `system` value).

### Rules

1. **Leaf agents** (`local-explorer`, `web-explorer`): anyone can spawn them freely — they are context compressors that never spawn children.

2. **Non-leaf agents**: can spawn leaf agents freely. Can spawn another non-leaf agent at max depth 1 (that child can only spawn leaf agents).

3. **Ancestry chain** for cycle detection: an agent cannot spawn a non-leaf agent with a skill combination already in its ancestry.

4. **Graceful ancestry blocking**: if a spawn is blocked by ancestry rules, the agent returns the best answer it has and lets the caller supplement with its own expertise. No hard failures.

5. **Dual-mode operation**: agents have direct tool access (grep, glob, webfetch, read, write, edit, bash) for simple operations. They spawn leaf agents for exploratory or large-volume operations where context compression is needed.

All depth/ancestry rules are enforced inside the `agentz_dispatch` tool's `execute` function before creating the child session.

### Depth Visualization

```
Orchestrator
├── business-analyst (non-leaf, depth 0)
│   ├── local-explorer (leaf) ← freely spawned
│   └── web-explorer (leaf) ← freely spawned
├── backend-developer (non-leaf, depth 0)
│   ├── local-explorer (leaf) ← freely spawned
│   └── backend-tester (non-leaf, depth 1) ← max depth
│       └── local-explorer (leaf) ← leaf only at depth 1
└── code-reviewer (non-leaf, depth 0)
    └── local-explorer (leaf) ← freely spawned
```

## 6. Orchestrator Design

The orchestrator is the **main agent** — always active, injected into every conversation via the system prompt hook. It is a **pure task processor** that never accumulates large outputs in its context. It does NOT brainstorm or analyze business/technology concerns itself; those are delegated to specialist agents.

### Complexity Decision

For every user request, the orchestrator evaluates whether full orchestration is needed:

**Handle directly (no session)** when:
- Single-file changes
- Quick questions about the codebase
- Simple refactors with clear scope
- Tasks completable in one agent turn

**Create orchestration session** when:
- Multi-step features requiring different expertise
- Tasks spanning multiple files/systems
- Work requiring analysis → design → implementation → testing
- Anything where persistent state tracking is needed

### Iteration Loop

Each iteration starts with **clean context** loaded from DB only:

```
1. Load from DB: session.goal, all todos, iteration summaries, notes, recent task summaries
2. Evaluate todo list:
   a. Regular todos remaining? → Pick highest priority incomplete todo, go to 3
   b. All regular todos done? → Run "Synthesize & Review" fixed todo
   c. Synthesizer added new todos? → Go back to 2a
   d. Synthesizer approved? → Run "Verify" fixed todo
   e. Verification passed? → Mark session complete
   f. Verification failed? → Synthesizer analyzes failures, adds fix todos, back to 2a
3. For picked todo:
   a. Determine task category (from todo metadata or inference)
   b. Look up tier + skill from mapping table
   c. Spawn agent with: tier model, skill prompt, task description, relevant context refs
   d. Agent writes full output to .agentz/sessions/<id>/<task>/output.md directly
   e. Agent returns completion report to orchestrator: file reference, short summary, status, recommendations
   f. Orchestrator stores summary + file reference in DB (never sees full output)
   g. Process agent recommendations (new todos, notes)
4. Write iteration summary to DB
5. Next iteration (go to 1)
```

**Key principle:** Subagents write their own output files. The orchestrator never receives full outputs — only lightweight completion reports. This keeps the orchestrator's context lean across arbitrarily many iterations.

### Fixed Todo Items

Every orchestration session automatically includes two fixed todos that run after all regular work is complete:

| Fixed Todo | Skill | Trigger | Purpose |
|---|---|---|---|
| **Synthesize & Review** | `synthesizer` | All regular todos completed | Reads output files from filesystem, identifies gaps/inconsistencies, may add new todos or approve for verification |
| **Verify** | `backend-tester` (or appropriate) | Synthesizer approved | Build, test, lint — concrete verification of implementation |

The synthesizer uses **adaptive complexity**: for large/complex task lists it does a deep cross-referencing review and may restructure remaining work; for simple tasks it does a quick sanity check and moves straight to verification. This decision is part of the synthesizer's skill prompt.

### What the Orchestrator Sees Per Iteration

```markdown
# Session: <session-id>
## Goal
<original user goal>

## Current Todos
- [x] 1. Analyze requirements (completed - task-001: "5 user stories identified")
- [x] 2. Design database schema (completed - task-002: "PostgreSQL schema with 4 tables")
- [ ] 3. Implement API endpoints (in_progress)
- [ ] 4. Write tests (pending)
- [ ] 5. [FIXED] Synthesize & Review (pending - runs after all regular todos)
- [ ] 6. [FIXED] Verify (pending - runs after synthesizer approves)

## Iteration History
- Iteration 1: Dispatched business-analyst for requirements. Added 3 new todos.
- Iteration 2: Dispatched database-architect for schema design. Completed.

## Notes
- User prefers PostgreSQL over MySQL (from business-analyst)
- Existing auth system uses JWT (from technical-analyst)

## Recent Task Summaries
### task-001: Analyze Requirements (business-analyst)
Status: completed
Summary: Identified 5 user stories, 12 acceptance criteria. Key finding: ...
Output: .agentz/sessions/abc123/task-001/output.md

### task-002: Design Database Schema (database-architect)
Status: completed
Summary: Designed PostgreSQL schema with 4 tables, migrations included.
Output: .agentz/sessions/abc123/task-002/output.md
```

## 7. Communication Protocol

### Principle: Subagent Writes, Orchestrator Reads Summaries

Subagents write their full output directly to the filesystem. The orchestrator **never** receives full outputs — only lightweight completion reports. This is critical for keeping the orchestrator's context lean across many iterations.

### What the Subagent Does (Before Returning)

1. Performs its work (analysis, implementation, review, etc.)
2. Writes full output to the designated path: `{{output_path}}` (injected via template variable)
3. Returns a **completion report** to the orchestrator (this is all the orchestrator sees)

### Full Output File (Written by Subagent)

Written to `.agentz/sessions/<session>/<task>/output.md`:

```markdown
## Summary
<2-5 sentence summary of what was done and key findings>

## Details
<Full analysis/implementation details — can be arbitrarily long>

## Artifacts
<List of files created/modified with paths>

## Recommendations
- ADD_TODO: <description> [priority: high|medium|low] [category: <task-category>]
- ADD_NOTE: <key insight for future iterations>
- NEEDS_REVIEW: <what needs human review and why>
```

### Completion Report (Returned to Orchestrator)

This is the **only** thing that flows back through the orchestrator's context:

```
STATUS: completed|failed
OUTPUT: .agentz/sessions/<session>/<task>/output.md
SUMMARY: <2-5 sentences, hard limit — same as the Summary section in the full output>
RECOMMENDATIONS:
- ADD_TODO: <description> [priority: high|medium|low] [category: <task-category>]
- ADD_NOTE: <key insight for future iterations>
- NEEDS_REVIEW: <what needs human review and why>
```

The `Details` and `Artifacts` sections stay in the output file only — they never travel through the orchestrator's context. Subsequent agents that need deep context from a prior task read the output file directly from the filesystem.

### Cross-Agent Context

When a subagent needs context from a prior task's output:
1. The orchestrator includes the output file path in the task prompt
2. The subagent reads the file directly from the filesystem
3. This keeps the orchestrator lean while giving agents access to full prior outputs

### Synthesizer Access

The synthesizer agent is special: it reads **all** output files for the session to build a holistic view. It receives the list of all task output paths and reads them from the filesystem, never through the orchestrator.

## 8. Persistence Schema

### SQLite Tables

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  opencode_session_id TEXT, -- links to the OpenCode session for auto-resume
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active, completed, paused, failed
  config TEXT, -- JSON: tier mappings, overrides
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, cancelled, interrupted, needs_rework
  priority TEXT NOT NULL DEFAULT 'medium', -- high, medium, low
  category TEXT, -- task category from mapping table
  added_by TEXT, -- which task/agent added this todo
  completed_by TEXT, -- which task completed this todo
  rework_of INTEGER REFERENCES todos(id), -- if this is a rework todo, points to the original
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY, -- e.g., task-001
  session_id TEXT NOT NULL REFERENCES sessions(id),
  todo_id INTEGER REFERENCES todos(id),
  skill TEXT NOT NULL, -- agent skill used
  tier TEXT NOT NULL, -- tier used
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed, interrupted
  input_summary TEXT, -- what was asked
  output_summary TEXT, -- compressed result
  output_path TEXT, -- filesystem path to full output
  recommendations TEXT, -- JSON array of recommendations
  iteration INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE iterations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  iteration_number INTEGER NOT NULL,
  summary TEXT NOT NULL,
  decisions TEXT, -- JSON: what was decided and why
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  content TEXT NOT NULL,
  added_by TEXT, -- which task/agent added this note
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Filesystem Structure

```
.agentz/
├── agentz.db              # SQLite database
└── sessions/
    └── <session-id>/
        ├── task-001/
        │   └── output.md   # Full agent output
        ├── task-002/
        │   └── output.md
        └── ...
```

## 9. Plugin Integration

### Always-On Orchestrator

The orchestrator is the **main agent** — always active, not activated by slash commands. Like oh-my-opencode-slim's phase-reminder, the orchestrator prompt is injected into every conversation via the system prompt hook.

### Entry Point

The plugin registers:
- **Agent** (`agentz`): Single subagent with lean base prompt — used as the target for all dispatched skill sessions (see Agent Spawning Implementation below)
- **Tool** (`agentz_dispatch`): Custom tool the orchestrator LLM calls to spawn skill-specialized agents (see Agent Spawning Implementation below)
- **Hook** (`experimental.chat.system.transform`): Always injects the orchestrator prompt. When no session is active, injects the lean base prompt (role + complexity decision criteria). When a session is active, injects the full orchestrator state from DB.
- **Hook** (`experimental.session.compacting`): Injects agentz state into compaction context (see Section 12)
- **Hook** (`event`): Listens for `session.compacted` and `MessageAbortedError` events (see Sections 12, 13)
- **Slash commands**: Management commands for session control

```typescript
"experimental.chat.system.transform": async ({ sessionID }, output) => {
  const session = db.getActiveSessionByOpenCodeId(sessionID);
  if (session) {
    // Full state: goal, todos, iteration history, notes, task summaries
    output.system.push(buildFullOrchestratorPrompt(session));
  } else {
    // Lean prompt: orchestrator role + when to create a session
    output.system.push(buildBaseOrchestratorPrompt());
  }
}
```

### Slash Commands

| Command | Description |
|---------|-------------|
| `/agentz-status [session-id]` | Show current session status, todos, progress |
| `/agentz-resume [session-id]` | Resume a paused or interrupted session (see Section 13) |
| `/agentz-pause` | Pause current session (saves state) |
| `/agentz-list` | List all sessions with status |

Note: There is no `/agentz <goal>` command — the orchestrator decides automatically whether to create a session based on task complexity. The user simply talks naturally.

### Agent Spawning Implementation

The plugin registers a single `agentz` agent and a custom `agentz_dispatch` tool:

```typescript
// Agent registration — lean base prompt, subagent mode
agent: {
  agentz: {
    model: undefined, // selected per-dispatch from tier config
    prompt: AGENTZ_BASE_PROMPT, // identity + safety + output format expectations
    description: "Agentz skill-specialized subagent",
    mode: "subagent",
  }
}

// Tool registration — the dispatch mechanism
tool: {
  agentz_dispatch: {
    description: "Dispatch a skill-specialized agent for a todo item",
    parameters: {
      todo_id: { type: "number", description: "The todo ID to work on" },
      skill: { type: "string", description: "The skill to use (from mapping table)" },
    },
    async execute(args, ctx) {
      // 1. Validate ancestry/depth rules
      // 2. Create child session: client.session.create({ parentID })
      // 3. Select model from tier config
      // 4. Compose system prompt: protocol + skill content + task context
      // 5. Call session.prompt() with per-prompt overrides:
      //    - agent: "agentz"
      //    - model: { providerID, modelID }
      //    - system: <composed skill prompt>  (appended to base agent prompt)
      //    - tools: { ... }                   (per-session tool control)
      //    - parts: [{ type: "text", text: <task description> }]
      // 6. Await completion, validate output
      // 7. Update DB: task status, output summary, recommendations
      // 8. Return completion report to orchestrator
    }
  }
}
```

The `system` field in `session.prompt()` is **appended** to the agent's registered base prompt by the OpenCode server (agent prompt first, then environment/instructions, then the `system` value). This means:
- The `agentz` base prompt provides stable identity and universal constraints
- Skill-specific protocol, task context, and output format go in `system` at dispatch time
- This matches the pattern used by oh-my-opencode's `delegate_task` tool

The SDK also provides `session.prompt_async()` (returns `204: void`) for fire-and-forget dispatch, available for future concurrent execution support.

## 10. Configuration

```yaml
# .opencode/agentz.yaml (or in opencode.json under "agentz" key)
agentz:
  tiers:
    fast-cheap: "haiku"
    balanced: "sonnet"
    powerful: "opus"
    reasoning: "o3"

  # Override default mapping for specific categories
  mapping_overrides:
    architect-db: { tier: "reasoning" }
    audit-security: { tier: "balanced" }

  # Session defaults
  defaults:
    max_iterations: 50
    max_concurrent_tasks: 1  # sequential by default
    output_format: "markdown"
```

## 11. Skill File Structure

Each skill file follows this template:

```markdown
# Skill: <skill-name>

## Role
<One sentence describing the agent's role>

## Capabilities
- <What this agent can do>
- <Tools it should use>

## Constraints
- <What this agent must NOT do>
- <Scope boundaries>

## Output Protocol

You MUST follow this output protocol:

1. Perform your work (analysis, implementation, review, etc.)
2. Write your full output to: {{output_path}}
   - Use the format: Summary, Details, Artifacts, Recommendations (see below)
3. Return ONLY a lightweight completion report to the orchestrator (see below)

### Full Output File (write to {{output_path}})

## Summary
<2-5 sentence summary>

## Details
<Full work output — can be arbitrarily long>

## Artifacts
<Files created/modified with paths>

## Recommendations
- ADD_TODO: <description> [priority: high|medium|low] [category: <task-category>]
- ADD_NOTE: <key insight for future iterations>
- NEEDS_REVIEW: <what needs human review and why>

### Completion Report (return to orchestrator)

STATUS: completed|failed
OUTPUT: {{output_path}}
SUMMARY: <2-5 sentences — same as Summary section above>
RECOMMENDATIONS:
<same as Recommendations section above>

## Context
You are operating as part of an Agentz orchestration session.
- Session ID: {{session_id}}
- Task ID: {{task_id}}
- Your ancestry: {{ancestry_chain}}
- Write your full output to: {{output_path}}
- You may spawn leaf agents (local-explorer, web-explorer) for information gathering.
{{#if can_spawn_non_leaf}}
- You may spawn ONE non-leaf agent if needed (it can only spawn leaf agents).
{{/if}}
{{#if prior_output_paths}}
- Relevant prior task outputs (read from filesystem if needed):
{{#each prior_output_paths}}
  - {{this}}
{{/each}}
{{/if}}
```

Template variables (`{{...}}`) are injected by the plugin at spawn time.

## 12. Autocompact Resilience

OpenCode triggers autocompact when the conversation context window fills up. This compresses the conversation history into a summary, replacing the full message history. Agentz must survive this seamlessly.

### Why It's Mostly a Non-Issue

The orchestrator already loads state from DB each iteration, not from conversation history. Autocompact destroys conversation context, but our source of truth is the database. The main risk is: the LLM loses awareness that it's in an agentz session and doesn't know what to do next.

### Three-Hook Strategy

#### Hook 1: `experimental.session.compacting` — Before Compaction

Injects agentz state into the compaction prompt so the resulting summary preserves orchestration awareness.

```typescript
"experimental.session.compacting": async ({ sessionID }, output) => {
  const session = db.getActiveSessionByOpenCodeId(sessionID);
  if (!session) return;
  const todos = db.getTodos(session.id);
  const currentTask = db.getRunningTask(session.id);
  output.context.push(
    `AGENTZ ORCHESTRATION SESSION ACTIVE: ${session.id}`,
    `Goal: ${session.goal}`,
    `Progress: ${todos.filter(t => t.status === 'completed').length}/${todos.length} todos completed`,
    `Current task: ${currentTask ? `${currentTask.id} (${currentTask.skill})` : 'none'}`,
    `IMPORTANT: After compaction, the orchestrator must continue by loading state from the agentz database and resuming the iteration loop.`
  );
}
```

#### Hook 2: `event` — After Compaction (`session.compacted`)

Detects that compaction occurred. The next LLM call will have the enriched summary from Hook 1, plus the system prompt from Hook 3.

```typescript
"event": async ({ event }) => {
  if (event.type === "session.compacted") {
    // Mark in-memory flag that compaction happened
    // Next system.transform call will inject full state
    compactedSessions.add(event.properties.sessionID);
  }
}
```

#### Hook 3: `experimental.chat.system.transform` — Every LLM Call

Ensures the orchestrator always has current agentz state regardless of compaction.

```typescript
"experimental.chat.system.transform": async ({ sessionID }, output) => {
  const session = db.getActiveSessionByOpenCodeId(sessionID);
  if (!session) return;
  output.system.push(buildOrchestratorStatePrompt(session));
  // buildOrchestratorStatePrompt() returns the full state block:
  // goal, todos, iteration history, notes, recent task summaries
}
```

### Subagent Compaction

Subagents spawned via `@general` run in isolated context. The parent's compaction does not affect a running child agent. When the child returns its result, the parent's post-compact context has Hook 3 re-injecting agentz state, so it knows to store the result and continue the iteration loop.

### Compaction During a Running Task

If compaction happens while waiting for a spawned agent to complete:

1. The running task is tracked in DB with `status: "running"`
2. Post-compact, Hook 3 injects the current state including the running task
3. The LLM sees: "Task X is running (skill: backend-developer). Await its result."
4. When the subagent returns, the orchestrator processes the result normally

## 13. Interruption & Resume

### Detection

When the user interrupts (Escape/Ctrl+C or sends a new message while processing):

- OpenCode fires `session.error` event with `MessageAbortedError`
- The `AssistantMessage` gets `error: { name: "MessageAbortedError" }`
- Session status transitions: `busy → idle`
- Any running tool receives the `AbortSignal`

The plugin detects interruption via the `event` hook and marks the running task as `interrupted` in the DB.

```typescript
"event": async ({ event }) => {
  if (event.type === "session.error") {
    const err = event.properties.error;
    if (err?.name === "MessageAbortedError") {
      const session = db.getActiveSessionByOpenCodeId(event.properties.sessionID);
      if (!session) return;
      const runningTask = db.getRunningTask(session.id);
      if (runningTask) {
        db.updateTaskStatus(runningTask.id, "interrupted");
        db.updateTodoStatus(runningTask.todo_id, "interrupted");
      }
    }
  }
}
```

### Case 1: User Adds or Changes Something

The user interrupts and provides new input (e.g., "also add authentication" or "switch to Redis instead").

**Flow:**

1. Interrupt detected → running task marked `interrupted`, its todo marked `interrupted`
2. User sends a new message with their change request
3. `experimental.chat.system.transform` injects current agentz state (including the interrupted task)
4. The orchestrator sees the interrupted state + new user input
5. Orchestrator dispatches `business-analyst` to analyze the change request against:
   - The original goal
   - Current todo list (with completed/pending/interrupted items)
   - Summaries of completed tasks
6. Business analyst returns structured recommendations:
   - New todos to add
   - Existing completed todos to mark as `needs_rework` (with reason)
   - The interrupted todo: retry, modify, or cancel
7. Orchestrator updates the todo list:
   - Adds new todos
   - Marks specified completed todos as `needs_rework`
   - Creates companion "rework" todos (with `rework_of` reference to the original)
   - Handles the interrupted todo as recommended
8. Normal iteration loop resumes

**Example — user says "switch from PostgreSQL to Redis":**

```
Before:
  Todo #1: Analyze requirements          → completed (task-001)
  Todo #2: Design PostgreSQL schema       → completed (task-002)
  Todo #3: Implement user API             → interrupted (was running)
  Todo #4: Write tests                    → pending

After business-analyst analysis:
  Todo #1: Analyze requirements          → completed (unchanged)
  Todo #2: Design PostgreSQL schema       → needs_rework
  Todo #3: Implement user API             → cancelled (will be replaced)
  Todo #4: Write tests                    → pending (unchanged)
  Todo #5: Redesign storage for Redis     → pending (rework_of: #2)
  Todo #6: Implement user API with Redis  → pending (new, replaces #3)
```

### Case 2: User Just Wants to Resume

The user interrupts (maybe accidentally, or to check status) and then wants to continue without changes.

**Flow:**

1. Interrupt detected → running task marked `interrupted`
2. User types "continue", `/agentz-resume`, or similar
3. Orchestrator loads state from DB
4. Sees interrupted task → retries it (re-dispatches same skill with same input)
5. Normal iteration loop resumes

### `/agentz-resume` Logic

```
/agentz-resume [session-id]
│
├── session-id provided
│   └── Load and resume that session
│
└── no session-id
    │
    ├── Active agentz session linked to this OpenCode session?
    │   └── Yes → auto-resume it
    │
    └── No active session
        │
        ├── Most recent non-completed session exists in DB?
        │   └── Ask user: "Found session '<goal>' (paused 2h ago). Resume? [Y/n]"
        │
        └── No sessions found
            └── "No sessions to resume. Use /agentz <goal> to start one."
```

### Task States

```
                    ┌──────────┐
                    │ pending  │
                    └────┬─────┘
                         │
                    ┌────▼─────┐
              ┌─────┤in_progress├─────┐
              │     └────┬─────┘     │
              │          │           │
         ┌────▼───┐ ┌───▼────┐ ┌───▼────────┐
         │ failed │ │completed│ │interrupted │
         └────────┘ └───┬────┘ └─────┬───────┘
                        │            │
                   ┌────▼──────┐  ┌──▼─────┐
                   │needs_rework│  │retrying│
                   └────┬──────┘  └──┬─────┘
                        │            │
                   (new rework   ┌───▼────┐
                    todo created)│completed│
                                └────────┘
```

### Todo Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Not yet started |
| `in_progress` | Currently being worked on by an agent |
| `completed` | Successfully finished |
| `cancelled` | No longer needed (superseded or removed) |
| `interrupted` | Was in progress when user interrupted |
| `needs_rework` | Was completed, but subsequent change request invalidates it |
