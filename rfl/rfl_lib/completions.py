"""Live data fetchers — completion helpers for interactive menus."""
from __future__ import annotations
import json, subprocess


def _mcp_exec(tool_name: str) -> dict:
    try:
        r = subprocess.run(
            ['ruflo', 'mcp', 'exec', '--tool', tool_name, '-p', '{}'],
            capture_output=True, text=True, timeout=10)
        raw = r.stdout.strip()
        # Output format: "Result:\n{json}"
        if 'Result:' in raw:
            raw = raw[raw.index('Result:') + 7:].strip()
        if not raw:
            return {}
        return json.loads(raw)
    except Exception:
        return {}


def _table_col(cmd_args: list[str], col: int = 1) -> list[str]:
    """Parse ruflo table output, extract column values."""
    try:
        r = subprocess.run(cmd_args, capture_output=True, text=True, timeout=10)
        items = []
        for line in r.stdout.split('\n'):
            if any(c in line for c in '┣┗┏'):
                continue
            if '┃' in line:
                parts = [p.strip() for p in line.split('┃')]
                # parts[0] is empty (before first ┃), parts[-1] is empty (after last ┃)
                real = [p for p in parts if p]
                if col <= len(real):
                    val = real[col - 1]
                    # Skip header-like values
                    if val and val not in ('ID', 'Type', 'Status', 'Name', 'Key', 'Tool',
                                           'Created', 'Last', 'Count', 'Priority', 'Description'):
                        items.append(val)
        return items
    except Exception:
        return []


def agents() -> list[str]:
    data = _mcp_exec('agent_list')
    return [
        f"{a.get('agentId', a.get('id', '?'))}  ({a.get('agentType', '?')} / {a.get('status', '?')})"
        for a in data.get('agents', [])
    ]


def tasks() -> list[str]:
    data = _mcp_exec('task_list')
    return [
        f"{t.get('taskId', t.get('id', '?'))}  ({t.get('status', '?')})"
        for t in data.get('tasks', [])
    ]


def sessions() -> list[str]:
    data = _mcp_exec('session_list')
    return [
        f"{s.get('sessionId', s.get('id', '?'))}  ({s.get('name', '')})"
        for s in data.get('sessions', [])
    ]


def memory_keys() -> list[str]:
    return _table_col(['ruflo', 'memory', 'list'], 1)


def agent_types() -> list[str]:
    try:
        r = subprocess.run(
            ['ruflo', 'agent', 'spawn', '-t', '__invalid__'],
            capture_output=True, text=True, timeout=10)
        out = r.stdout + r.stderr
        import re
        m = re.search(r'Must be one of: (.+)', out)
        if m:
            return [t.strip() for t in m.group(1).replace(',', ' ').split() if t.strip()]
    except Exception:
        pass
    return []


def mcp_tools() -> list[str]:
    try:
        r = subprocess.run(['ruflo', 'mcp', 'tools'], capture_output=True, text=True, timeout=10)
        return [line.split()[0] for line in r.stdout.split('\n')
                if line.startswith('  ') and line.strip()]
    except Exception:
        return []


def mcp_servers() -> list[str]:
    return _table_col(['ruflo', 'mcp', 'status'], 1)


def plugins() -> list[str]:
    return _table_col(['ruflo', 'plugins', 'list'], 1)


def config_keys() -> list[str]:
    return _table_col(['ruflo', 'config', 'get'], 1)


def hooks() -> list[str]:
    return _table_col(['ruflo', 'hooks', 'list'], 1)


def workflows() -> list[str]:
    data = _mcp_exec('workflow_list')
    wfs = data.get('workflows', data.get('items', []))
    if wfs:
        return [
            f"{w.get('workflowId', w.get('id', '?'))}  ({'/'.join(filter(None, [w.get('name', ''), w.get('status', '')]))})"
            for w in wfs
        ]
    return _table_col(['ruflo', 'workflow', 'list'], 1)


def deploy_envs() -> list[str]:
    return _table_col(['ruflo', 'deployment', 'environments'], 1)


def deploy_ids() -> list[str]:
    return _table_col(['ruflo', 'deployment', 'history'], 1)


def providers() -> list[str]:
    return _table_col(['ruflo', 'providers', 'list'], 1)


def collections() -> list[str]:
    return _table_col(['ruflo', 'embeddings', 'collections'], 1)
