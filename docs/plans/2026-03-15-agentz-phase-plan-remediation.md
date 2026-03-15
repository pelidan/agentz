# Agentz Phase Plan Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Revise the existing Agentz phase-plan documents so the phased implementation sequence is internally consistent, executable, and aligned with the review findings.

**Architecture:** This is a documentation-only remediation pass over the eight phase plan files plus the master checklist. Update each phase plan in place, preserving the product architecture while tightening task ownership, API assumptions, verification steps, and cross-phase contracts. When a phase gains or renames tasks, mirror the change in the checklist so the checklist remains the sequencing source of truth.

**Tech Stack:** Markdown documentation, existing Agentz phase plans, Bun/TypeScript/OpenCode plan references, command snippets using `bun test`, `bun run typecheck`, and lightweight text verification

**Prerequisites:** The phase-plan review findings are accepted. Do not edit implementation code while executing this plan; edit documentation only.

---

## Tasks

### Task 1: Repair the Phase 1 scaffold plan

**Files:**
- Modify: `docs/plans/2026-03-12-agentz-phase-01-project-scaffold.md`

**Step 1: Fix the Bun TypeScript setup snippet**

Update the `tsconfig.json` snippet so it no longer uses `"types": ["bun-types"]`. Replace that line with one of these exact options and use the same choice everywhere in the file:

```json
"types": ["@types/bun"]
```

or, if you choose to rely on Bun defaults, remove the `types` line entirely and add a one-line note below the snippet explaining that the field was intentionally omitted.

**Step 2: Make dependency ownership explicit**

Rewrite the `Tech Stack:` line and Task 1.1 dependency text so the plan no longer claims an unverified `zod v4.1.8`. Use one explicit ownership story and keep it consistent:

```markdown
**Tech Stack:** TypeScript (strict), Bun runtime, `@opencode-ai/plugin` v1.2.22, `@opencode-ai/sdk` v1.2.22, `bun:sqlite`, `bun:test`
```

Then add a short note under Task 1.1 stating that later phases may add `zod` if a concrete implementation step requires it.

**Step 3: Add repository hygiene to the scaffold task**

Expand Task 1.1 and Task 1.2 so Phase 1 explicitly creates `.gitignore` and handles empty directories safely. Add `.gitignore` to the created files list and include this exact snippet:

```gitignore
node_modules/
dist/
.test-tmp/
```

Also update the directory task so it either creates `.gitkeep` files inside `skills/` and `.opencode/`, or adds a note that empty directories are not committed. Update the commit step so it stages the actual Bun lockfile name produced at execution time instead of hard-coding `bun.lock`.

**Step 4: Verify the edited sections**

Run: `grep -n '@types/bun\|.gitignore\|.gitkeep\|zod' docs/plans/2026-03-12-agentz-phase-01-project-scaffold.md`
Expected: Matches confirming the corrected Bun types entry, the new repository hygiene instructions, and the clarified zod ownership note.

**Step 5: Commit**

```bash
git add docs/plans/2026-03-12-agentz-phase-01-project-scaffold.md
git commit -m "docs: fix phase 1 scaffold prerequisites and repo hygiene"
```

### Task 2: Repair the Phase 2 protocol-layer plan

**Files:**
- Modify: `docs/plans/2026-03-12-agentz-phase-02-protocol-layer.md`

**Step 1: Fix the renderer example**

Edit the `renderProtocol()` snippet so the output-sections example no longer renders malformed `### ##` headings. Replace the broken line with this exact form:

```typescript
${OUTPUT_SECTIONS.map((s) => `## ${s}`).join("\n")}
```

If you prefer to show the headings as a code example rather than literal output, wrap the example in a fenced block, but do not leave the double-heading form in the plan.

**Step 2: Align the phase description with validator behavior**

Adjust the goal or architecture text anywhere it claims the entire phase is purely side-effect free. Add a short note that the validator performs filesystem checks on the referenced output path, while the other protocol helpers remain pure.

**Step 3: Resolve the `schema.ts` placeholder ambiguity**

Add one explicit note in the Phase 2 file stating whether `src/protocol/schema.ts` is intentionally unused in this phase or should be removed from the earlier scaffold plan during cleanup. Do not leave the placeholder unexplained.

**Step 4: Verify the edited sections**

Run: `grep -n '## ${s}\|filesystem\|schema.ts' docs/plans/2026-03-12-agentz-phase-02-protocol-layer.md`
Expected: Matches confirming the corrected renderer example, the validator I/O note, and the explicit `schema.ts` decision.

**Step 5: Commit**

```bash
git add docs/plans/2026-03-12-agentz-phase-02-protocol-layer.md
git commit -m "docs: tighten phase 2 protocol plan wording and examples"
```

### Task 3: Repair the Phase 3 persistence-layer plan

**Files:**
- Modify: `docs/plans/2026-03-12-agentz-phase-03-persistence-layer.md`

**Step 1: Move WAL verification to a file-backed test path**

Rewrite Task 3.1 so it no longer asserts `journal_mode = wal` on `:memory:`. Remove the in-memory WAL assertion from the schema task and add a file-backed WAL verification to the database initialization helper task instead. The replacement test intent should be:

```typescript
const db = initDatabase(TEST_DB_PATH);
const result = raw.query("PRAGMA journal_mode").get() as { journal_mode: string };
expect(result.journal_mode.toLowerCase()).toBe("wal");
```

Keep the schema task focused on table creation and idempotency.

**Step 2: Define `getConfirmedGlobalNotesForInjection()` clearly**

Update Task 3.3 so the plan no longer duplicates `getConfirmedGlobalNotes()`. Add explicit behavior for injection use:
- return confirmed notes suitable for prompt injection
- annotate or filter notes that are stale after 5 or more sessions without reconfirmation
- document the exact stale-threshold behavior in both the method description and its test title

If you choose annotation, require the plan to mention a `[stale]` marker in the returned content.

**Step 3: Promote `close()` to a first-class database API**

Edit the `AgentzDB` plan snippets so the wrapper exposes `close()` directly instead of relying on `Object.assign(...)` monkey-patching in `initDatabase()`. While editing, add a one-line note that `depends_on` remains stored as a JSON string and is intentionally not interpreted in v1.

**Step 4: Verify the edited sections**

Run: `grep -n 'journal_mode\|getConfirmedGlobalNotesForInjection\|stale\|close()\|depends_on' docs/plans/2026-03-12-agentz-phase-03-persistence-layer.md`
Expected: Matches confirming the file-backed WAL strategy, stale-note semantics, a real `close()` API, and the v1 note for `depends_on`.

**Step 5: Commit**

```bash
git add docs/plans/2026-03-12-agentz-phase-03-persistence-layer.md
git commit -m "docs: fix phase 3 persistence plan contract gaps"
```

### Task 4: Repair the Phase 4 plugin-skeleton plan

**Files:**
- Modify: `docs/plans/2026-03-12-agentz-phase-04-plugin-skeleton.md`

**Step 1: Add explicit plugin API verification guidance**

Before the tool-registration code block, add a short warning note that the executor must verify the actual `@opencode-ai/plugin` types for:
- `tool(...)`
- `tool.schema`
- hook names and callback shapes
- slash-command registration shape

State clearly that the code snippet must be adjusted to the installed package API if the types differ.

**Step 2: Add permission gating to the tool snippets**

Update both tool definitions so the plan shows permission gating for the `agentz` orchestrator. Use this exact field name unless the verified package types require a different spelling:

```typescript
permission: "agentz",
```

Add a short note in the surrounding prose that both tools are intentionally restricted to the primary `agentz` agent.

**Step 3: Insert a new Task 4.4 for slash-command stubs**

Add a new section after Task 4.3 with this title and structure:

```markdown
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
```

**Step 4: Verify the edited Phase 4 plan**

Run: `grep -n 'permission\|Task 4.4\|slash command\|tool.schema' docs/plans/2026-03-12-agentz-phase-04-plugin-skeleton.md`
Expected: Matches confirming the API verification note, permission gating, and the new slash-command task.

**Step 5: Commit**

```bash
git add docs/plans/2026-03-12-agentz-phase-04-plugin-skeleton.md
git commit -m "docs: assign phase 4 ownership for plugin API checks and slash commands"
```

### Task 5: Repair the Phase 5 core-dispatch plan

**Files:**
- Modify: `docs/plans/2026-03-12-agentz-phase-05-core-dispatch.md`

**Step 1: Add tests for the pure dispatch helpers**

Update Task 5.4 so it no longer skips tests for all helper logic. Expand the file list to include a dedicated test file for `composeSystemPrompt()` and `classifyError()`, and add explicit red-green steps before the main implementation snippet. The new test coverage must prove:
- the composed prompt includes protocol + skill + task-context layers in order
- validation failures classify as `capability`
- transient keywords classify as `transient`
- unknown failures fall back to `capability`

**Step 2: Fix the error-classification and SDK-contract notes**

Update the `classifyError()` snippet so it checks the lowercased connection-refused token correctly:

```typescript
msg.includes("econnrefused")
```

Then replace `client: any` with either the real SDK client type or a narrow local interface. Add a short note beside `extractResponseText()` that the executor must confirm the real `session.prompt()` response shape against the installed SDK types before finalizing the helper.

**Step 3: Clarify iteration semantics and add an explicit verification task**

Rewrite the task-record comments so the `iteration` field clearly means one thing only: either orchestrator iteration number or task sequence number. Do not leave the plan with mixed interpretations.

Then add this new section near the end of the phase file:

```markdown
### Task 5.7: Run dispatch and query verification

**Files:**
- Modify: `docs/plans/2026-03-12-agentz-phase-05-core-dispatch.md`

**Step 1: Run targeted dispatch/query tests**

Run: `bun test src/dispatch src/query src/skills/loader.test.ts`
Expected: All tests PASS

**Step 2: Run the full test suite**

Run: `bun test`
Expected: All tests PASS

**Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add src/dispatch src/query src/index.ts
git commit -m "test: verify phase 5 dispatch and query integration"
```
```

**Step 4: Verify the edited Phase 5 plan**

Run: `grep -n 'composeSystemPrompt\|classifyError\|econnrefused\|Task 5.7\|session.prompt' docs/plans/2026-03-12-agentz-phase-05-core-dispatch.md`
Expected: Matches confirming the new pure-helper tests, the lowercase connection-refused check, the SDK response-shape note, and the added verification task.

**Step 5: Commit**

```bash
git add docs/plans/2026-03-12-agentz-phase-05-core-dispatch.md
git commit -m "docs: strengthen phase 5 dispatch testing and contracts"
```

### Task 6: Repair the Phase 6 working-view and hooks plan

**Files:**
- Modify: `docs/plans/2026-03-12-agentz-phase-06-working-view-and-hooks.md`

**Step 1: Correct the hook file ownership and add hook tests**

Rewrite Task 6.2 so `src/hooks/index.ts` is created in this phase instead of modified, unless an earlier phase is also updated to create it. Expand the file list to include:

```markdown
- Create: `src/hooks/index.ts`
- Create: `src/hooks/index.test.ts`
- Modify: `src/index.ts`
```

Then add explicit test coverage for `handleEvent()`, `handleSystemTransform()`, and `handleCompacting()`.

**Step 2: Make event-schema verification explicit**

Add a note before the hook implementation snippet that the executor must confirm the real plugin event payload shapes for `session.error` and `session.compacted`. Require the plan to keep runtime guards if the API remains loosely typed.

**Step 3: Expand the wiring instructions**

Replace the current prose-only wiring step with an exact checklist that says to:
- import the real hook helpers from `./hooks/index`
- share the `AgentzDB` instance initialized in Phase 5
- preserve the existing `sessionAgentMap` and `compactedSessions` sets in plugin scope
- document that `interrupted` is an intentional status used by the interruption path
- note that hook lookups depend on `opencode_session_id` being populated for active sessions

**Step 4: Verify the edited Phase 6 plan**

Run: `grep -n 'src/hooks/index.test.ts\|session.error\|session.compacted\|interrupted\|opencode_session_id' docs/plans/2026-03-12-agentz-phase-06-working-view-and-hooks.md`
Expected: Matches confirming the new hook test file, explicit event verification guidance, and the clarified interruption/session-ID notes.

**Step 5: Commit**

```bash
git add docs/plans/2026-03-12-agentz-phase-06-working-view-and-hooks.md
git commit -m "docs: strengthen phase 6 hook testing and wiring guidance"
```

### Task 7: Repair the Phase 7 skill-files plan

**Files:**
- Modify: `docs/plans/2026-03-12-agentz-phase-07-skill-files.md`

**Step 1: Clarify how `triage-analyst` is dispatched**

Add a short note near Task 7.1 explaining that `triage-analyst` is dispatched directly by the orchestrator and is intentionally not sourced from `CATEGORY_MAPPING`. This note should appear before the first skill file block so executors do not try to add a fake category mapping just to satisfy the plan.

**Step 2: Strengthen the Task 7.6 verification test**

Update the integration-test section so it also checks for the `## Domain Instructions` heading in every skill file. Use this exact assertion text inside the planned test block:

```typescript
expect(content).toContain("## Domain Instructions");
```

**Step 3: Add directory and protocol consistency notes**

Insert one short note that the `skills/` directory must exist before file creation, and one short note that recommendation tokens in the skill prose must stay aligned with the canonical protocol types (`ADD_TODO`, `ADD_NOTE`, `ADD_GLOBAL_NOTE`, `NEEDS_REVIEW`).

**Step 4: Verify the edited Phase 7 plan**

Run: `grep -n 'triage-analyst\|Domain Instructions\|skills/\|ADD_TODO\|ADD_GLOBAL_NOTE' docs/plans/2026-03-12-agentz-phase-07-skill-files.md`
Expected: Matches confirming the direct-dispatch note, the stronger integration assertion, and the directory/protocol consistency notes.

**Step 5: Commit**

```bash
git add docs/plans/2026-03-12-agentz-phase-07-skill-files.md
git commit -m "docs: clarify phase 7 skill ownership and verification"
```

### Task 8: Repair the Phase 8 end-to-end plan

**Files:**
- Modify: `docs/plans/2026-03-12-agentz-phase-08-end-to-end-integration.md`

**Step 1: Make the E2E assertions less brittle and add one failure path**

Rewrite the working-view assertions so they no longer depend on exact phrases like `4 remaining` or `3 remaining`. Keep the checks focused on stable facts: todo descriptions, completed-count presence, and the latest task summary.

Then add one explicit failure-path integration test to the phase plan. The new test must cover a validation failure or failed task path and verify that the database state reflects the failure cleanly.

**Step 2: Add a plugin-entry smoke test**

Extend Task 8.1 so it also imports `src/index.ts` and proves the plugin entry point loads without throwing. Keep this a lightweight smoke test; do not require live SDK calls.

**Step 3: Replace the prose-only cleanup task with exact edit instructions**

Rewrite Task 8.2 so it no longer says only "Delete `skills/test-skill.md` and update `src/skills/loader.test.ts`". Replace it with exact instructions that:
- delete `skills/test-skill.md`
- retarget `src/skills/loader.test.ts` to an existing real skill such as `local-explorer`
- update any expected headings or fixture strings to match the real skill file
- rerun `bun test` and `bun run typecheck`

**Step 4: Verify the edited Phase 8 plan**

Run: `grep -n 'validation failure\|failed task\|src/index.ts\|local-explorer\|remaining' docs/plans/2026-03-12-agentz-phase-08-end-to-end-integration.md`
Expected: Matches confirming the new failure-path coverage, the plugin smoke test, the explicit cleanup rewrite, and the softened assertion language.

**Step 5: Commit**

```bash
git add docs/plans/2026-03-12-agentz-phase-08-end-to-end-integration.md
git commit -m "docs: harden phase 8 integration plan and cleanup steps"
```

### Task 9: Sync the master checklist and run a cross-phase consistency pass

**Files:**
- Modify: `docs/plans/2026-03-12-agentz-implementation-checklist.md`
- Modify: `docs/plans/2026-03-12-agentz-phase-01-project-scaffold.md`
- Modify: `docs/plans/2026-03-12-agentz-phase-02-protocol-layer.md`
- Modify: `docs/plans/2026-03-12-agentz-phase-03-persistence-layer.md`
- Modify: `docs/plans/2026-03-12-agentz-phase-04-plugin-skeleton.md`
- Modify: `docs/plans/2026-03-12-agentz-phase-05-core-dispatch.md`
- Modify: `docs/plans/2026-03-12-agentz-phase-06-working-view-and-hooks.md`
- Modify: `docs/plans/2026-03-12-agentz-phase-07-skill-files.md`
- Modify: `docs/plans/2026-03-12-agentz-phase-08-end-to-end-integration.md`

**Step 1: Update checklist task lists and verification gates**

Edit the master checklist so it mirrors every task-level change introduced above. At minimum:
- add `Task 4.4` for slash-command stubs / permission-gated plugin surface
- add `Task 5.7` for dispatch/query verification
- rename Phase 6 and Phase 8 checklist items if their task titles changed materially
- keep the "Phase verification complete" and "Phase commits recorded" checkboxes in the right order after any insertions

**Step 2: Run a consistency sweep across the phase docs**

Re-read all edited phase files and normalize any repeated wording that still conflicts across phases. Focus on:
- shared `Tech Stack:` lines
- zod ownership wording
- slash-command ownership
- permission-gating terminology
- hook/event wording
- stale references to unused placeholders such as `schema.ts` or `src/tools/`

If a placeholder is intentionally kept, add one explicit note explaining why.

**Step 3: Run text verification commands**

Run: `grep -n 'Task 4.4\|Task 5.7\|permission\|Domain Instructions\|opencode_session_id\|local-explorer' docs/plans/2026-03-12-agentz-*.md`
Expected: Matches in the updated phase plan files and the master checklist.

Run: `grep -n 'Task 4.4\|Task 5.7' docs/plans/2026-03-12-agentz-implementation-checklist.md`
Expected: Matches confirming the checklist now tracks the newly added tasks.

**Step 4: Review the combined diff before the final commit**

Run: `git diff -- docs/plans/2026-03-12-agentz-implementation-checklist.md docs/plans/2026-03-12-agentz-phase-01-project-scaffold.md docs/plans/2026-03-12-agentz-phase-02-protocol-layer.md docs/plans/2026-03-12-agentz-phase-03-persistence-layer.md docs/plans/2026-03-12-agentz-phase-04-plugin-skeleton.md docs/plans/2026-03-12-agentz-phase-05-core-dispatch.md docs/plans/2026-03-12-agentz-phase-06-working-view-and-hooks.md docs/plans/2026-03-12-agentz-phase-07-skill-files.md docs/plans/2026-03-12-agentz-phase-08-end-to-end-integration.md`
Expected: A docs-only diff showing the agreed remediation edits and checklist synchronization.

**Step 5: Commit**

```bash
git add docs/plans/2026-03-12-agentz-implementation-checklist.md docs/plans/2026-03-12-agentz-phase-01-project-scaffold.md docs/plans/2026-03-12-agentz-phase-02-protocol-layer.md docs/plans/2026-03-12-agentz-phase-03-persistence-layer.md docs/plans/2026-03-12-agentz-phase-04-plugin-skeleton.md docs/plans/2026-03-12-agentz-phase-05-core-dispatch.md docs/plans/2026-03-12-agentz-phase-06-working-view-and-hooks.md docs/plans/2026-03-12-agentz-phase-07-skill-files.md docs/plans/2026-03-12-agentz-phase-08-end-to-end-integration.md
git commit -m "docs: synchronize reviewed fixes across agentz phase plans"
```

---

Plan complete and saved to `docs/plans/2026-03-15-agentz-phase-plan-remediation.md`.

Two execution options:

**1. Subagent-Driven (this session)** - Dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open a new session with `executing-plans` and execute the plan with checkpoints
