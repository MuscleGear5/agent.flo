"""Rich-based UI utilities for pyrfl."""

import re
import shutil
import subprocess
from rich import box
from rich.console import Console
from rich.columns import Columns
from rich.rule import Rule
from rich.table import Table
from rich.panel import Panel
from rich.text import Text
from rich.live import Live
from rich.prompt import Prompt, Confirm

console = Console()

# fzf color scheme — white borders/text, green/yellow/red highlights
_FZF_COLORS = (
    "border:7,label:7:bold,preview-border:7,preview-label:7:bold,"
    "prompt:7:bold,pointer:48,hl:48,hl+:48:bold,header:245"
)

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

_MAX_VALUE_WIDTH = 72


# ══════════════════════════════════════════════════════════════════════════
# Internal helpers
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


def status_style(s: str) -> str:
    """Return Rich color name for a status string."""
    key = s.lower().split()[0] if s else ""
    return STATUS_COLORS.get(key, "white")


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
# Spinners & progress
# ══════════════════════════════════════════════════════════════════════════

def spin(msg: str):
    """Context manager for spinner."""
    return console.status(msg, spinner="dots")


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
# Prompts & selectors
# ══════════════════════════════════════════════════════════════════════════

def prompt(label: str, default: str = "") -> str:
    """Prompt for input with Rich."""
    return Prompt.ask(label, default=default)


def confirm(label: str, default: bool = False) -> bool:
    """Confirm yes/no with Rich."""
    return Confirm.ask(label, default=default)


def _reset_mouse():
    """Disable terminal mouse tracking modes that leak into subprocesses."""
    import sys as _sys
    if _sys.stderr.isatty():
        _sys.stderr.write("\033[?1000l\033[?1002l\033[?1003l\033[?1006l")
        _sys.stderr.flush()


def choose(label: str, choices: list[str]) -> str | None:
    """fzf selector — falls back to Rich numbered prompt."""
    if shutil.which("fzf") and len(choices) > 1:
        try:
            _reset_mouse()
            proc = subprocess.run(
                ["fzf", "--no-sort", "--no-mouse",
                 f"--height={min(len(choices) + 4, 20)}",
                 "--border=bold", f"--border-label= {label} ",
                 "--border-label-pos=3", f"--color={_FZF_COLORS}",
                 "--pointer=>", "--no-info"],
                input="\n".join(choices),
                capture_output=True, text=True,
            )
            if proc.returncode == 0 and proc.stdout.strip():
                return proc.stdout.strip()
            return None
        except Exception:
            pass
    # Fallback
    console.print(f"\n[bold white]{label}[/]")
    for i, c in enumerate(choices, 1):
        console.print(f"  [bold white]{i}.[/] {c}")
    console.print(f"  [bold white]0.[/] [dim]cancel[/]")
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
    """fzf multi-select — falls back to Rich comma-separated input."""
    if shutil.which("fzf") and len(choices) > 1:
        try:
            _reset_mouse()
            proc = subprocess.run(
                ["fzf", "--multi", "--no-sort", "--no-mouse",
                 f"--height={min(len(choices) + 4, 20)}",
                 "--border=bold", f"--border-label= {label} ",
                 "--border-label-pos=3", f"--color={_FZF_COLORS}",
                 "--pointer=>", "--marker=*", "--no-info",
                 "--header=  space toggle  │  enter confirm  │  esc cancel"],
                input="\n".join(choices),
                capture_output=True, text=True,
            )
            if proc.returncode == 0 and proc.stdout.strip():
                return [ln for ln in proc.stdout.strip().split("\n") if ln]
            return []
        except Exception:
            pass
    # Fallback
    console.print(f"\n[bold white]{label}[/]")
    for i, c in enumerate(choices, 1):
        console.print(f"  [bold white]{i}.[/] {c}")
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
