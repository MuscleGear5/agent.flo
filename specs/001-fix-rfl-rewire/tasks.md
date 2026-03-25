# Tasks: Fix and Rewire rfl TUI Wrapper System

**Input**: Design documents from `/specs/001-fix-rfl-rewire/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1-US7)
- Exact file paths included

## Path Conventions

All paths relative to repository root (`agent.flo/`):
- Handler modules: `rfl/rfl.d/h-*.zsh`
- Core modules: `rfl/rfl.d/*.zsh`
- Python helpers: `rfl/rfl.d/pylib.py`
- Main entry: `rfl/rfl`

---

## Phase 1: Setup

**Purpose**: Verify environment and establish baseline

- [ ] T001 Run `rfl --test-all` and record current pass/fail/warn counts as baseline
- [ ] T002 Verify `ruflo`, `gum`, `fzf`, `python3` are all available in PATH

**Checkpoint**: Baseline recorded — know exactly what's broken before fixing

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure fixes that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 Wire neural handler: add `source "${_hdir}/h-neural.zsh"` to `rfl/rfl.d/handlers.zsh` after line 14
- [ ] T004 Wire neural dispatch: add `neural) _rfl_run_neural "$sub" "$@" ;;` case to `_rfl_run` in `rfl/rfl.d/handlers.zsh`
- [ ] T005 Add `ruflo` to startup dependency check in `rfl/rfl` (after fzf/gum checks, before interactive mode)
- [ ] T006 Add `python3` to startup dependency check in `rfl/rfl` (after ruflo check)
- [ ] T007 Remove vestigial `rfl/agents/` directory (5 dead YAML files per R-006)

**Checkpoint**: Foundation ready — all handlers wired, dependencies checked, dead code removed

---

## Phase 3: User Story 1 — Interactive TUI Commands Execute Correctly (P1) MVP

**Goal**: All handler commands produce formatted output or clear errors — zero raw JSON dumps or Python tracebacks.

**Independent Test**: Run `rfl agent list`, `rfl task list`, `rfl session list`, `rfl workflow list`, `rfl memory list` — all show formatted tables.

### Implementation for User Story 1

- [ ] T008 [P] [US1] Replace inline brace-matching in `rfl/rfl.d/h-task.zsh` lines 15-20 with `${_RFL_PYLIB}` + `pj()`
- [ ] T009 [P] [US1] Replace inline brace-matching in `rfl/rfl.d/h-task.zsh` lines 122-127 (task assign) with `pj()`
- [ ] T010 [P] [US1] Replace inline brace-matching in `rfl/rfl.d/h-session.zsh` lines 17-22 with `${_RFL_PYLIB}` + `pj()`
- [ ] T011 [P] [US1] Replace inline brace-matching in `rfl/rfl.d/h-session.zsh` lines 90-95 (session current) with `pj()`
- [ ] T012 [P] [US1] Replace inline brace-matching in `rfl/rfl.d/h-workflow.zsh` lines 17-22 with `${_RFL_PYLIB}` + `pj()`
- [ ] T013 [P] [US1] Replace inline brace-matching in `rfl/rfl.d/h-workflow.zsh` lines 66-71 (workflow status) with `pj()`
- [ ] T014 [P] [US1] Add `${_RFL_PYLIB}` injection to `rfl/rfl.d/completions.zsh` and replace 4 inline parsing instances (lines 28, 40, 52, 74) with `pj()`
- [ ] T015 [P] [US1] Replace inline JSON slice in `rfl/rfl.d/h-hive2.zsh` line 52 with `${_RFL_PYLIB}` + `pj()`
- [ ] T016 [P] [US1] Replace inline JSON slice in `rfl/rfl.d/h-misc.zsh` line 19 with `${_RFL_PYLIB}` + `pj()`
- [ ] T017 [P] [US1] Replace inline JSON slice in `rfl/rfl.d/swarm.zsh` line 89 with `${_RFL_PYLIB}` + `pj()`
- [ ] T018 [US1] Run `rfl --test-all` and verify zero FAIL for agent/task/session/workflow/memory domains

**Checkpoint**: All handler JSON parsing uses shared `pj()`. Tables render consistently. Zero raw JSON in output.

---

## Phase 4: User Story 2 — Swarm and Hive-Mind Topology Consistency (P1)

**Goal**: Swarm/hive-mind init uses project-configured `hierarchical-mesh` topology, not hardcoded `mesh`.

**Independent Test**: Run `rfl swarm init` and verify `.claude-flow/swarm/swarm-state.json` shows `hierarchical-mesh`.

### Implementation for User Story 2

- [ ] T019 [US2] Verify `rfl/rfl.d/swarm.zsh` `_rfl_swarm_start()` line 12 uses `hierarchical-mesh` (already applied — confirm)
- [ ] T020 [US2] Verify `rfl/rfl.d/swarm.zsh` `_rfl_hive_start()` line 50 defaults to `hierarchical-mesh` (already applied — confirm)
- [ ] T021 [US2] Update `rfl/rfl.d/build-args.zsh` swarm:init topology choices (line 148) to list `hierarchical-mesh` first instead of `mesh`
- [ ] T022 [US2] Run `rfl swarm init` → verify state file topology is `hierarchical-mesh`

**Checkpoint**: Topology matches project config in all code paths.

---

## Phase 5: User Story 3 — Suggestion Engine Uses Secure Key Retrieval (P2)

**Goal**: API keys sourced from environment variables only. No hardcoded file paths. No key exposure in process args.

**Independent Test**: Set `DEEPSEEK_API_KEY` env var, run a command, verify suggestions appear. Grep codebase for `~/.keys` — zero matches.

### Implementation for User Story 3

- [ ] T023 [US3] Verify `rfl/rfl.d/suggest.zsh` line 5 reads from `${DEEPSEEK_API_KEY:-}` (already applied — confirm)
- [ ] T024 [US3] Verify suggest.zsh uses curl config file for auth header (line 87), not `-H "Authorization: Bearer $key"` in args
- [ ] T025 [US3] Grep entire `rfl/` directory for `~/.keys` — must return zero matches
- [ ] T026 [US3] Verify `ps aux` does not show API key when suggestions are fetching

**Checkpoint**: No hardcoded key paths. Key never in process args.

---

## Phase 6: User Story 4 — Neural Handler Properly Integrated (P2)

**Goal**: Neural commands route through dedicated `_rfl_run_neural` handler, not default passthrough.

**Independent Test**: Run `rfl neural status` and confirm output is formatted (not raw ruflo passthrough).

### Implementation for User Story 4

- [ ] T027 [US4] Verify `rfl/rfl.d/handlers.zsh` sources `h-neural.zsh` and dispatches `neural` case (from T003/T004)
- [ ] T028 [P] [US4] Add missing `build-args.zsh` case handlers for `neural:status`, `neural:patterns`, `neural:benchmark`, `neural:list`, `neural:export`, `neural:import` in `rfl/rfl.d/build-args.zsh`
- [ ] T029 [P] [US4] Add missing `build-args.zsh` case handlers for `performance:benchmark`, `performance:profile`, `performance:metrics`, `performance:optimize`, `performance:bottleneck` in `rfl/rfl.d/build-args.zsh`
- [ ] T030 [US4] Run `rfl neural status` and `rfl neural patterns` — verify formatted output

**Checkpoint**: All neural and performance commands have build-args handlers and dedicated dispatch.

---

## Phase 7: User Story 5 — Consistent JSON Parsing Across All Handlers (P2)

**Goal**: Zero instances of inline brace-matching outside `pylib.py`. All handlers use `pj()`.

**Independent Test**: `grep -r 'rindex' rfl/rfl.d/ --include='*.zsh'` returns zero matches.

### Implementation for User Story 5

- [ ] T031 [US5] Grep `rfl/rfl.d/` for `rindex` and `txt.index('{')` patterns — verify all replaced by Phase 3 work
- [ ] T032 [US5] Verify every `h-*.zsh` file that has inline Python includes `${_RFL_PYLIB}` injection
- [ ] T033 [US5] Verify `completions.zsh` includes `${_RFL_PYLIB}` injection (from T014)
- [ ] T034 [US5] Run 5 different handler commands (agent list, task list, session list, workflow list, memory search) — verify identical table style

**Checkpoint**: Single parsing implementation. Consistent output across all domains.

---

## Phase 8: User Story 6 — Dependency Check at Startup (P3)

**Goal**: Missing `ruflo`, `gum`, `fzf`, or `python3` produces clear error naming the missing tool.

**Independent Test**: Rename `ruflo` binary temporarily, run `rfl`, verify error names `ruflo`.

### Implementation for User Story 6

- [ ] T035 [US6] Verify `rfl/rfl` checks for `ruflo` and `python3` at startup (from T005/T006)
- [ ] T036 [US6] Ensure all dependency error messages include install guidance (e.g., "install: npm i -g ruflo")
- [ ] T037 [US6] Test: temporarily `alias ruflo=false`, run `rfl`, verify error message

**Checkpoint**: All four dependencies checked with clear install guidance.

---

## Phase 9: User Story 7 — Consistent Table and Border Styling (P3)

**Goal**: All tables use same border style. All headers use same format. All ID colors use same code.

**Independent Test**: Run list commands across 5 domains — identical visual style.

### Implementation for User Story 7

- [ ] T038 [US7] Grep `rfl/rfl.d/` for `--border rounded` — must return zero matches (already fixed — confirm)
- [ ] T039 [US7] Grep `rfl/rfl.d/` for `%F{51}` — must return zero matches (already fixed — confirm)
- [ ] T040 [US7] Grep `rfl/rfl.d/` for `foreground=141` or `foreground 141` — must return zero matches
- [ ] T041 [US7] Grep `rfl/rfl.d/` for `gum style` — must return zero matches in handler output (only in build-args prompts)
- [ ] T042 [US7] Visual verification: run `agent list`, `task list`, `session list`, `hooks metrics`, `neural status` — same border style

**Checkpoint**: Uniform visual output across all command domains.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [ ] T043 Run `rfl --test-all` — verify improvement over T001 baseline (zero FAIL)
- [ ] T044 Run quickstart.md verification checklist end-to-end
- [ ] T045 Verify no `rfl/agents/` directory exists (from T007)
- [ ] T046 Grep for any remaining `~/.keys`, `%F{51}`, `--border rounded`, inline `rindex` — all must be zero

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — the core JSON parsing fix
- **US2 (Phase 4)**: Depends on Phase 2 — topology config (mostly pre-applied)
- **US3 (Phase 5)**: Depends on Phase 2 — API key security (mostly pre-applied)
- **US4 (Phase 6)**: Depends on Phase 2 (T003/T004) — neural wiring
- **US5 (Phase 7)**: Depends on US1 (Phase 3) — verification of parsing work
- **US6 (Phase 8)**: Depends on Phase 2 (T005/T006) — dependency checks
- **US7 (Phase 9)**: Depends on Phase 2 — styling verification (mostly pre-applied)
- **Polish (Phase 10)**: Depends on all user stories complete

### User Story Independence

- **US1 (P1)**: Independent — core fix
- **US2 (P1)**: Independent — config alignment (already applied)
- **US3 (P2)**: Independent — security fix (already applied)
- **US4 (P2)**: Independent — neural wiring (depends on T003/T004)
- **US5 (P2)**: Depends on US1 — validates parsing consistency
- **US6 (P3)**: Independent — startup checks
- **US7 (P3)**: Independent — styling verification (already applied)

### Parallel Opportunities

Within Phase 3 (US1): T008-T017 are ALL parallel — each edits a different file.
Within Phase 6 (US4): T028 and T029 are parallel — different sections of build-args.zsh.
US2/US3/US7 are mostly verification of already-applied fixes — can run in parallel.

---

## Parallel Example: User Story 1

```bash
# All of these edit different files — launch together:
Task: "Replace inline parsing in rfl/rfl.d/h-task.zsh with pj()"
Task: "Replace inline parsing in rfl/rfl.d/h-session.zsh with pj()"
Task: "Replace inline parsing in rfl/rfl.d/h-workflow.zsh with pj()"
Task: "Add pylib to rfl/rfl.d/completions.zsh and replace inline parsing"
Task: "Replace inline parsing in rfl/rfl.d/h-hive2.zsh with pj()"
Task: "Replace inline parsing in rfl/rfl.d/h-misc.zsh with pj()"
Task: "Replace inline parsing in rfl/rfl.d/swarm.zsh with pj()"
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup (baseline)
2. Complete Phase 2: Foundational (wire neural, add dep checks, remove dead code)
3. Complete Phase 3: User Story 1 (fix all JSON parsing)
4. **STOP AND VALIDATE**: `rfl --test-all` should show significant improvement
5. All commands produce formatted output

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (JSON parsing) → Core fix delivered (MVP)
3. US2 + US3 + US7 → Verify already-applied fixes (quick wins)
4. US4 (Neural wiring) → New handler integration
5. US5 (Parsing verification) → Confirm consistency
6. US6 (Startup checks) → Polish
7. Polish → Full validation

### Pre-Applied Fixes

Several items were already fixed in the current session:
- Topology hardcoding (US2) — `swarm.zsh` already updated
- API key handling (US3) — `suggest.zsh` already updated
- Border styling (US7 partial) — `%F{51}` → `%F{96}`, `--border rounded` → `thick`
- fzf color palette — neutral palette already applied

These phases are primarily verification + edge case cleanup.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to user story for traceability
- Many tasks are verification of already-applied changes — mark complete quickly
- The real work is in Phase 3 (US1): 10 inline parsing replacements across 7 files
- Commit after each phase or logical group
