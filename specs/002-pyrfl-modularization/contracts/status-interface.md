# status.py Interface Contract

**Module**: `rfl.pyrfl.status`
**Version**: 1.0.0
**Last Updated**: 2026-03-25

## Public API

### Constants

#### `STATUS_COLORS: dict[str, str]`

Maps status strings to Rich color names for consistent display.

**Contract**:
- MUST contain at least 50 status-to-color mappings
- MUST use Rich color names (e.g., "green", "red", "yellow", "dim")
- MUST be case-insensitive for lookups (callers use `.lower().split()[0]`)

**Example**:
```python
STATUS_COLORS = {
    "active": "green",
    "error": "red",
    "pending": "yellow",
    # ... 50+ more entries
}
```

---

### Functions

#### `status_style(s: str) -> str`

Returns the Rich color name for a status string.

**Parameters**:
- `s: str` - Status string to look up

**Returns**:
- `str` - Rich color name (defaults to "white" if not found)

**Contract**:
- MUST handle empty strings gracefully
- MUST perform case-insensitive lookup
- MUST return "white" for unknown status strings

**Example**:
```python
>>> status_style("active")
"green"
>>> status_style("UNKNOWN_STATUS")
"white"
>>> status_style("")
"white"
```

---

## Internal API

*These functions are used internally by other pyrfl modules but are not part of the public API.*

#### `_clean(s: str) -> str`

Strips emojis and replaces status symbols with text equivalents.

**Parameters**:
- `s: str` - Input string potentially containing emojis

**Returns**:
- `str` - Cleaned string with emojis removed and symbols replaced

**Contract**:
- MUST remove all Unicode emoji characters (U+1F300-U+1F9FF range)
- MUST replace ✅ with `[green]+[/]`
- MUST replace ❌ with `[red]x[/]`
- MUST replace ⚠ with `[yellow]![/]`
- MUST preserve original whitespace and structure

**Example**:
```python
>>> _clean("✅ Success")
"[green]+[/] Success"
>>> _clean("Hello 👋 World")
"Hello World"
```

---

#### `_truncate(s: str, maxlen: int = 72) -> str`

Truncates long strings with ellipsis.

**Parameters**:
- `s: str` - Input string
- `maxlen: int` - Maximum length (default: 72)

**Returns**:
- `str` - Truncated string with "…" if needed, original if under limit

**Contract**:
- MUST return original string if `len(s) <= maxlen`
- MUST use single character ellipsis "…" (U+2026)
- MUST preserve exactly `maxlen - 1` characters before ellipsis

**Example**:
```python
>>> _truncate("short", 10)
"short"
>>> _truncate("a" * 100, 10)
"aaaaaaaaa…"
```

---

#### `_format_value(v: object, depth: int = 0) -> str`

Formats a value for display, flattening nested structures.

**Parameters**:
- `v: object` - Value to format (any type)
- `depth: int` - Current nesting depth (default: 0)

**Returns**:
- `str` - Formatted string representation

**Contract**:
- MUST handle `dict` by flattening to key=value pairs
- MUST handle `list` by joining with ", "
- MUST handle `bool` as "[green]yes[/]" or "[red]no[/]"
- MUST handle `float` with 4 decimal places
- MUST handle `None` or empty string by skipping (returns "(empty)" or "(none)")
- MUST recursively call itself for nested structures

**Example**:
```python
>>> _format_value({"a": 1, "b": 2})
"a: 1\nb: 2"
>>> _format_value([1, 2, 3])
"1, 2, 3"
>>> _format_value(True)
"[green]yes[/]"
```

---

#### `_color_value(cell: str) -> str`

Applies status color to a value cell based on its content.

**Parameters**:
- `cell: str` - Cell content to colorize

**Returns**:
- `str` - Rich-markup colored string or original if no match

**Contract**:
- MUST extract first word for status lookup
- MUST use STATUS_COLORS for color mapping
- MUST return original cell if no status match found

**Example**:
```python
>>> _color_value("active")
"[green]active[/]"
>>> _color_value("error: something failed")
"[red]error: something failed[/]"
```
