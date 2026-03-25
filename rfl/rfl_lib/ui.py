"""UI helpers — gum/fzf subprocess wrappers, spinner, colorize."""
from __future__ import annotations
import os, sys, subprocess, time, re, math

R = '\x1b[0m'; B = '\x1b[1m'
GR = '\x1b[92m'; YL = '\x1b[93m'; RD = '\x1b[91m'
OR = '\x1b[33m'; GY = '\x1b[90m'; CY = '\x1b[96m'

_STATUS_COLORS = {
    'active': GR, 'running': GR, 'available': GR, 'loaded': GR,
    'enabled': GR, 'ready': GR, 'healthy': GR, 'configured': GR,
    'initialized': GR, 'connected': GR, 'installed': GR, 'online': GR,
    'verified': GR, 'valid': GR, 'passed': GR, 'success': GR,
    'open': GR, 'started': GR, 'synced': GR, 'optimized': GR,
    'in_progress': GR,
    'idle': YL, 'waiting': YL, 'paused': YL, 'suspended': YL,
    'degraded': YL, 'partial': YL, 'stale': YL,
    'pending': OR, 'standby': OR, 'queued': OR,
    'retrying': OR, 'migrating': OR, 'upgrading': OR,
    'completed': GY, 'done': GY, 'skipped': GY, 'closed': GY,
    'archived': GY, 'deprecated': GY,
    'failed': RD, 'error': RD, 'unknown': RD, 'stopped': RD,
    'disabled': RD, 'critical': RD, 'disconnected': RD, 'offline': RD,
    'invalid': RD, 'rejected': RD, 'denied': RD, 'expired': RD,
    'broken': RD, 'timeout': RD, 'crashed': RD, 'missing': RD,
}

_RE_NOT_STATES = re.compile(
    r'\bnot (loaded|running|available|configured|initialized|installed|connected)\b', re.I)
_RE_GREEN = re.compile(
    r'(?<!not )\b(active|running|available|loaded|enabled|ready|healthy|configured|initialized|connected|installed|online|verified|valid|passed|success|open|started|synced|optimized)\b', re.I)
_RE_YELLOW = re.compile(r'\b(idle|standby|waiting|paused|suspended|degraded|partial|stale)\b', re.I)
_RE_ORANGE = re.compile(r'\b(pending|queued|retrying|migrating|upgrading)\b', re.I)
_RE_GREY = re.compile(r'\b(completed|done|skipped|closed|archived|deprecated)\b', re.I)
_RE_RED = re.compile(
    r'\b(failed|error|unknown|stopped|disabled|critical|disconnected|offline|invalid|rejected|denied|expired|broken|timeout|crashed|missing)\b', re.I)


def colorize_line(line: str) -> str:
    if re.search(r'[┏┗┣┳┻]', line):
        return line
    if '┃' not in line and not re.search(r'^[\s─━]{3,}$', line):
        pass  # apply colorize to all non-border lines
    line = _RE_NOT_STATES.sub(lambda m: YL + m.group(0) + R, line)
    line = _RE_GREEN.sub(lambda m: GR + m.group(0) + R, line)
    line = _RE_YELLOW.sub(lambda m: YL + m.group(0) + R, line)
    line = _RE_ORANGE.sub(lambda m: OR + m.group(0) + R, line)
    line = _RE_GREY.sub(lambda m: GY + m.group(0) + R, line)
    line = _RE_RED.sub(lambda m: RD + m.group(0) + R, line)
    line = line.replace('[OK]', f'{GR}[OK]{R}').replace('[INFO]', f'{CY}[INFO]{R}')
    line = line.replace('[WARN]', f'{OR}[WARN]{R}').replace('[ERROR]', f'{RD}[ERROR]{R}')
    line = line.replace('✓', f'{GR}✓{R}').replace('Queen:', f'{OR}Queen:{R}')
    return line


def _run(args: list[str], input_data: str | None = None) -> str | None:
    try:
        r = subprocess.run(args, input=input_data, capture_output=True, text=True, timeout=30)
        return r.stdout.strip() if r.returncode == 0 else None
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None


def gum_choose(header: str, *items: str, no_limit: bool = False) -> str | list[str] | None:
    args = ['gum', 'choose']
    if header:
        args += [f'--header={header}', '--header.foreground=7']
    if no_limit:
        args.append('--no-limit')
    args += ['--'] + list(items)
    result = _run(args)
    if result is None:
        return [] if no_limit else None
    return result.split('\n') if no_limit else result


def gum_input(header: str, placeholder: str = '', width: int = 50, value: str = '') -> str | None:
    args = ['gum', 'input', f'--placeholder={placeholder}',
            f'--header={header}', '--header.foreground=245', f'--width={width}']
    if value:
        args.append(f'--value={value}')
    return _run(args)


def gum_write(header: str, placeholder: str = '', width: int = 60, height: int = 4) -> str | None:
    args = ['gum', 'write', f'--placeholder={placeholder}',
            f'--header={header}', '--header.foreground', '245',
            f'--width={width}', f'--height={height}']
    return _run(args)


def gum_confirm(prompt: str) -> bool:
    try:
        r = subprocess.run(['gum', 'confirm', prompt, '--affirmative=Yes', '--negative=No'])
        return r.returncode == 0
    except FileNotFoundError:
        return False


def gum_file(path: str = '.') -> str | None:
    return _run(['gum', 'file', path])


def gum_filter(header: str, *items: str) -> str | None:
    args = ['gum', 'filter', f'--header={header}', '--header.foreground=245',
            '--indicator=>', '--placeholder=type to filter...', '--height=12',
            '--'] + list(items)
    return _run(args)


def pick(header: str, placeholder: str, items: list[str]) -> str | None:
    if items:
        return gum_filter(header, *items)
    return gum_input(header, placeholder, width=60)


def fzf(items: list[str], **kwargs) -> tuple[str, str, int]:
    """Run fzf. Returns (query, selected, return_code)."""
    args = ['fzf', '--print-query']
    for k, v in kwargs.items():
        flag = k.replace('_', '-')
        if isinstance(v, bool):
            if v: args.append(f'--{flag}')
        else:
            args.append(f'--{flag}={v}')
    r = subprocess.run(args, input='\n'.join(items), capture_output=True, text=True)
    lines = r.stdout.strip().split('\n')
    query = lines[0] if lines else ''
    selected = lines[1] if len(lines) > 1 else ''
    return query, selected, r.returncode


# Rainbow wave spinner — simplified Python port of _rfl_spin
_WAVE_COLORS = [
    '\x1b[38;5;198m', '\x1b[38;5;171m', '\x1b[38;5;141m', '\x1b[38;5;105m',
    '\x1b[38;5;69m',  '\x1b[38;5;39m',  '\x1b[38;5;51m',  '\x1b[38;5;49m',
    '\x1b[38;5;48m',  '\x1b[38;5;84m',  '\x1b[38;5;226m', '\x1b[38;5;208m',
]


def spin(title: str, args: list[str], timeout_s: int = 15) -> tuple[str, int]:
    """Run command with rainbow spinner. Returns (stdout, return_code)."""
    tty = None
    try:
        tty = open('/dev/tty', 'w')
    except OSError:
        pass

    proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    bw = 16
    wlen = len(_WAVE_COLORS)
    nc = R
    tx = '\x1b[38;5;245m'
    ok_c = '\x1b[38;5;48m'
    i = 0
    start = time.time()

    if tty:
        tty.write('\x1b[?25l')
        tty.flush()

    while proc.poll() is None:
        if time.time() - start > timeout_s:
            proc.kill()
            proc.wait()
            if tty:
                rd = '\x1b[38;5;196m'
                tty.write(f'\r  {rd}{"━" * bw}{nc}  {rd}✗{nc} {tx}{title} (timeout){nc} ')
                time.sleep(0.5)
                tty.write(f'\r\x1b[K\x1b[?25h')
                tty.flush()
                tty.close()
            return '', 124

        if tty:
            bar = ''
            for j in range(bw):
                phase = (j * 5 + i * 3) % 64
                si = abs(math.sin(phase * math.pi / 32))
                ci = int(si * (wlen - 1)) % wlen
                bar += _WAVE_COLORS[ci] + '━'
            tty.write(f'\r  {bar}{nc}  {tx}{title}{nc} ')
            tty.flush()
        i += 1
        time.sleep(0.06)

    stdout = proc.stdout.read() if proc.stdout else ''
    rc = proc.returncode

    if tty:
        if rc == 0:
            tty.write(f'\r  {ok_c}{"━" * bw}{nc}  {ok_c}✓{nc} {tx}{title}{nc} ')
            time.sleep(0.3)
        tty.write(f'\r\x1b[K\x1b[?25h')
        tty.flush()
        tty.close()

    return stdout, rc
