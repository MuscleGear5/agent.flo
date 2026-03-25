"""Status color mapping and text processing utilities for pyrfl."""

import re

# ══════════════════════════════════════════════════════════════════════════
# Constants
# ══════════════════════════════════════════════════════════════════════════

STATUS_COLORS = {
    "active": "green",
    "running": "green",
    "ready": "green",
    "enabled": "green",
    "healthy": "green",
    "connected": "green",
    "installed": "green",
    "loaded": "green",
    "configured": "green",
    "initialized": "green",
    "verified": "green",
    "valid": "green",
    "passed": "green",
    "success": "green",
    "open": "green",
    "started": "green",
    "synced": "green",
    "optimized": "green",
    "true": "green",
    "yes": "green",
    "idle": "yellow",
    "pending": "yellow",
    "paused": "yellow",
    "waiting": "yellow",
    "degraded": "yellow",
    "partial": "yellow",
    "stale": "yellow",
    "standby": "bright_yellow",
    "queued": "bright_yellow",
    "retrying": "bright_yellow",
    "migrating": "bright_yellow",
    "error": "red",
    "failed": "red",
    "crashed": "red",
    "cancelled": "red",
    "disabled": "red",
    "critical": "red",
    "disconnected": "red",
    "offline": "red",
    "invalid": "red",
    "rejected": "red",
    "denied": "red",
    "expired": "red",
    "broken": "red",
    "timeout": "red",
    "missing": "red",
    "false": "red",
    "no": "red",
    "stopped": "dim",
    "terminated": "dim",
    "unknown": "dim",
    "completed": "dim",
    "done": "dim",
    "skipped": "dim",
    "closed": "dim",
    "archived": "dim",
    "deprecated": "dim",
}

# Status text replacements (emoji → text)
_STATUS_MAP = {
    "\u2705": "[green]+[/]",   # ✅ → +
    "\u274c": "[red]x[/]",     # ❌ → x
    "\u26a0": "[yellow]![/]",  # ⚠ → !
    "\u2714": "[green]+[/]",   # ✔ → +
    "\u2716": "[red]x[/]",     # ✖ → x
}

# Strip emojis and other non-ASCII decorative characters
_EMOJI_RE = re.compile(
    "[\U0001f300-\U0001f9ff\U00002600-\U000027bf\U0000fe00-\U0000fe0f"
    "\U0001fa00-\U0001fa6f\U0001fa70-\U0001faff\u200d\u2640\u2642"
    "\u2705\u274c\u2714\u2716\u2728\u26a0\u2b50]+",
    flags=re.UNICODE,
)

_MAX_VALUE_WIDTH = 72


# ══════════════════════════════════════════════════════════════════════════
# Public API
# ══════════════════════════════════════════════════════════════════════════

def status_style(s: str) -> str:
    """Return Rich color name for a status string."""
    key = s.lower().split()[0] if s else ""
    return STATUS_COLORS.get(key, "white")


# ══════════════════════════════════════════════════════════════════════════
# Internal helpers (used by other pyrfl modules)
# ══════════════════════════════════════════════════════════════════════════

def _clean(s: str) -> str:
    """Strip emojis, replace status symbols with text equivalents."""
    for emoji, replacement in _STATUS_MAP.items():
        s = s.replace(emoji, replacement)
    s = _EMOJI_RE.sub("", s)
    return s.strip()


def _truncate(s: str, maxlen: int = _MAX_VALUE_WIDTH) -> str:
    """Truncate long strings with ellipsis."""
    if len(s) <= maxlen:
        return s
    return s[:maxlen - 1] + "…"


def _format_value(v: object, depth: int = 0) -> str:
    """Format a value for display — flatten nested dicts/lists."""
    if isinstance(v, dict):
        if depth > 0:
            return _truncate(", ".join(f"{k}={_format_value(sv, depth+1)}" for k, sv in v.items()))
        parts = []
        for dk, dv in v.items():
            if dv is None or dv == "":
                continue
            parts.append(f"{dk}: {_format_value(dv, depth+1)}")
        return "\n".join(parts) if parts else "(empty)"
    if isinstance(v, list):
        if not v:
            return "(none)"
        items = [str(i) for i in v]
        joined = ", ".join(items)
        return _truncate(joined)
    if isinstance(v, bool):
        return "[green]yes[/]" if v else "[red]no[/]"
    if isinstance(v, float):
        return f"{v:.4f}"
    return _truncate(_clean(str(v)))


def _color_value(cell: str) -> str:
    """Apply status color to a value cell based on its content."""
    key = cell.lower().split()[0] if cell else ""
    color = STATUS_COLORS.get(key)
    if color:
        return f"[{color}]{cell}[/]"
    return cell


__all__ = [
    # Public
    "STATUS_COLORS",
    "status_style",
    # Internal (used by other pyrfl modules)
    "_STATUS_MAP",
    "_EMOJI_RE",
    "_clean",
    "_truncate",
    "_format_value",
    "_color_value",
]
