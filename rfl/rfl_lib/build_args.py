"""Interactive argument builder — gum/fzf prompts per command:subcommand."""
from __future__ import annotations

from rfl_lib import ui, completions  # pyright: ignore[reportMissingImports]
from rfl_lib.commands import DEFAULT_AGENT_TYPES  # pyright: ignore[reportMissingImports]

_SP = '__RFL_SP__'


def _encode(s: str) -> str:
    return s.replace(' ', _SP) if s else s


def build_args(cmd: str, sub: str) -> str | None:
    """Prompt for args interactively. Returns args string or None on cancel."""
    key = f'{cmd}:{sub}'

    # ── agent ──
    if key == 'agent:spawn':
        types = completions.agent_types() or DEFAULT_AGENT_TYPES
        atype = ui.pick('Agent type (-t)', 'coder', types)
        if not atype: return None
        args = f'-t {atype}'
        name = ui.gum_input('Agent name', 'agent name (optional)', width=40)
        if name: args += f' --name {name}'
        return args
    if key in ('agent:status', 'agent:stop', 'agent:metrics', 'agent:logs'):
        agents = completions.agents()
        raw = ui.pick('Select agent', 'agent-001', agents)
        if not raw: return None
        return raw.split('  ')[0]
    if key == 'agent:pool':
        action = ui.gum_choose('Pool action', 'scale', 'status', 'drain')
        if not action: return None
        if action == 'scale':
            n = ui.gum_input('Scale to', 'number of agents', width=20)
            return f'{action} {n}' if n else action
        return action

    # ── task ──
    if key == 'task:create':
        ttype = ui.gum_choose('Task type', 'implementation', 'testing', 'review',
                              'research', 'debugging', 'documentation', 'optimization')
        if not ttype: return None
        desc = ui.gum_write('Description (-d)', 'task description')
        if not desc: return None
        return f'-t {ttype} -d {_encode(desc)}'
    if key in ('task:status', 'task:cancel', 'task:retry', 'task:complete'):
        tasks = completions.tasks()
        raw = ui.pick('Select task', 'task-123', tasks)
        if not raw: return None
        return raw.split('  ')[0]
    if key == 'task:assign':
        tasks = completions.tasks()
        raw = ui.pick('Select task', 'task-123', tasks)
        if not raw: return None
        tid = raw.split('  ')[0]
        agents = completions.agents()
        raw2 = ui.pick('Assign to agent', 'agent-001', agents)
        if not raw2: return None
        return f'{tid} --agent {raw2.split("  ")[0]}'
    if key == 'task:list':
        f = ui.gum_choose('Filter', 'all', 'pending', 'running', 'completed', 'failed')
        if f == 'all': return '--all'
        return f'--status {f}' if f else ''

    # ── memory ──
    if key == 'memory:store':
        k = ui.gum_input('Key (-k)', 'key name', width=40)
        if not k: return None
        v = ui.gum_write('Value (-v)', 'value')
        if not v: return None
        return f'-k {_encode(k)} -v {_encode(v)}'
    if key in ('memory:retrieve', 'memory:delete'):
        keys = completions.memory_keys()
        k = ui.pick('Select key', 'key name', keys)
        if not k: return None
        return f'-k {_encode(k)}'
    if key == 'memory:search':
        q = ui.gum_input('Search (-q)', 'search query', width=60)
        if not q: return None
        return f'-q {_encode(q)}'
    if key == 'memory:configure':
        setting = ui.gum_choose('Memory setting', 'backend', 'max-size', 'ttl', 'compression', 'encryption')
        if not setting: return None
        val = ui.gum_input(f'Value for {setting}', 'new value', width=40)
        if not val: return None
        return f'{setting} {val}'
    if key in ('memory:export', 'memory:import'):
        path = ui.gum_file('.')
        return path or ''
    if key == 'memory:cleanup':
        if not ui.gum_confirm('Run memory cleanup?'): return None
        opts = ui.gum_choose('Cleanup options', '--force', '--dry-run', '--older-than 30d', no_limit=True)
        return ' '.join(opts) if isinstance(opts, list) else ''

    # ── session ──
    if key in ('session:restore', 'session:delete', 'session:export'):
        sessions = completions.sessions()
        raw = ui.pick('Select session', 'session-id', sessions)
        if not raw: return None
        return raw.split('  ')[0]
    if key == 'session:save':
        name = ui.gum_input('Session name', 'session name (optional)', width=40)
        return f'--name {name}' if name else ''
    if key == 'session:import':
        path = ui.gum_file('.')
        return path or ''

    # ── swarm ──
    if key == 'swarm:init':
        topo = ui.gum_choose('Topology', 'hierarchical-mesh', 'mesh', 'hierarchical', 'hybrid')
        return f'--topology {topo}' if topo else ''
    if key == 'swarm:start':
        obj = ui.gum_input('Objective', 'swarm objective (what should agents do?)', width=70)
        if not obj: return None
        types = completions.agent_types() or DEFAULT_AGENT_TYPES
        selected = ui.gum_choose('Select agent types (space to toggle)', *types, no_limit=True)
        if not selected or (isinstance(selected, list) and not selected): return None
        types_csv = ','.join(selected) if isinstance(selected, list) else selected
        return f'--objective {_encode(obj)} --types {types_csv}'
    if key == 'swarm:scale':
        n = ui.gum_input('Scale to', 'number of agents', width=20)
        return n or ''
    if key == 'swarm:coordinate':
        strategy = ui.gum_choose('Coordination strategy', 'round-robin', 'load-balanced', 'priority', 'consensus')
        return f'--strategy {strategy}' if strategy else ''

    # ── start ──
    if key.startswith('start:'):
        opts = ui.gum_choose('Options (space to toggle)',
                             '--daemon', '--skip-mcp', '--topology hierarchical-mesh',
                             '--topology mesh', '--topology hierarchical', no_limit=True)
        return ' '.join(opts) if isinstance(opts, list) else ''

    # ── neural ──
    if key in ('neural:status', 'neural:list'):
        return ''
    if key == 'neural:patterns':
        f = ui.gum_input('Filter patterns', 'pattern filter (optional)', width=50)
        return _encode(f) if f else ''
    if key == 'neural:train':
        mtype = ui.gum_choose('Model type', 'transformer', 'moe', 'classifier', 'embedding')
        args = f'--type {mtype}' if mtype else ''
        epochs = ui.gum_input('Epochs', '10', width=30, value='10')
        if epochs: args += f' --epochs {epochs}'
        batch = ui.gum_input('Batch size', '32', width=30, value='32')
        if batch: args += f' --batch-size {batch}'
        lr = ui.gum_input('Learning rate', '0.001', width=30, value='0.001')
        if lr: args += f' --learning-rate {lr}'
        return args
    if key == 'neural:predict':
        inp = ui.gum_input('Prediction input', 'input data or pattern', width=60)
        return _encode(inp) if inp else ''
    if key == 'neural:optimize':
        opts = ui.gum_choose('Optimization targets', 'latency', 'throughput', 'memory', 'accuracy', no_limit=True)
        return f'--target {",".join(opts)}' if isinstance(opts, list) and opts else ''
    if key == 'neural:benchmark':
        opts = ui.gum_choose('Benchmark options', '--iterations 10', '--warmup 3', '--verbose', no_limit=True)
        return ' '.join(opts) if isinstance(opts, list) else ''
    if key == 'neural:export':
        model = ui.gum_input('Export model', 'model name or ID', width=50)
        return model or ''
    if key == 'neural:import':
        cid = ui.gum_input('Import from', 'IPFS CID or model path', width=50)
        return cid or ''

    # ── workflow ──
    if key == 'workflow:run':
        templates = completions._table_col(['ruflo', 'workflow', 'template'], 1)
        wf = ui.pick('Workflow to run', 'workflow-name', templates)
        return wf.split('  ')[0] if wf else ''
    if key in ('workflow:status', 'workflow:stop'):
        wfs = completions.workflows()
        raw = ui.pick('Select workflow', 'no workflows found', wfs)
        if not raw: return None
        return raw.split('  ')[0]
    if key == 'workflow:validate':
        return ui.gum_file('.') or ''

    # ── hive-mind ──
    if key == 'hive-mind:spawn':
        types = completions.agent_types() or DEFAULT_AGENT_TYPES[:7]
        atype = ui.pick('Agent type', 'coder', types)
        if not atype: return None
        return f'--type {atype}'
    if key == 'hive-mind:task':
        desc = ui.gum_write('Hive task', 'task description')
        if not desc: return None
        return _encode(desc)
    if key in ('hive-mind:join', 'hive-mind:leave'):
        agents = completions.agents()
        if not agents: return None
        selected = ui.gum_choose('Select agents (space to toggle)', *agents, no_limit=True)
        if not selected or (isinstance(selected, list) and not selected): return None
        ids = [s.split('  ')[0].split(' (')[0].strip() for s in (selected if isinstance(selected, list) else [selected])]
        return ','.join(ids)
    if key == 'hive-mind:broadcast':
        msg = ui.gum_write('Message', 'broadcast message')
        if not msg: return None
        return _encode(msg)
    if key == 'hive-mind:consensus':
        topic = ui.gum_input('Topic', 'consensus topic', width=50)
        if not topic: return None
        return _encode(topic)

    # ── Extended args (config, mcp, doctor, etc.) ──
    return _build_args_ext(cmd, sub)


def _build_args_ext(cmd: str, sub: str) -> str | None:
    key = f'{cmd}:{sub}'

    # ── init ──
    if key in ('init:wizard', 'init:check', 'init:skills', 'init:upgrade', 'init:hooks'):
        opts = ui.gum_choose('Options (space to toggle)',
                             '--force', '--minimal', '--full', '--skip-claude',
                             '--start-all', '--start-daemon', '--with-embeddings', no_limit=True)
        return ' '.join(opts) if isinstance(opts, list) else ''

    # ── mcp ──
    if key == 'mcp:exec':
        tools = completions.mcp_tools()
        t = ui.pick('MCP tool to exec', 'tool-name', tools)
        if not t: return None
        return t
    if key in ('mcp:toggle', 'mcp:restart', 'mcp:stop', 'mcp:start'):
        servers = completions.mcp_servers()
        s = ui.pick('MCP server', 'server-name', servers)
        return s or ''
    if key == 'mcp:tools':
        tools = completions.mcp_tools()
        t = ui.pick('MCP tool (optional filter)', 'tool-name', tools)
        return t or ''

    # ── config ──
    if key == 'config:get':
        keys = completions.config_keys()
        k = ui.pick('Config key', 'swarm.topology', keys)
        if not k: return None
        return k
    if key == 'config:set':
        keys = completions.config_keys()
        k = ui.pick('Config key', 'swarm.topology', keys)
        if not k: return None
        val = ui.gum_input(f'Value for {k}', 'new value', width=40)
        if not val: return None
        return f'{k} {val}'
    if key == 'config:providers':
        provs = completions.providers()
        p = ui.pick('Select provider', 'anthropic', provs)
        return p.split('  ')[0] if p else ''
    if key in ('config:export', 'config:import'):
        return ui.gum_file('.') or ''

    # ── doctor ──
    if key == 'doctor:run':
        check = ui.gum_choose('Check category', 'all', 'version', 'node', 'npm',
                               'config', 'daemon', 'memory', 'api', 'git', 'mcp', 'claude')
        if check and check != 'all': return f'-c {check}'
        return ''

    # ── ruvector ──
    if key.startswith('ruvector:'):
        db = ui.gum_input('Database (--database)', 'database name (required)', width=40)
        if not db: return None
        args = f'--database {db}'
        if sub == 'init':
            driver = ui.gum_choose('Database driver', 'postgresql', 'sqlite', 'mysql')
            if not driver: return None
            args += f' --driver {driver}'
        return args

    # ── embeddings ──
    if key in ('embeddings:generate', 'embeddings:search'):
        text = ui.gum_input('Input text', 'text or query', width=60)
        return _encode(text) if text else ''
    if key == 'embeddings:compare':
        t1 = ui.gum_input('Text A', 'first text', width=60)
        if not t1: return None
        t2 = ui.gum_input('Text B', 'second text', width=60)
        if not t2: return None
        return f'{_encode(t1)} {_encode(t2)}'
    if key == 'embeddings:collections':
        cols = completions.collections()
        c = ui.pick('Collection', 'collection-name', cols)
        return c or ''
    if key in ('embeddings:index', 'embeddings:chunk'):
        return ui.gum_input('Target', 'file or directory', width=50) or ''
    if key == 'embeddings:providers':
        return ui.gum_choose('Action', 'list', 'add', 'remove', 'test') or ''

    # ── performance ──
    if key == 'performance:metrics':
        opts = ui.gum_choose('Metrics options', '--format json', '--format table',
                              '--period 1h', '--period 24h', '--period 7d', no_limit=True)
        return ' '.join(opts) if isinstance(opts, list) else ''
    if key == 'performance:benchmark':
        opts = ui.gum_choose('Benchmark options', '--iterations 10', '--warmup 3',
                              '--format json', '--format table', no_limit=True)
        return ' '.join(opts) if isinstance(opts, list) else ''
    if key == 'performance:profile':
        return ui.gum_input('Profile target', 'file or directory to profile', width=50) or ''
    if key == 'performance:optimize':
        targets = ui.gum_choose('Optimization targets', 'memory', 'cpu', 'io', 'network', 'all', no_limit=True)
        return f'--target {",".join(targets)}' if isinstance(targets, list) and targets else ''
    if key == 'performance:bottleneck':
        return ui.gum_input('Bottleneck target', 'component or path (default: all)', width=50) or ''

    # ── security ──
    if key in ('security:scan', 'security:audit'):
        return ui.gum_input('Scan target', 'path or target (default: .)', width=50) or ''
    if key == 'security:cve':
        return ui.gum_input('CVE lookup', 'CVE ID or search query', width=50) or ''
    if key == 'security:threats':
        scope = ui.gum_choose('Threat scope', 'all', 'critical', 'high', 'medium', 'low')
        if scope and scope != 'all': return f'--severity {scope}'
        return ''
    if key == 'security:secrets':
        return ui.gum_input('Scan path', 'path to scan (default: .)', width=50) or ''

    # ── analyze ──
    if key == 'analyze:diff':
        return ui.gum_input('Diff target', 'commit range or file', width=50) or ''
    if key in ('analyze:code', 'analyze:complexity', 'analyze:deps', 'analyze:imports', 'analyze:circular'):
        return ui.gum_input('Target path', 'file or directory (default: .)', width=50) or ''
    if key in ('analyze:ast', 'analyze:symbols'):
        return ui.gum_input('Target file', 'file path', width=50) or ''
    if key in ('analyze:boundaries', 'analyze:modules', 'analyze:dependencies'):
        return ui.gum_input('Target directory', 'directory (default: .)', width=50) or ''

    # ── deployment ──
    if key in ('deployment:deploy', 'deployment:status', 'deployment:logs'):
        envs = completions.deploy_envs() or ['development', 'staging', 'production']
        env = ui.pick('Environment', 'production', envs)
        return f'--env {env}' if env else ''
    if key == 'deployment:rollback':
        deploys = completions.deploy_ids()
        d = ui.pick('Rollback deployment', 'dep-123', deploys)
        return d or ''
    if key == 'deployment:history':
        envs = completions.deploy_envs() or ['development', 'staging', 'production']
        env = ui.pick('Environment', 'all', envs)
        if env and env != 'all': return f'--env {env}'
        return ''

    # ── plugins ──
    if key in ('plugins:uninstall', 'plugins:upgrade', 'plugins:info', 'plugins:toggle', 'plugins:rate'):
        plist = completions.plugins()
        p = ui.pick('Select plugin', 'plugin-name', plist)
        if not p: return None
        return p.split('  ')[0]
    if key in ('plugins:install', 'plugins:search'):
        return ui.gum_input('Plugin', 'plugin name, URL, or search query', width=50) or None
    if key == 'plugins:create':
        return ui.gum_input('Plugin name', 'plugin name', width=40) or None

    # ── providers ──
    if key in ('providers:configure', 'providers:test', 'providers:models', 'providers:usage'):
        provs = completions.providers()
        p = ui.pick('Select provider', 'anthropic', provs)
        return p.split('  ')[0] if p else ''

    # ── hooks ──
    if key in ('hooks:route', 'hooks:explain', 'hooks:pretrain', 'hooks:intelligence',
               'hooks:pre-edit', 'hooks:post-edit', 'hooks:pre-command', 'hooks:post-command',
               'hooks:pre-task', 'hooks:post-task'):
        hks = completions.hooks()
        h = ui.pick('Select hook', 'hook-name', hks)
        return h or ''
    if key == 'hooks:notify':
        msg = ui.gum_input('Message', 'notification message', width=60)
        if not msg: return None
        return _encode(msg)
    if key == 'hooks:model-route':
        return ui.gum_choose('Route to model', 'opus', 'sonnet', 'haiku', 'auto') or ''
    if key == 'hooks:token-optimize':
        opts = ui.gum_choose('Optimization', '--aggressive', '--conservative', '--analyze-only', no_limit=True)
        return ' '.join(opts) if isinstance(opts, list) else ''
    if key in ('hooks:coverage-route', 'hooks:coverage-suggest', 'hooks:coverage-gaps'):
        return ui.gum_input('Coverage target', 'file or directory', width=50) or ''

    # ── daemon ──
    if key == 'daemon:trigger':
        return ui.gum_input('Trigger event', 'event name', width=40) or ''
    if key == 'daemon:enable':
        return ui.gum_choose('Service', 'mcp', 'hooks', 'neural', 'embeddings', 'hive-mind', 'all') or ''

    # ── guidance ──
    if key in ('guidance:compile', 'guidance:retrieve'):
        q = ui.gum_input('Input', 'guidance query or path', width=50)
        return _encode(q) if q else ''
    if key == 'guidance:gates':
        return ui.gum_input('Gate', 'gate name', width=40) or ''
    if key == 'guidance:ab-test':
        return ui.gum_input('Test name', 'A/B test name', width=40) or ''

    # ── Default: no args needed ──
    return ''
