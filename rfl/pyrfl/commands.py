"""Command tree data — Python port of rfl.d/commands.zsh."""

__all__ = ["COMMANDS", "CATEGORIES", "SUBCMDS", "CMD_DESCS"]

# ── Subcommands per top-level command ─────────────────────────────
SUBCMDS: dict[str, list[str]] = {
    # Primary
    "init":        ["wizard", "check", "skills", "hooks", "upgrade"],
    "start":       ["stop", "restart", "quick"],
    "status":      ["agents", "tasks", "memory"],
    "agent":       ["spawn", "list", "status", "stop", "metrics", "pool", "health", "logs"],
    "swarm":       ["init", "start", "status", "stop", "scale", "coordinate"],
    "memory":      ["init", "store", "retrieve", "search", "list", "delete", "stats",
                    "configure", "cleanup", "compress", "export", "import"],
    "task":        ["create", "list", "status", "cancel", "assign", "retry", "complete"],
    "session":     ["list", "save", "restore", "delete", "export", "import", "current"],
    "mcp":         ["start", "stop", "status", "health", "restart", "tools", "toggle", "exec", "logs"],
    "hooks":       ["pre-edit", "post-edit", "pre-command", "post-command", "pre-task",
                    "post-task", "session-end", "session-restore", "route", "explain",
                    "pretrain", "build-agents", "metrics", "transfer", "list",
                    "intelligence", "notify", "worker", "progress", "statusline",
                    "coverage-route", "coverage-suggest", "coverage-gaps",
                    "token-optimize", "model-route"],
    # Advanced
    "neural":      ["train", "status", "patterns", "predict", "optimize", "benchmark",
                    "list", "export", "import"],
    "security":    ["scan", "cve", "threats", "audit", "secrets", "defend"],
    "performance": ["benchmark", "profile", "metrics", "optimize", "bottleneck"],
    "embeddings":  ["init", "generate", "search", "compare", "collections", "index",
                    "providers", "chunk", "normalize", "hyperbolic", "neural", "models",
                    "cache", "warmup", "benchmark"],
    "hive-mind":   ["init", "spawn", "status", "task", "join", "leave", "consensus",
                    "broadcast", "memory", "optimize-memory", "shutdown"],
    "ruvector":    ["init", "setup", "import", "migrate", "status", "benchmark",
                    "optimize", "backup"],
    "guidance":    ["compile", "retrieve", "gates", "status", "optimize", "ab-test"],
    # Utility
    "config":      ["init", "get", "set", "providers", "reset", "export", "import"],
    "doctor":      ["run", "--fix", "--install"],
    "daemon":      ["start", "stop", "status", "trigger", "enable"],
    "completions": ["bash", "zsh", "fish", "powershell"],
    "migrate":     ["status", "run", "verify", "rollback", "breaking"],
    "workflow":    ["run", "validate", "list", "status", "stop", "template"],
    # Analysis
    "analyze":     ["diff", "code", "deps", "ast", "complexity", "symbols", "imports",
                    "boundaries", "modules", "dependencies", "circular"],
    "route":       ["task", "list-agents", "stats", "feedback", "reset", "export",
                    "import", "coverage"],
    "progress":    ["check", "sync", "summary", "watch"],
    # Management
    "providers":   ["list", "configure", "test", "models", "usage"],
    "plugins":     ["list", "search", "install", "uninstall", "upgrade", "toggle",
                    "info", "create", "rate"],
    "deployment":  ["deploy", "status", "rollback", "history", "environments", "logs"],
    "claims":      ["list", "check", "grant", "revoke", "roles", "policies"],
    "issues":      ["list", "claim", "release", "handoff", "status", "stealable",
                    "steal", "load", "rebalance", "board"],
    "update":      ["check", "all", "history", "rollback", "clear-cache"],
    "process":     ["daemon", "monitor", "workers", "signals", "logs"],
    "appliance":   ["build", "inspect", "verify", "extract", "run", "sign",
                    "publish", "update"],
}

# ── Category groupings ────────────────────────────────────────────
CATEGORIES: dict[str, dict] = {
    "Primary": {
        "desc": "Core agent, swarm, memory, task, and session management",
        "commands": [],
        "cmd_names": ["init", "start", "status", "agent", "swarm", "memory",
                      "task", "session", "mcp", "hooks"],
    },
    "Advanced": {
        "desc": "Neural, security, performance, embeddings, hive-mind",
        "commands": [],
        "cmd_names": ["neural", "security", "performance", "embeddings",
                      "hive-mind", "ruvector", "guidance"],
    },
    "Utility": {
        "desc": "Config, doctor, daemon, completions, migrations, workflows",
        "commands": [],
        "cmd_names": ["config", "doctor", "daemon", "completions", "migrate",
                      "workflow"],
    },
    "Analysis": {
        "desc": "Code analysis, routing, and progress tracking",
        "commands": [],
        "cmd_names": ["analyze", "route", "progress"],
    },
    "Management": {
        "desc": "Providers, plugins, deployment, claims, issues, updates",
        "commands": [],
        "cmd_names": ["providers", "plugins", "deployment", "claims", "issues",
                      "update", "process", "appliance"],
    },
}

# ── Short descriptions for each cmd:sub pair ──────────────────────
CMD_DESCS: dict[str, str] = {
    # agent
    "agent:spawn":       "Create a new agent",
    "agent:list":        "List all agents",
    "agent:status":      "Show agent status",
    "agent:stop":        "Stop an agent",
    "agent:metrics":     "Agent performance metrics",
    "agent:pool":        "Agent pool management",
    "agent:health":      "Agent health check",
    "agent:logs":        "View agent logs",
    # swarm
    "swarm:init":        "Initialize swarm",
    "swarm:start":       "Start a swarm",
    "swarm:status":      "Swarm status",
    "swarm:stop":        "Stop the swarm",
    "swarm:scale":       "Scale swarm agents",
    "swarm:coordinate":  "Coordination strategy",
    # memory
    "memory:init":       "Initialize memory backend",
    "memory:store":      "Store a key-value pair",
    "memory:retrieve":   "Retrieve a value by key",
    "memory:search":     "Search memory (vector/FTS)",
    "memory:list":       "List stored keys",
    "memory:delete":     "Delete a key",
    "memory:stats":      "Memory statistics",
    "memory:configure":  "Configure memory settings",
    "memory:cleanup":    "Clean up stale entries",
    "memory:compress":   "Compress memory database",
    "memory:export":     "Export memory to file",
    "memory:import":     "Import memory from file",
    # task
    "task:create":       "Create a new task",
    "task:list":         "List tasks",
    "task:status":       "Task status",
    "task:cancel":       "Cancel a task",
    "task:assign":       "Assign task to agent",
    "task:retry":        "Retry a failed task",
    "task:complete":     "Mark task complete",
    # session
    "session:list":      "List sessions",
    "session:save":      "Save current session",
    "session:restore":   "Restore a session",
    "session:delete":    "Delete a session",
    "session:export":    "Export session",
    "session:import":    "Import session",
    "session:current":   "Show current session",
    # init
    "init:wizard":       "Interactive setup wizard",
    "init:check":        "Check configuration",
    "init:skills":       "Initialize skills",
    "init:hooks":        "Initialize hooks",
    "init:upgrade":      "Upgrade configuration",
    # start
    "start:stop":        "Stop all services",
    "start:restart":     "Restart all services",
    "start:quick":       "Quick start",
    # status
    "status:agents":     "Show agent overview",
    "status:tasks":      "Show task overview",
    "status:memory":     "Show memory overview",
    # mcp
    "mcp:start":         "Start MCP server",
    "mcp:stop":          "Stop MCP server",
    "mcp:status":        "MCP server status",
    "mcp:health":        "MCP health check",
    "mcp:restart":       "Restart MCP server",
    "mcp:tools":         "List MCP tools",
    "mcp:toggle":        "Toggle MCP server",
    "mcp:exec":          "Execute MCP tool",
    "mcp:logs":          "View MCP logs",
    # hooks
    "hooks:pre-edit":         "Pre-edit hook",
    "hooks:post-edit":        "Post-edit hook",
    "hooks:pre-command":      "Pre-command hook",
    "hooks:post-command":     "Post-command hook",
    "hooks:pre-task":         "Pre-task hook",
    "hooks:post-task":        "Post-task hook",
    "hooks:session-end":      "Session end hook",
    "hooks:session-restore":  "Session restore hook",
    "hooks:route":            "Routing hook",
    "hooks:explain":          "Explain hook",
    "hooks:pretrain":         "Pretrain hook",
    "hooks:build-agents":     "Build agents hook",
    "hooks:metrics":          "Metrics hook",
    "hooks:transfer":         "Transfer hook",
    "hooks:list":             "List all hooks",
    "hooks:intelligence":     "Intelligence hook",
    "hooks:notify":           "Notification hook",
    "hooks:worker":           "Worker management",
    "hooks:progress":         "Progress hook",
    "hooks:statusline":       "Statusline hook",
    "hooks:coverage-route":   "Coverage routing",
    "hooks:coverage-suggest": "Coverage suggestions",
    "hooks:coverage-gaps":    "Coverage gap analysis",
    "hooks:token-optimize":   "Token optimization",
    "hooks:model-route":      "Model routing",
    # neural
    "neural:train":      "Train neural model",
    "neural:status":     "Neural system status",
    "neural:patterns":   "View patterns",
    "neural:predict":    "Run prediction",
    "neural:optimize":   "Optimize neural models",
    "neural:benchmark":  "Benchmark neural",
    "neural:list":       "List neural models",
    "neural:export":     "Export neural model",
    "neural:import":     "Import neural model",
    # security
    "security:scan":     "Security scan",
    "security:cve":      "CVE lookup",
    "security:threats":  "Threat analysis",
    "security:audit":    "Security audit",
    "security:secrets":  "Secrets scan",
    "security:defend":   "Defense posture",
    # performance
    "performance:benchmark":  "Run benchmarks",
    "performance:profile":    "Profile execution",
    "performance:metrics":    "Performance metrics",
    "performance:optimize":   "Optimize performance",
    "performance:bottleneck": "Find bottlenecks",
    # embeddings
    "embeddings:init":        "Initialize embeddings",
    "embeddings:generate":    "Generate embeddings",
    "embeddings:search":      "Semantic search",
    "embeddings:compare":     "Compare embeddings",
    "embeddings:collections": "Manage collections",
    "embeddings:index":       "Index documents",
    "embeddings:providers":   "Embedding providers",
    "embeddings:chunk":       "Chunk documents",
    "embeddings:normalize":   "Normalize embeddings",
    "embeddings:hyperbolic":  "Hyperbolic embeddings",
    "embeddings:neural":      "Neural embeddings",
    "embeddings:models":      "Embedding models",
    "embeddings:cache":       "Embedding cache",
    "embeddings:warmup":      "Warmup cache",
    "embeddings:benchmark":   "Benchmark embeddings",
    # hive-mind
    "hive-mind:init":            "Initialize hive-mind",
    "hive-mind:spawn":           "Spawn hive agent",
    "hive-mind:status":          "Hive-mind status",
    "hive-mind:task":            "Submit hive task",
    "hive-mind:join":            "Join agents to hive",
    "hive-mind:leave":           "Remove agents from hive",
    "hive-mind:consensus":       "Consensus vote",
    "hive-mind:broadcast":       "Broadcast message",
    "hive-mind:memory":          "Hive shared memory",
    "hive-mind:optimize-memory": "Optimize hive memory",
    "hive-mind:shutdown":        "Shutdown hive-mind",
    # ruvector
    "ruvector:init":       "Initialize RuVector",
    "ruvector:setup":      "Setup RuVector DB",
    "ruvector:import":     "Import vectors",
    "ruvector:migrate":    "Migrate vector DB",
    "ruvector:status":     "RuVector status",
    "ruvector:benchmark":  "Benchmark RuVector",
    "ruvector:optimize":   "Optimize RuVector",
    "ruvector:backup":     "Backup RuVector",
    # guidance
    "guidance:compile":    "Compile guidance",
    "guidance:retrieve":   "Retrieve guidance",
    "guidance:gates":      "Gate management",
    "guidance:status":     "Guidance status",
    "guidance:optimize":   "Optimize guidance",
    "guidance:ab-test":    "A/B testing",
    # config
    "config:init":       "Initialize config",
    "config:get":        "Get config value",
    "config:set":        "Set config value",
    "config:providers":  "Provider config",
    "config:reset":      "Reset config",
    "config:export":     "Export config",
    "config:import":     "Import config",
    # doctor
    "doctor:run":        "Run health checks",
    "doctor:--fix":      "Auto-fix issues",
    "doctor:--install":  "Install dependencies",
    # daemon
    "daemon:start":      "Start daemon",
    "daemon:stop":       "Stop daemon",
    "daemon:status":     "Daemon status",
    "daemon:trigger":    "Trigger event",
    "daemon:enable":     "Enable service",
    # completions
    "completions:bash":       "Bash completions",
    "completions:zsh":        "Zsh completions",
    "completions:fish":       "Fish completions",
    "completions:powershell": "PowerShell completions",
    # migrate
    "migrate:status":    "Migration status",
    "migrate:run":       "Run migration",
    "migrate:verify":    "Verify migration",
    "migrate:rollback":  "Rollback migration",
    "migrate:breaking":  "Breaking changes",
    # workflow
    "workflow:run":      "Run workflow",
    "workflow:validate": "Validate workflow",
    "workflow:list":     "List workflows",
    "workflow:status":   "Workflow status",
    "workflow:stop":     "Stop workflow",
    "workflow:template": "Workflow templates",
    # analyze
    "analyze:diff":          "Analyze diff",
    "analyze:code":          "Code analysis",
    "analyze:deps":          "Dependency analysis",
    "analyze:ast":           "AST analysis",
    "analyze:complexity":    "Complexity analysis",
    "analyze:symbols":       "Symbol analysis",
    "analyze:imports":       "Import analysis",
    "analyze:boundaries":    "Boundary analysis",
    "analyze:modules":       "Module analysis",
    "analyze:dependencies":  "Dependency graph",
    "analyze:circular":      "Circular dependency check",
    # route
    "route:task":        "Route a task",
    "route:list-agents": "List routable agents",
    "route:stats":       "Routing statistics",
    "route:feedback":    "Agent feedback",
    "route:reset":       "Reset routing",
    "route:export":      "Export routing data",
    "route:import":      "Import routing data",
    "route:coverage":    "Route coverage",
    # progress
    "progress:check":    "Check progress",
    "progress:sync":     "Sync progress",
    "progress:summary":  "Progress summary",
    "progress:watch":    "Watch progress",
    # providers
    "providers:list":      "List providers",
    "providers:configure": "Configure provider",
    "providers:test":      "Test provider",
    "providers:models":    "Provider models",
    "providers:usage":     "Provider usage",
    # plugins
    "plugins:list":      "List plugins",
    "plugins:search":    "Search plugins",
    "plugins:install":   "Install plugin",
    "plugins:uninstall": "Uninstall plugin",
    "plugins:upgrade":   "Upgrade plugin",
    "plugins:toggle":    "Toggle plugin",
    "plugins:info":      "Plugin info",
    "plugins:create":    "Create plugin",
    "plugins:rate":      "Rate plugin",
    # deployment
    "deployment:deploy":       "Deploy",
    "deployment:status":       "Deployment status",
    "deployment:rollback":     "Rollback deployment",
    "deployment:history":      "Deployment history",
    "deployment:environments": "Environments",
    "deployment:logs":         "Deployment logs",
    # claims
    "claims:list":     "List claims",
    "claims:check":    "Check claim",
    "claims:grant":    "Grant claim",
    "claims:revoke":   "Revoke claim",
    "claims:roles":    "Manage roles",
    "claims:policies": "Manage policies",
    # issues
    "issues:list":       "List issues",
    "issues:claim":      "Claim issue",
    "issues:release":    "Release issue",
    "issues:handoff":    "Handoff issue",
    "issues:status":     "Issue status",
    "issues:stealable":  "Stealable issues",
    "issues:steal":      "Steal issue",
    "issues:load":       "Agent load",
    "issues:rebalance":  "Rebalance issues",
    "issues:board":      "Issue board",
    # update
    "update:check":       "Check for updates",
    "update:all":         "Update all",
    "update:history":     "Update history",
    "update:rollback":    "Rollback update",
    "update:clear-cache": "Clear update cache",
    # process
    "process:daemon":  "Process daemon",
    "process:monitor": "Process monitor",
    "process:workers": "Manage workers",
    "process:signals": "Send signals",
    "process:logs":    "Process logs",
    # appliance
    "appliance:build":   "Build appliance",
    "appliance:inspect": "Inspect appliance",
    "appliance:verify":  "Verify appliance",
    "appliance:extract": "Extract appliance",
    "appliance:run":     "Run appliance",
    "appliance:sign":    "Sign appliance",
    "appliance:publish": "Publish appliance",
    "appliance:update":  "Update appliance",
}

# ── Build COMMANDS nested dict (used by cli.py and menu.py) ──────
COMMANDS: dict[str, dict] = {}

for cmd, subs in SUBCMDS.items():
    COMMANDS[cmd] = {"subs": {}}
    for sub in subs:
        key = f"{cmd}:{sub}"
        COMMANDS[cmd]["subs"][sub] = {
            "desc": CMD_DESCS.get(key, f"{cmd} {sub}"),
            "params": [],
        }

# ── Populate CATEGORIES[...]["commands"] ──────────────────────────
for cat_name, cat_data in CATEGORIES.items():
    for cmd_name in cat_data["cmd_names"]:
        if cmd_name in COMMANDS:
            for sub, info in COMMANDS[cmd_name]["subs"].items():
                cat_data["commands"].append({
                    "cmd": cmd_name,
                    "sub": sub,
                    "desc": info["desc"],
                })

# ── Flat list of all command entries (for --list and --test-all) ──
COMMANDS_FLAT: list[dict[str, str]] = []
for cmd_name, cmd_data in COMMANDS.items():
    for sub_name, sub_info in cmd_data["subs"].items():
        COMMANDS_FLAT.append({
            "cmd": cmd_name,
            "sub": sub_name,
            "desc": sub_info["desc"],
        })
