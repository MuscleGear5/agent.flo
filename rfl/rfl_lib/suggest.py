"""AI-powered next-step suggestions via DeepSeek API."""
from __future__ import annotations
import os, sys, json, re, subprocess, threading, tempfile
from rfl_lib.commands import SUBCMDS  # pyright: ignore[reportMissingImports]

_DEEPSEEK_KEY = os.environ.get('DEEPSEEK_API_KEY', '')
_DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'
_SUGGEST_FLAG = os.path.join(os.environ.get('XDG_CONFIG_HOME', os.path.expanduser('~/.config')), 'rfl', 'suggest-off')
os.makedirs(os.path.dirname(_SUGGEST_FLAG), exist_ok=True)

last_output: str = ''
_history: list[str] = []
_suggest_file: str = ''
_suggest_detail: str = ''
_suggest_thread: threading.Thread | None = None


def log_cmd(cmd: str, sub: str) -> None:
    from datetime import datetime
    _history.append(f'[{datetime.now().strftime("%H:%M")}] ruflo {cmd} {sub}')
    if len(_history) > 20:
        del _history[:-20]


def is_off() -> bool:
    return os.path.isfile(_SUGGEST_FLAG)


def toggle() -> None:
    if os.path.isfile(_SUGGEST_FLAG):
        os.remove(_SUGGEST_FLAG)
    else:
        open(_SUGGEST_FLAG, 'w').close()


def fire_bg(cmd: str, sub: str) -> None:
    global _suggest_thread, _suggest_file, _suggest_detail
    if is_off() or not _DEEPSEEK_KEY:
        return

    _suggest_file = tempfile.mktemp(prefix='rfl-suggest-')
    _suggest_detail = tempfile.mktemp(prefix='rfl-suggest-detail-')

    def _fetch():
        try:
            # Strip IDs from history
            hist = '\n'.join(re.sub(r'(task|agent|swarm|session)-[a-z0-9_-]+', '<id>', h) for h in _history[-20:])
            out_stripped = re.sub(r'[┃┏┗┣┳┻╋━┓┛┫╸─]', '', last_output[:500])
            out_stripped = re.sub(r'(task|agent|swarm|session)-[a-z0-9_-]+', '<id>', out_stripped)

            # Gather live state
            def _mcp(tool):
                try:
                    r = subprocess.run(['ruflo', 'mcp', 'exec', '--tool', tool, '-p', '{}'],
                                       capture_output=True, text=True, timeout=10)
                    raw = r.stdout
                    if 'Result:' in raw:
                        raw = raw[raw.index('Result:') + 7:].strip()
                    return json.loads(raw)
                except Exception:
                    return {}

            agents_data = _mcp('agent_list')
            tasks_data = _mcp('task_list')
            swarm_data = _mcp('swarm_status')

            live_agents = '\n'.join(
                f"{a.get('agentId', '?')} ({a.get('agentType', '?')}, {a.get('status', '?')})"
                for a in agents_data.get('agents', [])
            ) or 'none'
            live_tasks = '\n'.join(
                f"{t.get('taskId', '?')} [{t.get('status', '?')}] {t.get('type', '')}: {t.get('description', '')}"
                for t in tasks_data.get('tasks', [])[:10]
            ) or 'none'
            live_swarm = f"swarm: {swarm_data.get('swarmId', '?')} status={swarm_data.get('status', '?')} topology={swarm_data.get('topology', '?')}" if swarm_data else 'none'

            sys_prompt = """You are a ruflo workflow advisor. Output ONLY a valid JSON array, nothing else.
FORMAT: [{"cmd":"ruflo <cmd> <sub> [args]","reason":"short reason (5-10 words)","detail":"2-3 sentence justification"}]
VALID commands: agent(spawn list status stop metrics), task(create list status cancel assign), swarm(init start status stop), memory(store search list), session(list save restore), hooks(list metrics)
RULES:
- Output ONLY the JSON array. No markdown fences, no commentary.
- ONLY use IDs from LIVE STATE sections. IDs in SESSION history may be STALE.
- Never repeat the command that was just run
- If error in output: suggest the FIX, never repeat failed command"""

            user_prompt = f"""JUST RAN: ruflo {cmd} {sub}
OUTPUT (truncated): {out_stripped}
SESSION (context only, IDs may be STALE): {hist}
=== LIVE STATE (use ONLY these IDs) ===
AGENTS: {live_agents}
TASKS: {live_tasks}
SWARM: {live_swarm}
Suggest 3-5 next steps using ONLY IDs from LIVE STATE above."""

            import urllib.request
            req_data = json.dumps({
                'model': 'deepseek-chat',
                'messages': [
                    {'role': 'system', 'content': sys_prompt},
                    {'role': 'user', 'content': user_prompt},
                ],
                'temperature': 0.3,
            }).encode()

            req = urllib.request.Request(_DEEPSEEK_URL, data=req_data, headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {_DEEPSEEK_KEY}',
            })
            with urllib.request.urlopen(req, timeout=25) as resp:
                resp_data = json.loads(resp.read())

            content = resp_data.get('choices', [{}])[0].get('message', {}).get('content', '')
            content = re.sub(r'^```(?:json)?\s*', '', content.strip())
            content = re.sub(r'\s*```$', '', content)

            try:
                data = json.loads(content)
                if not isinstance(data, list):
                    raise ValueError
                labels = []
                for item in data:
                    c = item.get('cmd', '').strip()
                    reason = item.get('reason', '').strip()
                    if c:
                        labels.append(f'• {c} — {reason}')
                with open(_suggest_file, 'w') as f:
                    f.write('\n'.join(labels) + '\n')
                with open(_suggest_detail, 'w') as f:
                    json.dump(data, f)
            except (json.JSONDecodeError, ValueError):
                with open(_suggest_file, 'w') as f:
                    f.write(content)
        except Exception:
            pass

    _suggest_thread = threading.Thread(target=_fetch, daemon=True)
    _suggest_thread.start()


def wait_for_suggestions(timeout: float = 10.0) -> None:
    if _suggest_thread and _suggest_thread.is_alive():
        _suggest_thread.join(timeout=timeout)


def get_suggestions() -> list[str]:
    """Read suggestion labels, filtering to valid commands."""
    if not _suggest_file or not os.path.isfile(_suggest_file):
        return []
    try:
        with open(_suggest_file) as f:
            lines = [l.strip() for l in f if l.strip()]
        os.unlink(_suggest_file)
    except Exception:
        return []

    valid = []
    for line in lines:
        m = re.search(r'ruflo\s+\S+(\s+\S+)*', line)
        if m:
            parts = m.group().split()
            cmd = parts[1] if len(parts) > 1 else ''
            sub = parts[2] if len(parts) > 2 else ''
            if cmd in SUBCMDS:
                if not sub or sub in SUBCMDS[cmd].split():
                    valid.append(line)
    return valid


def get_detail(cmd_str: str) -> str:
    """Get detail text for a suggestion command."""
    if not _suggest_detail or not os.path.isfile(_suggest_detail):
        return ''
    try:
        with open(_suggest_detail) as f:
            data = json.load(f)
        for s in data:
            if s.get('cmd', '').strip() == cmd_str:
                return s.get('detail', '')
    except Exception:
        pass
    return ''


def workflow_hints(cmd: str, sub: str) -> list[str]:
    """Deterministic workflow hints based on last command + output patterns."""
    out = last_output
    hints: list[str] = []

    new_task = re.search(r'task-[\w-]+', out)
    new_agent = re.search(r'agent-[\w-]+', out)
    idle_agent = None
    if re.search(r'idle', out, re.I):
        m = re.search(r'(rfl-[\w-]+|agent-[\w-]+)', out)
        if m:
            idle_agent = m.group(1)

    key = f'{cmd}:{sub}'
    tid = new_task.group() if new_task else None
    aid = new_agent.group() if new_agent else None

    if key == 'task:create' and tid:
        if idle_agent:
            hints.append(f'• ruflo task assign --task {tid} --agent {idle_agent} — assign to idle agent')
        else:
            hints.append(f'• ruflo task assign --task {tid} — assign to an available agent')
        hints.append(f'• ruflo task status --task {tid} — check task details')
    elif key == 'agent:spawn' and aid:
        hints.append('• ruflo task create — create work for the new agent')
    elif key == 'swarm:init':
        hints.append('• ruflo agent spawn — add agents to the swarm')
    elif re.search(r'not found|failed|error', out, re.I):
        hints.append('• ruflo doctor — diagnose system issues')

    return hints
