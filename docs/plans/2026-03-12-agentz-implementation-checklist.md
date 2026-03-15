# Agentz Sequential Implementation Checklist

Use this document to track gradual implementation of the Agentz phase plans. Work phases in order and treat each linked phase document as the active execution plan for that stage. This checklist and the linked phase plans are the source of truth for sequencing and completion.

**Tracking Rule:** Do not start the next phase until the current phase plan is complete, its verification steps pass, and its commits are recorded.

## Phase Sequence

- [ ] Phase 1 - Project Scaffold - `docs/plans/2026-03-12-agentz-phase-01-project-scaffold.md` - Project scaffold (package.json, tsconfig, directories)
- [ ] Phase 2 - Protocol Layer - `docs/plans/2026-03-12-agentz-phase-02-protocol-layer.md` - Protocol layer (types, renderer, parser, validator, context)
- [ ] Phase 3 - Persistence Layer - `docs/plans/2026-03-12-agentz-phase-03-persistence-layer.md` - Persistence layer (SQLite schema, full CRUD for 7 tables)
- [ ] Phase 4 - Plugin Skeleton - `docs/plans/2026-03-12-agentz-phase-04-plugin-skeleton.md` - Plugin skeleton (config, prompts, entry point with agents/tools/hooks)
- [ ] Phase 5 - Core Dispatch - `docs/plans/2026-03-12-agentz-phase-05-core-dispatch.md` - Core dispatch (skill loader, recommendations, reports, dispatch, query)
- [ ] Phase 6 - Working View and Hooks - `docs/plans/2026-03-12-agentz-phase-06-working-view-and-hooks.md` - Working view and hook implementations
- [ ] Phase 7 - Skill Files - `docs/plans/2026-03-12-agentz-phase-07-skill-files.md` - All 16 skill files plus loader verification
- [ ] Phase 8 - End-to-End Integration - `docs/plans/2026-03-12-agentz-phase-08-end-to-end-integration.md` - E2E integration test plus final cleanup

## Detailed Checklist

### Phase 1 - Project Scaffold

- Plan: `docs/plans/2026-03-12-agentz-phase-01-project-scaffold.md`
- Depends on: None. This is the starting phase.
- Target outcome: Project scaffold (package.json, tsconfig, directories)
- [ ] Task 1.1 - Initialize package.json and install dependencies
- [ ] Task 1.2 - Create directory structure and entry point stub
- [ ] Phase verification complete
- [ ] Phase commits recorded

### Phase 2 - Protocol Layer

- Plan: `docs/plans/2026-03-12-agentz-phase-02-protocol-layer.md`
- Depends on: Phase 1 complete and committed.
- Target outcome: Protocol layer (types, renderer, parser, validator, context)
- [ ] Task 2.1 - Define core protocol types
- [ ] Task 2.2 - Implement protocol renderer
- [ ] Task 2.3 - Implement completion report parser
- [ ] Task 2.4 - Implement output validator
- [ ] Task 2.5 - Implement task context renderer
- [ ] Task 2.6 - Run full protocol test suite
- [ ] Phase verification complete
- [ ] Phase commits recorded

### Phase 3 - Persistence Layer

- Plan: `docs/plans/2026-03-12-agentz-phase-03-persistence-layer.md`
- Depends on: Phase 2 complete and committed.
- Target outcome: Persistence layer (SQLite schema, full CRUD for 7 tables)
- [ ] Task 3.1 - Define database schema and initialization
- [ ] Task 3.2 - Implement database client — session and todo CRUD
- [ ] Task 3.3 - Add task, iteration, note, review_item, and global_note CRUD
- [ ] Task 3.4 - Add database initialization helper
- [ ] Task 3.5 - Run full database test suite
- [ ] Phase verification complete
- [ ] Phase commits recorded

### Phase 4 - Plugin Skeleton

- Plan: `docs/plans/2026-03-12-agentz-phase-04-plugin-skeleton.md`
- Depends on: Phase 3 complete and committed.
- Target outcome: Plugin skeleton (config, prompts, entry point with agents/tools/hooks, slash-command stubs)
- [ ] Task 4.1 - Define tier mapping and configuration types
- [ ] Task 4.2 - Define orchestrator and worker base prompts
- [ ] Task 4.3 - Wire up plugin entry point with agent registration and hook stubs
- [ ] Task 4.4 - Register slash command stubs and verify permission-gated plugin surface
- [ ] Phase verification complete
- [ ] Phase commits recorded

### Phase 5 - Core Dispatch

- Plan: `docs/plans/2026-03-12-agentz-phase-05-core-dispatch.md`
- Depends on: Phase 4 complete and committed.
- Target outcome: Core dispatch (skill loader, recommendations, reports, dispatch, query)
- [ ] Task 5.1 - Implement skill file loader
- [ ] Task 5.2 - Implement recommendation processor
- [ ] Task 5.3 - Implement structured report formatters
- [ ] Task 5.4 - Implement the agentz_dispatch execute function
- [ ] Task 5.5 - Implement the agentz_query execute function
- [ ] Task 5.6 - Wire dispatch and query into plugin entry point
- [ ] Task 5.7 - Run dispatch and query verification (full test suite and typecheck)
- [ ] Phase verification complete
- [ ] Phase commits recorded

### Phase 6 - Working View and Hooks

- Plan: `docs/plans/2026-03-12-agentz-phase-06-working-view-and-hooks.md`
- Depends on: Phase 5 complete and committed.
- Target outcome: Working view and hook implementations
- [ ] Task 6.1 - Implement buildWorkingView
- [ ] Task 6.2 - Implement event and compaction hooks
- [ ] Task 6.3 - Run full test suite for Phases 5-6
- [ ] Phase verification complete
- [ ] Phase commits recorded

### Phase 7 - Skill Files

- Plan: `docs/plans/2026-03-12-agentz-phase-07-skill-files.md`
- Depends on: Phase 6 complete and committed.
- Target outcome: All 16 skill files plus loader verification
- [ ] Task 7.1 - Write core skill files (triage-analyst, local-explorer, backend-developer)
- [ ] Task 7.2 - Write remaining leaf and analysis skills
- [ ] Task 7.3 - Write developer and tester skills
- [ ] Task 7.4 - Write review, infrastructure, and documentation skills
- [ ] Task 7.5 - Write synthesizer skill
- [ ] Task 7.6 - Verify all skill files load correctly
- [ ] Phase verification complete
- [ ] Phase commits recorded

### Phase 8 - End-to-End Integration

- Plan: `docs/plans/2026-03-12-agentz-phase-08-end-to-end-integration.md`
- Depends on: Phase 7 complete and committed.
- Target outcome: E2E integration test plus final cleanup
- [ ] Task 8.1 - Write E2E integration test
- [ ] Task 8.2 - Final verification and cleanup
- [ ] Phase verification complete
- [ ] Phase commits recorded
