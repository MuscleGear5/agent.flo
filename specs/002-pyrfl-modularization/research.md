# Research: pyrfl Modularization

**Date**: 2026-03-25
**Feature**: 002-pyrfl-modularization

## Research Questions

### R1: Current ui.py Structure

**Finding**: ui.py is 432 lines containing:
- Lines 1-100: Constants (STATUS_COLORS, _STATUS_MAP, _EMOJI_RE, _FZF_COLORS)
- Lines 101-154: Helper functions (_clean, _truncate, _format_value, _color_value, status_style)
- Lines 155-240: Box-art functions (breadcrumb, section, result_count, footer_hints)
- Lines 241-310: Table functions (show_table, show_kv, show_raw)
- Lines 311-350: Panel functions (error_panel, success_panel)
- Lines 351-390: Message functions (error, success, info, warn, spin)
- Lines 391-432: Prompt/selector functions (prompt, confirm, choose, multi_choose)

**Decision**: Extract status processing (lines 1-154) and selectors (lines 391-432) into dedicated modules.

### R2: Consumer Import Patterns

**Finding**: Analyzed consumers:
- handlers.py: `from .ui import console, error, info, success, show_kv, show_table`
- suggest.py: `from .ui import console, info, error, success, show_kv`
- menu.py: Uses fzf directly, imports from ui for display only

**Decision**: All consumers import display functions, not status/selectors directly. Re-exports in ui.py will maintain compatibility.

### R3: Shared Utilities

**Finding**:
- `_clean()` is used by both selectors (choose, multi_choose) and display functions
- `_truncate()` is used by `_format_value()` and table display
- `_format_value()` is used by `show_kv()` and `show_table()`

**Decision**: Create dependency chain: selectors.py imports from status.py. ui.py imports from both.

### R4: Rich Library Best Practices

**Finding**: Rich encourages:
- Single Console instance per application
- Modular organization with clear exports
- Re-exports via `__all__` for explicit public API

**Decision**: Keep single `console` instance in ui.py. Use `__all__` in all modules.

## Technical Decisions

| Decision | Rationale | Alternatives Rejected |
|----------|-----------|----------------------|
| Extract to 2 modules | Clear separation of concerns, manageable scope | Single mega-module (no improvement), 5+ micro-modules (over-engineering) |
| Re-export from ui.py | Zero breaking changes for consumers | Update all consumers (unnecessary work), deprecation warnings (adds complexity) |
| selectors imports from status | Avoid code duplication | Duplicate _clean (DRY violation) |
| Keep progress.py unchanged | Already well-isolated | Merge into status (wrong concern), restructure (unnecessary) |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Import cycles | Low | High | status.py has no dependencies; selectors imports from status only |
| Missing exports | Medium | Medium | Audit all __all__ lists against current ui.py exports |
| Test gaps | Medium | Low | Create test_status.py and test_selectors.py with basic coverage |
