# Research: Fix and Rewire rfl TUI Wrapper System

**Branch**: `001-fix-rfl-rewire` | **Date**: 2026-03-25

## R-001: Neural Handler Wiring Gap

**Decision**: Wire `h-neural.zsh` into `handlers.zsh` via source + dispatch case.

**Rationale**: `h-neural.zsh` defines `_rfl_run_neural()` (lines 4-157) with handlers for `status`, `patterns`, `predict`, `train`, `optimize`, and more. But `handlers.zsh` never sources it and the `_rfl_run` case statement has no `neural)` entry — so all neural commands silently fall through to `_rfl_run_default`, which just proxies to `ruflo neural <sub>` without the custom formatting.

**Fix**: Add `source "${_hdir}/h-neural.zsh"` in handlers.zsh line ~15, and add `neural) _rfl_run_neural "$sub" "$@" ;;` to the case statement.

**Alternatives considered**: None — this is a missing source/dispatch line, not a design choice.

## R-002: Inline JSON Parsing Duplication

**Decision**: Replace all inline brace-matching with `pj()` from `${_RFL_PYLIB}`.

**Rationale**: 13+ locations across 7 files manually implement `txt.rindex('}')` + brace-balance loop instead of using the `pj()` helper that does the same thing. This creates maintenance burden and inconsistent error handling. Files affected:

| File | Inline Instances | Already Uses pylib? |
|------|-----------------|---------------------|
| `h-task.zsh` | 2 (lines 15-20, 122-127) | Yes, partially (line 44 uses `pj()`) |
| `h-session.zsh` | 2 (lines 17-22, 90-95) | No |
| `h-workflow.zsh` | 2 (lines 17-22, 66-71) | Yes, partially |
| `completions.zsh` | 4 (lines 28, 40, 52, 74) | No |
| `h-hive2.zsh` | 1 (line 52) | No |
| `h-misc.zsh` | 1 (line 19) | Partially |
| `swarm.zsh` | 1 (line 89) | No |

**Fix**: For each instance, replace the manual parsing with `${_RFL_PYLIB}` injection + `d=pj(sys.stdin.read())`. For `completions.zsh`, also add `${_RFL_PYLIB}` since it currently doesn't load pylib at all.

**Alternatives considered**: Creating a separate `_rfl_parse_json` zsh function that wraps the Python call. Rejected because the Python inline scripts need the color constants and table functions too — `${_RFL_PYLIB}` gives the full toolkit.

## R-003: API Key Handling in suggest.zsh

**Decision**: Read from `DEEPSEEK_API_KEY` environment variable, remove `~/.keys` file path.

**Rationale**: Line 5 of `suggest.zsh` reads:
```zsh
_RFL_DEEPSEEK_KEY=$(grep 'DEEPSEEK_API_KEY=' ~/.keys 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'")
```
This violates Constitution Principle IV (Security at Boundaries): "Secrets MUST NOT appear in source, commits, or logs. API keys MUST be loaded from environment variables at runtime." The `~/.keys` path also breaks portability.

**Fix**: Replace with:
```zsh
_RFL_DEEPSEEK_KEY="${DEEPSEEK_API_KEY:-}"
```
Fallback to deterministic hints when empty (existing line 29 check handles this).

**Alternatives considered**: Reading from `.env` file via `dotenv` pattern. Rejected — environment variable is the simplest approach, and the existing fallback logic already handles the empty-key case.

## R-004: Completions Error Handling

**Decision**: Keep silent failures but add `${_RFL_PYLIB}` for consistent parsing.

**Rationale**: `completions.zsh` defines fetcher functions (`_rfl_agents`, `_rfl_tasks`, `_rfl_sessions`, etc.) that call `ruflo mcp exec --tool <name>`. When MCP is unavailable, Python try/except catches silently and returns empty list. This is acceptable UX — the user sees empty pickers, not tracebacks.

**Fix**: Replace inline parsing with `${_RFL_PYLIB}` (R-002). No change to error handling pattern. The empty-result behavior is correct for interactive use.

**Alternatives considered**: Adding a `_rfl_mcp_available()` pre-check. Rejected — adds latency to every completion fetch, and silent-empty is fine.

## R-005: Topology Hardcoding

**Decision**: Read topology from project config, fall back to `hierarchical-mesh`.

**Rationale**: `_rfl_swarm_start()` in `swarm.zsh` line 12 hardcodes `"topology":"mesh"`. `_rfl_hive_start()` line 50 defaults to `mesh`. Project configuration is `hierarchical-mesh` with `specialized` strategy.

**Fix for `_rfl_swarm_start()`**: Read topology from ruflo config:
```zsh
local topo=$(ruflo config get swarm.topology 2>/dev/null | grep -oP '"value"\s*:\s*"\K[^"]+' || echo "hierarchical-mesh")
```
Then use `$topo` in the MCP call instead of hardcoded `"mesh"`.

**Fix for `_rfl_hive_start()`**: Change default from `mesh` to `hierarchical-mesh`:
```zsh
local topo="${1:-hierarchical-mesh}"
```

**Alternatives considered**: Hardcoding `hierarchical-mesh` directly. Acceptable but less flexible — reading from config means topology changes propagate automatically.

## R-006: Agent YAML Configs (Vestigial)

**Decision**: Remove `rfl/agents/` directory.

**Rationale**: 5 YAML files exist (`architect.yaml`, `coder.yaml`, `reviewer.yaml`, `security-architect.yaml`, `tester.yaml`). Zero references found anywhere in the rfl codebase. Agent types are discovered dynamically via `_rfl_agent_types()` in `completions.zsh`. These YAMLs are dead code.

**Fix**: `rm -r rfl/agents/` and remove from git.

**Alternatives considered**: Wiring YAMLs into agent spawn as default configs. Rejected — MCP `agent_spawn` already handles defaults, and these YAMLs duplicate `.claude/agents/`.

## R-007: build-args.zsh Missing Handlers

**Decision**: Add missing case handlers for `performance` and `neural` subcommands.

**Rationale**: Two gaps found:
1. `performance` command (5 subcommands: benchmark, profile, metrics, optimize, bottleneck) — NO case handler at all
2. `neural` (7 subcommands missing: status, patterns, benchmark, list, export, import)

Most are read-only (status, list, metrics) and need no args. But `performance:benchmark`, `neural:export/import` could benefit from arg prompts.

**Fix**: Add case handlers. Read-only commands get no-op entries (fall through). Commands needing args get gum prompts.

## R-008: Upstream Reality — MCP Tools Are CRUD-Only

**Decision**: Document as out of scope. rfl fixes proceed assuming MCP tools return valid JSON (they do).

**Rationale**: ALL MCP tools are purely JSON state management in `.claude-flow/*.json` files. No process spawning, no LLM execution. Agents are JSON records that sit at `idle` forever. Tasks are records that never execute. The domain layer (`v3/src/`) has `Agent.executeTask()`, `SwarmCoordinator`, `WorkflowEngine` but none are called by MCP tool handlers.

This is critical but upstream of rfl. The rfl wrapper correctly displays whatever MCP returns. The fix for "agents always idle" is in `v3/@claude-flow/cli/src/mcp-tools/` — not in rfl.

**Future spec needed**: Separate spec to bridge MCP tools to actual execution (Claude Code Task tool, Anthropic provider, subprocess spawning).
