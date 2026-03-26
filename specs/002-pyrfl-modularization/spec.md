# Feature Specification: pyrfl Modularization

**Feature Branch**: `002-pyrfl-modularization`
**Created**: 2026-03-25
**Status**: Draft
**Input**: User description: "Refactor pyrfl ui.py into focused modules"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Module Extraction (Priority: P1)

As a pyrfl developer, I need status processing utilities in a dedicated module so that I can import and test them independently from display utilities.

**Why this priority**: Core infrastructure change that enables all other work. Without this, the monolithic ui.py remains difficult to maintain and test.

**Independent Test**: Can be fully tested by importing `from pyrfl.status import STATUS_COLORS, status_style` and verifying color lookup works correctly.

**Acceptance Scenarios**:

1. **Given** a status string "active", **When** calling `status_style("active")`, **Then** returns "green"
2. **Given** a string with emoji "✅ Done", **When** calling `_clean()`, **Then** returns "Done"
3. **Given** a long string >72 chars, **When** calling `_truncate()`, **Then** returns truncated string with ellipsis

---

### User Story 2 - Selector Extraction (Priority: P1)

As a pyrfl developer, I need user selection utilities in a dedicated module so that interactive pickers are isolated from display code.

**Why this priority**: Equal priority to status extraction - both are core extractions needed before ui.py can be trimmed.

**Independent Test**: Can be fully tested by importing `from pyrfl.selectors import choose, multi_choose` and testing with mock choices.

**Acceptance Scenarios**:

1. **Given** a list of choices ["a", "b", "c"], **When** calling `choose("test", choices)`, **Then** returns a single choice or None
2. **Given** a list of choices ["x", "y", "z"], **When** calling `multi_choose("test", choices)`, **Then** returns a list of selections

---

### User Story 3 - Backward Compatibility (Priority: P2)

As an existing pyrfl consumer (handlers.py, suggest.py, menu.py), I need existing imports to continue working so that no code changes are required in consumer modules.

**Why this priority**: Critical for adoption - breaking changes would require updating all consumers.

**Independent Test**: Can be fully tested by running `from pyrfl.ui import choose, STATUS_COLORS` and verifying no ImportError.

**Acceptance Scenarios**:

1. **Given** consumer code importing `from pyrfl.ui import choose`, **When** module loads, **Then** import succeeds
2. **Given** consumer code importing `from pyrfl.ui import STATUS_COLORS`, **When** module loads, **Then** import succeeds

---

### User Story 4 - Unit Test Coverage (Priority: P3)

As a pyrfl maintainer, I need unit tests for the new modules so that refactoring is verified and future changes are safe.

**Why this priority**: Important for long-term maintainability but not blocking for the extraction itself.

**Independent Test**: Can be fully tested by running `pytest rfl/pyrfl/tests/` and verifying all tests pass.

**Acceptance Scenarios**:

1. **Given** test_status.py exists, **When** running `pytest test_status.py`, **Then** all tests pass
2. **Given** test_selectors.py exists, **When** running `pytest test_selectors.py`, **Then** all tests pass

---

### Edge Cases

- What happens when choices list is empty in `choose()`? Returns None immediately.
- What happens when choices list has only one item? Returns that item without prompting.
- What happens when status string is not in STATUS_COLORS? Returns "white" as default.
- What happens when _truncate receives string exactly at maxlen? Returns string unchanged (no ellipsis).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide `status.py` module with STATUS_COLORS dict, status_style(), _clean(), _truncate(), _format_value() functions
- **FR-002**: System MUST provide `selectors.py` module with choose(), multi_choose() functions
- **FR-003**: System MUST maintain backward compatibility via re-exports in ui.py
- **FR-004**: System MUST keep ui.py as the primary import target for existing consumers
- **FR-005**: selectors.py MUST import _clean from status module (no duplication)
- **FR-006**: All modules MUST have proper `__all__` lists for explicit exports

### Key Entities

- **status.py**: Module containing status color mapping and text processing utilities (~154 lines)
- **selectors.py**: Module containing user selection utilities (~167 lines)
- **ui.py**: Core display module, trimmed to ~150 lines with re-exports

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: ui.py reduced from 432 lines to ~150 lines (65% reduction)
- **SC-002**: All existing imports from ui.py continue to work without modification
- **SC-003**: All functions have single source of truth (no duplication)
- **SC-004**: pytest passes on all new test files

## Assumptions

- Consumers (handlers.py, suggest.py, menu.py) will continue to import from ui.py
- New code can import directly from submodules if desired
- No API changes to function signatures - only module organization changes
- progress.py is already correctly extracted and will not be modified
