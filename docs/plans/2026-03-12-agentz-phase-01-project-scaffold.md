# Agentz Phase 1: Project Scaffold Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish the Agentz repository skeleton, package metadata, and placeholder module layout so later phases can build on a stable base.

**Architecture:** This phase creates the Bun and TypeScript project shell, the initial directory structure, and no-op module stubs. It keeps runtime behavior minimal while ensuring the repository is ready for test-driven implementation in later phases.

**Tech Stack:** TypeScript (strict), Bun runtime, `@opencode-ai/plugin` v1.2.22, `@opencode-ai/sdk` v1.2.22, `bun:sqlite`, `bun:test`

**Prerequisites:** None. This is the starting phase.

---

## Tasks

### Task 1.1: Initialize package.json and install dependencies

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

**Step 1: Create package.json**

```json
{
  "name": "agentz",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "bun build src/index.ts --outdir dist --target bun",
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "dev": "bun run --watch src/index.ts"
  },
  "dependencies": {
    "@opencode-ai/plugin": "^1.2.22",
    "@opencode-ai/sdk": "^1.2.22"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.8"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "types": ["@types/bun"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Step 3: Create .gitignore**

`.gitignore`:
```gitignore
node_modules/
dist/
.test-tmp/
```

**Step 4: Install dependencies**

Run: `bun install`
Expected: lockfile created, node_modules populated

> **Note on zod:** `zod` is not included in this phase. Later phases may add it as a dependency if a concrete implementation step requires schema validation.

**Step 5: Commit**

```bash
git add package.json tsconfig.json .gitignore $(ls bun.lock bun.lockb 2>/dev/null)
git commit -m "chore: initialize project with package.json and tsconfig"
```

### Task 1.2: Create directory structure and entry point stub

**Files:**
- Create: `src/index.ts`
- Create: `src/protocol/types.ts` (empty placeholder)
- Create: `src/protocol/schema.ts` (empty placeholder)
- Create: `src/protocol/renderer.ts` (empty placeholder)
- Create: `src/protocol/parser.ts` (empty placeholder)
- Create: `src/protocol/validator.ts` (empty placeholder)
- Create: `src/protocol/context.ts` (empty placeholder)
- Create: `src/db/index.ts` (empty placeholder)
- Create: `src/db/schema.ts` (empty placeholder)
- Create: `src/tools/dispatch.ts` (empty placeholder — **intentionally scaffolded only**; real dispatch lives in `src/dispatch/index.ts` from Phase 5 onward; this file can be removed during Phase 8 cleanup)
- Create: `src/tools/query.ts` (empty placeholder — **intentionally scaffolded only**; real query lives in `src/query/index.ts` from Phase 5 onward; this file can be removed during Phase 8 cleanup)
- Create: `src/hooks/index.ts` (empty placeholder)
- Create: `src/prompts/index.ts` (empty placeholder)
- Create: `skills/` directory (with `.gitkeep` so empty directory is committed)
- Create: `.opencode/` directory stub (with `.gitkeep` so empty directory is committed)

**Step 1: Create directory structure**

Run:
```bash
mkdir -p src/protocol src/db src/tools src/hooks src/prompts skills .opencode
touch skills/.gitkeep .opencode/.gitkeep
```

**Step 2: Create entry point stub**

`src/index.ts`:
```typescript
import type { Plugin } from "@opencode-ai/plugin";

const plugin: Plugin = async (input) => {
  return {};
};

export default plugin;
```

**Step 3: Create empty placeholder files**

Each file gets a single comment:

`src/protocol/types.ts`:
```typescript
// Protocol type definitions — completion reports, output files, recommendations
```

`src/protocol/schema.ts`:
```typescript
// Protocol constants — section names, field specs, constraints
```

`src/protocol/renderer.ts`:
```typescript
// renderProtocol() — generates LLM-facing prose from types
```

`src/protocol/parser.ts`:
```typescript
// parseCompletionReport() + parseOutputFile() — extract structured data from freeform text
```

`src/protocol/validator.ts`:
```typescript
// validateCompletionReport() — binary pass/fail validation
```

`src/protocol/context.ts`:
```typescript
// renderTaskContext() — generates task-specific context block
```

`src/db/index.ts`:
```typescript
// Database client — SQLite CRUD operations
```

`src/db/schema.ts`:
```typescript
// Database schema — table creation SQL
```

`src/tools/dispatch.ts`:
```typescript
// agentz_dispatch tool — spawns skill-specialized agents
```

`src/tools/query.ts`:
```typescript
// agentz_query tool — on-demand state access
```

`src/hooks/index.ts`:
```typescript
// Plugin hooks — event handlers, system.transform, chat.message, compaction
```

`src/prompts/index.ts`:
```typescript
// Orchestrator and worker base prompts
```

**Step 4: Verify typecheck passes**

Run: `bun run typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold directory structure with entry point stub"
```

---
