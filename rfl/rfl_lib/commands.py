"""Command tree data tables — mirrors commands.zsh."""

SUBCMDS: dict[str, str] = {
    # Primary
    'init':        'wizard check skills hooks upgrade',
    'start':       'stop restart quick',
    'status':      'agents tasks memory',
    'agent':       'spawn list status stop metrics pool health logs',
    'swarm':       'init start status stop scale coordinate',
    'memory':      'init store retrieve search list delete stats configure cleanup compress export import',
    'task':        'create list status cancel assign retry complete',
    'session':     'list save restore delete export import current',
    'mcp':         'start stop status health restart tools toggle exec logs',
    'hooks':       'pre-edit post-edit pre-command post-command pre-task post-task session-end session-restore route explain pretrain build-agents metrics transfer list intelligence notify worker progress statusline coverage-route coverage-suggest coverage-gaps token-optimize model-route',
    # Advanced
    'neural':      'train status patterns predict optimize benchmark list export import',
    'security':    'scan cve threats audit secrets defend',
    'performance': 'benchmark profile metrics optimize bottleneck',
    'embeddings':  'init generate search compare collections index providers chunk normalize hyperbolic neural models cache warmup benchmark',
    'hive-mind':   'init spawn status task join leave consensus broadcast memory optimize-memory shutdown',
    'ruvector':    'init setup import migrate status benchmark optimize backup',
    'guidance':    'compile retrieve gates status optimize ab-test',
    # Utility
    'config':      'init get set providers reset export import',
    'doctor':      'run --fix --install',
    'daemon':      'start stop status trigger enable',
    'completions': 'bash zsh fish powershell',
    'migrate':     'status run verify rollback breaking',
    'workflow':    'run validate list status stop template',
    # Analysis
    'analyze':     'diff code deps ast complexity symbols imports boundaries modules dependencies circular',
    'route':       'task list-agents stats feedback reset export import coverage',
    'progress':    'check sync summary watch',
    # Management
    'providers':   'list configure test models usage',
    'plugins':     'list search install uninstall upgrade toggle info create rate',
    'deployment':  'deploy status rollback history environments logs',
    'claims':      'list check grant revoke roles policies',
    'issues':      'list claim release handoff status stealable steal load rebalance board',
    'update':      'check all history rollback clear-cache',
    'process':     'daemon monitor workers signals logs',
    'appliance':   'build inspect verify extract run sign publish update',
}

CATEGORIES: dict[str, str] = {
    'Primary':    'init start status agent swarm memory task session mcp hooks',
    'Advanced':   'neural security performance embeddings hive-mind ruvector guidance',
    'Utility':    'config doctor daemon completions migrate workflow',
    'Analysis':   'analyze route progress',
    'Management': 'providers plugins deployment claims issues update process appliance',
}

CMD_OPTIONS: dict[str, str] = {
    'init':   '--force --minimal --full --skip-claude --only-claude --start-all --start-daemon --with-embeddings --codex --dual',
    'start':  '--daemon --skip-mcp --topology=mesh --topology=hierarchical',
    'status': '--watch --health-check',
    'doctor': '-c version -c node -c npm -c config -c daemon -c memory -c api -c git -c mcp -c claude',
}

DEFAULT_AGENT_TYPES = [
    'coder', 'researcher', 'tester', 'reviewer', 'architect', 'coordinator',
    'analyst', 'optimizer', 'security-architect', 'security-auditor',
    'memory-specialist', 'swarm-specialist', 'performance-engineer',
    'core-architect', 'test-architect',
]
