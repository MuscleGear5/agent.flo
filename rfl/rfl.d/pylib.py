# rfl.d/pylib.py — shared Python helpers for rfl handlers
# Loaded into $_RFL_PYLIB and injected via ${_RFL_PYLIB} in python3 -c "..."
import sys, json, re

R = '\x1b[0m'; B = '\x1b[1m'
GR = '\x1b[92m'; YL = '\x1b[93m'; RD = '\x1b[91m'
OR = '\x1b[33m'; GY = '\x1b[90m'; CY = '\x1b[96m'

SC = {
    # Green: positive / active
    'active': GR, 'running': GR, 'available': GR, 'in_progress': GR,
    'loaded': GR, 'enabled': GR, 'ready': GR, 'healthy': GR,
    'configured': GR, 'initialized': GR, 'connected': GR, 'installed': GR,
    'online': GR, 'verified': GR, 'valid': GR, 'passed': GR,
    'success': GR, 'open': GR, 'started': GR, 'synced': GR, 'optimized': GR,
    # Yellow: idle / waiting
    'idle': YL, 'waiting': YL, 'paused': YL, 'suspended': YL,
    'degraded': YL, 'partial': YL, 'stale': YL, 'not': YL,
    # Orange: pending / queued
    'pending': OR, 'standby': OR, 'queued': OR,
    'retrying': OR, 'migrating': OR, 'upgrading': OR,
    # Grey: completed / done
    'completed': GY, 'done': GY, 'skipped': GY, 'closed': GY,
    'archived': GY, 'deprecated': GY,
    # Red: errors / stopped
    'failed': RD, 'error': RD, 'unknown': RD, 'stopped': RD,
    'disabled': RD, 'critical': RD, 'disconnected': RD, 'offline': RD,
    'invalid': RD, 'rejected': RD, 'denied': RD, 'expired': RD,
    'broken': RD, 'timeout': RD, 'crashed': RD, 'missing': RD,
}

ansi = re.compile(r'\x1b\[[^m]+m')

def vl(s):
    return len(ansi.sub('', str(s)))

def tbl(cols, rows):
    W = [len(c) for c in cols]
    for r in rows:
        for i, c in enumerate(r): W[i] = max(W[i], vl(str(c)))
    top = '┏' + '┳'.join('━' * (w + 2) for w in W) + '┓'
    hdr = '┃' + '┃'.join(' ' + B + c.ljust(W[i]) + R + ' ' for i, c in enumerate(cols)) + '┃'
    sep = '┣' + '╋'.join('━' * (w + 2) for w in W) + '┫'
    bot = '┗' + '┻'.join('━' * (w + 2) for w in W) + '┛'
    def rs(r): return '┃' + '┃'.join(' ' + str(c) + ' ' * (W[i] - vl(str(c))) + ' ' for i, c in enumerate(r)) + '┃'
    return '\n'.join([top, hdr, sep] + [rs(r) for r in rows] + [bot])

def sc(s):
    k = (s.lower().split() or [''])[0]
    return SC.get(k, '') + s + R if SC.get(k) else s

def pj(raw):
    try:
        i = raw.rindex('}'); n = 0
        for k in range(i, -1, -1):
            if raw[k] == '}': n += 1
            elif raw[k] == '{': n -= 1
            if n == 0: return json.loads(raw[k:i + 1])
    except:
        return {}
