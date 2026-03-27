# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Ruflo v3.5** (formerly "Claude Flow") — Enterprise AI agent orchestration for Claude Code.
Three npm packages published in lockstep: `@claude-flow/cli`, `claude-flow` (umbrella), `ruflo` (alias). Current version: 3.5.42.

## Repository Structure

```
agent.flo/                    # Root package (claude-flow@3.5.42, ESM)
├── bin/                      # CLI entry points
│   ├── cli.js                # Umbrella entry — proxies to v3/@claude-flow/cli
│   ├── mcp-server.js         # MCP server runner
│   ├── npx-repair.js         # NPX compatibility fix
│   └── npx-safe-launch.js    # Safe NPX launcher
├── ruflo/                    # ruflo npm package (thin wrapper, depends on @claude-flow/cli)
├── v3/                       # V3 monorepo (pnpm workspaces)
│   ├── @claude-flow/         # 20+ workspace packages (see below)
│   ├── src/                  # V3 core domain modules (DDD)
│   │   ├── agent-lifecycle/  # Agent domain entity and lifecycle
│   │   ├── coordination/     # SwarmCoordinator application service
│   │   ├── task-execution/   # Task entity, WorkflowEngine
│   │   ├── memory/           # Memory entity, HybridBackend, SQLiteBackend, AgentDBBackend
│   │   ├── infrastructure/   # Plugins (PluginManager), MCP server, tools
│   │   └── shared/types/     # Shared type definitions
│   └── plugins/              # 15 domain-specific plugins (agentic-qe, cognitive-kernel, etc.)
├── v2/                       # Legacy V2 (deprecated)
├── rfl/                      # Experimental CLI wrappers + Python CLI (pyrfl)
│   ├── rfl                   # Main RFL wrapper script (Zsh)
│   ├── rft                   # RFT test runner
│   ├── pyrfl/                # Python CLI (cli.py, handlers.py, ui.py, mcp.py)
│   ├── providers/            # LLM provider configs (deepseek, glm, minimax, zai)
│   ├── ruflo/                # RuVector implementation
│   └── ruvector-postgres/    # PostgreSQL vector DB (docker-compose)
├── beads-mcp/                # Beads issue tracker MCP server (v1.0.0)
├── beads-router-mcp/         # Beads router MCP bridge (v1.0.0, reduces 81 tools to 3)
├── agents/                   # Agent configs (architect, coder, reviewer, security-architect, tester)
├── plugin/                   # Plugin hooks + symlinks to .claude/{agents,commands,skills}
├── specs/                    # Feature specifications (e.g., 001-fix-rfl-rewire)
├── scripts/                  # Shell scripts (cleanup-v3, install, rfl-wave2-dispatch, verify-appliance)
├── docs/                     # Documentation (META-PLAN-unified-state.md)
└── tests/                    # Root-level tests + docker-regression suite (22 test scripts)
```

### V3 @claude-flow/ Packages

| Package | Version | Purpose |
|---------|---------|---------|
| `cli` | 3.5.42 | Main CLI — 40 command files, 26 commands, 140+ subcommands |
| `aidefence` | 3.0.2 | AI manipulation defense system (AIMDS) |
| `browser` | 3.0.0-alpha.2 | Web browser automation for agents |
| `claims` | 3.0.0-alpha.8 | Claims-based authorization |
| `codex` | 3.0.0-alpha.9 | Dual-mode Claude + Codex collaboration |
| `deployment` | 3.0.0-alpha.7 | Deployment automation |
| `embeddings` | 3.0.0-alpha.12 | Vector embeddings (75x faster with ONNX) |
| `guidance` | 3.0.0-alpha.1 | Governance control plane |
| `hooks` | 3.0.0-alpha.7 | 27 hooks + 12 background workers |
| `integration` | 3.0.0 | agentic-flow integration |
| `mcp` | 3.0.0-alpha.8 | MCP server/transport optimization |
| `memory` | 3.0.0-alpha.12 | AgentDB + HNSW vector search |
| `neural` | 3.0.0-alpha.7 | Pattern training and prediction |
| `performance` | 3.0.0-alpha.6 | Profiling and benchmarking |
| `plugins` | 3.0.0-alpha.7 | Plugin system |
| `providers` | 3.0.0-alpha.6 | LLM provider integrations |
| `security` | 3.0.0-alpha.6 | Input validation, CVE remediation |
| `shared` | 3.0.0-alpha.7 | Shared types and utilities |
| `swarm` | 3.0.0-alpha.6 | Multi-agent swarm coordination |
| `testing` | 3.0.0-alpha.6 | Testing utilities |

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

# Docker regression tests
tests/docker-regression/   # 22 scripts covering agents, CLI, hooks, MCP, memory, etc.

# CLI from source (local dev)
node bin/cli.js <command>  # from repo root
```

## Key Architecture Decisions

- **ESM-only**: All packages use `"type": "module"`. Use `.js` extensions in imports.
- **TypeScript**: Target ES2022, module ESNext, bundler resolution. Path alias `@v3/*` maps to `./v3/*`.
- **pnpm workspaces**: V3 monorepo at `v3/` uses pnpm. Root package uses npm.
- **DDD structure**: `v3/src/` follows Domain-Driven Design — domain entities, application services, infrastructure.
- **London School TDD**: Vitest (v4.1.1) with mock-first approach. `mockReset`, `clearMocks`, `restoreMocks` all true.
- **Vitest aliases**: `@` -> `v3/src`, `@tests` -> `v3/__tests__`, `@fixtures`, `@helpers`, `@mocks` also available.
- **CLI entry flow**: `bin/cli.js` -> `v3/@claude-flow/cli/bin/cli.js` -> `dist/src/index.js` (CommandParser dispatches to command modules). Auto-detects MCP mode when stdin is piped.
- **Node requirement**: >=20.0.0

## CLI Commands Reference

Major CLI commands in `v3/@claude-flow/cli/src/commands/`:

| Command | File Size | Key Subcommands |
|---------|-----------|-----------------|
| `agent` | 33KB | spawn, list, status, stop, metrics, pool, health, logs |
| `swarm` | 28KB | init, status, spawn, monitor, strategies |
| `memory` | 48KB | store, search, usage, vector operations |
| `mcp` | 26KB | server management, transport config |
| `hooks` | 189KB | 27 hook types + 12 background workers |
| `hive-mind` | 50KB | Byzantine fault-tolerant consensus |
| `neural` | 70KB | pattern training, prediction |
| `embeddings` | 69KB | vector embeddings (ONNX acceleration) |
| `analyze` | 72KB | code analysis, bottleneck detection |
| `init` | 41KB | project initialization |
| `plugins` | 34KB | install, publish, discover |
| `route` | 32KB | task routing |
| `doctor` | 23KB | health checks |
| `config` | 13KB | configuration management |
| `deployment` | 13KB | deploy automation |

## Publishing (3 Packages Must Stay in Sync)

All three packages must be published together with matching versions and ALL dist-tags updated:

1. `@claude-flow/cli` — build in `v3/@claude-flow/cli`, publish with `--tag alpha`, then add `latest` tag
2. `claude-flow` — publish from root with `--tag v3alpha`, then add `latest` and `alpha` tags
3. `ruflo` — publish from `ruflo/`, then add `latest` tag

Verify with `npm view <pkg> dist-tags --json` for all three before considering publish complete.

## Plugin System

### Registry (IPFS/Pinata)
Registry CID lives in `v3/@claude-flow/cli/src/plugins/store/discovery.ts` (`LIVE_REGISTRY_CID`). Update both the live CID and the `demoPluginRegistry` fallback when modifying. Pinata credentials come from `.env` (never hardcode).

### V3 Plugins (v3/plugins/)
15 domain-specific plugins: agentic-qe, code-intelligence, cognitive-kernel, financial-risk, gastown-bridge, healthcare-clinical, hyperbolic-reasoning, legal-contracts, neural-coordination, perf-optimizer, prime-radiant, quantum-optimizer, ruvector-upstream, teammate-plugin, test-intelligence.

## CI/CD

GitHub workflows in `.github/workflows/`:
- `ci.yml` — Primary CI pipeline
- `v3-ci.yml` — V3 monorepo CI
- `integration-tests.yml` — Integration test suite
- `verification-pipeline.yml` — Verification testing
- `rollback-manager.yml` — Deployment rollback automation
- `status-badges.yml` — Status reporting

## File Organization Rules

- Source code -> `/src` or `v3/@claude-flow/<pkg>/src/`
- Tests -> `/tests` or `v3/__tests__/`
- Documentation -> `/docs`
- Scripts -> `/scripts`
- Agent configs -> `/agents` or `.claude/agents/`
- Feature specs -> `/specs`
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

## Intelligence System (RuVector)

4-step pipeline: RETRIEVE (HNSW) -> JUDGE (verdicts) -> DISTILL (LoRA) -> CONSOLIDATE (EWC++)

Components: SONA (<0.05ms), MoE (8 experts), HNSW (150x-12,500x faster search), Flash Attention (2.49x-7.47x speedup)

Located in `v3/@claude-flow/cli/src/ruvector/`.

## Active Technologies

- **Runtime**: Node.js >=20.0.0, TypeScript ^5.0.0
- **Testing**: Vitest 4.1.1, v8 coverage
- **Build**: tsc (root), pnpm workspaces (v3)
- **Shell**: Zsh 5.9+ (scripts), Python 3.10+ (pyrfl)
- **Tools**: gum (charmbracelet) 0.13+, fzf 0.40+
- **Dependencies**: semver, zod (runtime); tsx ^4.21.0, eslint ^8.0.0 (dev)
