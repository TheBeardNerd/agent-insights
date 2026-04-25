# Agent Insights Installable Repo Design

**Date:** 2026-04-23

## Goal

Move the current local OpenCode `/insights` command out of `~/.config/opencode` into a standalone repository at `~/Projects/agent-insights`, and refactor it into a GitHub-installable plugin that users can add directly to `opencode.json`.

The first version should remain OpenCode-first while structuring the implementation so the core analysis and reporting logic can be reused by other tools later.

## Scope

### In Scope

- New standalone repository at `~/Projects/agent-insights`
- GitHub-installable OpenCode plugin distribution via git URL in `opencode.json`
- Extraction of the current `/insights` implementation from `~/.config/opencode/plugins/opencode-insights`
- Separation between portable core logic and OpenCode-specific adapter code
- Documentation for install, development, and migration from the local plugin
- Preservation of the `/insights` slash command name and report behavior

### Out of Scope

- Building a registry website or package catalog in v1
- Supporting non-OpenCode runtimes in v1
- Introducing a standalone CLI command in v1
- Building a generic marketplace or discovery system for commands
- Changing the user-facing `/insights` report concept or broad feature set during extraction

## Non-Goals

- A full multi-package workspace from day one
- Cross-tool runtime compatibility in the first release
- Renaming the slash command away from `/insights`
- Redesigning the report UX during the extraction effort

## Distribution Model

The plugin should be installable from GitHub with a direct git dependency entry in `opencode.json`.

Target install flow:

```json
{
  "plugin": [
    "agent-insights@git+https://github.com/acme/agent-insights.git"
  ]
}
```

Users restart OpenCode after adding the plugin entry. The install string must use the repository's canonical published GitHub URL. No separate registry service, installer command, or website is required for v1.

## Naming

- Repository name: `agent-insights`
- Package name: `agent-insights`
- Slash command name: `/insights`

The package and repository may differ conceptually from the slash command, but the slash command remains stable for existing users.

## Architecture

### High-Level Shape

The new repository should use a monorepo-style single package with a clearly separated portable core and a thin OpenCode adapter.

This means:

- one install target for OpenCode users
- one repository for development and release
- one package entrypoint for plugin installation
- internal separation between reusable logic and OpenCode-specific wiring

### Design Principles

- OpenCode-first for runtime integration
- portable core for analysis, normalization, and report generation
- minimal adapter layer for slash-command registration and host-specific APIs
- no extra packaging complexity unless the current repo shape proves insufficient

## Repository Layout

Proposed top-level structure:

```text
agent-insights/
├── package.json
├── README.md
├── .opencode/
│   └── plugins/
│       └── agent-insights.js
├── src/
│   ├── core/
│   │   ├── ingest/
│   │   ├── analyze/
│   │   └── report/
│   └── opencode/
│       ├── create-command.js
│       ├── run-insights.js
│       └── open-report.js
└── test/
```

### Core Responsibilities

`src/core/ingest/`
- storage adapters
- session normalization
- filtering
- transcript shaping

`src/core/analyze/`
- deterministic metrics
- friction ranking
- workflow suggestions
- optional enrichment orchestration interfaces

`src/core/report/`
- report view model construction
- self-contained HTML rendering
- theme behavior and report section composition

### OpenCode Adapter Responsibilities

`src/opencode/`
- slash command registration
- OpenCode client integration
- OpenCode state-path discovery
- temporary prompt-session orchestration for enrichment
- browser opening and host-specific behaviors

The adapter layer may depend on OpenCode plugin and SDK APIs. The core layer should not.

## Package Entry Shape

`package.json` should keep the plugin-install entrypoint model:

- `name`: `agent-insights`
- `type`: `module`
- `main`: `.opencode/plugins/agent-insights.js`

The plugin entry file should be intentionally thin. Its job is to connect the OpenCode TUI/plugin lifecycle to `src/opencode/create-command.js` and `src/opencode/run-insights.js`, which then call into the portable core.

## Migration Source of Truth

The initial source of truth for extraction is the current local plugin implementation in:

- `~/.config/opencode/plugins/opencode-insights/`

This code should be moved rather than conceptually rewritten, except where renaming and folder separation are required to create the portable-core boundary.

The extraction should preserve:

- slash command behavior
- report generation semantics
- existing tests where still valid
- current install assumptions for OpenCode plugin loading

## Migration Plan

### Step 1: Create Repo Skeleton

Create `~/Projects/agent-insights` with:

- package metadata
- plugin entrypoint
- `src/core` and `src/opencode` directories
- test directory
- README

### Step 2: Move Existing Code

Move and rename the current local plugin files into the new structure.

Expected migration direction:

- current command wiring to `src/opencode/`
- current ingestion, analysis, enrichment, and report logic into `src/core/`
- plugin entrypoint renamed to `.opencode/plugins/agent-insights.js`

### Step 3: Update Internal Imports

Adjust imports so:

- OpenCode adapter imports from core
- plugin entrypoint imports from `src/opencode`
- tests follow the new layout

### Step 4: Verify Local Development

The extracted repo should be locally runnable and testable before changing any global OpenCode config.

### Step 5: Switch Local OpenCode Config

After the standalone repo works locally and is available at its canonical GitHub URL, replace the current local plugin entry in `~/.config/opencode/opencode.json`:

From:

```json
"./plugins/opencode-insights"
```

To:

```json
"agent-insights@git+https://github.com/acme/agent-insights.git"
```

The concrete owner in the install string must be the actual published repository owner at release time.

## Portability Boundary

The portable core should expose interfaces based on normalized inputs and outputs rather than OpenCode-specific SDK objects.

Examples:

- core ingest accepts abstract storage rows or adapter-produced raw session records
- core analysis accepts normalized sessions
- core report accepts analysis output and returns HTML
- enrichment accepts a pluggable prompt-session function rather than knowing about OpenCode client objects directly

The OpenCode adapter is responsible for translating host-specific concerns into those interfaces.

## Documentation Requirements

The standalone repo should include:

- install instructions for `opencode.json`
- local development instructions
- test command documentation
- migration notes for existing local-plugin users
- statement that v1 is OpenCode-first and git-URL install only

## Verification Requirements

The extraction is complete only when all of these are verified:

- the new repo loads as an OpenCode plugin from a git-style plugin spec
- `/insights` still registers and remains user-facingly unchanged
- the test suite passes from the new repo location
- the report still generates correctly through the extracted repo entrypoint
- the portable core folders are free of direct OpenCode plugin runtime coupling
- README install instructions match the actual package entrypoint and plugin name

## Risks and Guardrails

### Main Risks

- extraction accidentally hardcodes `~/.config/opencode` assumptions into the new repo
- OpenCode-specific SDK concerns leak into the portable core
- install docs drift from the actual package entrypoint shape
- migration breaks current local behavior before the GitHub-install path is verified

### Guardrails

- keep plugin entrypoint thin
- move code with minimal behavior change first, then refactor boundaries
- verify the extracted repo locally before switching the global config entry
- keep slash-command name stable throughout migration

## Deferred Work Beyond V1

- registry/catalog site for command discovery
- standalone CLI entrypoint
- adapters for non-OpenCode runtimes
- a broader “commands.sh” style ecosystem or install index
