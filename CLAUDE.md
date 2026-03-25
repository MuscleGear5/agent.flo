# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Ruflo v3.5** (formerly "Claude Flow") — Enterprise AI agent orchestration for Claude Code.
Three npm packages published in lockstep: `@claude-flow/cli`, `claude-flow` (umbrella), `ruflo` (alias). Current version: 3.5.42.

## Repository Structure

```
agent.flo/                    # Root package (claude-flow@3.5.42, ESM)
├── bin/cli.js                # Umbrella entry — proxies to v3/@claude-flow/cli
├── ruflo/                    # ruflo npm package (thin wrapper, depends on @claude-flow/cli)
├── v3/                       # V3 monorepo (pnpm workspaces)
│   ├── @claude-flow/
│   │   ├── cli/              # Main CLI package (@claude-flow/cli) — 26 commands, 140+ subcommands
│   │   │   ├── src/commands/ # Command implementations (agent, swarm, memory, hooks, etc.)
│   │   │   ├── src/mcp-tools/# MCP server tool definitions
│   │   │   ├── src/ruvector/ # RuVector intelligence system (SONA, HNSW, MoE)
│   │   │   └── src/plugins/  # Plugin system (discovery, store, manager)
│   │   ├── codex/            # Dual-mode Claude + Codex collaboration
│   │   ├── guidance/         # Governance control plane
│   │   ├── hooks/            # 17 hooks + 12 background workers
│   │   ├── memory/           # AgentDB + HNSW vector search
│   │   ├── providers/        # LLM provider integrations
│   │   ├── security/         # Input validation, CVE remediation
│   │   └── shared/           # Shared types and utilities
│   └── src/                  # V3 core domain modules (DDD)
│       ├── agent-lifecycle/  # Agent domain entity and lifecycle
│       ├── coordination/     # SwarmCoordinator application service
│       ├── task-execution/   # Task entity, WorkflowEngine
│       ├── memory/           # Memory entity, HybridBackend, SQLiteBackend, AgentDBBackend
│       └── infrastructure/   # Plugins (PluginManager), MCP server, tools
├── v2/                       # Legacy V2 (deprecated)
├── rfl/                      # Experimental modules (agents, providers, ruvector)
├── beads-mcp/                # Beads issue tracker MCP server
├── beads-router-mcp/         # Beads router MCP bridge
└── tests/                    # Root-level integration tests
```

## Build & Test

The project has two build systems: root-level (tsc) and v3 monorepo (pnpm + tsc per package).

```bash
# Root package
npm run build              # tsc (compiles v3/**/*.ts to dist/)
npm test                   # vitest (root tests/)
npm run lint               # delegates to v3/@claude-flow/cli lint

# V3 monorepo (from v3/)
cd v3
pnpm install               # install all workspace dependencies
pnpm -r build              # build all packages
vitest run                 # run all v3 tests
vitest run __tests__/unit  # unit tests only
vitest run __tests__/integration  # integration tests only

# Single V3 package (from v3/@claude-flow/<pkg>)
cd v3/@claude-flow/cli
npm run build              # tsc
npm run test               # vitest run

# Run a single test file
npx vitest run __tests__/integration/memory-integration.test.ts

# Security tests
npm run test:security      # from root — runs v3/__tests__/security/

# CLI from source (local dev)
node bin/cli.js <command>  # from repo root
```

## Key Architecture Decisions

- **ESM-only**: All packages use `"type": "module"`. Use `.js` extensions in imports.
- **TypeScript**: Target ES2022, module ESNext, bundler resolution. Path alias `@v3/*` maps to `./v3/*`.
- **pnpm workspaces**: V3 monorepo at `v3/` uses pnpm. Root package uses npm.
- **DDD structure**: `v3/src/` follows Domain-Driven Design — domain entities, application services, infrastructure.
- **London School TDD**: Vitest with mock-first approach. `mockReset`, `clearMocks`, `restoreMocks` all true.
- **Vitest aliases**: `@` → `v3/src`, `@tests` → `v3/__tests__`, `@fixtures`, `@helpers`, `@mocks` also available.
- **CLI entry flow**: `bin/cli.js` → `v3/@claude-flow/cli/bin/cli.js` → `dist/src/index.js` (CommandParser dispatches to command modules).

## Publishing (3 Packages Must Stay in Sync)

All three packages must be published together with matching versions and ALL dist-tags updated:

1. `@claude-flow/cli` — build in `v3/@claude-flow/cli`, publish with `--tag alpha`, then add `latest` tag
2. `claude-flow` — publish from root with `--tag v3alpha`, then add `latest` and `alpha` tags
3. `ruflo` — publish from `ruflo/`, then add `latest` tag

Verify with `npm view <pkg> dist-tags --json` for all three before considering publish complete.

## Plugin Registry (IPFS/Pinata)

Registry CID lives in `v3/@claude-flow/cli/src/plugins/store/discovery.ts` (`LIVE_REGISTRY_CID`). Update both the live CID and the `demoPluginRegistry` fallback when modifying. Pinata credentials come from `.env` (never hardcode).

## File Organization Rules

- Source code → `/src` or `v3/@claude-flow/<pkg>/src/`
- Tests → `/tests` or `v3/__tests__/`
- Documentation → `/docs`
- Scripts → `/scripts`
- Never save working files to the repo root.

## Beads Issue Tracker

This project uses `bd` (beads) for issue tracking instead of TodoWrite or markdown TODOs.

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
bd remember "insight" # Persistent knowledge across sessions
```

## Active Technologies
- Zsh 5.9+ (shell scripts), Python 3.10+ (inline parsing) + gum (charmbracelet) 0.13+, fzf 0.40+, ruflo CLI (npm) (001-fix-rfl-rewire)
- N/A (rfl is a stateless wrapper; state lives in `.claude-flow/`) (001-fix-rfl-rewire)

## Recent Changes
- 001-fix-rfl-rewire: Added Zsh 5.9+ (shell scripts), Python 3.10+ (inline parsing) + gum (charmbracelet) 0.13+, fzf 0.40+, ruflo CLI (npm)
