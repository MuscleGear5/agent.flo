"""Interactive menu — simple-term-menu with Rich prompt fallback."""

from __future__ import annotations

import importlib
from typing import Any

_pkg = __name__.rsplit(".", 1)[0]
ui = importlib.import_module(".ui", _pkg)
commands = importlib.import_module(".commands", _pkg)

console = ui.console
error = ui.error
COMMANDS = commands.COMMANDS
CATEGORIES = commands.CATEGORIES


def _expand_category(cat_name: str) -> list[tuple[str, str, str]]:
    """Expand a category's command names into (cmd, sub, desc) triples."""
    entries = []
    for cmd_name in CATEGORIES[cat_name]["commands"]:
        cmd_def = COMMANDS.get(cmd_name)
        if not cmd_def:
            continue
        for sub, sub_def in cmd_def["subs"].items():
            entries.append((cmd_name, sub, sub_def["desc"]))
    return entries


def interactive_mode() -> None:
    """Main interactive loop with category/command selection."""
    TerminalMenu: Any = None
    try:
        from simple_term_menu import TerminalMenu as _TM  # type: ignore[import-untyped]
        TerminalMenu = _TM
    except ImportError:
        pass

    if TerminalMenu is None:
        from rich.prompt import Prompt
        _interactive_rich(Prompt)
        return

    _interactive_stm(TerminalMenu)


def _interactive_stm(TerminalMenu: Any) -> None:
    """Interactive mode using simple-term-menu."""
    while True:
        cats = sorted(CATEGORIES.keys())
        items = [f"  {cat:<16} {CATEGORIES[cat]['desc']}" for cat in cats]
        items.append("  [quit]")

        menu = TerminalMenu(
            items,
            title="\n  pyrfl\n",
            menu_cursor_style=("fg_cyan", "bold"),
            menu_highlight_style=("fg_cyan",),
            clear_screen=False,
        )
        idx = menu.show()
        if idx is None or idx == len(cats):
            break

        cat = cats[idx]
        entries = _expand_category(cat)

        cmd_items = [f"  {c:<12} {s:<16} {d}" for c, s, d in entries]
        cmd_items.append("  [back]")

        cmd_menu = TerminalMenu(
            cmd_items,
            title=f"\n  pyrfl > {cat}\n",
            menu_cursor_style=("fg_cyan", "bold"),
            menu_highlight_style=("fg_cyan",),
            clear_screen=False,
        )
        cidx = cmd_menu.show()
        if cidx is None or cidx == len(entries):
            continue

        cmd, sub, _ = entries[cidx]
        _execute(cmd, sub)


def _interactive_rich(Prompt: Any) -> None:
    """Fallback interactive mode using Rich prompts."""
    while True:
        console.print("\n[bold]pyrfl[/] — ruflo interactive TUI\n")
        cats = sorted(CATEGORIES.keys())
        for i, cat in enumerate(cats, 1):
            console.print(f"  {i}. {cat:<16} {CATEGORIES[cat]['desc']}")
        console.print("  q. quit")
        choice = Prompt.ask("\nSelect", default="q")
        if choice.lower() == "q":
            break
        try:
            cat = cats[int(choice) - 1]
        except (ValueError, IndexError):
            error("Invalid choice")
            continue

        entries = _expand_category(cat)
        console.print(f"\n[bold]pyrfl > {cat}[/]\n")
        for i, (c, s, d) in enumerate(entries, 1):
            console.print(f"  {i}. {c:<12} {s:<16} {d}")
        console.print("  0. back")
        cidx = Prompt.ask("Select command", default="0")
        if cidx == "0":
            continue
        try:
            cmd, sub, _ = entries[int(cidx) - 1]
        except (ValueError, IndexError):
            error("Invalid choice")
            continue
        _execute(cmd, sub)


def _execute(cmd: str, sub: str) -> None:
    """Execute a command through the handler system."""
    handlers = importlib.import_module(".handlers", _pkg)
    handlers.run_command(cmd, sub)
