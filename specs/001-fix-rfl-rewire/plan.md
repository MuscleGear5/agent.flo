# Implementation Plan: Fix and Rewire rfl TUI Wrapper System

**Branch**: `001-fix-rfl-rewire` | **Date**: 2026-03-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-fix-rfl-rewire/spec.md`

## Summary

Fix and rewire the `rfl` interactive TUI wrapper so that all handler modules are properly sourced, all JSON parsing uses shared `pylib.py` utilities, swarm/hive-mind topology defaults match project configuration (`hierarchical-mesh`), API key handling uses environment variables instead of hardcoded paths, and table/border styling is consistent across all handler domains. This is a pure zsh/Python refactor of the `rfl/rfl.d/` wrapper layer — no changes to the upstream `ruflo` CLI or MCP tool implementations.

## Technical Context

**Language/Version**: Zsh 5.9+ (shell scripts), Python 3.10+ (inline parsing)
**Primary Dependencies**: gum (charmbracelet) 0.13+, fzf 0.40+, ruflo CLI (npm)
**Storage**: N/A (rfl is a stateless wrapper; state lives in `.claude-flow/`)
**Testing**: `rfl --test-all` integration harness (exercises all command paths)
**Target Platform**: Linux/macOS terminals with ANSI color support
**Project Type**: CLI/TUI wrapper
**Performance Goals**: Commands complete within 15s spinner timeout
**Constraints**: Must work on terminals without true-color; all state owned by ruflo backend; no modification to upstream v3 CLI
**Scale/Scope**: 47 top-level commands, 140+ subcommands, 10 handler modules, 1 completions module

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Assessment |
|-----------|--------|------------|
| **I. Modular Monorepo** | PASS | rfl is a standalone wrapper outside v3 workspaces. No cross-package imports. Handler modules are independently sourceable. |
| **II. ESM & TypeScript Strictness** | N/A | rfl is pure zsh/Python — no TypeScript involved. |
| **III. Test-First with London School TDD** | PARTIAL | rfl uses `--test-all` integration testing, not London School TDD. Shell scripts lack unit test infrastructure. Acceptable deviation — zsh handlers are thin wrappers, not domain logic. |
| **IV. Security at Boundaries** | VIOLATION → FIXED | Spec FR-006/FR-007 address the hardcoded `~/.keys` path in `suggest.zsh`. Plan remediates: API keys sourced from environment variables only, never exposed in process args or logs. |
| **V. Coordinated Publishing** | N/A | rfl is not a published npm package. |
| **VI. DDD Bounded Contexts** | N/A | rfl is a presentation layer wrapper, not domain code. |
| **VII. CLI Coordinates, Agents Execute** | PASS | rfl delegates all execution to `ruflo mcp exec --tool`. It performs no code generation or file writes outside its own temp files. Consistent with "MCP tools expose coordination primitives." |

**Gate Result**: PASS — Principle IV violation is the subject of this fix (FR-006/FR-007). Principle III deviation is justified for shell wrapper code.

## Project Structure

### Documentation (this feature)

```text
specs/001-fix-rfl-rewire/
├── plan.md              # This file
├── research.md          # Phase 0: unknowns resolution
├── data-model.md        # Phase 1: entity definitions
├── quickstart.md        # Phase 1: verification guide
└── contracts/           # Phase 1: handler interface contracts
```

### Source Code (repository root)

```text
rfl/
├── rfl                   # Main entry (interactive + oneshot dispatch)
├── rft                   # AI tutor (out of scope)
├── rfl.d/
│   ├── commands.zsh      # Command tree data tables (47 cmds)
│   ├── handlers.zsh      # Dispatch router + default handler
│   ├── helpers.zsh       # Spinner, colorizer, pylib loader
│   ├── build-args.zsh    # Interactive argument builder (gum)
│   ├── completions.zsh   # MCP-based completion fetchers
│   ├── preview.zsh       # fzf preview cache generator
│   ├── suggest.zsh       # AI suggestion engine
│   ├── swarm.zsh         # Swarm/hive-mind start orchestration
│   ├── pylib.py          # Shared Python helpers (pj, sc, tbl, vl)
│   ├── h-agent.zsh       # Agent handlers
│   ├── h-task.zsh        # Task handlers
│   ├── h-swarm.zsh       # Swarm handlers
│   ├── h-hive.zsh        # Hive-mind handlers (init/spawn/status/task)
│   ├── h-hive2.zsh       # Hive-mind handlers (join/leave/consensus/broadcast/memory)
│   ├── h-session.zsh     # Session handlers
│   ├── h-workflow.zsh    # Workflow handlers
│   ├── h-memory.zsh      # Memory handlers
│   ├── h-neural.zsh      # Neural handlers (NOT WIRED)
│   └── h-misc.zsh        # Status/mcp/config/hooks/progress handlers
└── agents/               # Agent YAML configs (vestigial — FR-015)
```

**Structure Decision**: Single flat directory. All handler modules are zsh files sourced by `handlers.zsh`. No new directories needed. The fix is wiring, deduplication, and configuration alignment — not restructuring.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle III (no London School TDD for zsh) | Shell scripts are thin presentation wrappers, not domain logic | Mocking zsh functions adds tooling burden disproportionate to the complexity of the code |
