# Feature Specification: Fix and Rewire rfl TUI Wrapper System

**Feature Branch**: `001-fix-rfl-rewire`
**Created**: 2026-03-25
**Status**: Draft
**Input**: User description: "Fix and rewire the entire rfl/ TUI wrapper system — broken MCP tool calls, missing handler sources, duplicated JSON parsing, hardcoded secrets paths, swarm topology mismatch, inconsistent table rendering, and all other broken integrations"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Interactive TUI Commands Execute Correctly (Priority: P1)

A developer uses the `rfl` interactive menu to run a command (e.g.,
`agent list`, `swarm status`, `memory search`). The command executes via
the correct MCP tool, parses the response, and displays formatted
output. No command silently fails or shows raw JSON.

**Why this priority**: The interactive TUI is the primary interface for
daily operations. Commands that silently fail or show garbled output make
the tool unusable.

**Independent Test**: Launch `rfl`, navigate to `agent > list` and
confirm a formatted table appears showing agent IDs, types, and
statuses. Repeat for `task list`, `memory list`, `swarm status`.

**Acceptance Scenarios**:

1. **Given** the swarm has running agents, **When** the user selects
   `agent > list`, **Then** a formatted table displays with Status, Type,
   and ID columns, color-coded by status.
2. **Given** the MCP server is not running, **When** the user runs any
   handler command, **Then** a clear error message appears instead of a
   Python traceback or empty output.
3. **Given** the user runs `memory search` with a query, **When** results
   exist, **Then** results display in a table with Key, Value, and Score
   columns.

---

### User Story 2 - Swarm and Hive-Mind Topology Consistency (Priority: P1)

A developer initializes a swarm or hive-mind via the interactive TUI.
The topology, agent count, and consensus settings match the project's
configured defaults (hierarchical-mesh, 15 agents, raft consensus)
rather than using hardcoded divergent values.

**Why this priority**: Topology mismatches between the TUI and project
configuration cause silent coordination failures and agent drift. The
`swarm.zsh` orchestrator hardcodes `mesh` topology and `_rfl_hive_start`
defaults to `mesh` — both diverge from the project's configured
`hierarchical-mesh`.

**Independent Test**: Run `rfl > swarm > init` and verify the swarm
state file shows `hierarchical-mesh` topology (not `mesh`). Run
`rfl > hive-mind > init` and confirm the same.

**Acceptance Scenarios**:

1. **Given** the project is configured for hierarchical-mesh topology,
   **When** the user runs swarm init through the TUI, **Then** the swarm
   is created with hierarchical-mesh topology and specialized strategy.
2. **Given** the hive-mind is initialized, **When** a queen is designated,
   **Then** the queen's coordination role is set and topology synced to
   hierarchical-mesh.
3. **Given** swarm start is invoked with agent types, **When** agents
   spawn, **Then** the swarm topology in the state file reads
   `hierarchical-mesh`, not `mesh`.

---

### User Story 3 - Suggestion Engine Uses Secure Key Retrieval (Priority: P2)

A developer uses the `rfl` interactive mode and the AI suggestion
engine provides next-step recommendations without requiring a hardcoded
key path. Suggestions work when the appropriate environment variable is
set and gracefully degrade when it is not.

**Why this priority**: Hardcoded key paths (`~/.keys`) break
portability and violate the project's security-at-boundaries principle
(Constitution Principle IV).

**Independent Test**: Set `DEEPSEEK_API_KEY` as an environment variable
and run a command in rfl. Confirm suggestions appear. Unset the variable
and confirm the deterministic fallback hints appear without errors.

**Acceptance Scenarios**:

1. **Given** `DEEPSEEK_API_KEY` is set as an environment variable,
   **When** a command completes, **Then** background suggestions are
   fetched and displayed.
2. **Given** no DeepSeek key is available, **When** a command completes,
   **Then** deterministic workflow hints appear as the fallback.
3. **Given** any configuration, **When** suggestions are generated,
   **Then** no API key value appears in process arguments, logs, or
   output.

---

### User Story 4 - Neural Handler Properly Integrated (Priority: P2)

A developer uses neural commands (status, patterns, predict, train,
optimize) through the TUI and they execute correctly. The neural handler
is sourced in the handler dispatch module and routes to the correct MCP
tools.

**Why this priority**: The `h-neural.zsh` handler file exists and is
functional, but `handlers.zsh` does not source it and the `_rfl_run`
dispatch function has no `neural` case — so neural commands fall through
to `_rfl_run_default` instead of the dedicated handler.

**Independent Test**: Run `rfl > neural > status` and confirm neural
system status is displayed with structured key-value output, not raw
`ruflo neural status` passthrough.

**Acceptance Scenarios**:

1. **Given** the neural system is initialized, **When** the user runs
   `neural > status`, **Then** neural status details display via the
   dedicated `_rfl_run_neural` handler, not the default passthrough.
2. **Given** the user runs `neural > train`, **When** training starts,
   **Then** a confirmation message appears with model type.
3. **Given** `handlers.zsh` is sourced, **Then** `h-neural.zsh` is also
   sourced and the `neural` case is handled in the `_rfl_run` dispatch.

---

### User Story 5 - Consistent JSON Parsing Across All Handlers (Priority: P2)

All handler modules use the shared `pylib.py` utilities (`pj()`, `sc()`,
`tbl()`) for JSON parsing and table rendering rather than duplicating
inline parsing logic. Output formatting is consistent across all
commands.

**Why this priority**: Duplicated JSON parsing in multiple handlers
creates maintenance burden and inconsistent error handling. Handlers
like `h-session.zsh`, `h-workflow.zsh` (some paths), `h-agent.zsh`
(list, pool), and `completions.zsh` manually re-implement the
brace-matching logic inline instead of using `pj()` from pylib.

**Independent Test**: Run commands from at least five different handler
domains (agent, task, session, workflow, neural) and verify all tables
use the same visual style (box-drawing characters, color coding,
column alignment).

**Acceptance Scenarios**:

1. **Given** any handler command returns JSON, **When** the output is
   parsed, **Then** parsing uses the shared `pj()` function from pylib.
2. **Given** a table is rendered, **When** displayed, **Then** the table
   uses consistent box-drawing style across all handlers.
3. **Given** a status value appears in output, **When** colored, **Then**
   the `sc()` semantic color function is used consistently.

---

### User Story 6 - Dependency Check at Startup (Priority: P3)

A developer launches `rfl` on a fresh machine. If `ruflo`, `gum`, or
`fzf` are missing, the TUI shows a clear message listing what needs to
be installed instead of failing mid-command with cryptic errors.

**Why this priority**: Currently `rfl` checks for `fzf` and `gum` but
does not verify `ruflo` availability. A missing `ruflo` causes every
handler to fail individually rather than failing fast at launch.

**Independent Test**: Temporarily rename `ruflo` binary, run `rfl`, and
confirm an error message names `ruflo` as missing.

**Acceptance Scenarios**:

1. **Given** `ruflo` is not in PATH, **When** the user runs `rfl`,
   **Then** an error message names `ruflo` as a missing dependency.
2. **Given** `gum` is not installed, **When** the user runs `rfl`,
   **Then** an error message names `gum` as a missing dependency.
3. **Given** all dependencies are present, **When** the user runs `rfl`,
   **Then** the interactive menu appears with no warnings.

---

### User Story 7 - Consistent Table and Border Styling (Priority: P3)

All handler output uses a single, consistent table and border convention.
Currently some handlers use `gum table --border thick`, others use
`--border rounded`, some use pipe `|` separators, others use comma `,`.
Headers vary between `gum style --border thick` boxes and plain bold
text.

**Why this priority**: Visual inconsistency across command domains
makes the TUI feel unpolished and harder to scan.

**Independent Test**: Run `agent list`, `task list`, `session list`,
`workflow list`, `hooks list` and visually compare border styles. All
MUST use the same convention.

**Acceptance Scenarios**:

1. **Given** the user runs list commands across different domains,
   **When** output renders, **Then** all tables use the same border
   style and separator character.
2. **Given** a section header is displayed, **When** rendered, **Then**
   it uses the same formatting convention across all handlers.

---

### Edge Cases

- What happens when `ruflo` binary is not installed or not in PATH?
  The TUI MUST display a clear error at launch pointing users to install
  instructions instead of failing mid-command.
- What happens when `gum` or `fzf` are not installed? The TUI MUST
  detect missing dependencies at startup and list what needs to be
  installed.
- What happens when MCP tool responses return unexpected JSON shapes
  (missing fields, empty arrays, nested errors)? Handlers MUST display
  "(no data)" or a brief error rather than Python tracebacks.
- What happens when the user's terminal does not support ANSI colors?
  Output MUST remain readable (no raw escape sequences visible).
- What happens when the spinner timeout is exceeded (default 30s)?
  The TUI MUST cancel the hung command and display a timeout message.
- What happens when `build-args.zsh` encounters a command:subcommand
  pair not covered by its case statement? It MUST fall through cleanly
  without prompting for wrong arguments.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `rfl` main script MUST verify that `ruflo`, `gum`,
  `fzf`, and `python3` are installed at startup and display missing
  dependency names with install guidance before entering the menu.
- **FR-002**: The handler dispatch module (`handlers.zsh`) MUST source
  `h-neural.zsh` and route the `neural` command case to
  `_rfl_run_neural` in the `_rfl_run` dispatch function.
- **FR-003**: All handler modules MUST use `${_RFL_PYLIB}` injection
  with the shared `pj()`, `sc()`, and `tbl()` functions for JSON
  parsing and formatting, eliminating inline brace-matching duplication.
- **FR-004**: The swarm init handler (`swarm.zsh` `_rfl_swarm_start`)
  MUST use the project-configured topology (`hierarchical-mesh`) and
  strategy (`specialized`) instead of hardcoded `mesh` topology.
- **FR-005**: The hive-mind init handler (`swarm.zsh` `_rfl_hive_start`)
  MUST default to `hierarchical-mesh` topology matching the project
  configuration instead of hardcoded `mesh`.
- **FR-006**: The suggestion engine (`suggest.zsh`) MUST read the
  DeepSeek API key from the `DEEPSEEK_API_KEY` environment variable,
  not from a hardcoded file path (`~/.keys`).
- **FR-007**: The suggestion engine MUST NOT expose API key values in
  process arguments, command output, or log files.
- **FR-008**: All completion fetchers (`completions.zsh`) that call
  `ruflo mcp exec --tool` MUST handle MCP server unavailability
  gracefully, returning empty results instead of error output.
- **FR-009**: The `_rfl_run_default` fallback handler MUST properly
  decode `__RFL_SP__` space placeholders before passing arguments to
  `ruflo` (currently implemented — verify consistent application in
  all handler paths).
- **FR-010**: All gum table rendering MUST use a single consistent
  separator and border style across all handlers. Standardize on one
  convention (either pipe `|` + `thick` or comma `,` + `rounded` —
  not a mix of both).
- **FR-011**: Handler commands that perform destructive operations
  (stop agent, delete session, cancel task, shutdown hive, config
  reset) MUST prompt for confirmation before executing.
- **FR-012**: The `build-args.zsh` interactive argument builder MUST
  correctly handle all advertised command:subcommand pairs in the
  command tree (`commands.zsh`) without falling through to a wrong
  case or silently skipping.
- **FR-013**: Handlers for `h-session.zsh` (list), `h-agent.zsh`
  (list, pool), `h-workflow.zsh` (list, template), and
  `completions.zsh` fetchers MUST be updated to use `${_RFL_PYLIB}`
  with `pj()` instead of inline brace-matching logic.
- **FR-014**: The `h-misc.zsh` handler for `mcp:status`, `config:get`,
  and `hooks:metrics` MUST use `${_RFL_PYLIB}` for consistent color
  constants and parsing rather than re-declaring inline ANSI codes.
- **FR-015**: Agent YAML configs in `rfl/agents/` MUST be consumed by
  at least one code path (e.g., agent spawn defaults, type validation),
  or be removed if vestigial.
- **FR-016**: The preview cache generator (`preview.zsh`) MUST generate
  accurate previews for all commands in the command tree, including
  hive-mind subcommands that currently have hardcoded help text
  potentially out of sync with actual capabilities.

### Key Entities

- **Handler**: A domain-specific command processor that receives a
  subcommand and arguments, calls MCP tools, parses JSON responses,
  and renders formatted output. Located in `rfl.d/h-*.zsh` files.
- **Command Tree**: The hierarchical structure of top-level commands
  (47 commands), subcommands, and their associated categories
  (Primary, Advanced, Utility, Analysis, Management) used by the fzf
  interactive menu. Defined in `rfl.d/commands.zsh`.
- **Pylib Runtime**: The shared Python utilities (`pj`, `sc`, `tbl`,
  `vl`) loaded once into `$_RFL_PYLIB` and injected into every
  inline Python script across all handlers.
- **Suggestion**: An AI-generated next-step recommendation displayed
  after command execution, sourced from either a live DeepSeek API
  call or a deterministic `_rfl_workflow_hints` fallback.
- **Build Args**: The interactive argument collection layer
  (`build-args.zsh`) that prompts users for required parameters via
  gum before dispatching to handlers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of interactive TUI commands across all handler
  domains (agent, task, session, workflow, memory, swarm, hive-mind,
  neural, status, mcp, config, hooks, progress) produce formatted
  output or a clear error message — zero raw JSON dumps or Python
  tracebacks in user-facing output.
- **SC-002**: Swarm and hive-mind initialization via the TUI create
  topology matching the project's configured defaults
  (hierarchical-mesh) in 100% of cases.
- **SC-003**: The suggestion engine operates without any hardcoded
  file path references, sourcing keys exclusively from environment
  variables.
- **SC-004**: All JSON parsing in handler modules uses shared pylib
  utilities — zero instances of inline brace-matching logic outside
  of `pylib.py`.
- **SC-005**: `rfl --test-all` runs with zero failures on a system
  with `ruflo`, `gum`, `fzf`, and `python3` installed.
- **SC-006**: Destructive commands (agent stop, session delete, task
  cancel, hive shutdown, config reset) prompt for confirmation before
  executing in 100% of cases.
- **SC-007**: All table outputs across handler domains use the same
  border style convention — zero mixed `thick`/`rounded` borders
  within a single session.
- **SC-008**: The `rfl` startup dependency check catches all missing
  tools (`ruflo`, `gum`, `fzf`, `python3`) and names them in the
  error message.

## Assumptions

- The `ruflo` CLI binary is installed globally via npm and available
  in PATH. The rfl wrapper does not install or manage it.
- `gum` (charmbracelet) version 0.13+ and `fzf` version 0.40+ are
  installed. The rfl wrapper will check for their presence but not
  install them.
- Python 3.10+ is available in PATH for inline JSON parsing scripts.
- The MCP server (`ruflo mcp exec --tool <name>`) responds with JSON
  containing a top-level object. Tool names match the existing
  conventions (e.g., `agent_list`, `task_create`, `swarm_init`).
- The existing `rfl --test-all` mode exercises all handlers and can
  serve as the integration test harness.
- The project configuration for topology (`hierarchical-mesh`),
  strategy (`specialized`), and max agents (`15`) is the single
  source of truth. Handler defaults MUST match these values.
- The `cc`, `cc.bak`, and provider launcher scripts (`cczai`, `ccmm`,
  `ccds`) are out of scope for this specification. They will be
  addressed separately.
