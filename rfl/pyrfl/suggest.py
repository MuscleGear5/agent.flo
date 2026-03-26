"""AI-powered next-step suggestions — DeepSeek background calls + fzf picker.

Port of rfl.d/suggest.zsh to Python. Toggleable with ctrl-s in the menu.
Flag file: $XDG_CONFIG_HOME/rfl/suggest-off (touch to disable, rm to enable).
"""

from __future__ import annotations

import importlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import textwrap
import threading
import time
from pathlib import Path


_pkg = __name__.rsplit(".", 1)[0]
ui = importlib.import_module(".ui", _pkg)
_progress_mod = importlib.import_module(".progress", _pkg)
_cmd_mod = importlib.import_module(".commands", _pkg)
COMMANDS = _cmd_mod.COMMANDS

# ── Config ────────────────────────────────────────────────────────────────

_DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
_FLAG_DIR = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "rfl"
_FLAG_FILE = _FLAG_DIR / "suggest-off"

# Session state
_session_history: list[str] = []
_last_output: str = ""
_suggest_thread: threading.Thread | None = None
_suggest_result: list[dict] | None = None
_suggest_lock = threading.Lock()


# ── Toggle ────────────────────────────────────────────────────────────────

def is_enabled() -> bool:
    """Check if AI suggestions are enabled."""
    return not _FLAG_FILE.exists()


def toggle() -> bool:
    """Toggle suggestions on/off. Returns new enabled state."""
    _FLAG_DIR.mkdir(parents=True, exist_ok=True)
    if _FLAG_FILE.exists():
        _FLAG_FILE.unlink()
        return True
    else:
        _FLAG_FILE.touch()
        return False


def _get_api_key() -> str:
    return os.environ.get("DEEPSEEK_API_KEY", "")


# ── History ───────────────────────────────────────────────────────────────

def log_cmd(cmd: str, sub: str):
    """Log a command execution to session history."""
    ts = time.strftime("%H:%M")
    _session_history.append(f"[{ts}] ruflo {cmd} {sub}")
    # Keep last 20
    while len(_session_history) > 20:
        _session_history.pop(0)


def set_last_output(output: str):
    """Capture last command output for suggestion context."""
    global _last_output
    # Strip box chars and truncate
    cleaned = re.sub(r"[┃┏┗┣┳┻╋━┓┛┫╸─┏┓┗┛]", "", output)
    cleaned = re.sub(r"  +", " ", cleaned)
    # Strip IDs so AI can't use stale ones
    cleaned = re.sub(r"(task|agent|swarm|session)-[a-z0-9_-]+", "<id>", cleaned)
    _last_output = cleaned[:500]


# ── Background API call ──────────────────────────────────────────────────

def _fetch_suggestions(cmd: str, sub: str):
    """Background thread: call DeepSeek for next-step suggestions."""
    global _suggest_result
    api_key = _get_api_key()
    if not api_key:
        return

    # Strip IDs from history
    history = "\n".join(_session_history[-20:])
    history = re.sub(r"(task|agent|swarm|session)-[a-z0-9_-]+", "<id>", history)

    # Gather live state via ruflo CLI (quick MCP calls)
    live_agents = _quick_mcp("agent_list", ".agents[] | \"\\(.agentId) (\\(.agentType), \\(.status))\"")
    live_tasks = _quick_mcp("task_list", ".tasks[] | \"\\(.taskId) [\\(.status)] \\(.type): \\(.description)\"")
    live_swarm = _quick_mcp("swarm_status", "\"swarm: \\(.swarmId) status=\\(.status) topology=\\(.topology)\"")

    # Build valid subcommands list
    valid_cmds = []
    for c, cdef in COMMANDS.items():
        subs = " ".join(cdef.get("subs", {}).keys())
        valid_cmds.append(f"{c}({subs})")
    valid_str = ", ".join(valid_cmds)

    system_prompt = f"""You are a ruflo workflow advisor. Output ONLY a valid JSON array, nothing else.

FORMAT: [{{"cmd":"ruflo <cmd> <sub> [args]","reason":"short reason (5-10 words)","detail":"2-3 sentence justification explaining WHY this is the right next step based on the current state, what ran, and the output"}}]

VALID commands: {valid_str}

RULES:
- Output ONLY the JSON array. No markdown fences, no commentary.
- ONLY use IDs from LIVE STATE sections below. IDs in SESSION history may be STALE/DELETED.
- If 'Task not found' or similar error: the ID is gone. Suggest task list or task create.
- If error in output: suggest the FIX, never repeat failed command
- Never repeat the command that was just run
- If no tasks exist: suggest task create FIRST (not task assign)
- Do NOT suggest task assign just because agents are idle — idle agents are normal
- Focus suggestions on the command just run, not on agent utilization
- detail field: reference specific state (agent IDs, task counts, errors) to justify the suggestion"""

    user_prompt = f"""JUST RAN: ruflo {cmd} {sub}

OUTPUT (truncated): {_last_output}

SESSION (for context only, IDs here may be STALE): {history}

=== LIVE STATE (use ONLY these IDs) ===
AGENTS: {live_agents}

TASKS: {live_tasks}

SWARM: {live_swarm}

Suggest 3-5 next steps using ONLY IDs from LIVE STATE above."""

    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
    }

    try:
        proc = subprocess.run(
            ["curl", "-s", "--max-time", "25", _DEEPSEEK_URL,
             "-H", "Content-Type: application/json",
             "-H", f"Authorization: Bearer {api_key}",
             "-d", json.dumps(payload)],
            capture_output=True, text=True, timeout=30,
        )
        if proc.returncode != 0:
            return

        resp = json.loads(proc.stdout)
        raw_content = resp.get("choices", [{}])[0].get("message", {}).get("content", "")

        # Strip markdown fences
        raw_content = re.sub(r"^```(?:json)?\s*", "", raw_content.strip())
        raw_content = re.sub(r"\s*```$", "", raw_content)

        data = json.loads(raw_content)
        if isinstance(data, list):
            # Validate commands against COMMANDS registry
            valid = []
            for item in data:
                cmd_str = item.get("cmd", "").strip()
                parts = cmd_str.replace("ruflo ", "").split()
                if len(parts) >= 2:
                    rcmd, rsub = parts[0], parts[1]
                    if rcmd in COMMANDS and rsub in COMMANDS[rcmd].get("subs", {}):
                        valid.append(item)
            with _suggest_lock:
                _suggest_result = valid
    except Exception:
        pass


def _quick_mcp(tool: str, jq_expr: str) -> str:
    """Quick MCP call via ruflo CLI + jq. Returns formatted string or 'none'."""
    try:
        proc = subprocess.run(
            ["ruflo", "mcp", "exec", "--tool", tool, "-p", "{}"],
            capture_output=True, text=True, timeout=10,
        )
        # Extract JSON after "Result:" line
        lines = proc.stdout.split("\n")
        json_start = -1
        for i, line in enumerate(lines):
            if "Result:" in line:
                json_start = i + 1
                break
        if json_start < 0:
            return "none"
        json_str = "\n".join(lines[json_start:])

        jq_proc = subprocess.run(
            ["jq", "-r", jq_expr],
            input=json_str, capture_output=True, text=True, timeout=5,
        )
        out = jq_proc.stdout.strip()
        return out if out else "none"
    except Exception:
        return "none"


# ── Public API ────────────────────────────────────────────────────────────

def fire_background(cmd: str, sub: str):
    """Fire a background API call for suggestions after a command runs."""
    global _suggest_thread, _suggest_result

    log_cmd(cmd, sub)

    if not is_enabled() or not _get_api_key():
        return

    with _suggest_lock:
        _suggest_result = None

    _suggest_thread = threading.Thread(target=_fetch_suggestions, args=(cmd, sub), daemon=True)
    _suggest_thread.start()


def show_suggestions(cmd: str, sub: str) -> bool:
    """Show AI suggestion picker via fzf. Returns True if a command was executed.

    Called after run_command completes. Waits for background thread if needed,
    then presents fzf picker with preview panel showing 'Why?' detail.
    """
    if not sys.stdin.isatty():
        return False

    if not is_enabled():
        ui.console.print(
            f"[dim]  AI suggestions OFF[/]  [dim](ctrl-s in menu to enable)[/]"
        )
        return False

    if not _get_api_key():
        return False

    # Wait for background thread with hash-bar progress
    if _suggest_thread and _suggest_thread.is_alive():
        with _progress_mod.Spin("AI suggestions", console=ui.console) as _s:
            while _suggest_thread.is_alive():
                _suggest_thread.join(timeout=0.1)

    with _suggest_lock:
        suggestions = _suggest_result

    if not suggestions:
        return False

    # Build fzf input: bullet + command + reason
    labels = []
    for s in suggestions:
        c = s.get("cmd", "").strip()
        r = s.get("reason", "").strip()
        labels.append(f"\u2022 {c} \u2014 {r}")
    labels.append("(back)")

    # Build preview script inline
    details_json = json.dumps(suggestions)
    preview_script = _build_preview_script(details_json)

    if not shutil.which("fzf"):
        # Fallback: just print suggestions
        ui.console.print()
        for lbl in labels[:-1]:
            ui.console.print(f"  [dim]{lbl}[/]")
        return False

    # Write preview script to temp file
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False, prefix="pyrfl_suggest_")
    tmp.write(preview_script)
    tmp.close()

    # Use temp file for input to avoid pipe buffering issues with fzf
    with tempfile.NamedTemporaryFile(mode="w", delete=False) as tf:
        tf.write(fzf_input)
        tf_name = tf.name

    try:
        with open(tf_name, "r") as f:
            proc = subprocess.run(
                ["fzf",
                 "--prompt=suggest > ",
                 "--border=bold",
                 "--border-label= Suggested next steps ",
                 "--border-label-pos=3",
                 f"--preview=python3 {tmp.name} {{}}",
                 "--preview-window=right:45%:wrap:hidden",
                 "--preview-label= Why? ",
                 "--preview-label-pos=3",
                 "--height=50%",
                 "--margin=1,2",
                 "--no-sort",
                 f"--color={ui._FZF_COLORS}",
                 "--header=  enter select  |  ? detail  |  esc back",
                 "--header-first",
                 "--pointer=>",
                 "--bind=?:toggle-preview",
                 "--no-info"],
                stdin=f, stdout=subprocess.PIPE, text=True,
            )

        if proc.returncode != 0:
            return False

        picked = proc.stdout.strip()
        if not picked or picked == "(back)":
            return False

        # Extract command from "* ruflo cmd sub ..." before em dash
        before_dash = picked.split("\u2014")[0]
        match = re.search(r"ruflo\s+(\S+)\s+(\S+)(.*)", before_dash)
        if not match:
            return False

        target_cmd = match.group(1)
        target_sub = match.group(2)
        extra = match.group(3).strip()

        ui.console.print(f"\n[green]> ruflo {target_cmd} {target_sub} {extra}[/]")

        # Import handlers to execute (avoid circular import)
        handlers = importlib.import_module(".handlers", _pkg)
        extra_args = extra.split() if extra else None
        handlers.run_command(target_cmd, target_sub, extra_args=extra_args)
        return True

    except Exception:
        return False
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
        try:
            os.unlink(tf_name)
        except OSError:
            pass


def _build_preview_script(details_json: str) -> str:
    """Build a Python preview script for fzf --preview."""
    # Escape for embedding in a Python string
    escaped = details_json.replace("\\", "\\\\").replace("'", "\\'")
    return f"""#!/usr/bin/env python3
import sys, json, re, textwrap

line = " ".join(sys.argv[1:])
if "back" in line:
    print("\\033[38;5;245mReturn to menu\\033[0m")
    sys.exit(0)

m = re.search(r"ruflo\\s+\\S+(\\s+\\S+)*", line)
if not m:
    print("No detail available")
    sys.exit(0)
cmd = m.group().strip()

data = json.loads('{escaped}')
for s in data:
    if s.get("cmd", "").strip() == cmd:
        print("\\033[1;38;5;51m" + s.get("cmd", "") + "\\033[0m")
        print()
        print("\\033[38;5;141mWhy this command?\\033[0m")
        print()
        detail = s.get("detail", "No detail available.")
        for wl in textwrap.wrap(detail, width=48):
            print("  " + wl)
        sys.exit(0)

# Fallback: show reason from after em dash
parts = line.split("\\u2014", 1)
if len(parts) > 1:
    reason = parts[1].strip()
    print("\\033[1;38;5;51m" + cmd + "\\033[0m")
    print()
    for wl in textwrap.wrap(reason, width=48):
        print("  " + wl)
else:
    print("(press ? to toggle detail)")
"""
