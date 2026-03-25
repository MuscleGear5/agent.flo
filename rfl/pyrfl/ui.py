"""Rich-based UI utilities for pyrfl."""

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text
from rich.live import Live
from rich.prompt import Prompt, Confirm

console = Console()

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


def status_style(s: str) -> str:
    """Return Rich color name for a status string."""
    key = s.lower().split()[0] if s else ""
    return STATUS_COLORS.get(key, "white")


def show_table(title: str, columns: list[str], rows: list[list[str]]):
    """Display a Rich table with automatic status coloring."""
    table = Table(title=title, border_style="bright_black", show_lines=False)
    for col in columns:
        table.add_column(col, style="bold" if col in ("ID", "Name", "Key") else "")
    for row in rows:
        styled = []
        for i, cell in enumerate(row):
            if columns[i].lower() == "status":
                styled.append(f"[{status_style(cell)}]{cell}[/]")
            else:
                styled.append(cell)
        table.add_row(*styled)
    console.print(table)


def show_kv(title: str, data: dict, skip: set | None = None):
    """Display key-value pairs as a Rich table."""
    if skip is None:
        skip = {"success"}
    table = Table(title=title, border_style="bright_black")
    table.add_column("Field", style="bold")
    table.add_column("Value")
    for k, v in data.items():
        if k in skip or v is None or v == "":
            continue
        if isinstance(v, dict):
            v = ", ".join(f"{sk}={sv}" for sk, sv in v.items())
        elif isinstance(v, list):
            v = ", ".join(str(item) for item in v)
        elif isinstance(v, float):
            v = f"{v:.4f}"
        table.add_row(str(k), str(v))
    console.print(table)


def show_raw(output: str):
    """Display raw text output in a panel."""
    if output:
        console.print(Panel(output, border_style="bright_black"))


def spin(msg: str):
    """Context manager for spinner."""
    return console.status(msg, spinner="dots")


def error(msg: str):
    """Print an error message."""
    console.print(f"[red bold]\\[ERROR][/] {msg}")


def success(msg: str):
    """Print a success message."""
    console.print(f"[green bold]\\[OK][/] {msg}")


def info(msg: str):
    """Print a dimmed info message."""
    console.print(f"[dim]{msg}[/]")


def warn(msg: str):
    """Print a warning message."""
    console.print(f"[yellow bold]\\[WARN][/] {msg}")


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
        # Try matching by name
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
