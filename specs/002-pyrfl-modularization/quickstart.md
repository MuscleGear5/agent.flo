# Quickstart: pyrfl Modularization

**Feature**: 002-pyrfl-modularization
**Date**: 2026-03-25

## Overview

This guide covers the refactored pyrfl module structure after extracting status and selector utilities into dedicated modules.

## Installation

```bash
# No installation changes - internal refactor only
cd rfl/pyrfl
pip install -e .
```

## Module Structure

```
rfl/pyrfl/
├── ui.py           # Core display (import from here for compatibility)
├── status.py       # Status colors, text processing
├── selectors.py    # User selection (choose/multi_choose)
└── progress.py     # Progress bars, Spin class
```

## Usage Examples

### Existing Code (No Changes Required)

```python
# All existing imports continue to work
from pyrfl.ui import console, show_table, choose, STATUS_COLORS

# Display a table
show_table("Agents", ["Name", "Status"], [["coder", "active"], ["tester", "idle"]])

# Use status colors
color = STATUS_COLORS["active"]  # "green"
```

### New Code (Direct Module Imports)

```python
# Import directly from submodules for clarity
from pyrfl.status import STATUS_COLORS, status_style, _clean, _truncate
from pyrfl.selectors import choose, multi_choose

# Use status utilities
clean_text = _clean("✅ Success")  # "[green]+[/] Success"
truncated = _truncate(long_string, 50)

# Get status color
color = status_style("active")  # "green"
```

### Text Processing

```python
from pyrfl.status import _clean, _truncate, _format_value

# Clean emojis from text
clean = _clean("Hello 👋 World")  # "Hello World"

# Truncate long strings
short = _truncate("A very long string...", 20)  # "A very long strin…"

# Format complex values
formatted = _format_value({"name": "test", "count": 42})
# "name: test\ncount: 42"
```

### User Selection

```python
from pyrfl.selectors import choose, multi_choose

# Single selection
agent = choose("Select agent", ["coder", "reviewer", "tester"])
if agent:
    print(f"Selected: {agent}")

# Multi-selection
agents = multi_choose("Select agents", ["coder", "reviewer", "tester"])
print(f"Selected {len(agents)} agents")
```

## Backward Compatibility

All existing imports continue to work without modification:

| Import | Status | Source |
|--------|--------|--------|
| `from pyrfl.ui import choose` | ✅ Works | Re-exported from selectors |
| `from pyrfl.ui import STATUS_COLORS` | ✅ Works | Re-exported from status |
| `from pyrfl.ui import show_table` | ✅ Works | Defined in ui.py |
| `from pyrfl.ui import console` | ✅ Works | Defined in ui.py |

## Running Tests

```bash
# Run all pyrfl tests
pytest rfl/pyrfl/tests/

# Run specific module tests
pytest rfl/pyrfl/tests/test_status.py
pytest rfl/pyrfl/tests/test_selectors.py
pytest rfl/pyrfl/tests/test_ui.py
```

## Migration Notes

- No migration required for existing code
- New code can import directly from submodules
- All `__all__` lists are properly defined for explicit exports
