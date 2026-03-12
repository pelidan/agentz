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

### 1. [x] Agent Spawning Mechanism Is Unspecified

**Design reference:** Section 10, lines 402-409

**Concern:** The plan says agents are spawned via "OpenCode's `@general` subagent system" and describes the plugin constructing prompts and setting models programmatically. However, the plugin SDK's `Hooks` interface does not expose a direct "spawn subagent" API. Subagents in OpenCode are spawned via `SubtaskPartInput` message parts — meaning the *LLM* decides to invoke the Task tool, not the plugin code.

This creates a fundamental question: is the orchestrator a **prompt** that instructs the LLM to use the Task tool (like superpowers does), or is it **plugin code** that programmatically spawns subagents via the SDK? The design reads like the latter, but the SDK may not support it.

**Impact:** If the spawning mechanism doesn't work as assumed, the entire iteration loop (Section 6) and the model-per-tier assignment (Section 3) need to be redesigned.

**Suggested direction:** Run a spike to validate what the SDK actually supports. If programmatic spawning isn't available, the cleanest alternative is registering a custom `agentz_dispatch` tool (via the `tool` hook) that the LLM calls. The tool implementation would handle prompt construction, model selection, DB tracking, and result collection — giving the plugin full control while letting the LLM trigger dispatch naturally.

**Decision:**

**Approach: Single `agentz` agent + custom `agentz_dispatch` tool.**

The plugin registers one agent (`agentz`, mode `"subagent"`) with a lean base prompt (identity, safety boundaries, output format expectations). Dispatch is handled by a custom `agentz_dispatch` tool registered via the plugin's `tool` hook. The orchestrator LLM calls this tool naturally to spawn skill-specific sub-sessions.

Dispatch flow: the tool creates a child session via `client.session.create({ parentID })`, selects a model from tier config, composes the system prompt (protocol + skill content + task context), and calls `session.prompt()` with per-prompt `model`, `system`, and `tools` overrides. It then awaits completion, validates output, updates DB, and returns the completion report.

Key SDK facts verified:
- `SessionPromptData` supports per-prompt `model`, `system`, and `tools` overrides
- The `system` field is **appended** to the agent's registered prompt (not an override) — agent prompt first, then environment/instructions, then the `system` value
- `SessionPromptAsyncData` provides a fire-and-forget variant for future async dispatch
- This matches oh-my-opencode v3.2.2's `delegate_task` pattern exactly

Design plan updated: Sections 5 and 9 now reflect the `agentz_dispatch` tool mechanism, replacing the previous `@general` subagent reference.

---

### 2. [x] Superpowers Plugin Coexistence

**Design reference:** Section 10, lines 366-389

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

**Approach: Absorb and Replace — agentz subsumes superpowers.**

Agentz becomes the primary workflow framework. The superpowers plugin is disabled when agentz is active and eventually retired. Superpowers' valuable process disciplines (brainstorming rigor, TDD, systematic debugging, verification-before-completion) are ported into agentz skill files rather than discarded.

**Injection conflict resolution:** Agentz's `chat.system.transform` hook suppresses superpowers' injection when the agentz plugin is active. Only one meta-cognitive framework injects at a time — there is no coexistence mode.

**Brainstorming is analyst-mediated, not orchestrator-owned.** Interactive brainstorming is dispatched to a `business-analyst` or `technical-analyst` agent with a brainstorming skill. This preserves the orchestrator's lean context principle. The flow:

1. Orchestrator evaluates complexity, decides brainstorming is needed.
2. Dispatches analyst agent with brainstorming skill.
3. Analyst returns `STATUS: needs_input` with questions for the user.
4. Orchestrator relays questions to user without interpreting them.
5. User responds. Orchestrator forwards raw response to the same analyst child session (session context persisted).
6. Analyst continues until `STATUS: complete`, producing a design document as its output file.
7. Orchestrator reads summary only, creates todos from the design output. Domain knowledge stays in the analyst's session and output files.

**New task state: `needs_input`** — task is paused awaiting user response. The orchestrator acts as a transparent relay (forwarding user text verbatim, not summarizing or interpreting). This keeps brainstorming context entirely out of the orchestrator.

**Design implications:**
- Task state diagram gains `needs_input` with transitions: `running → needs_input → running → complete`
- The `tasks` table gains `pending_questions` and `child_session_id` fields for multi-turn relay
- Analyst skill files carry ported brainstorming discipline (one question at a time, propose approaches, confirm direction)
- Other superpowers disciplines ported into relevant skill files: TDD into developer skills, debugging methodology into debugger skill, verification into synthesizer/verifier skills
- The `using-superpowers` meta-skill concept is retired — the orchestrator's complexity decision + skill-based dispatch replaces it

**Migration path:** During development, superpowers can remain active for non-agentz OpenCode sessions. Once agentz handles the full workflow spectrum, the superpowers plugin is retired.

Design plan updated: New Section 2 (Superpowers Coexistence Strategy) added. Section 7 (Orchestrator Design) updated with analyst-mediated brainstorming flow, `needs_input` branch in iteration loop. Section 8 (Communication Protocol) updated with `needs_input` status in completion reports. Section 9 (Persistence Schema) updated with `pending_questions` and `child_session_id` fields in tasks table. Section 14 (Interruption & Resume) updated with `needs_input` in task state diagram.

---

## High Priority (Significant Design Gaps)

### 3. [x] No Task Failure / Retry Strategy

**Design reference:** Section 7 (iteration loop), Section 14 (interruption only)

**Concern:** The design handles user interruption thoroughly but says nothing about what happens when a subagent **fails**. A subagent could:
- Hit its own context limit mid-work
- Return `STATUS: failed` with no useful information
- Fail to write the output file
- Return garbled/incomplete output
- Time out or crash

The task state diagram (Section 14) shows `failed` as a terminal state with no outgoing transitions. The iteration loop (Section 7, step 4) has no failure branch.

**Impact:** A single task failure could stall the entire session with no recovery path.

**Suggested direction:** Add a failure policy:
- Automatic retry (1-2 attempts) with the same config
- On repeated failure, escalate to a higher tier model
- For simple tasks that fail unexpectedly, let the orchestrator attempt inline
- After N failures on the same todo, pause the session and surface the failure to the user
- Add a `retries` counter to the `tasks` table

**Decision:**

**Approach: Smart Escalation Ladder inside `agentz_dispatch`.**

All retry logic lives inside the `agentz_dispatch` tool's `execute` function — the orchestrator never sees retries, only the final outcome. Each task gets at most 3 attempts with a fixed escalation sequence where each step changes exactly one variable for debuggability.

**Failure classification:** On failure, the dispatch tool classifies the error programmatically (not via LLM judgment):
- `transient` — timeout, abort, network error → retry same config first, then escalate tier
- `capability` — no completion report, missing output file, context limit → skip to tier escalation
- `systematic` — agent explicitly returned `STATUS: failed` with error message → surface to user immediately, no retries

**Tier escalation:** Each tier has a configurable `escalate_to` field (e.g., `fast-cheap → balanced → powerful → null`). When escalation is needed, the dispatch tool follows the chain. If `escalate_to` is `null`, the escalation step is skipped and the failure is surfaced to the user.

**User surface mechanism:** When the ladder is exhausted, the dispatch tool returns a structured failure report (STATUS, ERROR_TYPE, ERROR_DETAIL, ATTEMPTS, TIERS_TRIED). The orchestrator relays this to the user and pauses iteration — same flow as `needs_input`. User can retry, skip (cancel the todo), or rephrase the task.

**Schema changes:** The `tasks` table gains `retries` (INTEGER), `final_tier` (TEXT), `failure_classification` (TEXT), and `error_detail` (TEXT) fields.

**State diagram update:** `failed` is no longer terminal — it transitions to `pending` (user chose retry/rephrase, new task created) or stays `failed` with the todo cancelled (user chose skip).

Design plan updated: Section 4 (Tier System) gains Tier Escalation subsection with `escalate_to` config. Section 6 (Spawning Model) gains Failure Handling & Escalation Ladder subsection with classification table, ladder diagram, failure report format, and v1 scope boundaries. Section 7 (Iteration Loop) step 4 gains failure branch (step 4g). Section 8 (Communication Protocol) gains failure report format alongside completion report. Section 9 (Persistence Schema) `tasks` table gains `retries`, `final_tier`, `failure_classification`, `error_detail` fields. Section 11 (Configuration) tier config expanded to object format with `model` and `escalate_to`. Section 14 (Task States) diagram and transitions updated with recovery paths from `failed`.

---

### 4. [x] Orchestrator State Prompt Can Grow Unbounded

**Design reference:** Section 7 (what the orchestrator sees per iteration), Section 10 (system prompt hook)

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

**Approach: Working View with Rule-Based Pruning + On-Demand Query Tool.**

Replace `buildFullOrchestratorPrompt()` with `buildWorkingView()` — a function that extracts a pruned, actionable subset of session state from DB. Injected on every LLM call via the same `chat.system.transform` hook. No intent detection, no mode switching — the working view is compact enough (~800-1,300 tokens) that overhead is negligible even for non-orchestration queries.

**Pruning rules (fixed, no token counting):**
- **Goal:** Always shown in full
- **Incomplete todos:** Always shown with full description, priority, category
- **Completed todos:** Count-only line (`"N todos completed"`) — summaries pruned
- **Iteration history:** Last 3 iterations with full summary + decisions — older iterations pruned
- **Notes:** Always shown in full — notes are the cross-iteration memory that compensates for pruning everything else. Quality enforced via skill prompt guidance (good: durable insights and constraints; bad: status updates)
- **Task summaries:** Last completed task + any running task only — older task summaries pruned

**On-demand access for pruned data:** New `agentz_query` tool (registered alongside `agentz_dispatch`) lets the orchestrator pull full state sections from DB when needed. Parameters: `section` (todos|iterations|task|notes), optional `task_id`, optional `keyword` filter. Reads directly from DB, returns formatted text.

**Why not intent detection?** Classifying whether a user message is "orchestration-related" vs "casual question" is fragile — edge cases are genuinely ambiguous ("the tests are failing" could be either). The working view eliminates the classification problem: always inject, keep it cheap.

**Token impact (50-todo, 30-iteration session):** ~840-1,350 tokens (working view) vs ~3,350-5,700 tokens (unbounded). A 3-4x reduction.

Design plan updated: Section 7 (Orchestrator Design) gains "Working View" subsection replacing the old "What the Orchestrator Sees Per Iteration" with pruning rules, token budget table, and rendered example. Iteration loop step 1 updated to reference working view. Section 10 (Plugin Integration) gains `agentz_query` tool registration, hook code updated from `buildFullOrchestratorPrompt` to `buildWorkingView`. Section 12 (Skill File Structure) gains note quality guidelines. Section 13 (Autocompact Resilience) Hook 3 updated to reference `buildWorkingView`.

---

### 5. [x] Synthesizer Context Overflow on Large Sessions

**Design reference:** Section 5 (synthesizer role), Section 8 (synthesizer access)

**Concern:** The synthesizer reads **all** output files for the session to build a holistic view. For a 20-task session where each output is 2,000-5,000 tokens, the synthesizer would need to ingest 40,000-100,000 tokens of prior outputs. This could exceed the synthesizer agent's context window, especially if it's running on a `balanced` tier model.

**Impact:** Synthesizer fails or produces shallow review on complex sessions — exactly the sessions where deep synthesis matters most.

**Suggested direction:** Give the synthesizer a tiered reading strategy:
- Small sessions (< 5 tasks): read all outputs in full
- Medium sessions (5-15): read the Summary sections first, then selectively read full Details for flagged items
- Large sessions (15+): work from summaries + notes only, reading full outputs only for specific concerns
- Consider running the synthesizer on the `powerful` tier for large sessions regardless of the default mapping

**Decision:**

**Approach: Three-Pass Synthesizer — Breadth-First, Targeted Depth, Then Knowledge Curation.**

The synthesizer works in two explicit phases, instructed by its skill file. No architectural changes to the dispatch system or orchestrator loop.

**Pass 1 — Breadth Scan:** Reads every task's completion report summary (from DB) and the `## Summary` section from each output file. Builds a coverage map and produces an explicit deep-read target list with reasons before proceeding to Pass 2.

**Pass 2 — Targeted Deep Reads:** Reads full output files only for flagged tasks — typically 3–8 out of 20. Selection heuristics encoded in the skill prompt: tasks touching shared interfaces, tasks flagged with `NEEDS_REVIEW`, tasks in overlapping domains, highest-complexity tasks by tier.

**Token budget (20-task session):** ~29,000 tokens (two-pass) vs ~83,000 (full read). Comfortably within 128K context. Even a 40-task session stays under 50K.

**Key convention enforced:** All agent output files must start with a `## Summary` section — self-contained, 2–5 sentences, understandable without the rest of the file. This enables the breadth scan. Made an explicit hard requirement in Section 12 (Skill File Structure).

**Future improvement (v2):** Mid-session synthesis checkpoint for sessions with 10+ todos — a single synthesis step at the ~50% mark to catch coherence issues before downstream tasks build on flawed assumptions. Not in v1 scope.

Design plan updated: Section 5 (Agent Taxonomy) synthesizer description updated. Section 7 (Orchestrator Design) Fixed Todo Items table and synthesizer paragraph updated. Section 8 (Communication Protocol) "Synthesizer Access" replaced with "Synthesizer Reading Strategy" subsection containing two-pass mechanics, token budget table, `## Summary` requirement, and future improvement note. Section 12 (Skill File Structure) output template updated with explicit `## Summary` requirement and rationale.

---

### 6. [x] No User Visibility During Execution

**Design reference:** Sections 7, 10

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

**Decision:** Resolved with **Three-Layer Passive Visibility** — no active user interaction during execution, but three complementary feedback channels:

1. **Layer 1 — Live Task Status via `ctx.metadata()`**: The `agentz_dispatch` tool calls `ctx.metadata({ title, metadata })` at each orchestrator iteration to stream real-time status into the OpenCode TUI. The title shows a one-line summary (e.g., `"Designing DB schema [3/7]"`), and metadata carries structured fields (current todo, iteration count, phase). This uses the same `message.part.updated` event mechanism that the built-in Bash tool uses for streaming output.

2. **Layer 2 — Sidebar Todo Sync via `Todo.update()`**: After each task completes, the dispatch tool programmatically syncs agentz todo state to OpenCode's built-in todo sidebar using the internal `Todo.update()` function (not LLM-driven todowrite). Status mapping: `pending` → `pending`, `in_progress`/`running` → `in_progress`, `done` → `completed`, `failed`/`blocked` → `pending` (with `[FAILED]`/`[BLOCKED]` prefix). Sync triggers: task status change, new todos added, dispatch start, dispatch end.

3. **Layer 3 — On-Demand `/agentz-status` Slash Command**: Reads directly from the DB and outputs a formatted catch-up report containing: goal summary, todos with status markers, recent activity log (last 5 completed items), active notes/decisions, and any failures. Works mid-execution and after completion. Specified in full in Section 10 (Plugin Integration).

Additionally, the orchestrator system prompt includes a soft instruction to print a one-line progress summary between iterations (specified in Section 7, "Progress Summary Instruction").

Design plan updated: Section 6 (Spawning Model) dispatch flow steps 3 and 8 added, "User Visibility During Dispatch" subsection with metadata lifecycle table, "Sidebar Todo Sync" subsection with mechanism, status mapping, and sync triggers. Section 7 (Orchestrator Design) "Progress Summary Instruction" subsection added. Section 10 (Plugin Integration) `/agentz-status` expanded to full specification with output format, rendered example, and implementation note.

---

## Medium Priority (Design Improvements)

### 7. [x] Resolve or Remove Parallel Task Execution

**Design reference:** Section 11, line 430 (`max_concurrent_tasks: 1`)

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

**Approach: Sequential v1 + Schema Prep for Future Parallelism.**

Remove `max_concurrent_tasks` from the v1 config. The orchestrator dispatches exactly one task per iteration — no concurrent execution, no collection semantics, no dependency resolution. This is a deliberate commitment, not a deferral.

**Schema prep (zero-cost foundation for v2):** Add a `depends_on` column to the `todos` table:

```sql
depends_on TEXT, -- JSON array of todo IDs; nullable, unused in v1 (schema prep for v2 parallel dispatch)
```

This column is nullable, defaults to null, and is completely ignored by v1 logic. Its presence means v2 parallelism won't require a schema migration on existing databases.

**What gets removed:**
- `max_concurrent_tasks` from the config schema (Section 11)

**What gets clarified:**
- The `session.prompt_async()` mention (Section 6) is kept as a factual note about SDK capability but explicitly marked as "not used in v1"

**What stays unchanged:**
- The iteration loop (Section 7) remains strictly sequential — one todo picked, one dispatch, one result processed per iteration
- `agentz_dispatch` remains synchronous (`session.prompt()` only)
- The escalation ladder operates on a single task at a time

**Why not v1 parallelism:** The effort estimate is 5-15 days depending on approach, with significant design surface (dependency specification, conflict resolution, concurrent failure semantics, multi-task TUI visibility). The sequential loop's bottleneck is LLM latency per call, not serial dispatch — and parallelism multiplies token cost and debugging complexity. The value is real but situational (independent modules, parallel research), and doesn't justify the risk for v1.

**v2 parallelism requirements (for future design phase):**
- Dependency graph between todos (using the `depends_on` column)
- Independent-todo selection algorithm (topological sort on the DAG)
- `session.prompt_async()` based concurrent dispatch with barrier collection
- Domain isolation strategy for conflict avoidance
- Multi-task `ctx.metadata()` visibility
- Concurrent failure/escalation semantics

**Design plan changes:** Section 9 `todos` table gains `depends_on TEXT` column (nullable, v2 prep). Section 11 `max_concurrent_tasks` removed from config. Section 6 `session.prompt_async()` note clarified as not used in v1.

---

### 8. [x] Orchestrator Minimum Model Tier

**Design reference:** Section 4 (tier system), Section 7 (orchestrator design)

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

**Approach: Intentionally cheap/free orchestrator — no minimum tier, no warning.**

The concern's premise was invalidated by subsequent findings. Finding #10 outsourced triage to the `triage-analyst` agent, and Finding #14 made recommendation processing fully programmatic within the `agentz_dispatch` tool. After these changes, the orchestrator no longer categorizes tasks, selects tiers, picks skills, or processes recommendations — those responsibilities now live in specialist agents and plugin code.

The orchestrator's remaining responsibilities are near-mechanical: 8-9 of 11 are fully deterministic (pick next todo by priority, look up tier+skill from mapping table, call dispatch, process structured results, relay `needs_input`, relay failures, apply re-triage heuristic, print progress). The 2-3 subjective calls that remain (complexity decision, "non-trivial" check for code review, re-triage timing) are simple binary judgments well within `fast-cheap` model capability.

**No minimum tier check.** No warning mechanism. No `rating` attribute on tiers. No `orchestrator_tier` config field. No `warning_shown` session tracking. The orchestrator intentionally runs on whatever model the user configures — including free models — because its role does not require strong reasoning.

**V2 direction is open.** If real-world usage reveals orchestrator judgment gaps, v2 could either (a) replace the orchestrator LLM with a pure code state machine (pushing further toward mechanical), or (b) move to a stronger model and absorb triage/synthesizer roles back into the orchestrator (pulling toward a smarter coordinator). V1 data will inform this choice. See Section 15.

**Design plan changes:** Section 4 tier table: `Rating` column removed. Section 7: "Model Capability Check" subsection removed; "v2 consideration" paragraph updated to reflect cheap/free model intent. Section 9: `warning_shown` removed from `sessions` table. Section 11: `orchestrator_tier` config removed; `rating` fields removed from tier config objects. Section 15: rewritten to present open-ended v2 options.

---

### 9. [x] Separate Protocol from Domain Skills

**Design reference:** Section 12 (Protocol & Skill Architecture)

**Concern:** Each skill file contains both behavioral instructions (how the agent should think — its domain expertise) and protocol specifications (output format, completion report structure, spawning rules, template variables). This means:
- Changing the output protocol requires editing all 15 skill files
- The protocol sections are identical across skills, creating maintenance overhead
- Domain experts writing skill content need to understand the protocol details

**Impact:** Maintenance burden scales linearly with number of skills. Protocol changes are error-prone.

**Suggested direction:** Split into two layers:
- A **shared protocol template** that defines: output format, completion report structure, spawning rules, context injection, template variables. Maintained once.
- **Domain skill files** that define only: role, capabilities, constraints, and domain-specific instructions.
- The plugin composes at spawn time: `protocol template + domain skill = full agent prompt`

**Decision:** Adopted **Approach A: TypeScript Types + Renderer**. Section 12 has been fully rewritten as "Protocol & Skill Architecture" with three components:

1. **TypeScript type definitions** (`types.ts`) — `CompletionReport`, `FailureReport`, `OutputFile`, `TaskContext`, `Recommendation` types serve as the single source of truth for all structured formats.
2. **Protocol renderer** (`renderProtocol()`) — generates prose protocol instructions from types at spawn time. One shared protocol for all agents (100% shared — no agent-class variants). Leaf vs non-leaf behavioral differences are enforced by toolset availability, not protocol prose.
3. **Output validator** (`validateCompletionReport()`) — binary pass/fail validation using generous thresholds (e.g., allows up to 10 sentences while prompt guidance says 2-5). Validation failures trigger the existing escalation ladder as `capability` classification.

Domain skill files contain only: role definition, behavioral instructions, and domain expertise. No protocol knowledge required. Prompt composition at spawn time: `renderProtocol() + loadSkill(skill) + renderTaskContext(task)`.

This also substantially addresses Finding #10 (No Structured Output Validation) — the same types that generate protocol prose power programmatic validation. Finding #10 remains open for explicit confirmation in a future pass.

Cross-references updated: Sections 3, 6, 8, and 10 now reference the new Section 12 architecture.

---

### 10. [x] No Structured Output Validation

**Design reference:** Section 8 (communication protocol)

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

**Approach: Programmatic Parse-Validate-Process Pipeline — Zero Domain Leakage.**

Confirms and extends Finding #9's `validateCompletionReport()` into a complete pipeline where all structured data extraction, validation, and recommendation processing is handled by plugin code. The orchestrator LLM never parses raw completion reports, never sees recommendation content, and never touches output file internals. Freeform text format is retained (LLMs produce it naturally and reliably); parsing is the plugin's responsibility.

**Five components in the pipeline (all inside `agentz_dispatch`):**

1. **Completion Report Parser** (`parseCompletionReport()` in `src/protocol/parser.ts`) — extracts structured fields from freeform text using `STATUS:` as the anchor line. Strips markdown code fences and conversational preamble. When no completion report is detected (`found: false`), classified as `capability` error → escalation ladder.

2. **Extended Validator** (`validateCompletionReport()` in `src/protocol/validator.ts`) — extends Finding #9's spec with: no-report detection, output file structure validation (all four required `## ` sections must exist with `## Summary` first). Validation failures remain `capability` errors → escalation ladder.

3. **Output File Parser** (`parseOutputFile()` in `src/protocol/parser.ts`) — splits markdown by `## ` headings and maps to the four required sections. Used by the validator for structure checks and available to the synthesizer for reliable section extraction during breadth scan.

4. **Programmatic Recommendation Processing** — all recommendations applied by plugin code, zero orchestrator involvement:
   - `ADD_NOTE` → written to `notes` table immediately
   - `ADD_TODO` → written to `todos` table with agent-assigned priority/category
   - `NEEDS_REVIEW` → written to `review_items` table, surfaced when orchestrator decides timing is right
   - No dedup logic in v1 — duplicate todos are self-correcting at dispatch time (agent discovers work is done)
   - Orchestrator sees only action counts: `"2 todos added, 1 note recorded, 1 item flagged for review"`

5. **Structured Orchestrator Report** — `agentz_dispatch` returns a domain-free report instead of raw completion text: task status, summary (the only domain content — already accepted in existing design), output path, and action counts. The orchestrator makes orchestration decisions (continue, pause, surface reviews) without domain knowledge leakage.

**Key design principle — zero domain leakage:** Recommendation descriptions, NEEDS_REVIEW content, and output file internals never enter the orchestrator's context. Over a 20-task session with 2-3 recommendations each, this prevents 40-60 domain-specific lines from accumulating in the orchestrator — preserving its ability to focus on routing, prioritization, and iteration control.

**Schema changes:** `tasks` table gains `needs_review_count` (INTEGER). New `review_items` table for storing NEEDS_REVIEW content with a `surfaced` flag.

Design plan updated: Section 6 (Spawning Model) dispatch flow steps updated to 11-step parse→validate→process→present pipeline. Section 7 (Iteration Loop) step 4 rewritten — orchestrator receives domain-free structured report, recommendations pre-processed. Section 8 (Communication Protocol) gains "Programmatic Recommendation Processing" and "Structured Orchestrator Report" subsections. Section 9 (Persistence Schema) `tasks` table gains `needs_review_count`, new `review_items` table added. Section 12 (Protocol & Skill Architecture) gains `parser.ts` in file layout, `ParseResult` and `OutputFileParseResult` types, `parseCompletionReport()` and `parseOutputFile()` specs, extended validator checks table with output file structure validation and no-report detection.

---

### 11. [x] SQLite Resilience

**Design reference:** Section 9 (persistence schema)

**Concern:** The entire system's state lives in a single SQLite file. If the file gets corrupted (crash during write), locked (concurrent access from multiple OpenCode instances), or deleted, the orchestrator loses all session state with no recovery.

**Impact:** Data loss on a long-running session is catastrophic — hours of orchestrated work gone.

**Suggested direction:**
- Enable WAL (Write-Ahead Logging) mode for better crash resilience and read concurrency
- Add a periodic JSON export of session state to the filesystem as a lightweight backup
- The filesystem outputs (`output.md` files) already survive independently — document that they can be used for manual recovery
- Consider adding a `PRAGMA integrity_check` on startup

**Decision:**

**Approach: Pragmatic Hardening — WAL + Integrity Check + Session Lock + Documented Recovery.**

SQLite is the correct choice for an embedded local developer tool. The resilience concern is addressed with minimal hardening that covers the likely failure modes (crash during write, concurrent access) without building backup/recovery infrastructure that isn't justified for v1.

**Five components:**

1. **WAL mode + `synchronous=NORMAL`** — set on DB open. WAL provides crash resilience (committed transactions survive process crashes) and concurrent reads (status queries, sidebar sync, synthesizer reads all proceed without blocking writes). `synchronous=NORMAL` trades a negligible durability risk on sudden power loss for better write throughput — acceptable for a local dev tool.

2. **`busy_timeout(5000)`** — 5-second wait on lock contention instead of immediate `SQLITE_BUSY` failure. Covers brief timing overlaps between concurrent connections (e.g., `/agentz-status` reading while a task completion writes).

3. **Startup `PRAGMA integrity_check`** — runs once on plugin initialization. If it fails, the plugin enters degraded mode (no orchestration, status commands still work) and warns the user. Takes <100ms for a typical agentz DB. Does not crash OpenCode.

4. **Session-level advisory lock** — file-based lock at `.agentz/sessions/<id>/.lock` containing PID + timestamp. Prevents two OpenCode instances from orchestrating the same session simultaneously. Stale locks (PID no longer running) are cleaned up automatically on the next startup. Two instances can still work on different sessions in the same project, and read-only operations are never blocked (WAL handles concurrent reads).

5. **Documented filesystem recovery** — output files (`.agentz/sessions/<id>/<task-id>/output.md`) survive DB loss independently. A new "Filesystem Recovery" subsection in Section 9 documents what survives, what is lost, and how users can manually reconstruct from output files. No automated recovery tooling in v1.

**Why not periodic backups or JSON snapshots:** The effort/risk calculus doesn't justify it for v1. SQLite with WAL is already very crash-safe for single-writer scenarios. DB deletion is rare. The output files provide a partial safety net for the actual work product. If user reports show DB loss is a recurring problem, event-driven JSON snapshots or SQLite's online backup API can be added as targeted v2 improvements.

**Design plan changes:** Section 9 (Persistence Schema) gains "Database Resilience" subsection (PRAGMA config, integrity check, session-level lock), "Filesystem Recovery" subsection, and updated filesystem layout with `.lock` file. Section 10 (Plugin Integration) Entry Point updated with explicit 5-step plugin initialization sequence including DB open, PRAGMA setup, and integrity check.

---

## Lower Priority (Nice-to-Haves & Edge Cases)

### 12. [x] "Always-On" Orchestrator May Annoy Users

**Design reference:** Section 7 (complexity decision), Section 10 (primary agent orchestrator)

**Concern:** The orchestrator is injected into every conversation. It makes a subjective "complexity decision" on every user request. Users might find it frustrating if:
- The orchestrator creates a session for something the user considers simple
- The orchestrator handles something directly when the user wanted full orchestration
- The base prompt (even when lean) adds latency or noise to simple questions

**Suggested direction:**
- Add an explicit opt-out: a way to say "just do it directly" (e.g., prefix with `!` or a `/direct` command)
- Add an explicit opt-in: `/agentz start <goal>` for when the user definitely wants orchestration
- Keep the auto-detection as the default but make the threshold configurable
- Consider a confirmation step: "This looks complex — should I create an orchestration session? [Y/n]"

**Decision:** Orchestrator as primary agent with explicit activation.

- The `agentz` agent is registered with `mode: "primary"` so it appears in the TUI agent cycle. The orchestrator is only active when the user switches to this agent — no injection into other agents' conversations.
- A separate `agentz-worker` agent (`mode: "subagent"`) handles dispatched skill sessions (renamed from the old `agentz` subagent).
- `chat.system.transform` is scoped via agent-identity tracking (`chat.message` hook → `Map<sessionID, agentName>`). Only injects the working view when the active agent is `agentz`.
- Session start: user switches to `agentz` agent and states goal (complexity decision runs), OR `/agentz start <goal>` from any agent (creates DB session + switches to agentz agent).
- Session pause: implicit on agent switch-away (session stays `active` in DB, no injection). Explicit via `/agentz-pause`.
- Session resume: requires explicit user input ("continue" or `/agentz-resume`) — no auto-resume on switch-back. This prevents surprise behavior.
- Post-compaction hardening (Hook 4): on `session.compacted` event, if active agent is `agentz`, inject synthetic user message `"[System: Compaction occurred. Resume orchestration from DB state.]"` as belt-and-suspenders against weak compaction models.
- Clean-context-per-iteration fully preserved — `buildWorkingView()` still reads from DB, child sessions still isolated, autocompact hooks still global.
- Superpowers coexistence simplified: no injection conflict when user is on a non-agentz agent (both plugins coexist naturally during development).

**Design plan changes:** Section 2 (Injection Conflict Resolution) updated for natural coexistence via agent scoping. Section 7 (Orchestrator Design) updated: orchestrator is a primary agent, not always-on; "Why Always Inject" scoped to when the agentz agent is active. Section 10 (Plugin Integration) updated: "Always-On Orchestrator" replaced with "Primary Agent Orchestrator"; two-agent registration (agentz primary + agentz-worker subagent); `chat.message` hook for agent tracking; `chat.system.transform` scoped by agent identity; `/agentz start <goal>` slash command added. Section 13 (Autocompact Resilience) updated: three-hook strategy becomes four-hook with Hook 4 post-compaction hardening; Hook 3 scoped by agent identity. Section 14 (Interruption & Resume) updated: agent switch added as implicit pause trigger (Case 3) with "wait for explicit continue" semantics; `/agentz-resume` logic updated to handle agent switching.

---

### 13. [x] No Session Cleanup / Archival Strategy

**Design reference:** Section 9 (filesystem structure)

**Concern:** Sessions accumulate in `.agentz/sessions/` and the SQLite DB indefinitely. Over time:
- The DB grows with completed/stale sessions
- The filesystem fills with output files from old sessions
- `/agentz-list` shows an ever-growing list

**Suggested direction:**
- Add `/agentz-clean` command to remove completed sessions older than N days
- Auto-archive sessions after completion (move to `.agentz/archive/`)
- Add a `max_sessions` config option
- Consider TTL on session data

**Decision:** Minimal, user-controlled cleanup — solve list clutter through filtering, provide manual deletion.

- `/agentz-list` defaults to `active` and `paused` sessions only. `--all`, `--completed`, `--failed` flags extend the view.
- `/agentz-clean` hard-deletes completed/failed sessions (DB rows cascade + filesystem directory). Supports `--before <date>`, `--older-than <days>`, `--dry-run`, `--include-paused`. Requires confirmation. Never deletes `active` sessions.
- No auto-archive, no TTL, no `max_sessions`. Storage is not the bottleneck (DB stays under 1MB for hundreds of sessions). Auto-deletion risks surprise. Archive adds complexity for marginal benefit.
- v2 candidate: `status = 'archived'` + `/agentz-archive` if users need to keep-but-hide completed sessions.

**Design plan changes:** Section 9 (Persistence Schema) — added "Session Cleanup" subsection after "Filesystem Recovery" with list filtering behavior, `/agentz-clean` specification, and rationale. Section 10 (Slash Commands table) — updated `/agentz-list` entry with flag syntax, added `/agentz-clean` entry with flags and cross-reference.

---

### 14. [x] Cross-Session Learning Is Missing

**Design reference:** Section 9 (notes table)

**Concern:** Notes are session-scoped. Insights learned in one session (e.g., "this project uses PostgreSQL", "auth is JWT-based", "the team prefers tabs over spaces") are lost when the session ends. The next session starts from zero.

**Suggested direction:**
- Add a `global_notes` table (not tied to a session) for project-level knowledge
- Allow the orchestrator or any agent to promote a session note to a global note
- Inject relevant global notes into new sessions automatically
- This creates a lightweight "project memory" that improves over time

**Decision:** Adopted with a hybrid cross-session learning system that goes beyond simple note promotion:

1. **New recommendation type `ADD_GLOBAL_NOTE`:** Agents emit this when discovering durable project facts. Plugin code writes these to a `global_notes` table with `status = 'draft'`.

2. **Synthesizer extended with Pass 3 (Knowledge Curation):** At session end, the synthesizer reviews draft global notes + existing confirmed notes. It confirms, rejects, merges, or supersedes notes. This provides LLM-quality curation without human overhead.

3. **Confirmation-based aging:** `last_confirmed` timestamp updated each time the synthesizer re-confirms a note. Notes not confirmed in 5+ sessions get a `[stale]` marker in agent context. No auto-deletion — stale notes may still be valid, just unexercised.

4. **Global notes injection — child agents only, NOT orchestrator:** Key insight: global notes ARE domain knowledge, and the orchestrator should remain domain-free (consistent with Finding #10's "zero domain leakage" principle). `renderTaskContext()` includes a `## Project Knowledge` section with confirmed global notes for all child agents. 400-token cap, ordered by `confirmed_count` DESC, overflow truncated with `agentz_query` pointer.

5. **Triage outsourcing:** Complexity decision and todo decomposition moved OUT of the orchestrator to a `triage-analyst` agent dispatched at session start. Triage agent runs on `balanced` tier, receives project knowledge via global notes injection, returns a structured plan (complexity rating + todos with priorities/categories/suggested tiers). Orchestrator adopts the plan mechanically. Mid-session re-triage triggered by scope change heuristic (3+ `ADD_TODO` from one task OR any high-priority recommendation).

6. **V2 scope — mechanical orchestrator:** With triage outsourced, the orchestrator's remaining work is nearly mechanical (pick next todo, dispatch, process, check done). This opens the door to replacing the orchestrator LLM with a TypeScript state machine in v2, documented as a new Section 15.

7. **`/agentz-notes` slash command:** List, edit, and delete global notes. `--all` flag includes draft/rejected/superseded.

8. **`global_notes` table schema:** Includes `status` (draft/confirmed/superseded/rejected), `last_confirmed`, `confirmed_count`, `superseded_by`, `source_session_id`, `source_task_id`, and `category` fields.

**Design plan changes:** Section 5 (Agent Taxonomy) — added `triage-analyst` to non-leaf agents table, updated `synthesizer` description for three-pass review including Pass 3 knowledge curation. Section 7 (Orchestrator Design) — replaced "Complexity Decision" with "Triage Dispatch" subsection covering session-start triage, mid-session re-triage heuristic, and v2 mechanical orchestrator forward reference. Section 8 (Communication Protocol) — added `ADD_GLOBAL_NOTE` to recommendation processing table and output/completion report formats, added triage report format to structured orchestrator report. Section 9 (Persistence Schema) — added `global_notes` table with full schema after `review_items`, added "Global Notes Lifecycle" subsection. Section 10 (Plugin Integration) — added `/agentz-notes` variants to slash commands table, added `global_notes` to `agentz_query` enum and handler. Section 12 (Protocol & Skill Architecture) — added `ADD_GLOBAL_NOTE` to `RECOMMENDATION_TYPES`, added `globalNotes` to `PROTOCOL_CONSTRAINTS`, added `triage-analyst.md` to skills list, updated `renderTaskContext()` to include project knowledge injection with 400-token cap and orchestrator exclusion, updated renderer usage table. Added new Section 15 (V2 Scope: Mechanical Orchestrator) with full state machine design, responsibility comparison table, prerequisites, and cost impact analysis. Updated synthesizer reading strategy from two-pass to three-pass throughout (Section 7, Section 8).

---

### 15. [x] Leaf Agent "Freely Spawnable" Could Be Expensive

**Design reference:** Section 6 (spawning model)

**Concern:** Leaf agents (local-explorer, web-explorer) can be spawned "freely" by anyone. There's no limit on how many a single non-leaf agent can spawn. An agent doing broad exploration could spawn 10+ leaf agents, each consuming a model call. Even at `fast-cheap` tier, this adds up.

**Suggested direction:**
- Add a per-task limit on leaf agent spawns (e.g., max 5 per non-leaf agent)
- Track leaf agent costs in the DB for visibility
- Consider whether some leaf operations (single grep, single file read) should just be direct tool calls instead of spawning an agent

**Decision:**

**Approach: Soft Budget + Skill Guidance.**

Per-task leaf spawn budget (`max_leaf_spawns_per_task`, default 10) enforced in-memory by `agentz_dispatch`. When exhausted, further leaf spawn requests return a graceful fallback message directing the agent to use direct tools. Counter is per parent agent execution (not per session), scoped to the dispatch call's lifetime — no DB schema changes.

Protocol guidance added to `renderProtocol()` — a "Direct Tools vs. Leaf Agents" heuristic section injected into all agent prompts. Teaches agents when compression via leaf agent is warranted vs. when direct tool calls are faster and sufficient.

Config: `defaults.max_leaf_spawns_per_task: 10` in agentz.yaml. Set to `null` for unlimited (restores original "freely spawnable" behavior).

Design plan changes: Section 6 (Spawning Model) Rule 1 updated with budget semantics, new "Leaf Spawn Budget" subsection added after Depth Visualization. Section 11 (Configuration) `defaults` gains `max_leaf_spawns_per_task: 10`. Section 12 (Protocol & Skill Architecture) `renderProtocol()` gains "Direct Tools vs. Leaf Agents" guidance subsection in renderer output.

---

## Strengths Worth Preserving

These aspects of the design are strong and should be carried forward as-is:

1. **Subagent-writes-output model** (Section 7) — Clean separation, orchestrator stays lean.
2. **DB-first state management** — Source of truth is the database, not conversation history.
3. **Clean context per iteration** — Each iteration loads from DB, not accumulated chat.
4. **Tier abstraction** — Semantic tiers decoupled from concrete models.
5. **Interruption/resume handling** (Section 13) — Two-case distinction with business-analyst for change analysis.
6. **Autocompact resilience** (Section 13) — Four-hook strategy is thorough.
7. **Rework tracking** (`rework_of` in todos) — Good lineage for invalidation chains.
8. **Adaptive synthesizer complexity** — Scales review depth with task complexity.
