"""Rich-based UI utilities for pyrfl."""

import re
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text
from rich.live import Live
from rich.prompt import Prompt, Confirm

console = Console()

# Strip emojis and other non-ASCII decorative characters
_EMOJI_RE = re.compile(
    "[\U0001f300-\U0001f9ff\U00002600-\U000027bf\U0000fe00-\U0000fe0f"
    "\U0001fa00-\U0001fa6f\U0001fa70-\U0001faff\u200d\u2640\u2642"
    "\u2705\u274c\u2714\u2716\u2728\u26a0\u2b50]+",
    flags=re.UNICODE,
)

STATUS_COLORS = {
    "active": "green",
    "running": "green",
    "ready": "green",
    "completed": "green",
    "idle": "yellow",
    "pending": "yellow",
    "paused": "yellow",
    "waiting": "yellow",
    "error": "red",
    "failed": "red",
    "crashed": "red",
    "cancelled": "red",
    "stopped": "dim",
    "terminated": "dim",
    "unknown": "dim",
}

# Status text replacements (emoji → text)
_STATUS_MAP = {
    "\u2705": "[green]+[/]",   # ✅ → +
    "\u274c": "[red]x[/]",     # ❌ → x
    "\u26a0": "[yellow]![/]",  # ⚠ → !
    "\u2714": "[green]+[/]",   # ✔ → +
    "\u2716": "[red]x[/]",     # ✖ → x
}

_MAX_VALUE_WIDTH = 72


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
        # Top-level dict: one line per key
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


def status_style(s: str) -> str:
    """Return Rich color name for a status string."""
    key = s.lower().split()[0] if s else ""
    return STATUS_COLORS.get(key, "white")


def show_table(title: str, columns: list[str], rows: list[list[str]]):
    """Display a Rich table with automatic status coloring."""
    table = Table(title=title, border_style="bright_black", show_lines=False)
    for col in columns:
        table.add_column(col, style="bold" if col in ("ID", "Name", "Key") else "",
                         max_width=_MAX_VALUE_WIDTH)
    for row in rows:
        styled = []
        for i, cell in enumerate(row):
            cell = _clean(str(cell))
            if columns[i].lower() == "status":
                styled.append(f"[{status_style(cell)}]{cell}[/]")
            else:
                styled.append(_truncate(cell))
        table.add_row(*styled)
    console.print(table)


def show_kv(title: str, data: dict, skip: set | None = None):
    """Display key-value pairs as a Rich table with proper formatting."""
    if skip is None:
        skip = {"success"}
    table = Table(title=title, border_style="bright_black", show_lines=True)
    table.add_column("Field", style="bold", max_width=20)
    table.add_column("Value", max_width=_MAX_VALUE_WIDTH)
    for k, v in data.items():
        if k in skip or v is None or v == "":
            continue
        table.add_row(_clean(str(k)), _format_value(v))
    console.print(table)


def show_raw(output: str):
    """Display raw text output in a panel."""
    if output:
        console.print(Panel(_clean(output), border_style="bright_black"))


def spin(msg: str):
    """Context manager for spinner."""
    return console.status(msg, spinner="dots")


def error(msg: str):
    """Print an error message."""
    console.print(f"[red bold]\\[x][/] {msg}")


def success(msg: str):
    """Print a success message."""
    console.print(f"[green bold]\\[+][/] {msg}")


def info(msg: str):
    """Print a dimmed info message."""
    console.print(f"[dim]{msg}[/]")


def warn(msg: str):
    """Print a warning message."""
    console.print(f"[yellow bold]\\[!][/] {msg}")


def prompt(label: str, default: str = "") -> str:
    """Prompt for input with Rich."""
    return Prompt.ask(label, default=default)


def confirm(label: str, default: bool = False) -> bool:
    """Confirm yes/no with Rich."""
    return Confirm.ask(label, default=default)


def choose(label: str, choices: list[str]) -> str | None:
    """Present numbered choices and return selection."""
    console.print(f"\n[bold]{label}[/]")
    for i, c in enumerate(choices, 1):
        console.print(f"  {i}. {c}")
    console.print(f"  0. [dim]cancel[/]")
    raw = Prompt.ask("Select", default="0")
    try:
        idx = int(raw)
        if 1 <= idx <= len(choices):
            return choices[idx - 1]
    except ValueError:
        for c in choices:
            if c.lower().startswith(raw.lower()):
                return c
    return None


def multi_choose(label: str, choices: list[str]) -> list[str]:
    """Present choices for multi-select (comma-separated indices)."""
    console.print(f"\n[bold]{label}[/]")
    for i, c in enumerate(choices, 1):
        console.print(f"  {i}. {c}")
    console.print(f"  [dim]Enter comma-separated numbers, or 0 to cancel[/]")
    raw = Prompt.ask("Select", default="0")
    if raw.strip() == "0":
        return []
    selected = []
    for part in raw.split(","):
        part = part.strip()
        try:
            idx = int(part)
            if 1 <= idx <= len(choices):
                selected.append(choices[idx - 1])
        except ValueError:
            pass
    return selected
