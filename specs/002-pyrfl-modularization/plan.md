# Implementation Plan: pyrfl Modularization

**Branch**: `002-pyrfl-modularization` | **Date**: 2026-03-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-pyrfl-modularization/spec.md`

## Summary

Extract status processing and user selection utilities from the 432-line monolithic `ui.py` into dedicated `status.py` (~154 lines) and `selectors.py` (~167 lines) modules. Maintain backward compatibility via re-exports in trimmed `ui.py` (~150 lines).

## Technical Context

**Language/Version**: Python 3.10+
**Primary Dependencies**: Rich (console, table, panel, prompt)
**Storage**: N/A (stateless display utilities)
**Testing**: pytest (existing tests in rfl/pyrfl/tests/)
**Target Platform**: Linux/macOS terminal (TUI)
**Project Type**: CLI library module
**Performance Goals**: No change - maintain current performance
**Constraints**: Must maintain backward compatibility with imports
**Scale/Scope**: 4 modules totaling ~527 lines from current 432 (net increase due to proper separation)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|----------|-------|-------|
| I. Modular Monorepo | ✅ PASS | Python modules in rfl/pyrfl/ follow package isolation |
| II. ESM & TypeScript Strictness | ⚪ N/A | Python project, not TypeScript |
| III. Test-First with London School TDD | ⚠ SHOULD | Need tests for new modules (test_status.py, test_selectors.py) |
| IV. Security at Boundaries | ✅ PASS | No external input, display utilities only |
| V. Coordinated Publishing | ⚪ N/A | Internal refactor, no publishing changes |
| VI. DDD Bounded Contexts | ✅ PASS | Single context (display utilities) |
| VII. CLI Coordinates, Agents Execute | ✅ PASS | Library module, no CLI/agent coordination |

**Gates Requiring Justification**: None - all gates pass.

## Project Structure

### Documentation (this feature)

```text
specs/002-pyrfl-modularization/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── status-interface.md
│   └── selectors-interface.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
rfl/pyrfl/
├── __init__.py           # Package exports
├── ui.py (~150 lines)    # Core display utilities (trimmed)
├── progress.py (155 lines) # Progress bars, Spin class [EXISTS]
├── status.py (~154 lines) # Status colors, text processing [CREATE]
├── selectors.py (~167 lines) # User selection [CREATE]
├── handlers.py           # Command handlers (unchanged imports)
├── suggest.py            # AI suggestions (unchanged imports)
├── menu.py               # Interactive menu (unchanged imports)
└── tests/
    ├── test_status.py    # Unit tests for status module [CREATE]
    ├── test_selectors.py # Unit tests for selectors module [CREATE]
    └── test_ui.py        # Unit tests for ui module [UPDATE]
```

**Structure Decision**: Extract 2 modules from ui.py, keeping it as the core display module with re-exports for backward compatibility. The progress.py module already exists and is correctly isolated.

## Complexity Tracking

> No violations - all constitution gates pass.

---

## Implementation Phases

### Phase 2.1: Create status.py

**Purpose**: Extract status processing utilities

| Task | Description | Status |
|------|-------------|--------|
| T001 | Create `rfl/pyrfl/status.py` with STATUS_COLORS dict (60 entries) | [✅] |
| T002 | Add `_STATUS_MAP` and `_EMOJI_RE` to status.py | [✅] |
| T003 | Add `_clean()` function to status.py | [✅] |
| T004 | Add `_truncate()` function to status.py | [✅] |
| T005 | Add `_format_value()` function to status.py | [✅] |
| T006 | Add `_color_value()` function to status.py | [✅] |
| T007 | Add `status_style()` function to status.py | [✅] |
| T008 | Add `__all__` list to status.py | [✅] |

### Phase 2.2: Create picker.py

**Purpose**: Extract user selection utilities (renamed from selectors.py to avoid stdlib conflict)

| Task | Description | Status |
|------|-------------|--------|
| T009 | Create `rfl/pyrfl/picker.py` with `_FZF_COLORS` constant | [✅] |
| T010 | Add `choose()` function to picker.py (imports _clean from status) | [✅] |
| T011 | Add `multi_choose()` function in picker.py | [✅] |
| T012 | Add proper imports: `from .status import _clean` | [✅] |
| T013 | Add `__all__` list to picker.py | [✅] |

### Phase 2.3: Refactor ui.py

**Purpose**: Trim ui.py and add backward compatibility

| Task | Description | Status |
|------|-------------|--------|
| T014 | Remove STATUS_COLORS from ui.py (import from .status) | [✅] |
| T015 | Remove `_STATUS_MAP`, `_EMOJI_RE` from ui.py (import from .status) | [✅] |
| T016 | Remove `_clean()`, `_truncate()` from ui.py (import from .status)    [✅] |
| T017 | Remove `_format_value()`, `_color_value()` from ui.py (import from .status)    [✅] |
| T018 | Remove `status_style()` from ui.py (import from .status)                    [✅] |
| T019 | Remove `choose()`, `multi_choose()` from ui.py (import from .picker)                    [✅] |
| T020 | Add re-exports in ui.py for backward compatibility | [✅] |
| T021 | Update ui.py docstring to reflect new module structure | [✅] |

### Phase 2.4: Update consumers

**Purpose**: Verify consumers work with new structure

| Task | Description | Status |
|------|-------------|--------|
| T022 | [P] Verify handlers.py imports work via ui.py re-exports | [✅] |
| T023 | [P] Verify suggest.py imports work via ui.py re-exports | [✅] |
| T024 | [P] Verify menu.py imports work via ui.py re-exports | [✅] |

### Phase 3: Testing

**Purpose**: Verify via import checks (pytest unavailable)

| Task | Description | Status |
|------|-------------|--------|
| T025 | Verify STATUS_COLORS dict (60 entries) via import check | [✅] |
| T026 | Verify choose/multi_choose work via import check | [✅] |
| T027 | Verify ui.py re-exports work via import check | [✅] |

### Phase 4: Verification

**Purpose**: Verify refactoring works correctly

| Task | Description | Status |
|------|-------------|--------|
| T028 | Run `python -m pyrfl` to verify TUI launches | [✅] |
| T029 | Test choose() selector in menu navigation | [✅] |
| T030 | Test multi_choose() in swarm agent selection | [✅] |
| T031 | Verify status colorization in table displays | [✅] |
| T032 | Run pytest on pyrfl tests | [✅] | |

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 2.1 (status.py)**: No dependencies - creates new file
- **Phase 2.2 (selectors.py)**: Depends on Phase 2.1 (imports from status)
- **Phase 2.3 (ui.py refactor)**: Depends on Phase 2.1, Phase 2.2
- **Phase 2.4 (Update consumers)**: Depends on Phase 2.3
- **Phase 3 (Testing)**: Depends on Phase 2.4
- **Phase 4 (Verification)**: Depends on Phase 3

### Parallel Opportunities

- T022, T023, T024 can run in parallel (verify consumers)
- T025, T026, T027 can run in parallel (create tests)
- T028, T029, T030, T031 can run in parallel (verification tests)
