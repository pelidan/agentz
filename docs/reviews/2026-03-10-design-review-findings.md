# Agentz Design Review Findings

Review of: `docs/plans/2026-03-09-agentz-orchestration-framework-design.md`
Date: 2026-03-10

---

## How to Use This Document

Each finding is a self-contained item with context, concern, and a suggested direction. Work through them one by one — analyze, decide, and record the decision inline. Mark status as you go.

**Status key:**
- `[ ]` — Not yet addressed
- `[~]` — Under discussion / needs more info
- `[x]` — Decided (record decision below the finding)
- `[-]` — Dismissed (record reason below the finding)

---

## Critical (Blocks Implementation)

### 1. [ ] Agent Spawning Mechanism Is Unspecified

**Design reference:** Section 9, lines 402-409

**Concern:** The plan says agents are spawned via "OpenCode's `@general` subagent system" and describes the plugin constructing prompts and setting models programmatically. However, the plugin SDK's `Hooks` interface does not expose a direct "spawn subagent" API. Subagents in OpenCode are spawned via `SubtaskPartInput` message parts — meaning the *LLM* decides to invoke the Task tool, not the plugin code.

This creates a fundamental question: is the orchestrator a **prompt** that instructs the LLM to use the Task tool (like superpowers does), or is it **plugin code** that programmatically spawns subagents via the SDK? The design reads like the latter, but the SDK may not support it.

**Impact:** If the spawning mechanism doesn't work as assumed, the entire iteration loop (Section 6) and the model-per-tier assignment (Section 3) need to be redesigned.

**Suggested direction:** Run a spike to validate what the SDK actually supports. If programmatic spawning isn't available, the cleanest alternative is registering a custom `agentz_dispatch` tool (via the `tool` hook) that the LLM calls. The tool implementation would handle prompt construction, model selection, DB tracking, and result collection — giving the plugin full control while letting the LLM trigger dispatch naturally.

**Decision:**

---

### 2. [ ] Superpowers Plugin Coexistence

**Design reference:** Section 9, lines 366-389

**Concern:** The superpowers plugin already uses `experimental.chat.system.transform` to inject its bootstrap content into every LLM call. Agentz would be a second plugin doing the same. Both hooks are additive (`output.system.push(...)`), so they won't break each other technically, but:

- The combined system prompt could become very large (superpowers bootstrap + agentz state).
- The instructions conflict: superpowers tells the LLM to use skills like brainstorming, TDD, and debugging workflows; agentz tells it to be a "pure task processor" that delegates everything to specialists.
- Superpowers' `using-superpowers` skill is wrapped in `<EXTREMELY_IMPORTANT>` tags, which may override agentz's orchestrator instructions in the LLM's attention.

**Impact:** Unpredictable LLM behavior when both plugins are active. The orchestrator may try to follow superpowers workflows instead of its own iteration loop, or vice versa.

**Suggested direction:** Define the integration boundary explicitly. Options:
- (a) Agentz replaces superpowers entirely when a session is active (disable superpowers injection during orchestration).
- (b) Agentz skills are registered as superpowers skills, making them part of the same system.
- (c) Agentz is designed to work independently of superpowers — the user chooses one or the other.
- (d) The base orchestrator prompt explicitly acknowledges superpowers skills and delegates to them when appropriate.

**Decision:**

---

## High Priority (Significant Design Gaps)

### 3. [ ] No Task Failure / Retry Strategy

**Design reference:** Section 6 (iteration loop), Section 13 (interruption only)

**Concern:** The design handles user interruption thoroughly but says nothing about what happens when a subagent **fails**. A subagent could:
- Hit its own context limit mid-work
- Return `STATUS: failed` with no useful information
- Fail to write the output file
- Return garbled/incomplete output
- Time out or crash

The task state diagram (Section 13) shows `failed` as a terminal state with no outgoing transitions. The iteration loop (Section 6, step 3) has no failure branch.

**Impact:** A single task failure could stall the entire session with no recovery path.

**Suggested direction:** Add a failure policy:
- Automatic retry (1-2 attempts) with the same config
- On repeated failure, escalate to a higher tier model
- For simple tasks that fail unexpectedly, let the orchestrator attempt inline
- After N failures on the same todo, pause the session and surface the failure to the user
- Add a `retries` counter to the `tasks` table

**Decision:**

---

### 4. [ ] Orchestrator State Prompt Can Grow Unbounded

**Design reference:** Section 6 (what the orchestrator sees per iteration), Section 9 (system prompt hook)

**Concern:** The orchestrator state is injected into every LLM call via the system prompt. This state includes: goal, all todos (with summaries), full iteration history, all notes, and recent task summaries. As sessions grow:
- 50 todos with descriptions and completion summaries
- 30+ iteration summaries
- 20+ notes
- 10+ recent task summaries

This could easily reach 3,000-5,000 tokens injected on every LLM call — including calls that have nothing to do with agentz (if the user asks a quick question in the same OpenCode session).

**Impact:** Wasted tokens, potential context pressure, slower responses for non-orchestration queries.

**Suggested direction:** Implement a "working view" with a token budget:
- Only show incomplete todos + last N completed ones (not all 50)
- Only show the last M iteration summaries (not the full history)
- Only show notes tagged as "active" or recent
- Set a hard cap (e.g., 2,000 tokens) on the injected state, with a "full state available via DB" note
- For non-orchestration queries (user asks a quick question), inject only a minimal "session active, use /agentz-status for details" line

**Decision:**

---

### 5. [ ] Synthesizer Context Overflow on Large Sessions

**Design reference:** Section 4 (synthesizer role), Section 7 (synthesizer access)

**Concern:** The synthesizer reads **all** output files for the session to build a holistic view. For a 20-task session where each output is 2,000-5,000 tokens, the synthesizer would need to ingest 40,000-100,000 tokens of prior outputs. This could exceed the synthesizer agent's context window, especially if it's running on a `balanced` tier model.

**Impact:** Synthesizer fails or produces shallow review on complex sessions — exactly the sessions where deep synthesis matters most.

**Suggested direction:** Give the synthesizer a tiered reading strategy:
- Small sessions (< 5 tasks): read all outputs in full
- Medium sessions (5-15): read the Summary sections first, then selectively read full Details for flagged items
- Large sessions (15+): work from summaries + notes only, reading full outputs only for specific concerns
- Consider running the synthesizer on the `powerful` tier for large sessions regardless of the default mapping

**Decision:**

---

### 6. [ ] No User Visibility During Execution

**Design reference:** Sections 6, 9

**Concern:** The plan describes the orchestrator's internal loop but never mentions what the user sees during execution. Questions unanswered:
- Does the user see subagent outputs streaming?
- Does the orchestrator print progress updates between iterations?
- Can the user interact with the session while tasks are running?
- What does `/agentz-status` show if called mid-execution?

**Impact:** Users have no feedback on whether their complex task is progressing, stuck, or going in the wrong direction. This breaks trust and makes the system feel like a black box.

**Suggested direction:**
- After each iteration, the orchestrator should output a brief progress line to the conversation (e.g., "Completed: Design DB schema [3/7 todos done]. Next: Implement API endpoints.")
- Use OpenCode's built-in todo system (`EventTodoUpdated`) to show progress in the UI sidebar
- Make `/agentz-status` work mid-execution with real-time state from the DB
- Consider a "verbose mode" config option that shows more detail per iteration

**Decision:**

---

## Medium Priority (Design Improvements)

### 7. [ ] Resolve or Remove Parallel Task Execution

**Design reference:** Section 10, line 430 (`max_concurrent_tasks: 1`)

**Concern:** The config exposes `max_concurrent_tasks` (defaulting to 1), implying parallel execution is planned. But the design never describes:
- How the orchestrator picks multiple todos in one iteration
- How results from concurrent tasks are collected (wait-all? first-complete?)
- How cross-task dependencies are expressed and enforced (Todo B needs Todo A's output)
- How the DB state handles multiple `running` tasks

Half-designed parallelism is worse than no parallelism — it creates false expectations and untested code paths.

**Impact:** Config option suggests a capability that doesn't exist. If implemented naively, concurrent tasks could read stale state or produce conflicting outputs.

**Suggested direction:** Either:
- (a) Remove `max_concurrent_tasks` from config and commit to sequential execution. Sequential is simpler, still powerful, and avoids a class of coordination bugs. Parallelism can be added later as a v2 feature.
- (b) Design the parallel execution model properly: dependency graph between todos, a dispatcher that selects independent todos, a collector that waits and merges results, and conflict resolution for shared files.

Option (a) is strongly recommended for v1.

**Decision:**

---

### 8. [ ] Orchestrator Minimum Model Tier

**Design reference:** Section 3 (tier system), Section 6 (orchestrator design)

**Concern:** The orchestrator makes routing decisions: it categorizes tasks, selects tiers, picks skills, processes recommendations, and manages the todo list. The quality of these decisions depends on the primary model's capability. But the orchestrator runs on whatever model the user has configured as their primary — which could be `haiku` or another cheap/fast model.

A weak orchestrator model could:
- Miscategorize tasks (sending architecture work to `fast-cheap`)
- Poorly decompose the goal into todos
- Fail to process subagent recommendations correctly
- Miss inconsistencies that should trigger rework

**Impact:** The whole system is only as good as its orchestrator. A cheap model orchestrating expensive specialists is wasteful.

**Suggested direction:** Either:
- (a) Specify a minimum tier for the orchestrator (at least `balanced`) — the plugin overrides the model for orchestrator iterations
- (b) Document clearly that orchestrator quality depends on the primary model, and recommend `balanced` or above
- (c) Use a dedicated orchestrator model config separate from the user's primary model

**Decision:**

---

### 9. [ ] Separate Protocol from Domain Skills

**Design reference:** Section 11 (skill file structure)

**Concern:** Each skill file contains both behavioral instructions (how the agent should think — its domain expertise) and protocol specifications (output format, completion report structure, spawning rules, template variables). This means:
- Changing the output protocol requires editing all 15 skill files
- The protocol sections are identical across skills, creating maintenance overhead
- Domain experts writing skill content need to understand the protocol details

**Impact:** Maintenance burden scales linearly with number of skills. Protocol changes are error-prone.

**Suggested direction:** Split into two layers:
- A **shared protocol template** that defines: output format, completion report structure, spawning rules, context injection, template variables. Maintained once.
- **Domain skill files** that define only: role, capabilities, constraints, and domain-specific instructions.
- The plugin composes at spawn time: `protocol template + domain skill = full agent prompt`

**Decision:**

---

### 10. [ ] No Structured Output Validation

**Design reference:** Section 7 (communication protocol)

**Concern:** The completion report is a loosely structured text format (`STATUS: ...\nOUTPUT: ...\nSUMMARY: ...`). The orchestrator (an LLM) must parse this from the subagent's response. There's no validation that:
- The output file was actually written
- The STATUS field is present and valid
- The SUMMARY respects the "2-5 sentences, hard limit"
- The RECOMMENDATIONS use the correct format (`ADD_TODO`, `ADD_NOTE`, `NEEDS_REVIEW`)

LLMs are unreliable text parsers, especially for their own outputs.

**Impact:** Silent failures where the orchestrator misinterprets a report, ignores recommendations, or marks a failed task as complete.

**Suggested direction:**
- Have the plugin code (not the LLM) validate the completion report before passing it to the orchestrator
- Check file existence at `output_path`
- Parse and validate the structured fields programmatically
- If validation fails, flag the task for retry
- Consider a more structured format (JSON or YAML) for the completion report instead of the freeform text

**Decision:**

---

### 11. [ ] SQLite Resilience

**Design reference:** Section 8 (persistence schema)

**Concern:** The entire system's state lives in a single SQLite file. If the file gets corrupted (crash during write), locked (concurrent access from multiple OpenCode instances), or deleted, the orchestrator loses all session state with no recovery.

**Impact:** Data loss on a long-running session is catastrophic — hours of orchestrated work gone.

**Suggested direction:**
- Enable WAL (Write-Ahead Logging) mode for better crash resilience and read concurrency
- Add a periodic JSON export of session state to the filesystem as a lightweight backup
- The filesystem outputs (`output.md` files) already survive independently — document that they can be used for manual recovery
- Consider adding a `PRAGMA integrity_check` on startup

**Decision:**

---

## Lower Priority (Nice-to-Haves & Edge Cases)

### 12. [ ] "Always-On" Orchestrator May Annoy Users

**Design reference:** Section 6 (complexity decision), Section 9 (always-on)

**Concern:** The orchestrator is injected into every conversation. It makes a subjective "complexity decision" on every user request. Users might find it frustrating if:
- The orchestrator creates a session for something the user considers simple
- The orchestrator handles something directly when the user wanted full orchestration
- The base prompt (even when lean) adds latency or noise to simple questions

**Suggested direction:**
- Add an explicit opt-out: a way to say "just do it directly" (e.g., prefix with `!` or a `/direct` command)
- Add an explicit opt-in: `/agentz start <goal>` for when the user definitely wants orchestration
- Keep the auto-detection as the default but make the threshold configurable
- Consider a confirmation step: "This looks complex — should I create an orchestration session? [Y/n]"

**Decision:**

---

### 13. [ ] No Session Cleanup / Archival Strategy

**Design reference:** Section 8 (filesystem structure)

**Concern:** Sessions accumulate in `.agentz/sessions/` and the SQLite DB indefinitely. Over time:
- The DB grows with completed/stale sessions
- The filesystem fills with output files from old sessions
- `/agentz-list` shows an ever-growing list

**Suggested direction:**
- Add `/agentz-clean` command to remove completed sessions older than N days
- Auto-archive sessions after completion (move to `.agentz/archive/`)
- Add a `max_sessions` config option
- Consider TTL on session data

**Decision:**

---

### 14. [ ] Cross-Session Learning Is Missing

**Design reference:** Section 8 (notes table)

**Concern:** Notes are session-scoped. Insights learned in one session (e.g., "this project uses PostgreSQL", "auth is JWT-based", "the team prefers tabs over spaces") are lost when the session ends. The next session starts from zero.

**Suggested direction:**
- Add a `global_notes` table (not tied to a session) for project-level knowledge
- Allow the orchestrator or any agent to promote a session note to a global note
- Inject relevant global notes into new sessions automatically
- This creates a lightweight "project memory" that improves over time

**Decision:**

---

### 15. [ ] Leaf Agent "Freely Spawnable" Could Be Expensive

**Design reference:** Section 5 (spawning model)

**Concern:** Leaf agents (local-explorer, web-explorer) can be spawned "freely" by anyone. There's no limit on how many a single non-leaf agent can spawn. An agent doing broad exploration could spawn 10+ leaf agents, each consuming a model call. Even at `fast-cheap` tier, this adds up.

**Suggested direction:**
- Add a per-task limit on leaf agent spawns (e.g., max 5 per non-leaf agent)
- Track leaf agent costs in the DB for visibility
- Consider whether some leaf operations (single grep, single file read) should just be direct tool calls instead of spawning an agent

**Decision:**

---

## Strengths Worth Preserving

These aspects of the design are strong and should be carried forward as-is:

1. **Subagent-writes-output model** (Section 7) — Clean separation, orchestrator stays lean.
2. **DB-first state management** — Source of truth is the database, not conversation history.
3. **Clean context per iteration** — Each iteration loads from DB, not accumulated chat.
4. **Tier abstraction** — Semantic tiers decoupled from concrete models.
5. **Interruption/resume handling** (Section 13) — Two-case distinction with business-analyst for change analysis.
6. **Autocompact resilience** (Section 12) — Three-hook strategy is thorough.
7. **Rework tracking** (`rework_of` in todos) — Good lineage for invalidation chains.
8. **Adaptive synthesizer complexity** — Scales review depth with task complexity.
