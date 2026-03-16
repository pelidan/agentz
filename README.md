# Agentz

A multi-agent orchestration framework for [OpenCode](https://opencode.ai). Decomposes complex tasks into todos, dispatches skill-specialized AI agents, and tracks progress persistently via SQLite.

An orchestrator agent coordinates everything without accumulating domain knowledge -- it delegates to specialists and reads only lightweight summaries.

## Features

- **16 skill-specialized agents** spanning exploration, analysis, development, testing, and operations
- **Tier-based model selection** (fast-cheap / balanced / powerful / reasoning) with automatic escalation on failure
- **SQLite persistence** for sessions, todos, tasks, iterations, and notes
- **Structured protocol** for agent communication with output validation
- **Working view injection** -- compact state summary (~1K tokens) in the orchestrator prompt

## Installation

Requires [Bun](https://bun.sh/).

```bash
bun install
bun run build
```

## Setup

Add the plugin to your `opencode.json` (project-level or global at `~/.config/opencode/opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "/absolute/path/to/agentz/dist/index.js"
  ]
}
```

Or use a project-local config at `.opencode/opencode.json` with a relative path:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "../path/to/agentz/dist/index.js"
  ]
}
```

Make sure to `bun run build` first so `dist/index.js` exists.

## Usage

Once the plugin is loaded, the orchestrator agent and its tools are available in your OpenCode session.

### Available tools

| Tool | Description |
|------|-------------|
| `agentz_dispatch` | Dispatch a skill-specialized agent for a todo item |
| `agentz_query` | Query orchestration state (todos, tasks, notes, iterations) |

### Development

```bash
bun run dev         # watch mode
bun test            # run tests
bun run typecheck   # type check
```

## Architecture

```
orchestrator (agentz)
  ├── dispatches worker agents by skill + tier
  ├── reads completion reports & recommendations
  ├── persists state to SQLite (.agentz/agentz.db)
  └── iterates until all todos are complete

workers (16 skills)
  ├── receive task context + skill instructions
  ├── write output to .agentz/sessions/<id>/tasks/<id>/output.md
  └── return structured completion reports
```

Tiers escalate automatically: if a lower-tier model fails, the system retries at a higher tier (up to 3 attempts). Failures are classified as transient, capability, or systematic, each with different retry strategies.

## License

Private.
