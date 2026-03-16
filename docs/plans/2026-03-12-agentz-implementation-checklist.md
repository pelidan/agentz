# Agentz Sequential Implementation Checklist

Use this document to track gradual implementation of the Agentz phase plans. Work phases in order and treat each linked phase document as the active execution plan for that stage. This checklist and the linked phase plans are the source of truth for sequencing and completion.

**Tracking Rule:** Do not start the next phase until the current phase plan is complete, its verification steps pass, and its commits are recorded.

## Phase Sequence

- [x] Phase 1 - Project Scaffold - `docs/plans/2026-03-12-agentz-phase-01-project-scaffold.md` - Project scaffold (package.json, tsconfig, directories)
- [x] Phase 2 - Protocol Layer - `docs/plans/2026-03-12-agentz-phase-02-protocol-layer.md` - Protocol layer (types, renderer, parser, validator, context)
- [x] Phase 3 - Persistence Layer - `docs/plans/2026-03-12-agentz-phase-03-persistence-layer.md` - Persistence layer (SQLite schema, full CRUD for 7 tables)
- [x] Phase 4 - Plugin Skeleton - `docs/plans/2026-03-12-agentz-phase-04-plugin-skeleton.md` - Plugin skeleton (config, prompts, entry point with agents/tools/hooks)
- [x] Phase 5 - Core Dispatch - `docs/plans/2026-03-12-agentz-phase-05-core-dispatch.md` - Core dispatch (skill loader, recommendations, reports, dispatch, query)
- [x] Phase 6 - Working View and Hooks - `docs/plans/2026-03-12-agentz-phase-06-working-view-and-hooks.md` - Working view and hook implementations
- [x] Phase 7 - Skill Files - `docs/plans/2026-03-12-agentz-phase-07-skill-files.md` - All 16 skill files plus loader verification
- [x] Phase 8 - End-to-End Integration - `docs/plans/2026-03-12-agentz-phase-08-end-to-end-integration.md` - E2E integration test plus final cleanup

## Detailed Checklist

### Phase 1 - Project Scaffold

- Plan: `docs/plans/2026-03-12-agentz-phase-01-project-scaffold.md`
- Depends on: None. This is the starting phase.
- Target outcome: Project scaffold (package.json, tsconfig, directories)
- [x] Task 1.1 - Initialize package.json and install dependencies
- [x] Task 1.2 - Create directory structure and entry point stub
- [x] Phase verification complete
- [x] Phase commits recorded — `09feb24`, `d9d06eb`

### Phase 2 - Protocol Layer

- Plan: `docs/plans/2026-03-12-agentz-phase-02-protocol-layer.md`
- Depends on: Phase 1 complete and committed.
- Target outcome: Protocol layer (types, renderer, parser, validator, context)
- [x] Task 2.1 - Define core protocol types
- [x] Task 2.2 - Implement protocol renderer
- [x] Task 2.3 - Implement completion report parser
- [x] Task 2.4 - Implement output validator
- [x] Task 2.5 - Implement task context renderer
- [x] Task 2.6 - Run full protocol test suite
- [x] Phase verification complete
- [x] Phase commits recorded — `9efe9bd`, `ea7ec26`, `10e782d`, `464f105`, `7979c22`, `9f5d7fe`, `a7a21f1`

### Phase 3 - Persistence Layer

- Plan: `docs/plans/2026-03-12-agentz-phase-03-persistence-layer.md`
- Depends on: Phase 2 complete and committed.
- Target outcome: Persistence layer (SQLite schema, full CRUD for 7 tables)
- [x] Task 3.1 - Define database schema and initialization
- [x] Task 3.2 - Implement database client — session and todo CRUD
- [x] Task 3.3 - Add task, iteration, note, review_item, and global_note CRUD
- [x] Task 3.4 - Add database initialization helper
- [x] Task 3.5 - Run full database test suite
- [x] Phase verification complete
- [x] Phase commits recorded — `1de5324`, `969a5d5`, `6465b83`, `2984228`

### Phase 4 - Plugin Skeleton

- Plan: `docs/plans/2026-03-12-agentz-phase-04-plugin-skeleton.md`
- Depends on: Phase 3 complete and committed.
- Target outcome: Plugin skeleton (config, prompts, entry point with agents/tools/hooks, slash-command stubs)
- [x] Task 4.1 - Define tier mapping and configuration types
- [x] Task 4.2 - Define orchestrator and worker base prompts
- [x] Task 4.3 - Wire up plugin entry point with agent registration and hook stubs
- [x] Task 4.4 - Register slash command stubs and verify permission-gated plugin surface
- [x] Phase verification complete
- [x] Phase commits recorded — `b51ab8f`, `36b0897`, `87d607a`, `df93ab3`, `1f7044f`, `0735bb6`, `46ebec5`, `df8969e`, `af2023f`

### Phase 5 - Core Dispatch

- Plan: `docs/plans/2026-03-12-agentz-phase-05-core-dispatch.md`
- Depends on: Phase 4 complete and committed.
- Target outcome: Core dispatch (skill loader, recommendations, reports, dispatch, query)
- [x] Task 5.1 - Implement skill file loader
- [x] Task 5.2 - Implement recommendation processor
- [x] Task 5.3 - Implement structured report formatters
- [x] Task 5.4 - Implement the agentz_dispatch execute function
- [x] Task 5.5 - Implement the agentz_query execute function
- [x] Task 5.6 - Wire dispatch and query into plugin entry point
- [x] Task 5.7 - Run dispatch and query verification (full test suite and typecheck)
- [x] Phase verification complete
- [x] Phase commits recorded — `580b9a3`, `6ec81ee`, `8e985b7`, `5b3ee5e`, `026b412`, `9587948`

### Phase 6 - Working View and Hooks

- Plan: `docs/plans/2026-03-12-agentz-phase-06-working-view-and-hooks.md`
- Depends on: Phase 5 complete and committed.
- Target outcome: Working view and hook implementations
- [x] Task 6.1 - Implement buildWorkingView
- [x] Task 6.2 - Implement event and compaction hooks
- [x] Task 6.3 - Run full test suite for Phases 5-6
- [x] Phase verification complete
- [x] Phase commits recorded — `1926a5b`, `bb164ee`

### Phase 7 - Skill Files

- Plan: `docs/plans/2026-03-12-agentz-phase-07-skill-files.md`
- Depends on: Phase 6 complete and committed.
- Target outcome: All 16 skill files plus loader verification
- [x] Task 7.1 - Write core skill files (triage-analyst, local-explorer, backend-developer)
- [x] Task 7.2 - Write remaining leaf and analysis skills
- [x] Task 7.3 - Write developer and tester skills
- [x] Task 7.4 - Write review, infrastructure, and documentation skills
- [x] Task 7.5 - Write synthesizer skill
- [x] Task 7.6 - Verify all skill files load correctly
- [x] Phase verification complete
- [x] Phase commits recorded — `11f863c`, `f237a68`, `466cbcb`, `5ac5f0b`, `5c858d9`, `4cfee64`

### Phase 8 - End-to-End Integration

- Plan: `docs/plans/2026-03-12-agentz-phase-08-end-to-end-integration.md`
- Depends on: Phase 7 complete and committed.
- Target outcome: E2E integration test plus final cleanup
- [x] Task 8.1 - Write E2E integration test
- [x] Task 8.2 - Final verification and cleanup
- [x] Phase verification complete
- [x] Phase commits recorded — `63db4f8`, `ed3a785`
