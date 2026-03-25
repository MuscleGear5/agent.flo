"""Generic handler system that routes commands to MCP tools.

The handler first checks CUSTOM_HANDLERS for commands that need special
interactive treatment (e.g. agent spawn, swarm init).  Everything else goes
through the generic path: look up the MCP tool name in COMMANDS, optionally
prompt for missing parameters, call mcp_exec, and auto-format the result.
"""

from __future__ import annotations

import importlib
from collections.abc import Callable

_pkg = __name__.rsplit(".", 1)[0]
_mcp_mod = importlib.import_module(".mcp", _pkg)
mcp_exec = _mcp_mod.mcp_exec
ruflo_run = _mcp_mod.ruflo_run

ui = importlib.import_module(".ui", _pkg)
_cmd_mod = importlib.import_module(".commands", _pkg)
COMMANDS = _cmd_mod.COMMANDS

from rich.prompt import Prompt, Confirm  # noqa: E402


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_command(cmd: str, sub: str, extra_args: list[str] | None = None,
                args: dict | None = None):
    """Route command to appropriate handler or generic MCP call.

    Parameters
    ----------
    cmd : str
        Top-level command (e.g. "agent", "task").
    sub : str
        Subcommand (e.g. "spawn", "list").
    extra_args : list[str] | None
        Positional CLI args (legacy compat, converted to dict when possible).
    args : dict | None
        Pre-built parameter dict — takes precedence over extra_args.
    """
    # Check for custom handler first
    handler_key = f"{cmd}_{sub}"
    custom = CUSTOM_HANDLERS.get(handler_key)
    if custom:
        custom(args or _args_from_list(cmd, sub, extra_args))
        return

    # Generic MCP handler
    cmd_def = COMMANDS.get(cmd, {}).get("subs", {}).get(sub)
    if not cmd_def:
        ui.error(f"Unknown command: {cmd} {sub}")
        return

    tool = cmd_def["tool"]
    params = args or _args_from_list(cmd, sub, extra_args)

    # If command needs params and none provided, prompt interactively
    if not params and "params" in cmd_def:
        params = _prompt_params(cmd_def)
        if params is None:  # User cancelled
            return

    with ui.spin(f"Running {cmd} {sub}..."):
        result = mcp_exec(tool, params if params else None)

    if not result:
        ui.info("(no data)")
        return

    if result.get("error"):
        ui.error(result["error"])
        raw = result.get("raw", "")
        if raw:
            ui.show_raw(raw)
        return

    # Auto-format result based on content
    _auto_display(cmd, sub, result)


# ---------------------------------------------------------------------------
# Argument helpers
# ---------------------------------------------------------------------------

def _args_from_list(cmd: str, sub: str, extra_args: list[str] | None) -> dict:
    """Convert positional CLI args to a parameter dict using the command schema."""
    if not extra_args:
        return {}
    cmd_def = COMMANDS.get(cmd, {}).get("subs", {}).get(sub, {})
    param_names = cmd_def.get("params", [])
    result: dict = {}
    # Pair up positional args with parameter names
    for i, name in enumerate(param_names):
        if i < len(extra_args):
            result[name] = extra_args[i]
    # If there are more args than param names, pass remaining as-is
    if len(extra_args) > len(param_names):
        result["_extra"] = extra_args[len(param_names):]
    return result


def _prompt_params(cmd_def: dict) -> dict | None:
    """Interactively prompt for required parameters."""
    params: dict = {}
    for p in cmd_def.get("params", []):
        val = Prompt.ask(f"  {p}")
        if not val:
            return None
        params[p] = val
    return params


# ---------------------------------------------------------------------------
# Auto-display
# ---------------------------------------------------------------------------

# Keys that represent list-typed result arrays
_LIST_KEYS = (
    "agents", "tasks", "workflows", "sessions", "memories", "models",
    "patterns", "items", "results", "hooks", "plugins", "claims",
    "issues", "nodes", "workers", "collections", "embeddings",
    "checks", "tools", "environments", "deployments",
)


def _auto_display(cmd: str, sub: str, result: dict):
    """Auto-format MCP result into Rich tables or key-value display."""
    ui.console.print()

    # List results -> table
    for key in _LIST_KEYS:
        items = result.get(key)
        if isinstance(items, list) and items:
            if isinstance(items[0], dict):
                cols = list(items[0].keys())[:6]  # Max 6 columns
                rows = [[str(item.get(c, ""))[:40] for c in cols] for item in items]
                ui.show_table(f"{cmd} {sub}", cols, rows)
            else:
                for item in items:
                    ui.console.print(f"  {item}")
            return

    # Raw text output
    raw = result.get("raw", "")
    if raw:
        ui.show_raw(raw)
        return

    # Single object -> key-value table (filter out meta keys)
    display = {k: v for k, v in result.items()
               if k not in ("success", "raw", "error")}
    if display:
        ui.show_kv(f"{cmd} {sub}", display)
    else:
        ui.success(f"{cmd} {sub} completed")


# ---------------------------------------------------------------------------
# Custom handlers — commands that need interactive prompts or special logic
# ---------------------------------------------------------------------------

def _handle_swarm_init(args: dict):
    """Custom swarm init with topology selection."""
    topology = args.get("topology") or ui.choose(
        "Topology", ["hierarchical", "mesh", "hierarchical-mesh", "hybrid"],
    )
    if not topology:
        return
    max_agents = args.get("maxAgents") or Prompt.ask("Max agents", default="8")
    strategy = args.get("strategy") or Prompt.ask("Strategy", default="specialized")
    with ui.spin("Initializing swarm..."):
        result = mcp_exec("swarm_init", {
            "topology": topology,
            "maxAgents": int(max_agents),
            "strategy": strategy,
        })
    if result.get("success") or result.get("swarmId"):
        ui.success(f"Swarm initialized ({topology}, max {max_agents} agents)")
        ui.show_kv("Swarm", result)
    else:
        ui.error(result.get("error", "Swarm init failed"))


def _handle_agent_spawn(args: dict):
    """Custom agent spawn with type selection."""
    AGENT_TYPES = [
        "coder", "researcher", "tester", "reviewer", "architect",
        "coordinator", "analyst", "optimizer", "security-architect",
        "security-auditor", "memory-specialist", "swarm-specialist",
        "performance-engineer", "core-architect", "test-architect",
    ]
    atype = args.get("agentType") or ui.choose("Agent type", AGENT_TYPES)
    if not atype:
        return
    task = args.get("task") or Prompt.ask("Task description (optional)", default="")
    agent_id = args.get("agentId") or Prompt.ask("Agent ID (optional)", default="")
    params: dict = {"agentType": atype}
    if task:
        params["task"] = task
    if agent_id:
        params["agentId"] = agent_id
    with ui.spin(f"Spawning {atype}..."):
        result = mcp_exec("agent_spawn", params)
    aid = result.get("agentId", result.get("id", "?"))
    if result.get("success") or aid != "?":
        ui.success(f"Agent spawned: {aid} ({atype})")
    else:
        ui.error(result.get("error", "Spawn failed"))


def _handle_task_create(args: dict):
    """Custom task create with prompts."""
    TASK_TYPES = [
        "implementation", "testing", "review", "research",
        "debugging", "documentation", "optimization", "feature",
    ]
    ttype = args.get("type") or ui.choose("Task type", TASK_TYPES)
    if not ttype:
        return
    desc = args.get("description") or Prompt.ask("Description")
    if not desc:
        ui.error("No description provided")
        return
    priority = args.get("priority") or Prompt.ask("Priority", default="high")
    with ui.spin("Creating task..."):
        result = mcp_exec("task_create", {
            "type": ttype,
            "description": desc,
            "priority": priority,
        })
    tid = result.get("taskId", result.get("id", "?"))
    if tid != "?":
        ui.success(f"Task created: {tid} ({ttype})")
        ui.info(f"  {desc}")
    else:
        ui.error(result.get("error", "Create failed"))


def _handle_memory_store(args: dict):
    """Custom memory store with prompts."""
    key = args.get("key") or Prompt.ask("Key")
    if not key:
        ui.error("Key required")
        return
    value = args.get("value") or Prompt.ask("Value")
    if not value:
        ui.error("Value required")
        return
    ns = args.get("namespace") or Prompt.ask("Namespace", default="default")
    with ui.spin("Storing..."):
        result = mcp_exec("memory_store", {
            "key": key,
            "value": value,
            "namespace": ns,
        })
    if result.get("success"):
        ui.success(f"Stored: {key} in {ns}")
    else:
        ui.error(result.get("error", "Store failed"))


def _handle_memory_search(args: dict):
    """Custom memory search with prompts."""
    query = args.get("query") or Prompt.ask("Search query")
    if not query:
        ui.error("Query required")
        return
    ns = args.get("namespace") or Prompt.ask("Namespace (optional)", default="")
    limit = args.get("limit") or Prompt.ask("Max results", default="10")
    params: dict = {"query": query, "limit": int(limit)}
    if ns:
        params["namespace"] = ns
    with ui.spin("Searching..."):
        result = mcp_exec("memory_search", params)
    _auto_display("memory", "search", result)


def _handle_hive_mind_init(args: dict):
    """Custom hive-mind init with topology selection."""
    topology = args.get("topology") or ui.choose(
        "Topology", ["mesh", "hierarchical", "ring", "star"],
    )
    if not topology:
        return
    with ui.spin("Initializing hive mind..."):
        result = mcp_exec("hive-mind_init", {"topology": topology})
    if result.get("success") or result.get("hiveMindId"):
        ui.success(f"Hive mind initialized ({topology})")
        ui.show_kv("Hive Mind", result)
    else:
        ui.error(result.get("error", "Init failed"))


def _handle_hive_mind_spawn(args: dict):
    """Custom hive-mind spawn."""
    AGENT_TYPES = [
        "coder", "researcher", "tester", "reviewer", "architect",
        "coordinator", "analyst",
    ]
    ntype = args.get("nodeType") or ui.choose("Node type", AGENT_TYPES)
    if not ntype:
        return
    count = args.get("count") or Prompt.ask("Count", default="1")
    with ui.spin(f"Spawning {count} {ntype} node(s)..."):
        result = mcp_exec("hive-mind_spawn", {
            "nodeType": ntype,
            "count": int(count),
        })
    if result.get("success") or result.get("nodes"):
        ui.success(f"Spawned {count} {ntype} node(s)")
    else:
        ui.error(result.get("error", "Spawn failed"))


def _handle_neural_train(args: dict):
    """Custom neural train with prompts."""
    domain = args.get("domain") or Prompt.ask("Domain")
    if not domain:
        ui.error("Domain required")
        return
    epochs = args.get("epochs") or Prompt.ask("Epochs", default="10")
    with ui.spin(f"Training on '{domain}' ({epochs} epochs)..."):
        result = mcp_exec("neural_train", {
            "domain": domain,
            "epochs": int(epochs),
        })
    if result.get("success") or result.get("modelId"):
        ui.success(f"Training started: {result.get('modelId', 'n/a')}")
        ui.show_kv("Training", result)
    else:
        ui.error(result.get("error", "Training failed"))


def _handle_security_scan(args: dict):
    """Custom security scan with target prompt."""
    target = args.get("target") or Prompt.ask("Target path", default=".")
    with ui.spin(f"Scanning {target}..."):
        result = mcp_exec("aidefence_scan", {"target": target})
    _auto_display("security", "scan", result)


def _handle_embeddings_compare(args: dict):
    """Custom embeddings compare with two-text prompt."""
    text_a = args.get("textA") or Prompt.ask("Text A")
    if not text_a:
        ui.error("Text A required")
        return
    text_b = args.get("textB") or Prompt.ask("Text B")
    if not text_b:
        ui.error("Text B required")
        return
    with ui.spin("Comparing..."):
        result = mcp_exec("embeddings_compare", {
            "textA": text_a,
            "textB": text_b,
        })
    _auto_display("embeddings", "compare", result)


def _handle_config_set(args: dict):
    """Custom config set with key/value prompt."""
    key = args.get("key") or Prompt.ask("Config key")
    if not key:
        ui.error("Key required")
        return
    value = args.get("value") or Prompt.ask(f"Value for {key}")
    if not value:
        ui.error("Value required")
        return
    with ui.spin(f"Setting {key}..."):
        result = mcp_exec("config_set", {"key": key, "value": value})
    if result.get("success"):
        ui.success(f"Set {key} = {value}")
    else:
        ui.error(result.get("error", "Set failed"))


def _handle_hooks_route(args: dict):
    """Custom hooks route with task prompt."""
    task = args.get("task") or Prompt.ask("Task description")
    if not task:
        ui.error("Task required")
        return
    with ui.spin("Routing task..."):
        result = mcp_exec("hooks_route", {"task": task})
    model = result.get("model", result.get("recommendation", ""))
    tier = result.get("tier", "")
    if model:
        ui.success(f"Routed to: {model}" + (f" (tier {tier})" if tier else ""))
        display = {k: v for k, v in result.items()
                   if k not in ("success", "raw", "error")}
        if display:
            ui.show_kv("Route Decision", display)
    else:
        _auto_display("hooks", "route", result)


def _handle_doctor_run(args: dict):
    """Run all health checks via system_health."""
    with ui.spin("Running health checks..."):
        result = mcp_exec("system_health", None)
    checks = result.get("checks", [])
    if checks:
        cols = ["name", "status", "message"]
        rows = []
        for c in checks:
            if isinstance(c, dict):
                rows.append([
                    str(c.get("name", "")),
                    str(c.get("status", "")),
                    str(c.get("message", ""))[:50],
                ])
        if rows:
            ui.show_table("Health Checks", cols, rows)
            return
    _auto_display("doctor", "run", result)


# ---------------------------------------------------------------------------
# Handler registry — maps "cmd_sub" to custom handler function
# ---------------------------------------------------------------------------

CUSTOM_HANDLERS: dict[str, Callable[..., None]] = {
    "swarm_init":        _handle_swarm_init,
    "agent_spawn":       _handle_agent_spawn,
    "task_create":       _handle_task_create,
    "memory_store":      _handle_memory_store,
    "memory_search":     _handle_memory_search,
    "hive-mind_init":    _handle_hive_mind_init,
    "hive-mind_spawn":   _handle_hive_mind_spawn,
    "neural_train":      _handle_neural_train,
    "security_scan":     _handle_security_scan,
    "security_audit":    _handle_security_scan,   # Same handler
    "embeddings_compare": _handle_embeddings_compare,
    "config_set":        _handle_config_set,
    "hooks_route":       _handle_hooks_route,
    "hooks_coverage-route": _handle_hooks_route,   # Same handler
    "hooks_model-route": _handle_hooks_route,      # Same handler
    "doctor_run":        _handle_doctor_run,
    "doctor_--fix":      _handle_doctor_run,       # Same handler
}
