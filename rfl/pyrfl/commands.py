"""Command registry for pyrfl — Python rewrite of rfl.d/commands.zsh.

Defines the complete command tree with MCP tool name mappings for every
subcommand extracted from the zsh SUBCMDS associative array.

Data structures
---------------
COMMANDS : dict
    Nested ``{cmd: {desc, subs: {sub: {desc, tool, params?}}}}`` tree.
    ``tool`` is the MCP tool name (underscore-delimited, e.g. ``agent_spawn``).
    ``params`` (optional) lists parameter names the tool accepts.

CATEGORIES : dict
    ``{name: {desc, commands: [cmd_name, ...]}}`` grouping commands by domain.

Legacy compat
-------------
SUBCMDS, CMD_DESCS, COMMANDS_FLAT — kept for backward compatibility with
menu.py and CLI ``--list`` until the migration is complete.
"""

from __future__ import annotations

__all__ = [
    "COMMANDS",
    "CATEGORIES",
    "CMD_OPTIONS",
    # Legacy
    "SUBCMDS",
    "CMD_DESCS",
    "COMMANDS_FLAT",
    # Helpers
    "get_tool",
    "get_params",
    "get_desc",
    "list_commands",
    "list_subs",
    "find_command",
    "total_commands",
]

# ---------------------------------------------------------------------------
# Complete command tree
# ---------------------------------------------------------------------------
# Every entry from the zsh SUBCMDS associative array is represented here.
# "tool" is the MCP tool name (underscore-delimited, e.g. "agent_spawn").
# "params" lists parameter names the tool accepts (omitted when none needed).
# ---------------------------------------------------------------------------

COMMANDS: dict[str, dict] = {
    # ── Primary ────────────────────────────────────────────────────
    "init": {
        "desc": "Project initialization",
        "subs": {
            "wizard":  {"desc": "Interactive setup wizard",    "tool": "hooks_init"},
            "check":   {"desc": "Check project configuration", "tool": "system_health"},
            "skills":  {"desc": "Install skill packages",      "tool": "hooks_init",  "params": ["skills"]},
            "hooks":   {"desc": "Initialize hooks system",     "tool": "hooks_init"},
            "upgrade": {"desc": "Upgrade to latest version",   "tool": "system_info"},
        },
    },
    "start": {
        "desc": "Start services",
        "subs": {
            "stop":    {"desc": "Stop all services",           "tool": "swarm_stop"},
            "restart": {"desc": "Restart services",            "tool": "swarm_init"},
            "quick":   {"desc": "Quick-start (daemon + MCP)",  "tool": "swarm_init",  "params": ["topology"]},
        },
    },
    "status": {
        "desc": "System status overview",
        "subs": {
            "agents": {"desc": "Agent status summary",  "tool": "agent_list"},
            "tasks":  {"desc": "Task status summary",   "tool": "task_list"},
            "memory": {"desc": "Memory status summary",  "tool": "memory_stats"},
        },
    },
    "agent": {
        "desc": "Agent lifecycle management",
        "subs": {
            "spawn":   {"desc": "Spawn a new agent",          "tool": "agent_spawn",     "params": ["agentType", "agentId", "task"]},
            "list":    {"desc": "List all agents",             "tool": "agent_list"},
            "status":  {"desc": "Agent status",                "tool": "agent_status",    "params": ["agentId"]},
            "stop":    {"desc": "Stop (terminate) an agent",   "tool": "agent_terminate", "params": ["agentId"]},
            "metrics": {"desc": "Agent performance metrics",   "tool": "system_metrics",  "params": ["agentId"]},
            "pool":    {"desc": "Agent pool info",             "tool": "agent_pool"},
            "health":  {"desc": "Agent health check",          "tool": "agent_health",    "params": ["agentId"]},
            "logs":    {"desc": "Agent logs",                  "tool": "agent_status",    "params": ["agentId"]},
        },
    },
    "swarm": {
        "desc": "Multi-agent swarm coordination",
        "subs": {
            "init":       {"desc": "Initialize a swarm",      "tool": "swarm_init",              "params": ["topology", "maxAgents", "strategy"]},
            "start":      {"desc": "Start the swarm",         "tool": "swarm_init",              "params": ["topology"]},
            "status":     {"desc": "Swarm status",             "tool": "swarm_status",            "params": ["swarmId"]},
            "stop":       {"desc": "Stop the swarm",           "tool": "swarm_stop",              "params": ["swarmId"]},
            "scale":      {"desc": "Scale swarm agents",       "tool": "coordination_load_balance", "params": ["targetCount"]},
            "coordinate": {"desc": "Coordinate swarm task",    "tool": "coordination_orchestrate",  "params": ["task"]},
        },
    },
    "memory": {
        "desc": "AgentDB memory + HNSW search",
        "subs": {
            "init":      {"desc": "Initialize memory backend",  "tool": "memory_store"},
            "store":     {"desc": "Store a memory entry",       "tool": "memory_store",    "params": ["key", "value", "namespace"]},
            "retrieve":  {"desc": "Retrieve a memory entry",    "tool": "memory_retrieve", "params": ["key", "namespace"]},
            "search":    {"desc": "Search memory (HNSW)",       "tool": "memory_search",   "params": ["query", "namespace", "limit"]},
            "list":      {"desc": "List memory entries",        "tool": "memory_list",     "params": ["namespace", "limit"]},
            "delete":    {"desc": "Delete a memory entry",      "tool": "memory_delete",   "params": ["key", "namespace"]},
            "stats":     {"desc": "Memory statistics",          "tool": "memory_stats"},
            "configure": {"desc": "Configure memory backend",   "tool": "config_set",      "params": ["key", "value"]},
            "cleanup":   {"desc": "Clean up stale entries",     "tool": "memory_list"},
            "compress":  {"desc": "Compress memory store",      "tool": "neural_compress"},
            "export":    {"desc": "Export memory data",         "tool": "config_export",   "params": ["path"]},
            "import":    {"desc": "Import memory data",         "tool": "config_import",   "params": ["path"]},
        },
    },
    "task": {
        "desc": "Task creation and tracking",
        "subs": {
            "create":   {"desc": "Create a new task",       "tool": "task_create",   "params": ["type", "description", "priority"]},
            "list":     {"desc": "List all tasks",           "tool": "task_list"},
            "status":   {"desc": "Task status",              "tool": "task_status",   "params": ["taskId"]},
            "cancel":   {"desc": "Cancel a task",            "tool": "task_cancel",   "params": ["taskId"]},
            "assign":   {"desc": "Assign task to agent(s)",  "tool": "task_assign",   "params": ["taskId", "agentIds"]},
            "retry":    {"desc": "Retry a failed task",      "tool": "task_execute",  "params": ["taskId"]},
            "complete": {"desc": "Mark task complete",        "tool": "task_complete", "params": ["taskId"]},
        },
    },
    "session": {
        "desc": "Session state management",
        "subs": {
            "list":    {"desc": "List sessions",          "tool": "session_list"},
            "save":    {"desc": "Save current session",   "tool": "session_save",    "params": ["sessionId"]},
            "restore": {"desc": "Restore a session",      "tool": "session_restore", "params": ["sessionId"]},
            "delete":  {"desc": "Delete a session",       "tool": "session_delete",  "params": ["sessionId"]},
            "export":  {"desc": "Export session data",    "tool": "session_info",    "params": ["sessionId"]},
            "import":  {"desc": "Import session data",    "tool": "session_restore", "params": ["sessionId"]},
            "current": {"desc": "Current session info",   "tool": "session_current"},
        },
    },
    "mcp": {
        "desc": "MCP server management",
        "subs": {
            "start":   {"desc": "Start MCP server",             "tool": "mcp_status"},
            "stop":    {"desc": "Stop MCP server",              "tool": "mcp_stop"},
            "status":  {"desc": "MCP server status",            "tool": "mcp_status"},
            "health":  {"desc": "MCP health check",             "tool": "system_health"},
            "restart": {"desc": "Restart MCP server",           "tool": "mcp_status"},
            "tools":   {"desc": "List available MCP tools",     "tool": "mcp_status"},
            "toggle":  {"desc": "Toggle MCP tool on/off",       "tool": "config_set",   "params": ["tool", "enabled"]},
            "exec":    {"desc": "Execute an MCP tool directly", "tool": "mcp_status",   "params": ["toolName", "params"]},
            "logs":    {"desc": "MCP server logs",              "tool": "mcp_status"},
        },
    },
    "hooks": {
        "desc": "Self-learning hooks system",
        "subs": {
            "pre-edit":         {"desc": "Pre-edit hook",                   "tool": "hooks_pre-edit",        "params": ["filePath", "content"]},
            "post-edit":        {"desc": "Post-edit hook",                  "tool": "hooks_post-edit",       "params": ["filePath", "result"]},
            "pre-command":      {"desc": "Pre-command hook",                "tool": "hooks_pre-command",     "params": ["command"]},
            "post-command":     {"desc": "Post-command hook",               "tool": "hooks_post-command",    "params": ["command", "result"]},
            "pre-task":         {"desc": "Pre-task hook",                   "tool": "hooks_pre-task",        "params": ["description"]},
            "post-task":        {"desc": "Post-task hook",                  "tool": "hooks_post-task",       "params": ["taskId", "success"]},
            "session-end":      {"desc": "Session end hook",                "tool": "hooks_session-end",     "params": ["sessionId"]},
            "session-restore":  {"desc": "Session restore hook",            "tool": "hooks_session-restore", "params": ["sessionId"]},
            "route":            {"desc": "Route a task to best model",      "tool": "hooks_route",           "params": ["task"]},
            "explain":          {"desc": "Explain a routing decision",      "tool": "hooks_explain",         "params": ["task"]},
            "pretrain":         {"desc": "Pre-train intelligence",          "tool": "hooks_pretrain",        "params": ["domain"]},
            "build-agents":     {"desc": "Build agent configs",             "tool": "hooks_build-agents",    "params": ["count", "types"]},
            "metrics":          {"desc": "Hook metrics/analytics",          "tool": "hooks_metrics"},
            "transfer":         {"desc": "Transfer learning state",         "tool": "hooks_transfer",        "params": ["sourceId", "targetId"]},
            "list":             {"desc": "List all hooks",                  "tool": "hooks_list"},
            "intelligence":     {"desc": "Intelligence system status",      "tool": "hooks_intelligence"},
            "notify":           {"desc": "Send notification",               "tool": "hooks_notify",          "params": ["message", "level"]},
            "worker":           {"desc": "Worker management",               "tool": "hooks_worker-list"},
            "progress":         {"desc": "Progress tracking",               "tool": "progress_check"},
            "statusline":       {"desc": "Status line output",              "tool": "hooks_metrics"},
            "coverage-route":   {"desc": "Coverage-aware routing",          "tool": "hooks_route",           "params": ["task"]},
            "coverage-suggest": {"desc": "Suggest coverage improvements",   "tool": "hooks_intelligence"},
            "coverage-gaps":    {"desc": "Find coverage gaps",              "tool": "hooks_intelligence"},
            "token-optimize":   {"desc": "Token optimization",              "tool": "hooks_intelligence"},
            "model-route":      {"desc": "Model routing decision",          "tool": "hooks_model-route",     "params": ["task"]},
        },
    },

    # ── Advanced ───────────────────────────────────────────────────
    "neural": {
        "desc": "Neural model training and inference",
        "subs": {
            "train":     {"desc": "Train a neural model",    "tool": "neural_train",     "params": ["domain", "epochs"]},
            "status":    {"desc": "Training status",         "tool": "neural_status"},
            "patterns":  {"desc": "View learned patterns",   "tool": "neural_patterns",  "params": ["domain"]},
            "predict":   {"desc": "Make a prediction",       "tool": "neural_predict",   "params": ["input", "model"]},
            "optimize":  {"desc": "Optimize model",          "tool": "neural_optimize",  "params": ["model"]},
            "benchmark": {"desc": "Benchmark model",         "tool": "neural_benchmark", "params": ["model"]},
            "list":      {"desc": "List models",             "tool": "neural_list"},
            "export":    {"desc": "Export a model",          "tool": "neural_export",    "params": ["model", "path"]},
            "import":    {"desc": "Import a model",          "tool": "neural_import",    "params": ["path"]},
        },
    },
    "security": {
        "desc": "Security scanning and analysis",
        "subs": {
            "scan":    {"desc": "Run security scan",           "tool": "aidefence_scan",      "params": ["target"]},
            "cve":     {"desc": "Check CVE database",          "tool": "aidefence_analyze",   "params": ["query"]},
            "threats": {"desc": "Threat analysis",             "tool": "aidefence_analyze",   "params": ["target"]},
            "audit":   {"desc": "Security audit",              "tool": "aidefence_scan",      "params": ["target"]},
            "secrets": {"desc": "Detect secrets/credentials",  "tool": "transfer_detect-pii", "params": ["content"]},
            "defend":  {"desc": "Activate AI defence",         "tool": "aidefence_is_safe",   "params": ["input"]},
        },
    },
    "performance": {
        "desc": "Performance benchmarking",
        "subs": {
            "benchmark":  {"desc": "Run performance benchmark",   "tool": "performance_benchmark",  "params": ["target"]},
            "profile":    {"desc": "Profile execution",           "tool": "performance_profile",    "params": ["target"]},
            "metrics":    {"desc": "Performance metrics",         "tool": "performance_metrics"},
            "optimize":   {"desc": "Optimization suggestions",    "tool": "performance_optimize",   "params": ["target"]},
            "bottleneck": {"desc": "Find bottlenecks",            "tool": "performance_bottleneck", "params": ["target"]},
        },
    },
    "embeddings": {
        "desc": "Embedding generation and search",
        "subs": {
            "init":        {"desc": "Initialize embeddings engine",  "tool": "embeddings_init",       "params": ["provider"]},
            "generate":    {"desc": "Generate embeddings",           "tool": "embeddings_generate",   "params": ["text", "model"]},
            "search":      {"desc": "Semantic search",               "tool": "embeddings_search",     "params": ["query", "limit"]},
            "compare":     {"desc": "Compare two texts",             "tool": "embeddings_compare",    "params": ["textA", "textB"]},
            "collections": {"desc": "List collections",              "tool": "embeddings_status"},
            "index":       {"desc": "Build search index",            "tool": "embeddings_init"},
            "providers":   {"desc": "List embedding providers",      "tool": "embeddings_status"},
            "chunk":       {"desc": "Chunk text for embedding",      "tool": "embeddings_generate",   "params": ["text"]},
            "normalize":   {"desc": "Normalize embeddings",          "tool": "embeddings_generate",   "params": ["text"]},
            "hyperbolic":  {"desc": "Hyperbolic embeddings",         "tool": "embeddings_hyperbolic", "params": ["text"]},
            "neural":      {"desc": "Neural embeddings",             "tool": "embeddings_neural",     "params": ["text"]},
            "models":      {"desc": "List embedding models",         "tool": "embeddings_status"},
            "cache":       {"desc": "Embedding cache stats",         "tool": "embeddings_status"},
            "warmup":      {"desc": "Warm up embedding cache",       "tool": "embeddings_init"},
            "benchmark":   {"desc": "Benchmark embeddings",          "tool": "embeddings_status"},
        },
    },
    "hive-mind": {
        "desc": "Byzantine fault-tolerant consensus",
        "subs": {
            "init":            {"desc": "Initialize hive mind",      "tool": "hive-mind_init",      "params": ["topology"]},
            "spawn":           {"desc": "Spawn hive mind node",      "tool": "hive-mind_spawn",     "params": ["nodeType", "count"]},
            "status":          {"desc": "Hive mind status",          "tool": "hive-mind_status"},
            "task":            {"desc": "Submit task to hive",       "tool": "hive-mind_task",      "params": ["description"]},
            "join":            {"desc": "Join a hive mind cluster",  "tool": "hive-mind_join",      "params": ["clusterId"]},
            "leave":           {"desc": "Leave hive mind cluster",   "tool": "hive-mind_leave",     "params": ["clusterId"]},
            "consensus":       {"desc": "Run consensus protocol",    "tool": "hive-mind_consensus", "params": ["proposal"]},
            "broadcast":       {"desc": "Broadcast message to hive", "tool": "hive-mind_broadcast", "params": ["message"]},
            "memory":          {"desc": "Hive shared memory",        "tool": "hive-mind_memory"},
            "optimize-memory": {"desc": "Optimize hive memory",      "tool": "hive-mind_memory"},
            "shutdown":        {"desc": "Shutdown hive mind",        "tool": "hive-mind_shutdown"},
        },
    },
    "ruvector": {
        "desc": "RuVector intelligence system",
        "subs": {
            "init":      {"desc": "Initialize RuVector",      "tool": "ruvllm_status"},
            "setup":     {"desc": "Setup RuVector pipeline",  "tool": "ruvllm_hnsw_create", "params": ["dimensions"]},
            "import":    {"desc": "Import vectors",           "tool": "ruvllm_hnsw_add",    "params": ["vectors"]},
            "migrate":   {"desc": "Migrate vector store",     "tool": "ruvllm_status"},
            "status":    {"desc": "RuVector status",          "tool": "ruvllm_status"},
            "benchmark": {"desc": "Benchmark vector ops",     "tool": "ruvllm_status"},
            "optimize":  {"desc": "Optimize vector index",    "tool": "ruvllm_status"},
            "backup":    {"desc": "Backup vector store",      "tool": "ruvllm_status"},
        },
    },
    "guidance": {
        "desc": "Governance control plane",
        "subs": {
            "compile":  {"desc": "Compile governance rules",  "tool": "system_info"},
            "retrieve": {"desc": "Retrieve governance state", "tool": "system_info"},
            "gates":    {"desc": "List quality gates",        "tool": "system_info"},
            "status":   {"desc": "Guidance system status",    "tool": "system_status"},
            "optimize": {"desc": "Optimize governance rules", "tool": "system_info"},
            "ab-test":  {"desc": "A/B test governance rules", "tool": "system_info"},
        },
    },

    # ── Utility ────────────────────────────────────────────────────
    "config": {
        "desc": "Configuration management",
        "subs": {
            "init":      {"desc": "Initialize configuration", "tool": "config_list"},
            "get":       {"desc": "Get a config value",       "tool": "config_get",    "params": ["key"]},
            "set":       {"desc": "Set a config value",       "tool": "config_set",    "params": ["key", "value"]},
            "providers": {"desc": "List LLM providers",       "tool": "config_list"},
            "reset":     {"desc": "Reset to defaults",        "tool": "config_reset"},
            "export":    {"desc": "Export configuration",     "tool": "config_export", "params": ["path"]},
            "import":    {"desc": "Import configuration",     "tool": "config_import", "params": ["path"]},
        },
    },
    "doctor": {
        "desc": "Health diagnostics",
        "subs": {
            "run":       {"desc": "Run all health checks", "tool": "system_health"},
            "--fix":     {"desc": "Auto-fix issues",       "tool": "system_health"},
            "--install": {"desc": "Install missing deps",  "tool": "system_health"},
        },
    },
    "daemon": {
        "desc": "Background daemon management",
        "subs": {
            "start":   {"desc": "Start the daemon",        "tool": "system_status"},
            "stop":    {"desc": "Stop the daemon",          "tool": "swarm_stop"},
            "status":  {"desc": "Daemon status",            "tool": "system_status"},
            "trigger": {"desc": "Trigger daemon action",    "tool": "system_status"},
            "enable":  {"desc": "Enable daemon auto-start", "tool": "config_set",   "params": ["key", "value"]},
        },
    },
    "completions": {
        "desc": "Shell completion generation",
        "subs": {
            "bash":       {"desc": "Generate bash completions",       "tool": "system_info"},
            "zsh":        {"desc": "Generate zsh completions",        "tool": "system_info"},
            "fish":       {"desc": "Generate fish completions",       "tool": "system_info"},
            "powershell": {"desc": "Generate PowerShell completions", "tool": "system_info"},
        },
    },
    "migrate": {
        "desc": "Migration management",
        "subs": {
            "status":   {"desc": "Migration status",           "tool": "memory_stats"},
            "run":      {"desc": "Run pending migrations",     "tool": "memory_migrate"},
            "verify":   {"desc": "Verify migration integrity", "tool": "memory_stats"},
            "rollback": {"desc": "Rollback last migration",    "tool": "memory_migrate"},
            "breaking": {"desc": "Check for breaking changes", "tool": "memory_stats"},
        },
    },
    "workflow": {
        "desc": "Workflow automation",
        "subs": {
            "run":      {"desc": "Run a workflow",            "tool": "workflow_run",      "params": ["workflowId"]},
            "validate": {"desc": "Validate workflow config",  "tool": "workflow_status",   "params": ["workflowId"]},
            "list":     {"desc": "List workflows",            "tool": "workflow_list"},
            "status":   {"desc": "Workflow status",           "tool": "workflow_status",   "params": ["workflowId"]},
            "stop":     {"desc": "Stop a workflow",           "tool": "workflow_cancel",   "params": ["workflowId"]},
            "template": {"desc": "Create from template",      "tool": "workflow_template", "params": ["templateId"]},
        },
    },

    # ── Analysis ───────────────────────────────────────────────────
    "analyze": {
        "desc": "Code analysis tools",
        "subs": {
            "diff":         {"desc": "Analyze a diff",            "tool": "analyze_diff",          "params": ["diff"]},
            "code":         {"desc": "Analyze code quality",      "tool": "analyze_file-risk",     "params": ["filePath"]},
            "deps":         {"desc": "Dependency analysis",       "tool": "analyze_diff-stats",    "params": ["target"]},
            "ast":          {"desc": "AST analysis",              "tool": "analyze_file-risk",     "params": ["filePath"]},
            "complexity":   {"desc": "Complexity analysis",       "tool": "analyze_file-risk",     "params": ["filePath"]},
            "symbols":      {"desc": "Symbol analysis",           "tool": "analyze_file-risk",     "params": ["filePath"]},
            "imports":      {"desc": "Import graph analysis",     "tool": "analyze_file-risk",     "params": ["filePath"]},
            "boundaries":   {"desc": "Module boundary analysis",  "tool": "analyze_diff-classify", "params": ["diff"]},
            "modules":      {"desc": "Module structure analysis", "tool": "analyze_diff-stats",    "params": ["target"]},
            "dependencies": {"desc": "Full dependency graph",     "tool": "analyze_diff-stats",    "params": ["target"]},
            "circular":     {"desc": "Circular dependency check", "tool": "analyze_diff-stats",    "params": ["target"]},
        },
    },
    "route": {
        "desc": "Task routing and feedback",
        "subs": {
            "task":        {"desc": "Route a task",            "tool": "hooks_route",      "params": ["task"]},
            "list-agents": {"desc": "List routable agents",    "tool": "agent_list"},
            "stats":       {"desc": "Routing statistics",      "tool": "hooks_metrics"},
            "feedback":    {"desc": "Submit routing feedback",  "tool": "agentdb_feedback", "params": ["routeId", "outcome"]},
            "reset":       {"desc": "Reset routing state",     "tool": "system_reset"},
            "export":      {"desc": "Export routing data",     "tool": "config_export",    "params": ["path"]},
            "import":      {"desc": "Import routing data",     "tool": "config_import",    "params": ["path"]},
            "coverage":    {"desc": "Route coverage stats",    "tool": "hooks_metrics"},
        },
    },
    "progress": {
        "desc": "Progress tracking",
        "subs": {
            "check":   {"desc": "Check progress",      "tool": "progress_check"},
            "sync":    {"desc": "Sync progress state",  "tool": "progress_sync"},
            "summary": {"desc": "Progress summary",     "tool": "progress_summary"},
            "watch":   {"desc": "Watch progress live",   "tool": "progress_watch"},
        },
    },

    # ── Management ─────────────────────────────────────────────────
    "providers": {
        "desc": "LLM provider management",
        "subs": {
            "list":      {"desc": "List providers",           "tool": "config_list"},
            "configure": {"desc": "Configure a provider",     "tool": "config_set",    "params": ["provider", "key", "value"]},
            "test":      {"desc": "Test provider connection",  "tool": "system_health"},
            "models":    {"desc": "List provider models",      "tool": "config_list"},
            "usage":     {"desc": "Provider usage stats",      "tool": "system_metrics"},
        },
    },
    "plugins": {
        "desc": "Plugin management",
        "subs": {
            "list":      {"desc": "List installed plugins",        "tool": "transfer_plugin-search"},
            "search":    {"desc": "Search plugin registry",        "tool": "transfer_plugin-search", "params": ["query"]},
            "install":   {"desc": "Install a plugin",              "tool": "transfer_plugin-info",   "params": ["pluginId"]},
            "uninstall": {"desc": "Uninstall a plugin",            "tool": "transfer_plugin-info",   "params": ["pluginId"]},
            "upgrade":   {"desc": "Upgrade a plugin",              "tool": "transfer_plugin-info",   "params": ["pluginId"]},
            "toggle":    {"desc": "Enable/disable a plugin",       "tool": "transfer_plugin-info",   "params": ["pluginId"]},
            "info":      {"desc": "Plugin details",                "tool": "transfer_plugin-info",   "params": ["pluginId"]},
            "create":    {"desc": "Create a new plugin scaffold",  "tool": "transfer_plugin-info",   "params": ["name"]},
            "rate":      {"desc": "Rate a plugin",                 "tool": "transfer_plugin-info",   "params": ["pluginId", "rating"]},
        },
    },
    "deployment": {
        "desc": "Deployment management",
        "subs": {
            "deploy":       {"desc": "Deploy application",     "tool": "system_status"},
            "status":       {"desc": "Deployment status",      "tool": "system_status"},
            "rollback":     {"desc": "Rollback deployment",    "tool": "system_reset"},
            "history":      {"desc": "Deployment history",     "tool": "system_info"},
            "environments": {"desc": "List environments",      "tool": "system_info"},
            "logs":         {"desc": "Deployment logs",        "tool": "system_info"},
        },
    },
    "claims": {
        "desc": "Work item claims",
        "subs": {
            "list":     {"desc": "List all claims",     "tool": "claims_list"},
            "check":    {"desc": "Check claim status",  "tool": "claims_status",  "params": ["claimId"]},
            "grant":    {"desc": "Grant a claim",       "tool": "claims_claim",   "params": ["resourceId", "agentId"]},
            "revoke":   {"desc": "Revoke a claim",      "tool": "claims_release", "params": ["claimId"]},
            "roles":    {"desc": "List roles",          "tool": "claims_list"},
            "policies": {"desc": "List claim policies", "tool": "claims_list"},
        },
    },
    "issues": {
        "desc": "Issue tracking (beads)",
        "subs": {
            "list":      {"desc": "List issues",                 "tool": "claims_list"},
            "claim":     {"desc": "Claim an issue",              "tool": "claims_claim",     "params": ["issueId", "agentId"]},
            "release":   {"desc": "Release an issue",            "tool": "claims_release",   "params": ["claimId"]},
            "handoff":   {"desc": "Hand off an issue",           "tool": "claims_handoff",   "params": ["claimId", "targetAgentId"]},
            "status":    {"desc": "Issue status",                "tool": "claims_status",    "params": ["issueId"]},
            "stealable": {"desc": "List stealable issues",       "tool": "claims_stealable"},
            "steal":     {"desc": "Steal an issue",              "tool": "claims_steal",     "params": ["claimId", "agentId"]},
            "load":      {"desc": "Agent load distribution",     "tool": "claims_load"},
            "rebalance": {"desc": "Rebalance issue assignments", "tool": "claims_rebalance"},
            "board":     {"desc": "Issue board view",            "tool": "claims_board"},
        },
    },
    "update": {
        "desc": "Update management",
        "subs": {
            "check":       {"desc": "Check for updates",  "tool": "system_info"},
            "all":         {"desc": "Update everything",  "tool": "system_info"},
            "history":     {"desc": "Update history",     "tool": "system_info"},
            "rollback":    {"desc": "Rollback an update", "tool": "system_reset"},
            "clear-cache": {"desc": "Clear update cache", "tool": "system_reset"},
        },
    },
    "process": {
        "desc": "Process management",
        "subs": {
            "daemon":  {"desc": "Daemon process info",   "tool": "system_status"},
            "monitor": {"desc": "Monitor processes",     "tool": "system_metrics"},
            "workers": {"desc": "List worker processes",  "tool": "hooks_worker-list"},
            "signals": {"desc": "Signal management",     "tool": "system_status"},
            "logs":    {"desc": "Process logs",          "tool": "system_info"},
        },
    },
    "appliance": {
        "desc": "Appliance packaging",
        "subs": {
            "build":   {"desc": "Build an appliance",          "tool": "system_info"},
            "inspect": {"desc": "Inspect an appliance",        "tool": "system_info"},
            "verify":  {"desc": "Verify appliance integrity",  "tool": "system_health"},
            "extract": {"desc": "Extract appliance contents",  "tool": "system_info"},
            "run":     {"desc": "Run an appliance",            "tool": "system_info"},
            "sign":    {"desc": "Sign an appliance",           "tool": "system_info"},
            "publish": {"desc": "Publish an appliance",        "tool": "system_info"},
            "update":  {"desc": "Update an appliance",         "tool": "system_info"},
        },
    },
}

# ---------------------------------------------------------------------------
# Category groupings — mirrors zsh CATEGORIES
# ---------------------------------------------------------------------------

CATEGORIES: dict[str, dict] = {
    "Primary": {
        "desc": "Core commands for everyday use",
        "commands": ["init", "start", "status", "agent", "swarm", "memory",
                     "task", "session", "mcp", "hooks"],
    },
    "Advanced": {
        "desc": "Neural, security, performance, embeddings, hive-mind, RuVector, governance",
        "commands": ["neural", "security", "performance", "embeddings",
                     "hive-mind", "ruvector", "guidance"],
    },
    "Utility": {
        "desc": "Configuration, diagnostics, migration, workflows",
        "commands": ["config", "doctor", "daemon", "completions", "migrate",
                     "workflow"],
    },
    "Analysis": {
        "desc": "Code analysis, routing, progress tracking",
        "commands": ["analyze", "route", "progress"],
    },
    "Management": {
        "desc": "Providers, plugins, deployment, claims, issues, updates, processes, appliances",
        "commands": ["providers", "plugins", "deployment", "claims", "issues",
                     "update", "process", "appliance"],
    },
}

# ---------------------------------------------------------------------------
# Init option flags (from CMD_OPTIONS in zsh)
# ---------------------------------------------------------------------------

CMD_OPTIONS: dict[str, list[str]] = {
    "init":   ["--force", "--minimal", "--full", "--skip-claude", "--only-claude",
               "--start-all", "--start-daemon", "--with-embeddings", "--codex", "--dual"],
    "start":  ["--daemon", "--skip-mcp", "--topology=mesh", "--topology=hierarchical"],
    "status": ["--watch", "--health-check"],
    "doctor": ["-c version", "-c node", "-c npm", "-c config", "-c daemon",
               "-c memory", "-c api", "-c git", "-c mcp", "-c claude"],
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def get_tool(cmd: str, sub: str) -> str | None:
    """Return the MCP tool name for a given cmd/sub, or None."""
    entry = COMMANDS.get(cmd, {}).get("subs", {}).get(sub)
    return entry["tool"] if entry else None


def get_params(cmd: str, sub: str) -> list[str]:
    """Return parameter names for a given cmd/sub (empty list if none)."""
    entry = COMMANDS.get(cmd, {}).get("subs", {}).get(sub)
    return entry.get("params", []) if entry else []


def get_desc(cmd: str, sub: str | None = None) -> str:
    """Return description for a command or subcommand."""
    cmd_def = COMMANDS.get(cmd)
    if not cmd_def:
        return ""
    if sub is None:
        return cmd_def.get("desc", "")
    return cmd_def.get("subs", {}).get(sub, {}).get("desc", "")


def list_commands() -> list[str]:
    """Return sorted list of all top-level commands."""
    return sorted(COMMANDS.keys())


def list_subs(cmd: str) -> list[str]:
    """Return sorted list of subcommands for a given command."""
    return sorted(COMMANDS.get(cmd, {}).get("subs", {}).keys())


def find_command(query: str) -> list[tuple[str, str, str]]:
    """Fuzzy-find commands matching a query string.

    Returns list of (cmd, sub, desc) tuples whose cmd, sub, or desc
    contain the query (case-insensitive).
    """
    q = query.lower()
    results = []
    for cmd, cmd_def in COMMANDS.items():
        for sub, sub_def in cmd_def.get("subs", {}).items():
            desc = sub_def.get("desc", "")
            if q in cmd.lower() or q in sub.lower() or q in desc.lower():
                results.append((cmd, sub, desc))
    return results


def total_commands() -> int:
    """Return total number of subcommands across all commands."""
    return sum(len(c.get("subs", {})) for c in COMMANDS.values())


# ---------------------------------------------------------------------------
# Legacy compatibility layer
# ---------------------------------------------------------------------------
# These replicate the old flat data structures so existing code (menu.py,
# cli.py --list) keeps working during migration.
# ---------------------------------------------------------------------------

SUBCMDS: dict[str, list[str]] = {
    cmd: list(data["subs"].keys()) for cmd, data in COMMANDS.items()
}

CMD_DESCS: dict[str, str] = {}
for _cmd, _data in COMMANDS.items():
    for _sub, _sub_def in _data.get("subs", {}).items():
        CMD_DESCS[f"{_cmd}:{_sub}"] = _sub_def["desc"]

COMMANDS_FLAT: list[dict] = []
for _cmd, _data in COMMANDS.items():
    for _sub, _sub_def in _data.get("subs", {}).items():
        COMMANDS_FLAT.append({
            "cmd": _cmd,
            "sub": _sub,
            "desc": _sub_def["desc"],
            "tool": _sub_def["tool"],
        })
