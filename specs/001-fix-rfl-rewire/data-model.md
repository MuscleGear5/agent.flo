# Data Model: rfl TUI Wrapper

**Branch**: `001-fix-rfl-rewire` | **Date**: 2026-03-25

## Entities

### Handler Module

A domain-specific command processor sourced by `handlers.zsh`.

| Field | Type | Description |
|-------|------|-------------|
| `file` | string | `rfl.d/h-<domain>.zsh` |
| `function` | string | `_rfl_run_<domain>` — the dispatch target |
| `subcommands` | string[] | Case statement branches within the function |
| `uses_pylib` | boolean | Whether `${_RFL_PYLIB}` is injected into inline Python |
| `sourced` | boolean | Whether `handlers.zsh` sources it |
| `dispatched` | boolean | Whether `_rfl_run` case statement routes to it |

**Current handler registry:**

| Domain | File | Function | Sourced | Dispatched | Uses pylib |
|--------|------|----------|---------|------------|------------|
| agent | h-agent.zsh | `_rfl_run_agent` | Yes | Yes | Partial |
| task | h-task.zsh | `_rfl_run_task` | Yes | Yes | Partial |
| swarm | h-swarm.zsh | `_rfl_run_swarm` | Yes | Yes | Yes |
| hive-mind | h-hive.zsh + h-hive2.zsh | `_rfl_run_hive` + `_rfl_run_hive2` | Yes | Yes | Partial |
| session | h-session.zsh | `_rfl_run_session` | Yes | Yes | No |
| workflow | h-workflow.zsh | `_rfl_run_wf` | Yes | Yes | Partial |
| memory | h-memory.zsh | `_rfl_run_memory` | Yes | Yes | Yes |
| misc | h-misc.zsh | `_rfl_run_misc` | Yes | Yes (multi-cmd) | Partial |
| **neural** | **h-neural.zsh** | **`_rfl_run_neural`** | **No** | **No** | **Yes** |

### Command Tree Entry

Defined in `commands.zsh` SUBCMDS associative array.

| Field | Type | Description |
|-------|------|-------------|
| `command` | string | Top-level command (e.g., `agent`, `swarm`) |
| `subcommands` | string | Space-separated subcommand list |
| `category` | string | Primary, Advanced, Utility, Analysis, Management |
| `has_build_args` | boolean | Whether `build-args.zsh` has a case handler |
| `has_handler` | boolean | Whether a dedicated handler exists (vs default) |

**Stats**: 47 commands, 140+ subcommands, 5 categories.

### Pylib Functions

| Function | Signature | Purpose |
|----------|-----------|---------|
| `pj(raw)` | `str -> dict` | Extract outermost JSON object from mixed text |
| `sc(s)` | `str -> str` | Semantic status colorizer (first-word lookup) |
| `tbl(cols, rows)` | `list, list[list] -> str` | Box-drawing table matching ruflo |
| `vl(s)` | `str -> int` | Visible length (strip ANSI) |

**SC color map**: 50+ status words across 5 categories (green/yellow/orange/grey/red).

### Suggestion Source

| Field | Type | Description |
|-------|------|-------------|
| `source` | enum | `deepseek` or `fallback` |
| `api_key` | string | From `DEEPSEEK_API_KEY` env var only |
| `suggestions` | list | Up to 5 labeled next-step recommendations |

## State Transitions

### Handler Dispatch

```
fzf selection -> build_args(cmd, sub)
  -> _rfl_run_capture(cmd, sub, args)
    -> _rfl_run(cmd, sub, args)
      -> case: dedicated handler OR _rfl_run_default (passthrough)
    -> _rfl_suggest_bg(cmd, sub)
```

### JSON Parsing (Target State)

```
MCP returns mixed text + JSON
  -> stdin to Python inline script
  -> ${_RFL_PYLIB} provides pj/sc/tbl
  -> d = pj(sys.stdin.read())
  -> render with sc() for colors, tbl() for tables
```

## Relationships

- `handlers.zsh` sources all `h-*.zsh` files (1:N)
- `h-*.zsh` files inject `${_RFL_PYLIB}` into Python blocks (N:1)
- `build-args.zsh` maps `cmd:sub` pairs to gum prompts (1:1)
- `completions.zsh` fetchers provide dynamic lists to `build-args.zsh` pickers (N:N)
- `suggest.zsh` fires after `_rfl_run_capture` completes (sequential)
