#!/usr/bin/env python3
"""pyrfl -- Python TUI wrapper for ruflo CLI."""

from __future__ import annotations

import argparse
import importlib
import shutil
import sys

_pkg = __name__.rsplit(".", 1)[0]

__version__ = "1.0.0"


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="pyrfl",
        description="Interactive TUI for ruflo agent orchestration",
    )
    parser.add_argument("--version", action="version", version=f"pyrfl {__version__}")
    parser.add_argument("--list", action="store_true", dest="list_commands",
                        help="List all available commands")
    parser.add_argument("--test-all", action="store_true",
                        help="Test every command path (--help)")
    parser.add_argument("cmd", nargs="?", help="Command (e.g., agent, task, swarm)")
    parser.add_argument("sub", nargs="?", help="Subcommand (e.g., list, create, status)")
    parser.add_argument("args", nargs="*", help="Additional arguments")

    args = parser.parse_args()

    # Check ruflo is available
    if not shutil.which("ruflo"):
        print("Error: ruflo not found. Install with: npm i -g @claude-flow/cli@latest",
              file=sys.stderr)
        sys.exit(1)

    # Check Rich is available
    try:
        from rich.console import Console  # noqa: F401
    except ImportError:
        print("Error: rich not found. Install with: pip install rich", file=sys.stderr)
        sys.exit(1)

    commands = importlib.import_module(".commands", _pkg)

    # --list: dump all command paths
    if args.list_commands:
        for entry in commands.COMMANDS_FLAT:
            print(f"ruflo {entry['cmd']} {entry['sub']}")
        return

    # --test-all: test every command with --help
    if args.test_all:
        rc = _test_all(commands)
        sys.exit(rc)

    if args.cmd and args.sub:
        # Direct execution mode
        handlers = importlib.import_module(".handlers", _pkg)
        extra = args.args if args.args else None
        handlers.run_command(args.cmd, args.sub, extra_args=extra)
    elif args.cmd and not args.sub:
        # Show subcommands for this command
        ui = importlib.import_module(".ui", _pkg)
        subcmds = commands.SUBCMDS.get(args.cmd)
        if not subcmds:
            print(f"Unknown command: {args.cmd}", file=sys.stderr)
            sys.exit(1)
        rows = []
        for sub in subcmds:
            desc = commands.CMD_DESCS.get(f"{args.cmd}:{sub}", "")
            rows.append([sub, desc])
        ui.show_table(f"ruflo {args.cmd}", ["Subcommand", "Description"], rows)
    else:
        # Interactive mode
        menu = importlib.import_module(".menu", _pkg)
        menu.interactive_mode()


def _test_all(commands_mod: object) -> int:
    """Test every command path by running ruflo <cmd> <sub> --help."""
    import subprocess

    ui = importlib.import_module(".ui", _pkg)
    console = ui.console
    all_commands = getattr(commands_mod, "COMMANDS_FLAT", [])

    passed = 0
    failed = 0
    warned = 0
    failures: list[str] = []

    console.print("[bold]Testing all pyrfl command paths...[/]")
    console.print("Mode: HELP (--help only)")
    console.print("[dim]" + "-" * 50 + "[/]")

    for entry in all_commands:
        cmd, sub = entry["cmd"], entry["sub"]
        label = f"{cmd} {sub}"
        try:
            result = subprocess.run(
                ["ruflo", "--v3-mode", cmd, sub, "--help"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                console.print(f"  {label:<40} [green]PASS[/]")
                passed += 1
            else:
                output = (result.stderr or result.stdout or "").split("\n")[0]
                bad_words = ("unknown", "not found", "error", "invalid")
                if any(w in output.lower() for w in bad_words):
                    console.print(f"  {label:<40} [red]FAIL[/]  {output}")
                    failed += 1
                    failures.append(label)
                else:
                    console.print(
                        f"  {label:<40} [yellow]WARN[/]  rc={result.returncode}"
                    )
                    warned += 1
        except FileNotFoundError:
            console.print(f"  {label:<40} [red]FAIL[/]  ruflo not found")
            failed += 1
            failures.append(label)
        except subprocess.TimeoutExpired:
            console.print(f"  {label:<40} [yellow]WARN[/]  timeout")
            warned += 1

    console.print("[dim]" + "-" * 50 + "[/]")
    console.print(
        f"Results: [green]{passed} pass[/]  "
        f"[red]{failed} fail[/]  "
        f"[yellow]{warned} warn[/]"
    )

    if failures:
        console.print("\n[bold]Failed paths:[/]")
        for f in failures:
            console.print(f"  - ruflo {f}")

    return 1 if failed > 0 else 0


if __name__ == "__main__":
    main()
