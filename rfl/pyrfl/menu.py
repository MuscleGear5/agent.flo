"""Interactive menu — simple-term-menu with Rich prompt fallback."""

from __future__ import annotations

import importlib
import sys
import os
from typing import Any

# Use importlib for sibling modules to satisfy static analysis
_pkg = __name__.rsplit(".", 1)[0]
ui = importlib.import_module(".ui", _pkg)
mcp = importlib.import_module(".mcp", _pkg)
commands = importlib.import_module(".commands", _pkg)

console = ui.console
show_table = ui.show_table
error = ui.error
info = ui.info
COMMANDS = commands.COMMANDS
CATEGORIES = commands.CATEGORIES


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
        # Level 1: Category selection
        cats = sorted(CATEGORIES.keys())
        items = [f"  {cat:<16} {CATEGORIES[cat]['desc']}" for cat in cats]
        items.append("  [quit]")

        menu = TerminalMenu(
            items,
            title="\n  ruflo\n",
            menu_cursor_style=("fg_cyan", "bold"),
            menu_highlight_style=("fg_cyan",),
            clear_screen=False,
        )
        idx = menu.show()
        if idx is None or idx == len(cats):
            break

        cat = cats[idx]
        cmds = CATEGORIES[cat]["commands"]

        # Level 2: Command selection
        cmd_items = [f"  {c['cmd']:<12} {c['sub']:<16} {c['desc']}" for c in cmds]
        cmd_items.append("  [back]")

        cmd_menu = TerminalMenu(
            cmd_items,
            title=f"\n  ruflo > {cat}\n",
            menu_cursor_style=("fg_cyan", "bold"),
            menu_highlight_style=("fg_cyan",),
            clear_screen=False,
        )
        cidx = cmd_menu.show()
        if cidx is None or cidx == len(cmds):
            continue

        selected = cmds[cidx]
        _execute(selected["cmd"], selected["sub"])


def _interactive_rich(Prompt: Any) -> None:
    """Fallback interactive mode using Rich prompts."""
    while True:
        console.print("\n[bold]ruflo[/] -- interactive mode\n")
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
        # Show commands in category
        cmds = CATEGORIES[cat]["commands"]
        console.print(f"\n[bold]ruflo > {cat}[/]\n")
        for i, c in enumerate(cmds, 1):
            console.print(f"  {i}. {c['cmd']:<12} {c['sub']:<16} {c['desc']}")
        console.print("  0. back")
        cidx = Prompt.ask("Select command", default="0")
        if cidx == "0":
            continue
        try:
            selected = cmds[int(cidx) - 1]
        except (ValueError, IndexError):
            error("Invalid choice")
            continue
        _execute(selected["cmd"], selected["sub"])


def _execute(cmd: str, sub: str) -> None:
    """Execute a command through the handler system."""
    handlers = importlib.import_module(".handlers", _pkg)
    handlers.run_command(cmd, sub)
