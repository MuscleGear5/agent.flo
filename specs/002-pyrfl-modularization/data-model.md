# Data Model: pyrfl Modularization

**Date**: 2026-03-25
**Feature**: 002-pyrfl-modularization

## Module Dependency Graph

```
┌─────────────┐
│   ui.py     │ (display + re-exports)
└──────┬──────┘
       │
       ├── imports from ──────────────────┐
       │                                   │
       ▼                                   ▼
┌─────────────┐                    ┌─────────────┐
│  status.py  │◄───────────────────│ selectors.py │
└─────────────┘   imports _clean   └─────────────┘
       │
       │ (no dependencies)
       ▼
   [stdlib]
   - re (regex)
   - typing (type hints)
```

## Entity Definitions

### status.py

**Purpose**: Status color mapping and text processing utilities

**Constants**:
- `STATUS_COLORS: dict[str, str]` - Maps status strings to Rich color names
- `_STATUS_MAP: dict[str, str]` - Emoji to text replacements
- `_EMOJI_RE: re.Pattern` - Compiled regex for stripping emojis

**Functions**:
```python
def _clean(s: str) -> str:
    """Strip emojis, replace status symbols with text equivalents."""

def _truncate(s: str, maxlen: int = 72) -> str:
    """Truncate long strings with ellipsis."""

def _format_value(v: object, depth: int = 0) -> str:
    """Format a value for display — flatten nested dicts/lists."""

def _color_value(cell: str) -> str:
    """Apply status color to a value cell based on its content."""

def status_style(s: str) -> str:
    """Return Rich color name for a status string."""
```

### selectors.py

**Purpose**: Interactive user selection utilities

**Constants**:
- `_FZF_COLORS: str` - fzf color scheme for terminal UI

**Functions**:
```python
def choose(label: str, choices: list[str]) -> str | None:
    """Interactive single-selection picker with Rich fallback."""

def multi_choose(label: str, choices: list[str]) -> list[str]:
    """Interactive multi-selection picker with Rich fallback."""
```

**Dependencies**:
- `from .status import _clean` (for text processing)

### ui.py (after refactor)

**Purpose**: Core display utilities with backward-compatible re-exports

**Retained Functions**:
- `console: Console` - Shared Rich console instance
- `breadcrumb()`, `section()`, `result_count()` - Box-art utilities
- `footer_hints()` - Next-action hints
- `show_table()`, `show_kv()`, `show_raw()` - Table display
- `error_panel()`, `success_panel()` - Panel display
- `error()`, `success()`, `info()`, `warn()` - Messages
- `spin()` - Context manager (delegates to progress.Spin)
- `prompt()`, `confirm()` - Rich prompts

**Re-exports** (for backward compatibility):
```python
from .status import STATUS_COLORS, status_style, _clean, _truncate, _format_value, _color_value
from .selectors import choose, multi_choose
```

## State Management

**Stateless**: All modules are stateless utility libraries. No shared state between modules.

## Import Matrix

| From → To | status.py | selectors.py | ui.py |
|-----------|-----------|--------------|-------|
| status.py | — | ❌ | ❌ |
| selectors.py | ✅ | — | ❌ |
| ui.py | ✅ | ✅ | — |
| handlers.py | ❌ | ❌ | ✅ |
| suggest.py | ❌ | ❌ | ✅ |
| menu.py | ❌ | ❌ | ✅ |
