"""Progress bar module — [green]####[/][dim]----[/] matching ruflo CLI output.ts.

Provides HashBarColumn and Spin context manager used by ui.spin() and suggest.
All spinners/bars across pyrfl use this single module for consistent styling.

Bar styles:
  Indeterminate : ⠋ Loading...  [####------####--------------] 0:00:03
  Determinate   : ⠋ Building... [#############---------------] 45.2%  0:00:07
  Complete      : ✓ Done        [##############################] 100%  0:00:12
"""

from __future__ import annotations

import math

from rich.console import Console
from rich.progress import (
    Progress,
    ProgressColumn,
    SpinnerColumn,
    Task,
    TextColumn,
    TimeElapsedColumn,
)
from rich.text import Text


# ── Block chars for sub-character fill resolution ─────────────────────────
# Full block → 7/8 → 3/4 → 5/8 → 1/2 → 3/8 → 1/4 → 1/8
_BLOCKS = " ░▒▓█"  # 5 levels: empty, 25%, 50%, 75%, full


class HashBarColumn(ProgressColumn):
    """Pulsing hash-bar: \\[####----] matching ruflo CLI progressBar style.

    Indeterminate (total=None):
        Sine-wave pulse with bright leading edge and dim trail.

    Determinate (total set):
        Standard fill bar with green filled / dim empty + percentage.
    """

    def __init__(self, width: int = 30):
        super().__init__()
        self.width = width

    def render(self, task: Task) -> Text:
        if task.total is None:
            return self._render_pulse(task)
        return self._render_fill(task)

    def _render_pulse(self, task: Task) -> Text:
        """Sine-wave pulse — smooth bounce with bright leading edge."""
        elapsed = task.elapsed or 0.0
        w = self.width

        # Sine wave position (0..1) — smooth bounce
        t = math.sin(elapsed * 1.8) * 0.5 + 0.5  # 0→1→0 smoothly
        center = int(t * (w - 1))
        pulse_w = max(3, int(w * 0.25))  # pulse is ~25% of bar width

        bar = Text("[", style="white")
        for i in range(w):
            dist = abs(i - center)
            if dist == 0:
                bar.append("#", style="bold green")
            elif dist < pulse_w // 2:
                bar.append("#", style="green")
            elif dist < pulse_w:
                bar.append("#", style="dim green")
            else:
                bar.append("-", style="dim")
        bar.append("]", style="white")
        return bar

    def _render_fill(self, task: Task) -> Text:
        """Determinate fill — green hashes with fractional leading edge."""
        w = self.width
        pct = min(1.0, max(0.0, task.completed / task.total)) if task.total else 0.0
        filled_f = pct * w
        filled = int(filled_f)
        frac = filled_f - filled  # 0..1 fractional part
        empty = w - filled - (1 if frac > 0.05 and filled < w else 0)

        bar = Text("[", style="white")

        # Filled section
        if filled > 0:
            bar.append("#" * filled, style="green")

        # Fractional leading edge — use block chars for sub-char resolution
        if frac > 0.05 and filled < w:
            level = min(len(_BLOCKS) - 1, int(frac * len(_BLOCKS)))
            bar.append(_BLOCKS[level], style="green")

        # Empty section
        if empty > 0:
            bar.append("-" * empty, style="dim")

        bar.append("]", style="white")

        # Percentage
        bar.append(f" {pct * 100:.1f}%", style="bold white")
        return bar


class Spin:
    """Context manager — green dots spinner + [####----] bar + elapsed time.

    Usage::

        with Spin("Loading...", console=console):
            do_work()

    For determinate progress::

        with Spin("Building...", console=console, total=100) as s:
            for i in range(100):
                do_step()
                s.advance()
    """

    def __init__(self, msg: str, console: Console | None = None,
                 total: float | None = None):
        self._msg = msg
        self._console = console
        self._total = total
        self._progress = Progress(
            SpinnerColumn("dots", style="green"),
            TextColumn(f"[bold white]{msg}[/]"),
            HashBarColumn(),
            TimeElapsedColumn(),
            console=console,
            transient=True,
        )
        self._task_id = None

    def __enter__(self):
        self._progress.__enter__()
        self._task_id = self._progress.add_task("", total=self._total)
        return self

    def __exit__(self, *args):
        return self._progress.__exit__(*args)

    def advance(self, amount: float = 1):
        """Advance determinate progress bar."""
        if self._task_id is not None:
            self._progress.advance(self._task_id, amount)

    def update(self, completed: float):
        """Set absolute progress value."""
        if self._task_id is not None:
            self._progress.update(self._task_id, completed=completed)
