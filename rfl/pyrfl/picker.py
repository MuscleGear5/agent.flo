"""User selection utilities for pyrfl."""

import shutil
import subprocess
import tempfile
import os
from rich.console import Console
from rich.prompt import Prompt

from .status import _clean

console = Console()

# fzf color scheme — white borders/text, green/yellow/red highlights
_FZF_COLORS = (
    "border:7,label:7:bold,preview-border:7,preview-label:7:bold,"
    "prompt:7:bold,pointer:48,hl:48,hl+:48:bold,header:245"
)


def choose(label: str, choices: list[str]) -> str | None:
    """Interactive single-selection picker with Rich fallback."""
    if not choices:
        return None
    if len(choices) == 1:
        return choices[0]

    # fzf selector (if available)
    if shutil.which("fzf"):
        # Use temp file for input
        with tempfile.NamedTemporaryFile(mode="w", delete=False) as tf:
            tf.write("\n".join(_clean(c) for c in choices))
            tf_name = tf.name

        try:
            with open(tf_name, "r") as f:
                proc = subprocess.run(
                    ["fzf", "--no-sort",
                     f"--height={min(len(choices) + 4, 20)}",
                     "--border=bold", f"--border-label= {label} ",
                     "--border-label-pos=3", f"--color={_FZF_COLORS}",
                     "--pointer=>", "--no-info"],
                    stdin=f, stdout=subprocess.PIPE, text=True,
                )
            if proc.returncode == 0 and proc.stdout.strip():
                return proc.stdout.strip()
            return None
        except Exception:
            pass
        finally:
            try:
                os.unlink(tf_name)
            except OSError:
                pass

    # Rich fallback
    console.print(f"\n[bold white]{label}[/]")
    for i, c in enumerate(choices, 1):
        console.print(f"  [bold white]{i}.[/] {_clean(c)}")
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
    """Interactive multi-selection picker with Rich fallback."""
    if not choices:
        return []

    # fzf multi-select (if available)
    if shutil.which("fzf") and len(choices) > 1:
        # Use temp file for input
        with tempfile.NamedTemporaryFile(mode="w", delete=False) as tf:
            tf.write("\n".join(_clean(c) for c in choices))
            tf_name = tf.name

        try:
            with open(tf_name, "r") as f:
                proc = subprocess.run(
                    ["fzf", "--multi", "--no-sort",
                     f"--height={min(len(choices) + 4, 20)}",
                     "--border=bold", f"--border-label= {label} ",
                     "--border-label-pos=3", f"--color={_FZF_COLORS}",
                     "--pointer=>", "--marker=*", "--no-info",
                     "--header=  space toggle  │  enter confirm  │  esc cancel"],
                    stdin=f, stdout=subprocess.PIPE, text=True,
                )
            if proc.returncode == 0 and proc.stdout.strip():
                return [ln for ln in proc.stdout.strip().split("\n") if ln]
            return []
        except Exception:
            pass
        finally:
            try:
                os.unlink(tf_name)
            except OSError:
                pass

    # Rich fallback
    console.print(f"\n[bold white]{label}[/]")
    for i, c in enumerate(choices, 1):
        console.print(f"  [bold white]{i}.[/] {_clean(c)}")
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


__all__ = [
    "choose",
    "multi_choose",
    "_FZF_COLORS",
]
