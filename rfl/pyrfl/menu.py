"""Interactive menu — fzf-based TUI matching rfl's look and feel."""

from __future__ import annotations

import importlib
import os
import shutil
import subprocess
import sys
import tempfile
from typing import Any

_pkg = __name__.rsplit(".", 1)[0]
ui = importlib.import_module(".ui", _pkg)
commands = importlib.import_module(".commands", _pkg)

console = ui.console
COMMANDS = commands.COMMANDS
CATEGORIES = commands.CATEGORIES

# fzf color scheme matching rfl
_FZF_COLORS = (
    "border:7,label:7:bold,preview-border:7,preview-label:7:bold,"
    "prompt:7:bold,pointer:48,hl:48,hl+:48:bold,header:245"
)


def interactive_mode() -> None:
    """Main interactive loop — fzf-based with preview, falls back to Rich."""
    if not shutil.which("fzf"):
        console.print("[yellow]fzf not found — using basic menu[/]")
        from rich.prompt import Prompt
        _interactive_rich(Prompt)
        return

    _interactive_fzf()


# ── fzf-based interactive mode (mirrors rfl) ─────────────────────


def _interactive_fzf() -> None:
    """Full fzf interactive mode matching rfl's dual-panel drill-down."""
    preview_dir = tempfile.mkdtemp(prefix="pyrfl_")
    try:
        _build_previews(preview_dir)
        _fzf_main_loop(preview_dir)
    finally:
        import shutil as _sh
        _sh.rmtree(preview_dir, ignore_errors=True)


def _build_previews(pdir: str) -> None:
    """Build preview cache files for fzf --preview."""
    # Category previews
    for cat_name, cat_data in CATEGORIES.items():
        safe = cat_name.replace(" ", "_")
        lines = []
        for cmd_name in cat_data["commands"]:
            cmd_def = COMMANDS.get(cmd_name)
            if not cmd_def:
                continue
            lines.append(f"--- {cmd_name} ---")
            for sub in cmd_def["subs"]:
                lines.append(f"    {sub}")
            lines.append("")
        with open(os.path.join(pdir, f"cat_{safe}"), "w") as f:
            f.write("\n".join(lines))

    # Per-command previews
    for cmd_name, cmd_def in COMMANDS.items():
        for sub, sub_def in cmd_def["subs"].items():
            fname = f"rfl_{cmd_name}_{sub}"
            lines = [
                f"--- {cmd_name} {sub} ---",
                sub_def.get("desc", ""),
                "",
                f"MCP tool: {sub_def.get('tool', 'N/A')}",
            ]
            params = sub_def.get("params", [])
            if params:
                lines.append(f"Params: {', '.join(params)}")
            with open(os.path.join(pdir, fname), "w") as f:
                f.write("\n".join(lines))

    # Unified preview script
    preview_script = f"""#!/bin/sh
line="$1"
dir="{pdir}"
first="$(echo "$line" | sed 's/^[[:space:]]*//' | cut -c1-3)"
if echo "$first" | grep -q '\\[+\\]'; then
  name="$(echo "$line" | sed 's/^[^[:alpha:]]*//' | sed 's/  .*//')"
  safe="$(echo "$name" | tr ' ' '_')"
  cat "$dir/cat_$safe" 2>/dev/null || echo "No preview"
else
  right="$(echo "$line" | sed 's/.*│[[:space:]]*//')"
  cmd="$(echo "$right" | awk '{{print $1}}')"
  sub="$(echo "$right" | awk '{{print $2}}')"
  if [ -n "$cmd" ] && [ -n "$sub" ]; then
    if [ -f "$dir/rfl_${{cmd}}_${{sub}}" ]; then
      cat "$dir/rfl_${{cmd}}_${{sub}}"
    else
      echo "--- $cmd $sub ---"
      echo
      ruflo --v3-mode "$cmd" "$sub" --help 2>&1 | head -30
    fi
  fi
fi
"""
    script_path = os.path.join(pdir, "unified_preview.sh")
    with open(script_path, "w") as f:
        f.write(preview_script)
    os.chmod(script_path, 0o755)

    # Category submenu preview
    cat_preview = f"""#!/bin/sh
cmd="$1"
sub="$2"
dir="{pdir}"
if [ -f "$dir/rfl_${{cmd}}_${{sub}}" ]; then
  cat "$dir/rfl_${{cmd}}_${{sub}}"
else
  echo "--- $cmd $sub ---"
  echo
  ruflo --v3-mode "$cmd" "$sub" --help 2>&1 | head -30
fi
"""
    cat_script_path = os.path.join(pdir, "cmd_preview.sh")
    with open(cat_script_path, "w") as f:
        f.write(cat_preview)
    os.chmod(cat_script_path, 0o755)


def _fzf_main_loop(pdir: str) -> None:
    """Main fzf loop — unified list with categories + all commands."""
    # Build unified list matching rfl format
    unified = []
    for cat_name, cat_data in sorted(CATEGORIES.items()):
        count = sum(
            len(COMMANDS.get(c, {}).get("subs", {}))
            for c in cat_data["commands"]
        )
        cmds_str = " ".join(cat_data["commands"])
        unified.append(f"[+]{cat_name:<14}  {count:>3} cmds  │  {cmds_str}")

    for cmd_name in sorted(COMMANDS.keys()):
        for sub in COMMANDS[cmd_name]["subs"]:
            unified.append(f"   {'':14}        │  {cmd_name} {sub}")

    main_query = ""

    while True:
        fzf_input = "\n".join(unified)
        result = _run_fzf(
            fzf_input,
            query=main_query,
            prompt="pyrfl > ",
            border_label=" pyrfl  ruflo orchestration ",
            preview=f"'{pdir}/unified_preview.sh' {{}} '{pdir}'",
            header="  type to search  │  ↑↓ navigate  │  enter select  │  esc quit",
            height="90%",
        )

        if result is None:
            break

        main_query = result["query"]
        selected = result["selected"]

        if "[+]" in selected:
            # Category selected — extract name between [+] and first double-space
            raw = selected.split("[+]", 1)[-1].split("  ")[0].strip()
            cat_name = raw
            for cn in CATEGORIES:
                if cn == raw or cn.lower() == raw.lower():
                    cat_name = cn
                    break
            _fzf_category(pdir, cat_name)
        else:
            # Direct command — extract from right side of │
            right = selected.split("│")[-1].strip()
            parts = right.split()
            if len(parts) >= 2:
                cmd, sub = parts[0], parts[1]
                _fzf_run_command(cmd, sub)


def _fzf_category(pdir: str, cat_name: str) -> None:
    """Category submenu — fzf list of commands within a category."""
    cat_data = CATEGORIES.get(cat_name)
    if not cat_data:
        return

    entries = []
    for cmd_name in cat_data["commands"]:
        cmd_def = COMMANDS.get(cmd_name)
        if not cmd_def:
            continue
        for sub in cmd_def["subs"]:
            entries.append(f"{cmd_name} {sub}")

    cat_query = ""

    while True:
        fzf_input = "\n".join(entries)
        result = _run_fzf(
            fzf_input,
            query=cat_query,
            prompt=f"  {cat_name} > ",
            border_label=f" {cat_name} ",
            preview=f"'{pdir}/cmd_preview.sh' {{1}} {{2}}",
            preview_label=" Help ",
            header="  type to search  │  ↑↓ navigate  │  enter select  │  esc back",
            height="80%",
        )

        if result is None:
            break

        cat_query = result["query"]
        selected = result["selected"]
        parts = selected.split()
        if len(parts) >= 2:
            cmd, sub = parts[0], parts[1]
            # Action chooser
            action = _fzf_action(cmd, sub)
            if action == "Run":
                _fzf_run_command(cmd, sub)
            elif action == "Explain":
                _explain(cmd, sub)


def _fzf_action(cmd: str, sub: str) -> str | None:
    """Show Run/Explain/Cancel action picker via fzf."""
    actions = "Run\nExplain\nCancel"
    try:
        proc = subprocess.run(
            ["fzf", "--no-sort", "--height=6", "--border=bold",
             f"--border-label= {cmd} {sub} ",
             "--border-label-pos=3",
             f"--color={_FZF_COLORS}",
             "--pointer=>", "--no-info"],
            input=actions, capture_output=True, text=True,
        )
        if proc.returncode != 0:
            return None
        return proc.stdout.strip()
    except Exception:
        return None


def _fzf_run_command(cmd: str, sub: str) -> None:
    """Execute a command through handlers, then pause."""
    handlers = importlib.import_module(".handlers", _pkg)
    console.print()
    handlers.run_command(cmd, sub)
    console.print()
    console.print("[dim]Press enter to continue...[/]", end="")
    try:
        input()
    except (EOFError, KeyboardInterrupt):
        pass


def _explain(cmd: str, sub: str) -> None:
    """Show detailed help for a command."""
    console.print(f"\n[bold]ruflo {cmd} {sub}[/]\n")
    sub_def = COMMANDS.get(cmd, {}).get("subs", {}).get(sub, {})
    console.print(f"  {sub_def.get('desc', '')}")
    tool = sub_def.get("tool", "")
    if tool:
        console.print(f"  MCP tool: [cyan]{tool}[/]")
    params = sub_def.get("params", [])
    if params:
        console.print(f"  Params: {', '.join(params)}")
    console.print()
    # Also try ruflo --help
    try:
        proc = subprocess.run(
            ["ruflo", "--v3-mode", cmd, sub, "--help"],
            capture_output=True, text=True, timeout=10,
        )
        if proc.stdout.strip():
            console.print(proc.stdout.strip())
    except Exception:
        pass
    console.print()
    console.print("[dim]Press enter to continue...[/]", end="")
    try:
        input()
    except (EOFError, KeyboardInterrupt):
        pass


def _run_fzf(
    input_text: str,
    query: str = "",
    prompt: str = "> ",
    border_label: str = "",
    preview: str = "",
    preview_label: str = " Preview ",
    header: str = "",
    height: str = "90%",
) -> dict | None:
    """Run fzf with standard pyrfl styling. Returns {query, selected} or None."""
    cmd = [
        "fzf",
        "--print-query",
        f"--query={query}",
        f"--prompt={prompt}",
        "--border=bold",
        f"--border-label={border_label}",
        "--border-label-pos=3",
        f"--preview={preview}",
        "--preview-window=right:55%:border-left:wrap",
        f"--preview-label={preview_label}",
        "--preview-label-pos=3",
        f"--height={height}",
        "--margin=1,2",
        "--no-sort",
        f"--color={_FZF_COLORS}",
        f"--header={header}",
        "--header-first",
        "--pointer=>",
        "--marker=*",
    ]

    try:
        proc = subprocess.run(
            cmd, input=input_text, capture_output=True, text=True,
        )
        if proc.returncode != 0:
            return None
        lines = proc.stdout.strip().split("\n")
        return {
            "query": lines[0] if lines else "",
            "selected": lines[1] if len(lines) > 1 else "",
        }
    except Exception:
        return None


# ── Rich fallback (no fzf) ───────────────────────────────────────


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
            ui.error("Invalid choice")
            continue

        entries = []
        for cmd_name in CATEGORIES[cat]["commands"]:
            cmd_def = COMMANDS.get(cmd_name)
            if not cmd_def:
                continue
            for sub, sub_def in cmd_def["subs"].items():
                entries.append((cmd_name, sub, sub_def["desc"]))

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
            ui.error("Invalid choice")
            continue
        handlers = importlib.import_module(".handlers", _pkg)
        handlers.run_command(cmd, sub)
