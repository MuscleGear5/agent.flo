"""Rich-based UI utilities for pyrfl.

Module structure:
- ui.py: Core display utilities (console, tables, panels, messages, prompts)
- status.py: Status colors, text processing (STATUS_COLORS, _clean, _truncate, etc.)
- selectors.py: User selection (choose, multi_choose)
- progress.py: Progress bars, Spin class

All imports from ui.py continue to work via re-exports for backward compatibility.
"""

from rich import box
from rich.console import Console
from rich.rule import Rule
from rich.table import Table
from rich.panel import Panel
from rich.prompt import Prompt, Confirm

# Import from new modules
from .status import (
    STATUS_COLORS,
    _STATUS_MAP,
    _EMOJI_RE,
    _clean,
    _truncate,
    _format_value,
    _color_value,
    status_style,
)
from .picker import choose, multi_choose, _FZF_COLORS

console = Console()

_MAX_VALUE_WIDTH = 72


# ══════════════════════════════════════════════════════════════════════════
# Box-art: breadcrumbs, sections, footers
# ══════════════════════════════════════════════════════════════════════════

def breadcrumb(*parts: str):
    """Print a breadcrumb trail:  pyrfl > agent > status"""
    trail = " > ".join(parts)
    console.print(Rule(f"[bold white] {trail} [/]", style="white", characters="━"))


def section(title: str):
    """Print a thin section divider with title."""
    console.print(Rule(f"[bold white] {title} [/]", style="dim white"))


def result_count(n: int, label: str = "items"):
    """Print a result count badge."""
    if n == 0:
        console.print(f"[dim]  0 {label}[/]")
    else:
        console.print(f"[bold white]  {n} {label}[/]")


def footer_hints(cmd: str, sub: str):
    """AI-powered suggestions — delegates to suggest module."""
    import importlib
    _suggest = importlib.import_module(".suggest", __name__.rsplit(".", 1)[0])
    _suggest.show_suggestions(cmd, sub)


# ══════════════════════════════════════════════════════════════════════════
# Tables — HEAVY box, white text, status colors
# ══════════════════════════════════════════════════════════════════════════

def show_table(title: str, columns: list[str], rows: list[list[str]]):
    """Display a Rich table — thick borders, white text, status colors."""
    table = Table(
        title=title,
        box=box.HEAVY,
        border_style="white",
        show_lines=True,
        title_style="bold white",
    )
    for col in columns:
        table.add_column(col, style="bold white", max_width=_MAX_VALUE_WIDTH)
    for row in rows:
        styled = []
        for i, cell in enumerate(row):
            cell = _clean(str(cell))
            if columns[i].lower() in ("status", "value", "state"):
                styled.append(_color_value(cell))
            else:
                styled.append(_truncate(cell))
        table.add_row(*styled)
    console.print(table)
    result_count(len(rows))


def show_kv(title: str, data: dict, skip: set | None = None):
    """Display key-value pairs — thick borders, white text, status colors."""
    if skip is None:
        skip = {"success"}
    table = Table(
        title=title,
        box=box.HEAVY,
        border_style="white",
        show_lines=True,
        title_style="bold white",
    )
    table.add_column("Field", style="bold white", max_width=20)
    table.add_column("Value", style="white", max_width=_MAX_VALUE_WIDTH)
    for k, v in data.items():
        if k in skip or v is None or v == "":
            continue
        formatted = _format_value(v)
        table.add_row(_clean(str(k)), _color_value(formatted))
    console.print(table)


def show_raw(output: str):
    """Display raw text output in a panel."""
    if output:
        console.print(Panel(
            _clean(output),
            box=box.HEAVY,
            border_style="white",
            style="white",
        ))


# ══════════════════════════════════════════════════════════════════════════
# Error & status panels
# ══════════════════════════════════════════════════════════════════════════

def error_panel(msg: str, detail: str = "", params: dict | None = None):
    """Display an error in a bordered panel with optional context."""
    lines = [f"[red bold]{msg}[/]"]
    if detail:
        lines.append(f"[dim]{detail}[/]")
    if params:
        lines.append("")
        lines.append("[dim]Sent parameters:[/]")
        for k, v in params.items():
            lines.append(f"  [bold]{k}[/] = {v}")
    console.print(Panel(
        "\n".join(lines),
        title="[red bold] Error [/]",
        box=box.HEAVY,
        border_style="red",
        padding=(1, 2),
    ))


def success_panel(title: str, msg: str, hints: list[str] | None = None):
    """Display a success result in a bordered panel with optional hints."""
    lines = [f"[green bold]{msg}[/]"]
    if hints:
        lines.append("")
        for h in hints:
            lines.append(f"[dim]  {h}[/]")
    console.print(Panel(
        "\n".join(lines),
        title=f"[green bold] {title} [/]",
        box=box.HEAVY,
        border_style="green",
        padding=(0, 2),
    ))


# ══════════════════════════════════════════════════════════════════════════
# Spinners & progress — [green]####[/][dim]----[/] bar (see progress.py)
# ══════════════════════════════════════════════════════════════════════════

import importlib as _importlib
_progress = _importlib.import_module(".progress", __name__.rsplit(".", 1)[0])
_HashBarColumn = _progress.HashBarColumn
_Spin = _progress.Spin


def spin(msg: str):
    """Context manager — green dots spinner + hash progress bar + elapsed time."""
    return _Spin(msg, console=console)


# ══════════════════════════════════════════════════════════════════════════
# Messages
# ══════════════════════════════════════════════════════════════════════════

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


# ══════════════════════════════════════════════════════════════════════════
# Prompts
# ══════════════════════════════════════════════════════════════════════════

def prompt(label: str, default: str = "") -> str:
    """Prompt for input with Rich."""
    return Prompt.ask(label, default=default)


def confirm(label: str, default: bool = False) -> bool:
    """Confirm yes/no with Rich."""
    return Confirm.ask(label, default=default)


# ══════════════════════════════════════════════════════════════════════════
# Re-exports for backward compatibility
# ══════════════════════════════════════════════════════════════════════════
# STATUS_COLORS, status_style, _clean, _truncate, _format_value, _color_value
# choose, multi_choose are already imported above and re-exported automatically

__all__ = [
    # Core display
    "console",
    "breadcrumb",
    "section",
    "result_count",
    "footer_hints",
    "show_table",
    "show_kv",
    "show_raw",
    "error_panel",
    "success_panel",
    "error",
    "success",
    "info",
    "warn",
    "spin",
    "prompt",
    "confirm",
    # Re-exported from status
    "STATUS_COLORS",
    "status_style",
    "_STATUS_MAP",
    "_EMOJI_RE",
    "_clean",
    "_truncate",
    "_format_value",
    "_color_value",
    # Re-exported from selectors
    "choose",
    "multi_choose",
    "_FZF_COLORS",
]
