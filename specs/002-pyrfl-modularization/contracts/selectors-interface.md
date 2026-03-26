# selectors.py Interface Contract

**Module**: `rfl.pyrfl.selectors`
**Version**: 1.0.0
**Last Updated**: 2026-03-25

## Dependencies

- `from .status import _clean` - For text processing

## Public API

### Functions

#### `choose(label: str, choices: list[str]) -> str | None`

Interactive single-selection picker with Rich fallback.

**Parameters**:
- `label: str` - Prompt label displayed to user
- `choices: list[str]` - List of options to choose from

**Returns**:
- `str | None` - Selected choice, or None if cancelled

**Contract**:
- MUST return `None` if choices list is empty
- MUST return the single item immediately if choices has only one element
- MUST display numbered list format: "1. option", "2. option", etc.
- MUST include "0. cancel" option
- MUST accept numeric input (1-N) or text prefix match
- MUST clean choice text using `_clean()` before display

**Error Handling**:
- MUST handle invalid numeric input by returning None
- MUST handle partial text matches (case-insensitive prefix match)

**Example**:
```python
>>> choose("Select agent", ["coder", "reviewer", "tester"])
# Displays:
# Select agent
#   1. coder
#   2. reviewer
#   3. tester
#   0. cancel
# Select [0]:
# User enters "1" -> returns "coder"
```

---

#### `multi_choose(label: str, choices: list[str]) -> list[str]`

Interactive multi-selection picker with Rich fallback.

**Parameters**:
- `label: str` - Prompt label displayed to user
- `choices: list[str]` - List of options to choose from

**Returns**:
- `list[str]` - List of selected choices (may be empty)

**Contract**:
- MUST return empty list if choices list is empty
- MUST display numbered list format with comma-separated input hint
- MUST accept comma-separated numbers (e.g., "1,3,5")
- MUST handle whitespace around numbers
- MUST ignore invalid numbers silently
- MUST clean choice text using `_clean()` before display

**Example**:
```python
>>> multi_choose("Select agents", ["coder", "reviewer", "tester"])
# Displays:
# Select agents
#   1. coder
#   2. reviewer
#   3. tester
#   Enter comma-separated numbers, or 0 to cancel
# Select [0]:
# User enters "1, 3" -> returns ["coder", "tester"]
```

---

## Internal Constants

#### `_FZF_COLORS: str`

fzf color scheme for terminal UI (currently unused as fzf is disabled).

**Value**:
```
"border:7,label:7:bold,preview-border:7,preview-label:7:bold,"
"prompt:7:bold,pointer:48,hl:48,hl+:48:bold,header:245"
```

**Contract**:
- MUST define white borders/text with green/yellow/red highlights
- MUST be compatible with fzf `--color` flag format

---

## Behavior Notes

### Rich Fallback Mode

Both `choose()` and `multi_choose()` currently use Rich's numbered prompt system exclusively (fzf integration removed due to terminal state issues). The fallback is now the primary implementation:

1. Display numbered list of choices
2. Prompt for numeric input via Rich's `Prompt.ask()`
3. Parse input and return selection(s)

### Text Cleaning

All displayed text is processed through `_clean()` to:
- Remove emoji characters
- Replace status symbols with text equivalents
- Ensure clean terminal output
