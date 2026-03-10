# Agentz — Orchestration Framework for OpenCode

## 1. Overview

Agentz is an OpenCode plugin that enables multi-agent orchestration with dynamic model/skill assignment. It provides a persistence layer (SQLite + filesystem) so that complex, long-running tasks survive context limits and can be resumed across sessions.

**Core idea:** An orchestrator agent processes a user's goal iteratively — breaking it into todos, dispatching specialized agents (each with a tier-appropriate model and domain skill), collecting results, and updating state in a database. Each iteration starts with clean context loaded from DB, not accumulated conversation history.

**Inspired by** oh-my-opencode-slim but fundamentally different: agents divided by tier + dynamic skills (not fixed roles), persistence layer for state, clean orchestrator context per iteration, iterative processing with DB state.

## 2. Superpowers Coexistence Strategy

### Decision: Absorb and Replace

Agentz is the primary workflow framework. The superpowers plugin is disabled when agentz is active and eventually retired. Superpowers' valuable process disciplines (brainstorming rigor, TDD, systematic debugging, verification-before-completion) are ported into agentz skill files rather than discarded.

### Why Not Coexist

Both superpowers and agentz are meta-cognitive frameworks — they inject instructions into every LLM call via `experimental.chat.system.transform` telling the LLM *how to think about work*. Their instructions conflict:

- Superpowers says: "Invoke skills BEFORE any response or action — this is not negotiable."
- Agentz says: "Be a pure task processor that delegates everything to specialists."

Superpowers wraps its instructions in double-nested `<EXTREMELY_IMPORTANT>` tags with anti-rationalization tables. Agentz uses plain markdown. In a conflict, superpowers will dominate the LLM's attention, making the orchestrator effectively inert.

The combined token cost (superpowers bootstrap ~800-1000 tokens + agentz state 300-3000 tokens) is also wasteful on every LLM call.

### Injection Conflict Resolution

Agentz's `chat.system.transform` hook suppresses superpowers' injection when the agentz plugin is active. Implementation: when both plugins are loaded, agentz filters superpowers' content from `output.system` after both hooks have run, or superpowers checks for an agentz-active flag and skips injection.

### Porting Superpowers Disciplines

Superpowers' process disciplines are absorbed into agentz skill files:

| Superpowers Discipline | Agentz Location |
|---|---|
| Brainstorming (interactive exploration, approach proposals) | `business-analyst` / `technical-analyst` skill with brainstorming mode (see Section 7, Analyst-Mediated Brainstorming) |
| TDD iron law (red-green-refactor) | `backend-developer`, `frontend-developer` skill prompts |
| Systematic debugging (4-phase root cause investigation) | `debugger` category added to mapping table; debugging discipline in developer skills |
| Verification before completion | `synthesizer` and verification phase of iteration loop |
| Writing plans (bite-sized tasks, exact file paths) | Orchestrator's todo decomposition behavior |

The `using-superpowers` meta-skill concept (invoke skills before acting) is retired — the orchestrator's complexity decision + skill-based dispatch replaces it. The orchestrator *is* the meta-skill.

### Migration Path

During development, superpowers can remain active for non-agentz OpenCode sessions. Once agentz handles the full workflow spectrum, the superpowers plugin is retired.

## 3. Three-Layer Architecture

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

## 4. Tier System

Semantic tier tags abstracted from concrete models. Users map tiers to models in config.

| Tier | Rating | Intent | Example Models |
|------|--------|--------|----------------|
| `fast-cheap` | S | Quick lookups, simple transforms | haiku, gpt-4o-mini, gemini-flash |
| `balanced` | M | Most coding tasks, analysis | sonnet, gpt-4o, gemini-pro |
| `powerful` | L | Complex architecture, large refactors | opus, o1, gemini-ultra |
| `reasoning` | XL | Multi-step logic, math, planning | o1, o3, deepseek-r1 |

**Rating** — a t-shirt size (S, M, L, XL) expressing the tier's general model capability. Used for tier comparisons (e.g., orchestrator minimum model check) without hardcoding model-specific knowledge. Ordering: `S < M < L < XL`.

**No cost multiplier in tier definition** — that's a config-time decision by the user.

### Tier Escalation

Each tier has an optional `escalate_to` field pointing to the next tier to try when a task fails due to insufficient model capability. The `agentz_dispatch` tool follows this chain during failure recovery (see Section 6, Failure Handling).

| Tier | Default `escalate_to` |
|------|----------------------|
| `fast-cheap` | `balanced` |
| `balanced` | `powerful` |
| `powerful` | `null` (no escalation — surface to user) |
| `reasoning` | `null` (no escalation — surface to user) |

Users can reconfigure the escalation path per tier. If `escalate_to` is `null` or absent, model escalation is skipped and the failure is surfaced to the user directly.

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

## 5. Agent Taxonomy

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
| `synthesizer` | Two-pass review: breadth scan of all task summaries, then targeted deep reads of flagged outputs. Identifies requirement gaps and cross-task inconsistencies. Can add new todos, flag issues, or approve for verification. Adapts depth based on session size and task complexity (see Section 8, Synthesizer Reading Strategy). |

## 6. Spawning Model

### Mechanism

All agent dispatch goes through the `agentz_dispatch` tool — a custom tool registered by the plugin via the `tool` hook. The orchestrator LLM calls this tool naturally; the tool's `execute` function handles all spawning mechanics:

1. Creates a child session via `client.session.create({ parentID })`
2. Selects a model from tier config based on skill requirements
3. Publishes live status via `ctx.metadata()` (see Section 6, User Visibility During Dispatch)
4. Composes the system prompt (protocol template + skill content + task context)
5. Calls `session.prompt()` with per-prompt `model`, `system`, and `tools` overrides
6. Validates output and runs the escalation ladder on failure (see Failure Handling below)
7. Updates DB (including retry metadata)
8. Syncs agentz todos to OpenCode's sidebar (see Section 6, Sidebar Todo Sync)
9. Returns completion or failure report

The plugin registers a single `agentz` agent (mode: `"subagent"`) with a lean base prompt covering identity, safety boundaries, and general output format expectations. All skill-specific instructions are injected via the `system` parameter at dispatch time — the SDK **appends** this to the agent's base prompt (agent prompt first, then environment/instructions, then the `system` value).

### Rules

1. **Leaf agents** (`local-explorer`, `web-explorer`): anyone can spawn them freely — they are context compressors that never spawn children.

2. **Non-leaf agents**: can spawn leaf agents freely. Can spawn another non-leaf agent at max depth 1 (that child can only spawn leaf agents).

3. **Ancestry chain** for cycle detection: an agent cannot spawn a non-leaf agent with a skill combination already in its ancestry.

4. **Graceful ancestry blocking**: if a spawn is blocked by ancestry rules, the agent returns the best answer it has and lets the caller supplement with its own expertise. No hard failures.

5. **Dual-mode operation**: agents have direct tool access (grep, glob, webfetch, read, write, edit, bash) for simple operations. They spawn leaf agents for exploratory or large-volume operations where context compression is needed.

All depth/ancestry rules are enforced inside the `agentz_dispatch` tool's `execute` function before creating the child session.

### Failure Handling & Escalation Ladder

All retry logic lives inside `agentz_dispatch`'s `execute` function. The orchestrator LLM never sees retries — only the final outcome (success or exhausted-failure). Each task gets at most 3 attempts.

#### Failure Classification

When `session.prompt()` fails or returns an invalid result, the dispatch tool classifies the failure before deciding which ladder step to apply:

| Signal | Classification | Rationale |
|--------|---------------|-----------|
| `session.prompt()` throws timeout / abort / network error | `transient` | Infrastructure issue, likely recoverable on retry |
| `session.prompt()` returns but output has no completion report | `capability` | Model couldn't follow the protocol — needs stronger model |
| Completion report present but output file missing at `output_path` | `capability` | Model didn't write the file — needs stronger model |
| `STATUS: failed` with error message from agent | `systematic` | Agent explicitly reported failure — the task itself is problematic |
| `session.prompt()` throws context limit error | `capability` | Model ran out of context — escalation to larger context window may help |

#### The Ladder

```
Attempt 1: Original config (tier model + skill)
    ↓ failure
Classify failure → transient | capability | systematic
    ↓
┌─ transient ──→ Attempt 2: Same config (retry)
│                    ↓ failure
│                Attempt 3: Escalated tier model (via escalate_to)
│                    ↓ failure
│                Return failure report to orchestrator
│
├─ capability ─→ Attempt 2: Escalated tier model (skip same-config retry)
│                    ↓ failure
│                Return failure report to orchestrator
│
└─ systematic ─→ Return failure report to orchestrator immediately (no retries)
```

When escalation is needed, the dispatch tool looks up the current tier's `escalate_to` (see Section 4, Tier Escalation). If `escalate_to` is `null` or absent, the escalation step is skipped and the failure is returned immediately.

#### Failure Report (Returned to Orchestrator on Exhausted Ladder)

When retries are exhausted, the dispatch tool returns a failure report instead of a completion report:

```
STATUS: failed
ERROR_TYPE: <transient|capability|systematic>
ERROR_DETAIL: <what went wrong — exception message, validation error, or agent's error message>
ATTEMPTS: <number of attempts made, including original>
TIERS_TRIED: <comma-separated list of tiers attempted>
ORIGINAL_TASK: <the task description>
```

The orchestrator treats this similarly to `needs_input` — it relays the failure info to the user and pauses iteration awaiting a decision. See Section 7 (Iteration Loop, step 4g) for how the orchestrator processes this.

#### What This Doesn't Handle (Out of Scope for v1)

- **Wrong skill assignment** — If a task fails because it was assigned the wrong skill, the user will see it at the surface-to-user step and can rephrase. Automatic re-routing is a v2 concern.
- **Partial output recovery** — If a subagent wrote partial output before failing, this design discards it and retries from scratch. Incremental recovery is not worth the complexity for v1.
- **Cost budgets** — The design records `retries` and `final_tier` for visibility, but does not enforce cost limits. Cost tracking is a separate concern.

### User Visibility During Dispatch

The `agentz_dispatch` tool provides real-time user feedback via `ctx.metadata()` — the same mechanism OpenCode's Bash tool uses for streaming command output and the Task tool uses for subtask progress. Each `ctx.metadata()` call updates the tool's display in the TUI instantly via a `message.part.updated` event.

#### Metadata Lifecycle

| Moment | `ctx.metadata()` call | What the user sees |
|---|---|---|
| Dispatch start | `ctx.metadata({ title: "Designing DB schema [3/7]", metadata: { todo: "Design DB schema", tier: "balanced", skill: "backend-developer", progress: "3/7" } })` | Tool status line: `Designing DB schema [3/7]` |
| Escalation (retry) | `ctx.metadata({ title: "Designing DB schema [3/7] — retrying (tier: powerful)", metadata: { ... } })` | Status updates in-place |
| Completion | Tool returns with `title: "Completed: Design DB schema [3/7]"` | Final status line shown |

The `progress` field in metadata uses the format `"<completed>/<total>"` counting all regular todos (excluding fixed todos). This gives the user a simple progress indicator without exposing internal complexity.

### Sidebar Todo Sync

After each task completes (and after the orchestrator adds/removes/reorders todos), the `agentz_dispatch` tool programmatically syncs agentz's internal todos to OpenCode's built-in todo sidebar. This happens inside the tool's `execute` function — no LLM involvement, zero token cost, guaranteed consistency.

#### Mechanism

The tool imports OpenCode's `Todo.update()` function and calls it directly after updating the agentz DB:

```typescript
// Inside agentz_dispatch.execute(), after DB update:
import { Todo } from "@opencode-ai/opencode/session/todo"

const agentzTodos = db.getTodos(session.id);
await Todo.update({
  sessionID: openCodeSessionID,
  todos: agentzTodos.map(t => ({
    id: String(t.id),
    content: t.description.slice(0, 100),
    status: mapStatus(t.status),
    priority: t.priority,
  })),
});
```

#### Status Mapping

| Agentz status | OpenCode status |
|---|---|
| `pending` | `pending` |
| `in_progress` | `in_progress` |
| `completed` | `completed` |
| `cancelled` | `cancelled` |
| `interrupted` | `pending` (shows as resumable) |
| `needs_rework` | `pending` (the rework todo appears separately) |

#### What's Dropped

Agentz-specific fields (`category`, `rework_of`, `added_by`, `completed_by`, `sort_order`) are not synced to the sidebar — they remain in the agentz DB for the orchestrator and `/agentz-status`. The sidebar shows a simplified progress view.

#### Sync Triggers

1. Inside `agentz_dispatch.execute()`: after DB update, before returning the completion/failure report
2. After the orchestrator adds new todos from agent recommendations (step 4i of the iteration loop)
3. After interruption handling updates todo statuses (Section 14)

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

## 7. Orchestrator Design

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

### Model Capability Check

Before creating an orchestration session, the plugin checks whether the user's active model meets the minimum capability threshold for orchestration. The orchestrator makes routing decisions (task categorization, tier selection, recommendation processing, iteration control) that require strong reasoning — a weak model orchestrating expensive specialists is wasteful.

**Resolution mechanism (substring match):** The plugin resolves the user's active OpenCode model ID to a tier by checking if the model ID contains any tier's configured `model` value as a substring. Example: user's model `claude-3.5-sonnet` contains `sonnet` → matches tier `balanced` (rating M). Match order: longest `model` value first to avoid false prefix matches.

**Comparison:** The resolved tier's `rating` is compared against the `orchestrator_tier` config's `rating` using the ordering `S < M < L < XL`. If the user's model rates below the threshold, the plugin injects a one-time warning into the conversation via the system prompt:

> "Note: Your current model ({model_id}, resolved to tier {resolved_tier}/rating {rating}) is below the recommended orchestrator tier ({orchestrator_tier}/rating {min_rating}). Task decomposition, routing, and recommendation processing may be degraded. Consider switching to a {min_rating}+ model for orchestration sessions."

**Unknown models:** If the user's model ID does not substring-match any configured tier's `model` field, it is assumed capable (no warning). This avoids false positives on new or custom model IDs.

**No override, no degradation:** The orchestrator runs the full pipeline regardless of the model. The warning is informational only. If real-world usage shows weak-model orchestration is a common failure pattern, adaptive prompt complexity (simplified orchestrator prompt for weak models) can be added as a v2 enhancement.

**Warning tracking:** The `sessions` table includes a `warning_shown` flag (default false) to ensure the warning is emitted at most once per session.

### Analyst-Mediated Brainstorming (Pre-Session)

When the orchestrator determines a task is complex enough for orchestration, it may need to explore requirements before decomposing into todos. This is handled by dispatching an analyst agent — **not** by the orchestrator itself — to preserve the orchestrator's lean context.

**Why not brainstorm in the orchestrator?** Brainstorming is inherently interactive (questions, answers, approach proposals, approvals). If the orchestrator runs this conversation, it accumulates all exploration context in its own session, violating the "clean context per iteration, loaded from DB only" principle.

**The relay pattern:** The orchestrator dispatches a `business-analyst` (or `technical-analyst`) with a brainstorming skill. The analyst explores requirements and returns questions. The orchestrator relays questions to the user without interpreting them, then forwards the user's raw response back to the analyst's persisted child session. The orchestrator never processes domain content — it acts as a transparent relay.

**Flow:**

```
User: "Add dark mode support"

1. Orchestrator: Complex task → dispatches business-analyst with brainstorming skill
   Task: "Explore requirements for dark mode support"

2. Analyst (turn 1): Returns completion report:
   STATUS: needs_input
   QUESTIONS:
   1. Should dark mode follow system preference or be manual toggle?
   2. Do you want CSS variables or a theme provider?
   3. Which components need theming?

3. Orchestrator: Sees STATUS: needs_input → surfaces questions to user verbatim

4. User: "System preference with manual override, CSS variables, all components"

5. Orchestrator: Forwards raw user response to same analyst child session
   (session context persisted — analyst retains full brainstorming history)

6. Analyst (turn 2): Has full context from turn 1 + answers
   STATUS: complete
   OUTPUT: .agentz/sessions/<id>/task-001/output.md (design document)
   SUMMARY: "Dark mode design finalized: CSS variables, system pref + toggle..."

7. Orchestrator: Reads summary only → creates todos from design output
   Domain knowledge stays in analyst's session and output files
```

**Key properties:**
- The analyst's context is persisted in its own child session. Re-dispatch continues the same session via `session.prompt()`.
- The orchestrator stays lean: it sees "analyst needs input, here are questions" → relays → "analyst is done, here's a summary." No domain knowledge in orchestrator context.
- The output file (design document) becomes the knowledge artifact. Later agents receive it as context when dispatched.
- The orchestrator forwards user responses verbatim — no paraphrasing, no summarizing.

### Iteration Loop

Each iteration starts with **clean context** loaded from DB via the working view (see Working View below):

```
1. Load working view from DB: goal, incomplete todos, completed todo count, last 3 iterations, all notes, last completed task + running task
2. Check for tasks in needs_input state:
   a. Task awaiting user input? → Relay questions to user, wait for response
   b. User responded? → Forward raw response to same child session, go to 3e
3. Evaluate todo list:
   a. Regular todos remaining? → Pick highest priority incomplete todo, go to 4
   b. All regular todos done? → Check for implementation tasks:
      - Has completed develop-backend/develop-frontend tasks AND orchestrator deems non-trivial? → Run "Code Review" fixed todo
      - No reviewable implementation tasks? → Skip to "Synthesize & Review" (step 3e)
   c. Code Review done:
      - Reviewer added rework todos? → Go back to 3a (rework todos are regular todos)
      - Reviewer approved? → Go to 3e
      - Review cycle limit reached (default 2)? → Surface to user, pause for decision
   d. Rework todos from reviewer completed? → Re-run "Code Review" (go to 3b)
   e. Run "Synthesize & Review" fixed todo
   f. Synthesizer added new todos? → Go back to 3a
   g. Synthesizer approved? → Run "Verify" fixed todo
   h. Verification passed? → Mark session complete
   i. Verification failed? → Synthesizer analyzes failures, adds fix todos, back to 3a
4. For picked todo:
   a. Determine task category (from todo metadata or inference)
   b. Look up tier + skill from mapping table
   c. Spawn agent with: tier model, skill prompt, task description, relevant context refs
   d. Agent writes full output to .agentz/sessions/<id>/<task>/output.md directly
   e. Agent returns completion report to orchestrator: file reference, short summary, status, recommendations
   f. If STATUS is needs_input: store questions in DB, surface to user, pause iteration (go to 2)
   g. If STATUS is failed (ladder exhausted — see Section 6, Failure Handling):
      - Store failure report in DB (error_type, error_detail, retries, tiers_tried)
      - Relay failure info to user with context (what failed, why, what was tried)
      - Pause iteration awaiting user decision (same flow as needs_input)
      - User may: retry (re-dispatch same config), skip (cancel todo), or rephrase the task
   h. Orchestrator stores summary + file reference in DB (never sees full output)
   i. Process agent recommendations (new todos, notes)
5. Write iteration summary to DB
6. Next iteration (go to 1)
```

**Key principle:** Subagents write their own output files. The orchestrator never receives full outputs — only lightweight completion reports. This keeps the orchestrator's context lean across arbitrarily many iterations.

### Progress Summary Instruction

The orchestrator's system prompt includes a soft instruction to print a one-line progress summary to the conversation after each dispatch returns. This gives the user a textual breadcrumb trail in the chat alongside the live metadata and sidebar sync.

**Prompt instruction:** `"After each agentz_dispatch call completes, output a single progress line in the format: 'Completed: <todo description> [N/M todos]. Next: <next todo description>.' Do not elaborate beyond this line."`

**Example output:** `Completed: Design DB schema [3/7 todos]. Next: Implement OAuth2 middleware.`

This is a soft instruction — if the LLM skips it, the sidebar and tool metadata still provide full visibility. The instruction is designed to be low-friction: one line, no analysis, no commentary.

### Fixed Todo Items

Every orchestration session automatically includes three fixed todos that run after all regular work is complete:

| Fixed Todo | Skill | Trigger | Purpose |
|---|---|---|---|
| **Code Review** | `code-reviewer` | All regular todos completed AND at least one non-trivial `develop-backend`/`develop-frontend` todo exists | Reads implementation output files + actual code diffs from filesystem. Reviews for correctness, style, patterns, edge cases. May add rework todos. Skipped if the orchestrator deems all implementation trivial or if no implementation tasks exist. |
| **Synthesize & Review** | `synthesizer` | Code Review approved (or skipped) | Two-pass review: (1) breadth scan of all task Summary sections to assess coverage and flag concerns, (2) targeted deep reads of flagged outputs for coherence analysis. Identifies requirement gaps, cross-task inconsistencies, architectural misalignment. May add new todos or approve for verification. Does NOT re-evaluate code quality (trusts the reviewer). See Section 8, Synthesizer Reading Strategy. |
| **Verify** | `backend-tester` (or appropriate) | Synthesizer approved | Build, test, lint — concrete verification of implementation |

**Reviewer / Synthesizer boundary:** The code reviewer evaluates *implementation quality* (correctness, patterns, edge cases, test coverage of implementation code). The synthesizer evaluates *project completeness* (requirement coverage, cross-task coherence, gap analysis). The synthesizer trusts that reviewer-approved code is correct and focuses exclusively on whether the right things were built and whether they fit together.

**Review cycle limit:** To prevent infinite review-rework loops, the session tracks a `review_cycle` counter. After N cycles (configurable, default 2), the orchestrator escalates to the user with outstanding issues and pauses for a decision.

The synthesizer uses a **two-pass reading strategy** to stay within context limits while maintaining both breadth and depth (see Section 8, Synthesizer Reading Strategy for full details). For small sessions (< 5 tasks) the two passes are effectively the same since all outputs are read. For large sessions (15+), the two-pass approach reduces token consumption by ~60-70% compared to reading all outputs in full.

### Working View (What the Orchestrator Sees Per Iteration)

The orchestrator state is injected into every LLM call via the system prompt hook. To prevent unbounded growth in long sessions, the injected state is a **working view** — a pruned, actionable subset of the full DB state. The full state remains in the database, accessible on demand via the `agentz_query` tool.

#### Pruning Rules

| Section | Rule | Rationale |
|---|---|---|
| **Goal** | Always show in full | Fixed, small (~50-100 tokens) |
| **Incomplete todos** | Always show with full description, priority, category | Primary decision input for the orchestrator |
| **Completed todos** | Count-only: `"N todos completed (use agentz_query 'todos' for details)"` | Summaries of finished work are rarely needed for current decisions |
| **Iteration history** | Last 3 iterations with full summary + decisions | Recent decisions inform the next step; older history is queryable |
| **Notes** | Always show all | Notes are the cross-iteration memory that compensates for pruning other sections. Quality enforced via skill prompts (see Section 12), not view pruning. |
| **Task summaries** | Last completed task + any currently running task | Most recent result informs the next dispatch; older results are queryable |

#### Why Always Inject (No Intent Detection)

The working view is injected on every LLM call — including non-orchestration queries (user asks a quick question mid-session). Rather than trying to classify whether a message is "orchestration-related" (fragile, ambiguous edge cases), the working view is kept compact enough (~800-1,300 tokens) that the overhead is negligible even when not needed. This eliminates the classification problem entirely.

#### Token Budget Estimate (Large Session: 50 Todos, 30 Iterations, 20 Notes)

| Section | Unbounded (old) | Working view |
|---|---|---|
| Goal | ~50-100 | ~50-100 |
| Todos | ~1,500-2,500 (50 with summaries) | ~250-400 (5 incomplete + count line) |
| Iterations | ~900-1,500 (30 summaries) | ~90-150 (3 summaries) |
| Notes | ~400-600 (20 notes) | ~400-600 (unchanged) |
| Task summaries | ~500-1,000 (10+ recent) | ~50-100 (1-2 tasks) |
| **Total** | **~3,350-5,700** | **~840-1,350** |

#### On-Demand State Access: `agentz_query` Tool

For data pruned from the working view, the orchestrator can call the `agentz_query` tool (see Section 10 for registration details):

| Section Parameter | Returns |
|---|---|
| `todos` | Full todo list with descriptions, statuses, and completion summaries |
| `iterations` | Full iteration history with summaries and decisions |
| `task` (+ `task_id`) | Specific task detail: input, output summary, recommendations, status |
| `notes` (+ optional `keyword`) | All notes, optionally filtered by keyword substring |

The tool reads directly from DB and returns formatted text. No LLM interpretation layer.

#### Rendered Working View Example

```markdown
# Session: <session-id>
## Goal
<original user goal>

## Todos
12 todos completed (use agentz_query section="todos" for full list)
- [ ] 13. Implement API endpoints (in_progress)
- [ ] 14. Write tests (pending)
- [ ] 15. [FIXED] Code Review (pending - runs after all impl todos, skipped if no impl)
- [ ] 16. [FIXED] Synthesize & Review (pending - runs after code review approves)
- [ ] 17. [FIXED] Verify (pending - runs after synthesizer approves)

## Recent Iterations (last 3 of 14)
- Iteration 12: Dispatched frontend-developer for dashboard UI. Completed.
- Iteration 13: Dispatched backend-developer for notification service. Completed, added 2 rework todos.
- Iteration 14: Dispatched backend-developer for rework on auth middleware. Completed.

(Use agentz_query section="iterations" for full history)

## Notes
- User prefers PostgreSQL over MySQL (from business-analyst)
- Existing auth system uses JWT (from technical-analyst)
- Dashboard must support mobile viewports (from ui-ux-designer)

## Last Completed Task
### task-014: Rework auth middleware (backend-developer)
Status: completed
Summary: Refactored auth middleware to support both JWT and session tokens.
Output: .agentz/sessions/abc123/task-014/output.md

(Use agentz_query section="task" task_id="<id>" for any task's details)
```

## 8. Communication Protocol

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
STATUS: completed|failed|needs_input
OUTPUT: .agentz/sessions/<session>/<task>/output.md
SUMMARY: <2-5 sentences, hard limit — same as the Summary section in the full output>
RECOMMENDATIONS:
- ADD_TODO: <description> [priority: high|medium|low] [category: <task-category>]
- ADD_NOTE: <key insight for future iterations>
- NEEDS_REVIEW: <what needs human review and why>
QUESTIONS: (only when STATUS is needs_input)
- <question 1>
- <question 2>
```

Note: When `STATUS: failed` is returned by an agent, the orchestrator only sees it if the escalation ladder in `agentz_dispatch` has been exhausted (see Section 6, Failure Handling). The dispatch tool may have already retried the task 1-2 times transparently before surfacing the failure. The failure report format returned by the dispatch tool is:

```
STATUS: failed
ERROR_TYPE: <transient|capability|systematic>
ERROR_DETAIL: <what went wrong>
ATTEMPTS: <total attempts including original>
TIERS_TRIED: <comma-separated tiers attempted>
ORIGINAL_TASK: <the task description>
```

The `Details` and `Artifacts` sections stay in the output file only — they never travel through the orchestrator's context. Subsequent agents that need deep context from a prior task read the output file directly from the filesystem.

### Cross-Agent Context

When a subagent needs context from a prior task's output:
1. The orchestrator includes the output file path in the task prompt
2. The subagent reads the file directly from the filesystem
3. This keeps the orchestrator lean while giving agents access to full prior outputs

### Synthesizer Reading Strategy

The synthesizer agent needs both **breadth** (see everything) and **depth** (catch subtle issues). Reading all output files in full would exceed context limits on large sessions (a 20-task session generates 40,000–100,000 tokens of outputs). The synthesizer uses a two-pass reading strategy, instructed by its skill file — no architectural changes to the dispatch system.

#### Pass 1 — Breadth Scan (All Tasks, Summaries Only)

The synthesizer reads lightweight data for every task:
- **Task completion report summaries** from DB (`tasks.output_summary`, 2–5 sentences each)
- **The `## Summary` section** from each task's output file (first section only — all output files are required to start with `## Summary`)

From this, the synthesizer builds a coverage map: which requirements are addressed, which aren't, where outputs might overlap or conflict. It then produces an explicit **deep-read target list** with reasons before proceeding to Pass 2.

#### Pass 2 — Targeted Deep Reads (Selected Tasks, Full Output)

The synthesizer reads full output files only for flagged tasks — typically 3–8 out of 20. Selection heuristics (encoded in the skill prompt, not programmatic):
- Tasks that touch **shared interfaces** (API contracts, DB schemas, shared types)
- Tasks flagged with `NEEDS_REVIEW` by any prior agent
- Tasks in **overlapping domains** (e.g., two tasks both modifying auth)
- The **highest-complexity task** by tier (anything that ran on `powerful`)

The synthesizer performs coherence analysis on selected outputs: contract consistency, error handling patterns, assumption alignment, naming conventions, missing integration points.

#### Token Budget (Two-Pass vs. Full Read)

For a 20-task session (outputs averaging 4,000 tokens each):

| Component | Full Read (old) | Two-Pass |
|---|---|---|
| All outputs in full | ~80,000 | — |
| All summaries (DB + output `## Summary`) | — | ~6,000 |
| Deep reads (~5 selected outputs) | — | ~20,000 |
| Overhead (system prompt, skill, task prompt) | ~3,000 | ~3,000 |
| **Total** | **~83,000** | **~29,000** |

Comfortably within 128K context. Even a 40-task session stays under 50K with this approach.

#### Output `## Summary` Section Requirement

All agent output files **must** start with a `## Summary` section. This is a hard requirement across all skills, not optional. The Summary section must be:
- **Self-contained**: understandable without reading the rest of the file
- **Concise**: 2–5 sentences covering what was done, key decisions, and notable findings
- **Consistent**: matches the SUMMARY field in the completion report

This convention enables the synthesizer's breadth scan to work reliably — it reads only this section during Pass 1. The skill file template (Section 12) enforces this as the first section of every output file.

#### Future Improvement: Mid-Session Synthesis Checkpoint

Not in v1 scope. For sessions with 10+ todos, a single synthesis checkpoint at the ~50% mark could catch major coherence issues early — before downstream tasks build on flawed assumptions. This would require a minor orchestrator loop change (insert a conditional mini-synthesis step after roughly half the regular todos are complete). Noted as a v2 enhancement.

## 9. Persistence Schema

### SQLite Tables

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  opencode_session_id TEXT, -- links to the OpenCode session for auto-resume
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active, completed, paused, failed
  config TEXT, -- JSON: tier mappings, overrides
  review_cycles INTEGER NOT NULL DEFAULT 0, -- tracks review-rework iterations for cycle limit
  max_review_cycles INTEGER NOT NULL DEFAULT 2, -- configurable limit before escalating to user
  warning_shown BOOLEAN NOT NULL DEFAULT 0, -- whether the model capability warning has been emitted
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
  depends_on TEXT, -- JSON array of todo IDs; nullable, unused in v1 (schema prep for v2 parallel dispatch)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY, -- e.g., task-001
  session_id TEXT NOT NULL REFERENCES sessions(id),
  todo_id INTEGER REFERENCES todos(id),
  skill TEXT NOT NULL, -- agent skill used
  tier TEXT NOT NULL, -- tier originally assigned
  final_tier TEXT, -- tier that produced the final result (may differ from tier if escalated)
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed, interrupted, needs_input
  retries INTEGER NOT NULL DEFAULT 0, -- number of retry attempts made by escalation ladder
  failure_classification TEXT, -- transient, capability, systematic, or null if no failure
  error_detail TEXT, -- error message / diagnostic info from the failure
  input_summary TEXT, -- what was asked
  output_summary TEXT, -- compressed result
  output_path TEXT, -- filesystem path to full output
  recommendations TEXT, -- JSON array of recommendations
  pending_questions TEXT, -- JSON array of questions when status is needs_input
  child_session_id TEXT, -- OpenCode child session ID for multi-turn relay (needs_input flow)
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

## 10. Plugin Integration

### Always-On Orchestrator

The orchestrator is the **main agent** — always active, not activated by slash commands. Like oh-my-opencode-slim's phase-reminder, the orchestrator prompt is injected into every conversation via the system prompt hook.

### Entry Point

The plugin registers:
- **Agent** (`agentz`): Single subagent with lean base prompt — used as the target for all dispatched skill sessions (see Agent Spawning Implementation below)
- **Tool** (`agentz_dispatch`): Custom tool the orchestrator LLM calls to spawn skill-specialized agents (see Agent Spawning Implementation below)
- **Tool** (`agentz_query`): On-demand state query tool for accessing data pruned from the working view (see Section 7, Working View)
- **Hook** (`experimental.chat.system.transform`): Always injects the orchestrator prompt. When no session is active, injects the lean base prompt (role + complexity decision criteria). When a session is active, injects the working view from DB (see Section 7, Working View).
- **Hook** (`experimental.session.compacting`): Injects agentz state into compaction context (see Section 13)
- **Hook** (`event`): Listens for `session.compacted` and `MessageAbortedError` events (see Sections 12, 13)
- **Slash commands**: Management commands for session control

```typescript
"experimental.chat.system.transform": async ({ sessionID }, output) => {
  const session = db.getActiveSessionByOpenCodeId(sessionID);
  if (session) {
    // Working view: goal, incomplete todos, completed count, last 3 iterations, all notes, last task
    output.system.push(buildWorkingView(session));
  } else {
    // Lean prompt: orchestrator role + when to create a session
    output.system.push(buildBaseOrchestratorPrompt());
  }
}
```

### Slash Commands

| Command | Description |
|---------|-------------|
| `/agentz-status [session-id]` | Show current session status, todos, progress, recent activity, and notes (see /agentz-status Output Format below) |
| `/agentz-resume [session-id]` | Resume a paused or interrupted session (see Section 14) |
| `/agentz-pause` | Pause current session (saves state) |
| `/agentz-list` | List all sessions with status |

Note: There is no `/agentz <goal>` command — the orchestrator decides automatically whether to create a session based on task complexity. The user simply talks naturally.

### `/agentz-status` Output Format

The `/agentz-status` command reads from the DB and outputs a formatted progress report. It works mid-execution because it reads DB state, not conversation history. This is the user's "catch-up" view — what happened while they weren't watching.

**Sections:**

1. **Header:** Session goal, elapsed time, current iteration number, session status
2. **Progress:** All todos with statuses, completion times for finished items, skill assignment for the running item
3. **Recent Activity:** Last N iteration summaries showing what was dispatched, what completed, what recommendations were processed
4. **Notes:** All active notes with attribution
5. **Failures:** Summary of any failed tasks (if none, shows `"none"`)

**Rendered example:**

```
## Session: Refactor auth system to OAuth2
Started: 12 min ago | Iteration: 5 | Status: running

### Progress: 3/7 todos complete
  [x] Analyze existing auth code (backend-developer, 2m)
  [x] Design OAuth2 flow (architect, 3m)
  [x] Design DB schema changes (backend-developer, 1m)
  [>] Implement OAuth2 middleware (backend-developer, running...)
  [ ] Update API endpoints
  [ ] Write integration tests
  [ ] Update documentation

### Recent Activity
  #5: Dispatched "Implement OAuth2 middleware" → tier: balanced, skill: backend-developer
  #4: Completed "Design DB schema changes" — added note: "Using existing sessions table, adding oauth_tokens"
  #3: Completed "Design OAuth2 flow" — architect recommended ADD_TODO: "Update documentation"

### Notes (2)
  - Using existing sessions table, adding oauth_tokens table (from backend-developer)
  - Team uses passport.js — integrate with existing middleware stack (from technical-analyst)

### Failures: none
```

**Implementation:** The `command.execute.before` hook intercepts `/agentz-status`, queries the DB, formats the output, and pushes it as a `TextPart` in `output.parts`.

### Agent Spawning Implementation

The plugin registers a single `agentz` agent, the `agentz_dispatch` tool, and the `agentz_query` tool:

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

// Tool registrations
tool: {
  // Dispatch tool — spawns skill-specialized agents
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
      // 6. Validate output (completion report present, output file exists)
      //    - On success: update DB, return completion report
      //    - On failure: classify error (transient/capability/systematic),
      //      run escalation ladder (see Section 6, Failure Handling):
      //      a. transient → retry same config, then escalate tier, then fail
      //      b. capability → escalate tier (skip same-config retry), then fail
      //      c. systematic → fail immediately (no retries)
      //      Escalation uses tier's escalate_to config (Section 4)
      // 7. Update DB: task status, retries, final_tier, error_detail
      // 8. Return completion report (or failure report) to orchestrator
    }
  },

  // Query tool — on-demand access to state pruned from the working view
  agentz_query: {
    description: "Query full session state from the database. Use when the working view's pruned data is insufficient.",
    parameters: {
      section: {
        type: "string",
        enum: ["todos", "iterations", "task", "notes"],
        description: "Which state section to retrieve"
      },
      task_id: {
        type: "string",
        description: "Task ID to retrieve details for (required when section is 'task')",
        optional: true
      },
      keyword: {
        type: "string",
        description: "Keyword substring filter (only used when section is 'notes')",
        optional: true
      },
    },
    async execute(args, ctx) {
      const session = db.getActiveSessionByContext(ctx);
      if (!session) return "No active agentz session.";
      switch (args.section) {
        case "todos":
          // Returns all todos with descriptions, statuses, completion summaries
          return formatAllTodos(db.getTodos(session.id));
        case "iterations":
          // Returns full iteration history with summaries and decisions
          return formatAllIterations(db.getIterations(session.id));
        case "task":
          // Returns specific task detail: input, output summary, recommendations, status
          return formatTaskDetail(db.getTask(args.task_id));
        case "notes":
          // Returns all notes, optionally filtered by keyword
          return formatNotes(db.getNotes(session.id), args.keyword);
      }
    }
  }
}
```

The `system` field in `session.prompt()` is **appended** to the agent's registered base prompt by the OpenCode server (agent prompt first, then environment/instructions, then the `system` value). This means:
- The `agentz` base prompt provides stable identity and universal constraints
- Skill-specific protocol, task context, and output format go in `system` at dispatch time
- This matches the pattern used by oh-my-opencode's `delegate_task` tool

The SDK also provides `session.prompt_async()` (returns `204: void`) for fire-and-forget dispatch. This is noted as an available SDK capability but is **not used in v1** — all dispatch is synchronous via `session.prompt()`. Concurrent dispatch using `prompt_async()` is a v2 concern (see review Finding #7 decision).

## 11. Configuration

```yaml
# .opencode/agentz.yaml (or in opencode.json under "agentz" key)
agentz:
  # Minimum recommended tier for orchestrator model capability check (see Section 7)
  orchestrator_tier: balanced

  tiers:
    fast-cheap:
      model: "haiku"
      rating: S
      escalate_to: "balanced"
    balanced:
      model: "sonnet"
      rating: M
      escalate_to: "powerful"
    powerful:
      model: "opus"
      rating: L
      escalate_to: null  # no further escalation — surface to user
    reasoning:
      model: "o3"
      rating: XL
      escalate_to: null

  # Override default mapping for specific categories
  mapping_overrides:
    architect-db: { tier: "reasoning" }
    audit-security: { tier: "balanced" }

  # Session defaults
  defaults:
    max_iterations: 50
    max_review_cycles: 2  # review-rework cycles before escalating to user
    output_format: "markdown"
```

## 12. Skill File Structure

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

**IMPORTANT:** The `## Summary` section MUST be the first section in every output file. The synthesizer's breadth scan reads only this section during its first pass — it must be self-contained and understandable without the rest of the file.

## Summary
<2-5 sentence summary — self-contained, covers what was done, key decisions, notable findings>

## Details
<Full work output — can be arbitrarily long>

## Artifacts
<Files created/modified with paths>

## Recommendations
- ADD_TODO: <description> [priority: high|medium|low] [category: <task-category>]
- ADD_NOTE: <key insight for future iterations>
- NEEDS_REVIEW: <what needs human review and why>

### Note Quality Guidelines

ADD_NOTE is for **durable insights and constraints** that future iterations need — not status updates.

**Good notes** (persist across iterations, inform future decisions):
- "User prefers PostgreSQL over MySQL"
- "Auth system uses JWT with RS256 signing"
- "CI pipeline requires Node 20+"
- "The payments module has no test coverage — handle carefully"

**Bad notes** (duplicates todo/task status, adds noise):
- "Started working on API endpoints"
- "Database schema completed successfully"
- "Dispatched frontend developer"

Notes are always shown in the orchestrator's working view and are never pruned. Keep them high-signal.

### Completion Report (return to orchestrator)

STATUS: completed|failed|needs_input
OUTPUT: {{output_path}}
SUMMARY: <2-5 sentences — same as Summary section above>
RECOMMENDATIONS:
<same as Recommendations section above>
QUESTIONS: (only when STATUS is needs_input)
<numbered list of questions for the user>

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

## 13. Autocompact Resilience

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

Ensures the orchestrator always has current agentz state regardless of compaction. Uses the working view (Section 7) to keep injected state compact.

```typescript
"experimental.chat.system.transform": async ({ sessionID }, output) => {
  const session = db.getActiveSessionByOpenCodeId(sessionID);
  if (!session) return;
  output.system.push(buildWorkingView(session));
  // buildWorkingView() returns the pruned state block:
  // goal, incomplete todos + completed count, last 3 iterations, all notes, last task
}
```

### Subagent Compaction

Subagents spawned via `agentz_dispatch` run in isolated context. The parent's compaction does not affect a running child agent. When the child returns its result, the parent's post-compact context has Hook 3 re-injecting agentz state, so it knows to store the result and continue the iteration loop.

### Compaction During a Running Task

If compaction happens while waiting for a spawned agent to complete:

1. The running task is tracked in DB with `status: "running"`
2. Post-compact, Hook 3 injects the current state including the running task
3. The LLM sees: "Task X is running (skill: backend-developer). Await its result."
4. When the subagent returns, the orchestrator processes the result normally

## 14. Interruption & Resume

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

Note: The `failed` state shown here is the **terminal** failure — when the escalation ladder in `agentz_dispatch` has been exhausted (see Section 6, Failure Handling). Transient and capability retries happen transparently inside the dispatch tool and are not visible in the state diagram. The `retries` and `final_tier` fields on the `tasks` table record what happened internally.

```
                    ┌──────────┐
                    │ pending  │
                    └────┬─────┘
                         │
                    ┌────▼─────┐
              ┌─────┤in_progress├─────┬──────────┐
              │     └────┬─────┘     │          │
              │          │           │          │
         ┌────▼───┐ ┌───▼────┐ ┌───▼────────┐ │
         │ failed │ │completed│ │interrupted │ │
         └────────┘ └───┬────┘ └─────┬───────┘ │
                        │            │     ┌────▼──────┐
                   ┌────▼──────┐  ┌──▼─────┐ │needs_input│
                   │needs_rework│  │retrying│ └────┬──────┘
                   └────┬──────┘  └──┬─────┘      │ user responds
                        │            │        ┌────▼─────┐
                   (new rework   ┌───▼────┐   │in_progress│ (resume child session)
                    todo created)│completed│   └──────────┘
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

State transitions:
- `pending` → `in_progress`
- `in_progress` → `failed` | `completed` | `interrupted` | `needs_input`
- `failed` → `pending` (user chose retry/rephrase — new task created) | stays `failed` (user chose skip — todo cancelled)
- `interrupted` → `retrying` → `completed`
- `needs_input` → `in_progress` (when user responds, resume child session)
- `completed` → `needs_rework` (when a subsequent change request invalidates it)
- `needs_rework` triggers creation of a new rework todo
