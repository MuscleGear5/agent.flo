"""Generic handler system that routes commands to MCP tools.

The handler first checks CUSTOM_HANDLERS for commands that need special
interactive treatment (e.g. agent spawn, swarm start).  Everything else goes
through the generic path: look up the MCP tool name in COMMANDS, optionally
prompt for missing parameters, call mcp_exec, and auto-format the result.
"""

from __future__ import annotations

import importlib
import os
import sys
import time
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
# CLI passthrough — commands that have proper CLI output but no/wrong MCP tool
# ---------------------------------------------------------------------------
# These commands are routed through `ruflo_run` (direct CLI) instead of
# `mcp_exec` because the CLI has rich formatted output while the MCP tool
# either doesn't exist or returns wrong/minimal data.

_CLI_PASSTHROUGH: frozenset[str] = frozenset({
    "providers_list", "providers_test", "providers_models", "providers_usage",
    "providers_configure",
    "security_scan", "security_cve", "security_threats", "security_audit",
    "security_secrets", "security_defend",
    "doctor_run", "doctor_--fix", "doctor_--install",
    "init_check",
    "daemon_start", "daemon_stop", "daemon_status", "daemon_restart",
    "daemon_logs", "daemon_enable",
    "neural_autosetup",
})

# Commands that define params but work fine with no args (params are optional filters)
_OPTIONAL_PARAMS: frozenset[str] = frozenset({
    "neural_patterns", "neural_benchmark", "neural_optimize", "neural_list",
    "embeddings_status", "embeddings_init",
    "performance_metrics", "performance_benchmark", "performance_bottleneck",
    "analyze_code", "analyze_deps", "analyze_complexity", "analyze_imports",
    "analyze_circular", "analyze_boundaries", "analyze_modules",
    "analyze_dependencies",
    "hooks_metrics", "hooks_list", "hooks_intelligence",
    "memory_list", "memory_stats",
    "session_list", "session_current",
    "plugins_list", "claims_list", "issues_list",
    "guidance_status",
})


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_command(cmd: str, sub: str, extra_args: list[str] | None = None,
                args: dict | None = None):
    """Route command to appropriate handler or generic MCP call.

    Priority: custom handler > CLI passthrough > generic MCP.
    """
    handler_key = f"{cmd}_{sub}"

    # 1. Check for custom handler first
    custom = CUSTOM_HANDLERS.get(handler_key)
    if custom:
        custom(args or _args_from_list(cmd, sub, extra_args))
        return

    # 2. CLI passthrough — use ruflo CLI directly (rich formatted output)
    if handler_key in _CLI_PASSTHROUGH:
        cli_args = []
        if extra_args:
            cli_args.extend(extra_args)
        if args:
            for k, v in args.items():
                if k.startswith("_"):
                    continue
                cli_args.extend([f"--{k}", str(v)])
        with ui.spin(f"Running {cmd} {sub}..."):
            result = ruflo_run(cmd, sub, *cli_args, timeout=30)
        raw = result.get("raw", "")
        if raw:
            ui.console.print(raw)
        elif result.get("error"):
            ui.error(result["error"])
        else:
            _auto_display(cmd, sub, result)
        return

    # 3. Generic MCP handler
    cmd_def = COMMANDS.get(cmd, {}).get("subs", {}).get(sub)
    if not cmd_def:
        ui.error(f"Unknown command: {cmd} {sub}")
        return

    tool = cmd_def["tool"]
    params = args or _args_from_list(cmd, sub, extra_args)

    # If command needs params and none provided, prompt interactively
    # Skip prompting for commands with all-optional params or when not on a TTY
    if not params and "params" in cmd_def:
        handler_key = f"{cmd}_{sub}"
        if handler_key not in _OPTIONAL_PARAMS:
            if sys.stdin.isatty():
                params = _prompt_params(cmd_def)
                if params is None:  # User cancelled
                    return
            else:
                params = {}

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
    """Interactively prompt for parameters.

    The FIRST parameter is required (empty = cancel).  Subsequent parameters
    are optional -- empty input skips them rather than cancelling.
    Returns empty dict if stdin is not a TTY.
    """
    if not sys.stdin.isatty():
        return {}
    params: dict = {}
    param_list = cmd_def.get("params", [])
    for i, p in enumerate(param_list):
        try:
            if i == 0:
                val = Prompt.ask(f"  {p}")
                if not val:
                    return None
                params[p] = val
            else:
                val = Prompt.ask(f"  {p} (optional)", default="")
                if val:
                    params[p] = val
        except EOFError:
            return params if params else {}
    return params


# ---------------------------------------------------------------------------
# Dynamic ID pickers -- fetch live data from MCP and present selection
# ---------------------------------------------------------------------------

def _pick_agent(label: str = "Select agent") -> str | None:
    """Fetch agent list via MCP, present picker, return selected agent ID."""
    result = mcp_exec("agent_list")
    agents = result.get("agents", [])
    if not agents:
        ui.warn("No agents found")
        return None
    choices: list[str] = []
    for a in agents:
        aid = a.get("agentId", a.get("id", "?"))
        status = a.get("status", "?")
        atype = a.get("agentType", a.get("type", "?"))
        choices.append(f"{aid}  [{status}]  {atype}")
    sel = ui.choose(label, choices)
    if not sel:
        return None
    return sel.split()[0]  # Extract ID from "id  [status]  type"


def _pick_task(label: str = "Select task") -> str | None:
    """Fetch task list via MCP, present picker, return selected task ID."""
    result = mcp_exec("task_list")
    tasks = result.get("tasks", [])
    if not tasks:
        ui.warn("No tasks found")
        return None
    choices: list[str] = []
    for t in tasks:
        tid = t.get("taskId", t.get("id", "?"))
        status = t.get("status", "?")
        desc = str(t.get("description", ""))[:40]
        choices.append(f"{tid}  [{status}]  {desc}")
    sel = ui.choose(label, choices)
    if not sel:
        return None
    return sel.split()[0]


def _pick_session(label: str = "Select session") -> str | None:
    """Fetch session list, present picker."""
    result = mcp_exec("session_list")
    sessions = result.get("sessions", [])
    if not sessions:
        ui.warn("No sessions found")
        return None
    choices: list[str] = []
    for s in sessions:
        sid = s.get("sessionId", s.get("id", "?"))
        name = s.get("name", "")
        status = s.get("status", "?")
        choices.append(f"{sid}  [{status}]  {name}")
    sel = ui.choose(label, choices)
    if not sel:
        return None
    return sel.split()[0]


def _pick_agents_multi(label: str = "Select agents") -> list[str]:
    """Fetch agent list, present multi-select picker, return list of IDs."""
    result = mcp_exec("agent_list")
    agents = result.get("agents", [])
    if not agents:
        ui.warn("No agents found")
        return []
    choices: list[str] = []
    for a in agents:
        aid = a.get("agentId", a.get("id", "?"))
        status = a.get("status", "?")
        atype = a.get("agentType", a.get("type", "?"))
        choices.append(f"{aid}  [{status}]  {atype}")
    selected = ui.multi_choose(label, choices)
    return [s.split()[0] for s in selected]


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

# Meta keys to filter out of list-table columns
_META_KEYS = frozenset({"success", "raw", "error", "warning", "_extra"})


def _auto_display(cmd: str, sub: str, result: dict):
    """Auto-format MCP result into Rich tables or key-value display."""
    ui.console.print()

    # Collect ALL list keys that have data (handle multiple lists in one result)
    displayed = False
    for key in _LIST_KEYS:
        items = result.get(key)
        if isinstance(items, list) and items:
            if isinstance(items[0], dict):
                # Filter meta keys from columns
                cols = [c for c in items[0].keys() if c not in _META_KEYS][:6]
                rows = [[str(item.get(c, ""))[:40] for c in cols] for item in items]
                ui.show_table(f"{cmd} {sub} ({key})", cols, rows)
            else:
                for item in items:
                    ui.console.print(f"  {item}")
            displayed = True

    if displayed:
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
# Custom handlers -- commands that need interactive prompts or special logic
# ---------------------------------------------------------------------------

# ── Swarm ──────────────────────────────────────────────────────────────────

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


def _handle_swarm_start(args: dict):
    """Multi-step swarm start: objective -> multi-select types -> init -> spawn -> task."""
    # 1. Prompt objective
    objective = args.get("objective") or Prompt.ask("Swarm objective")
    if not objective:
        ui.error("No objective provided")
        return

    # 2. Multi-select agent types
    AGENT_TYPES = [
        "coder", "researcher", "tester", "reviewer", "architect",
        "coordinator", "analyst", "optimizer", "security-architect",
        "security-auditor", "memory-specialist", "swarm-specialist",
        "performance-engineer", "core-architect", "test-architect",
    ]
    selected_types = args.get("types")
    if selected_types and isinstance(selected_types, str):
        selected_types = [t.strip() for t in selected_types.split(",")]
    if not selected_types:
        selected_types = ui.multi_choose("Select agent types", AGENT_TYPES)
    if not selected_types:
        ui.warn("No agent types selected")
        return

    agent_count = len(selected_types)

    # 3. Initialize swarm
    with ui.spin(f"Initializing swarm ({agent_count} agents)..."):
        init_result = mcp_exec("swarm_init", {
            "topology": "hierarchical-mesh",
            "maxAgents": agent_count,
            "strategy": "specialized",
            "objective": objective,
        })
    swarm_id = init_result.get("swarmId", init_result.get("id", ""))
    if not swarm_id:
        ui.error(init_result.get("error", "Swarm init failed"))
        return
    ui.success(f"Swarm: {swarm_id}")

    # 4. Spawn each agent type
    tag = swarm_id.rsplit("-", 1)[-1] if "-" in swarm_id else swarm_id[:8]
    spawned = 0
    for atype in selected_types:
        aid = f"swarm-{tag}-{atype}"
        with ui.spin(f"Spawning {atype}..."):
            spawn_result = mcp_exec("agent_spawn", {
                "agentType": atype,
                "agentId": aid,
                "task": objective,
            })
        if spawn_result.get("success") or spawn_result.get("agentId"):
            ui.success(f"{aid} ({atype})")
            spawned += 1
        else:
            ui.error(f"{atype} spawn failed")

    # 5. Create task for the objective
    with ui.spin("Creating task..."):
        task_result = mcp_exec("task_create", {
            "type": "feature",
            "description": objective,
            "priority": "high",
        })
    tid = task_result.get("taskId", task_result.get("id", ""))
    if tid:
        ui.success(f"Task: {tid}")

    ui.console.print()
    ui.success(f"Swarm ready: {spawned}/{agent_count} agents deployed")
    ui.info("  Monitor: rfl swarm status")
    ui.info("  Agents:  rfl agent list")


# ── Agent ──────────────────────────────────────────────────────────────────

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


def _handle_agent_status(args: dict):
    """Agent status with picker."""
    aid = args.get("agentId") or _pick_agent("Agent status")
    if not aid:
        return
    with ui.spin(f"Getting status for {aid}..."):
        result = mcp_exec("agent_status", {"agentId": aid})
    _auto_display("agent", "status", result)


def _handle_agent_stop(args: dict):
    """Agent stop with picker."""
    aid = args.get("agentId") or _pick_agent("Stop agent")
    if not aid:
        return
    with ui.spin(f"Stopping {aid}..."):
        result = mcp_exec("agent_terminate", {"agentId": aid})
    if result.get("success"):
        ui.success(f"Agent {aid} stopped")
    else:
        ui.error(result.get("error", f"Failed to stop {aid}"))


def _handle_agent_metrics(args: dict):
    """Agent metrics with picker."""
    aid = args.get("agentId") or _pick_agent("Agent metrics")
    if not aid:
        return
    with ui.spin(f"Getting metrics for {aid}..."):
        result = mcp_exec("system_metrics", {"agentId": aid})
    _auto_display("agent", "metrics", result)


def _handle_agent_logs(args: dict):
    """Agent logs with picker."""
    aid = args.get("agentId") or _pick_agent("Agent logs")
    if not aid:
        return
    with ui.spin(f"Getting logs for {aid}..."):
        result = mcp_exec("agent_status", {"agentId": aid})
    _auto_display("agent", "logs", result)


def _handle_agent_health(args: dict):
    """Agent health with picker."""
    aid = args.get("agentId") or _pick_agent("Agent health")
    if not aid:
        return
    with ui.spin(f"Checking health for {aid}..."):
        result = mcp_exec("agent_health", {"agentId": aid})
    _auto_display("agent", "health", result)


# ── Task ───────────────────────────────────────────────────────────────────

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


def _handle_task_status(args: dict):
    """Task status with picker."""
    tid = args.get("taskId") or _pick_task("Task status")
    if not tid:
        return
    with ui.spin(f"Getting status for {tid}..."):
        result = mcp_exec("task_status", {"taskId": tid})
    _auto_display("task", "status", result)


def _handle_task_cancel(args: dict):
    """Task cancel with picker."""
    tid = args.get("taskId") or _pick_task("Cancel task")
    if not tid:
        return
    with ui.spin(f"Cancelling {tid}..."):
        result = mcp_exec("task_cancel", {"taskId": tid})
    if result.get("success"):
        ui.success(f"Task {tid} cancelled")
    else:
        ui.error(result.get("error", f"Failed to cancel {tid}"))


def _handle_task_retry(args: dict):
    """Task retry with picker."""
    tid = args.get("taskId") or _pick_task("Retry task")
    if not tid:
        return
    with ui.spin(f"Retrying {tid}..."):
        result = mcp_exec("task_execute", {"taskId": tid})
    if result.get("success"):
        ui.success(f"Task {tid} retried")
    else:
        ui.error(result.get("error", f"Failed to retry {tid}"))


def _handle_task_complete(args: dict):
    """Task complete with picker."""
    tid = args.get("taskId") or _pick_task("Complete task")
    if not tid:
        return
    with ui.spin(f"Completing {tid}..."):
        result = mcp_exec("task_complete", {"taskId": tid})
    if result.get("success"):
        ui.success(f"Task {tid} completed")
    else:
        ui.error(result.get("error", f"Failed to complete {tid}"))


def _handle_task_assign(args: dict):
    """Task assign with picker for both task and agent. Sends agentIds as list."""
    tid = args.get("taskId") or _pick_task("Assign task")
    if not tid:
        return
    # Accept agentIds as list or string
    agent_ids = args.get("agentIds")
    if isinstance(agent_ids, str):
        agent_ids = [agent_ids]
    if not agent_ids:
        aid = _pick_agent("Assign to agent")
        if not aid:
            return
        agent_ids = [aid]
    with ui.spin(f"Assigning {tid} to {', '.join(agent_ids)}..."):
        result = mcp_exec("task_assign", {
            "taskId": tid,
            "agentIds": agent_ids,  # Always a list
        })
    if result.get("success"):
        ui.success(f"Task {tid} assigned to {', '.join(agent_ids)}")
    else:
        ui.error(result.get("error", "Assign failed"))


# ── Session ────────────────────────────────────────────────────────────────

def _handle_session_restore(args: dict):
    """Session restore with picker."""
    sid = args.get("sessionId") or _pick_session("Restore session")
    if not sid:
        return
    with ui.spin(f"Restoring session {sid}..."):
        result = mcp_exec("session_restore", {"sessionId": sid})
    if result.get("success"):
        ui.success(f"Session {sid} restored")
    else:
        ui.error(result.get("error", f"Failed to restore {sid}"))


def _handle_session_delete(args: dict):
    """Session delete with picker."""
    sid = args.get("sessionId") or _pick_session("Delete session")
    if not sid:
        return
    if not Confirm.ask(f"Delete session {sid}?", default=False):
        return
    with ui.spin(f"Deleting session {sid}..."):
        result = mcp_exec("session_delete", {"sessionId": sid})
    if result.get("success"):
        ui.success(f"Session {sid} deleted")
    else:
        ui.error(result.get("error", f"Failed to delete {sid}"))


def _handle_session_export(args: dict):
    """Session export with picker."""
    sid = args.get("sessionId") or _pick_session("Export session")
    if not sid:
        return
    with ui.spin(f"Exporting session {sid}..."):
        result = mcp_exec("session_info", {"sessionId": sid})
    _auto_display("session", "export", result)


# ── Memory ─────────────────────────────────────────────────────────────────

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


# ── Hive-Mind ──────────────────────────────────────────────────────────────

def _hive_spawn_agent(atype: str) -> str | None:
    """Spawn a single agent into the hive: agent_spawn + hive-mind_join +
    coordination_node.  Returns the agent ID on success, None on failure.

    Ported from _rfl_hive_spawn (swarm.zsh).
    """
    rand_hex = os.urandom(4).hex()
    ts = int(time.time())
    aid = f"hive-{atype}-{ts}-{rand_hex}"
    with ui.spin(f"Spawning {atype}..."):
        spawn_result = mcp_exec("agent_spawn", {
            "agentType": atype,
            "agentId": aid,
        })
    if spawn_result.get("success") or spawn_result.get("agentId"):
        # Join hive
        mcp_exec("hive-mind_join", {"agentId": aid})
        # Register as worker in coordination
        mcp_exec("coordination_node", {
            "nodeId": aid,
            "role": "worker",
            "capabilities": [atype],
        })
        ui.success(f"{aid} ({atype})")
        return aid
    return None


def _handle_hive_mind_init(args: dict):
    """Full hive-mind setup: topology -> init -> spawn agents -> join ->
    designate queen -> set coordination topology -> sync.

    Ported from _rfl_hive_start (swarm.zsh).
    """
    # 1. Choose topology
    topology = args.get("topology") or ui.choose(
        "Topology", ["mesh", "hierarchical", "hierarchical-mesh", "ring", "star"],
    )
    if not topology:
        return

    # 2. Initialize hive-mind
    with ui.spin(f"Initializing hive-mind ({topology})..."):
        result = mcp_exec("hive-mind_init", {"topology": topology})
    if not (result.get("success") or result.get("hiveMindId")):
        ui.error(result.get("error", "Hive-mind init failed"))
        return
    ui.success(f"Hive-mind initialized ({topology})")

    # 3. Multi-select agent types to spawn
    AGENT_TYPES = [
        "coder", "researcher", "tester", "reviewer", "architect",
        "coordinator", "analyst", "optimizer",
    ]
    selected_types = ui.multi_choose("Spawn agents into hive?", AGENT_TYPES)
    if not selected_types:
        ui.info("Hive initialized, no agents. Use hive-mind spawn/join.")
        return

    # 4. Spawn each agent via _handle_hive_mind_spawn logic (spawn + join + coordination)
    spawned = 0
    queen_id = ""
    agent_ids: list[str] = []
    for atype in selected_types:
        aid = _hive_spawn_agent(atype)
        if aid:
            agent_ids.append(aid)
            spawned += 1
            # First coordinator/architect becomes queen candidate
            if not queen_id and atype in ("coordinator", "architect"):
                queen_id = aid
        else:
            ui.error(f"{atype} spawn failed")

    # 5. If no coordinator was picked, fallback: query agent_list for last hive- agent
    if not queen_id and agent_ids:
        queen_id = agent_ids[0]
    if queen_id:
        mcp_exec("coordination_node", {
            "nodeId": queen_id,
            "role": "queen",
            "capabilities": ["coordinate", "assign", "monitor"],
        })
        ui.info(f"  Queen: {queen_id}")

    # 6. Set coordination topology and sync
    mcp_exec("coordination_topology", {
        "topology": topology,
        "queen": queen_id or "",
    })
    mcp_exec("coordination_sync", {"action": "sync"})

    ui.console.print()
    ui.success(f"Hive ready: {spawned} agents, queen assigned")


def _handle_hive_mind_spawn(args: dict):
    """Full hive-mind spawn: choose type -> agent_spawn + hive-mind_join +
    coordination_node for each agent.

    Ported from _rfl_hive_spawn (swarm.zsh).
    """
    AGENT_TYPES = [
        "coder", "researcher", "tester", "reviewer", "architect",
        "coordinator", "analyst", "optimizer",
    ]
    ntype = args.get("nodeType") or args.get("agentType") or ui.choose(
        "Agent type", AGENT_TYPES,
    )
    if not ntype:
        return
    count_str = args.get("count") or Prompt.ask("Count", default="1")
    count = int(count_str)

    spawned = 0
    for _ in range(count):
        aid = _hive_spawn_agent(ntype)
        if aid:
            spawned += 1

    if spawned:
        ui.success(f"Spawned {spawned}/{count} {ntype} node(s) into hive")
    else:
        ui.error(f"All {count} {ntype} spawn(s) failed")


def _handle_hive_mind_task(args: dict):
    """Multi-step hive-mind task: create task -> find idle agent -> assign ->
    broadcast -> orchestrate."""
    # 1. Prompt description
    desc = args.get("description") or Prompt.ask("Task description")
    if not desc:
        ui.error("No description provided")
        return

    # 2. Create task
    with ui.spin("Creating task..."):
        task_result = mcp_exec("task_create", {
            "type": "feature",
            "description": desc,
            "priority": "high",
        })
    tid = task_result.get("taskId", task_result.get("id", ""))
    if not tid:
        ui.error(task_result.get("error", "Task creation failed"))
        return
    ui.success(f"Task: {tid}")

    # 3. Find idle/active agent and assign
    agent_result = mcp_exec("agent_list")
    agents = agent_result.get("agents", [])
    assignee = ""
    for a in agents:
        if a.get("status") in ("idle", "active"):
            assignee = a.get("agentId", a.get("id", ""))
            if assignee:
                break
    if assignee:
        with ui.spin(f"Assigning to {assignee}..."):
            mcp_exec("task_assign", {
                "taskId": tid,
                "agentIds": [assignee],  # List, not string
            })
        ui.success(f"Assigned to: {assignee}")

    # 4. Broadcast to hive
    mcp_exec("hive-mind_broadcast", {
        "message": f"task: {desc}",
        "taskId": tid,
        "type": "task",
    })
    ui.success("Broadcast to hive")

    # 5. Orchestrate
    with ui.spin("Orchestrating..."):
        orch_result = mcp_exec("coordination_orchestrate", {
            "taskId": tid,
            "strategy": "auto",
            "description": desc,
        })
    if orch_result.get("success"):
        ui.success("Orchestration started")
    else:
        ui.info("Orchestration queued")

    ui.console.print()
    ui.success(f"Task {tid} dispatched")
    ui.info(f"  {desc}")


def _handle_hive_mind_broadcast(args: dict):
    """Multi-step broadcast: send message -> store in hive memory -> sync."""
    msg = args.get("message") or Prompt.ask("Broadcast message")
    if not msg:
        ui.error("No message provided")
        return

    # 1. Broadcast to hive
    with ui.spin("Broadcasting..."):
        result = mcp_exec("hive-mind_broadcast", {"message": msg})
    if not (result.get("success")):
        ui.error(result.get("error", "Broadcast failed"))
        return
    ui.success("Broadcast sent to hive")

    # 2. Store in hive memory
    ts = int(time.time())
    mcp_exec("hive-mind_memory", {
        "action": "store",
        "key": f"broadcast-{ts}",
        "value": msg,
    })

    # 3. Sync coordination
    mcp_exec("coordination_sync", {
        "action": "broadcast",
        "message": msg,
    })
    ui.success("Stored in hive memory + coordination synced")
    ui.info(f"  {msg}")


def _handle_hive_mind_join(args: dict):
    """Multi-step join: multi-pick agents -> join each to hive + register
    coordination node -> sync."""
    agent_ids = args.get("agentIds")
    if isinstance(agent_ids, str):
        agent_ids = [a.strip() for a in agent_ids.split(",") if a.strip()]
    if not agent_ids:
        agent_ids = _pick_agents_multi("Join agents to hive")
    if not agent_ids:
        return

    joined = 0
    for aid in agent_ids:
        with ui.spin(f"Joining {aid}..."):
            result = mcp_exec("hive-mind_join", {"agentId": aid})
        if result.get("success"):
            mcp_exec("coordination_node", {"nodeId": aid, "role": "worker"})
            ui.success(f"{aid} joined hive + coordination")
            joined += 1
        else:
            ui.error(f"{aid} join failed")

    if joined > 0:
        mcp_exec("coordination_sync", {"action": "sync"})
        ui.success(f"{joined} agent(s) joined hive, coordination synced")


def _handle_hive_mind_leave(args: dict):
    """Multi-pick agents to remove from hive."""
    agent_ids = args.get("agentIds")
    if isinstance(agent_ids, str):
        agent_ids = [a.strip() for a in agent_ids.split(",") if a.strip()]
    if not agent_ids:
        agent_ids = _pick_agents_multi("Remove agents from hive")
    if not agent_ids:
        return

    left = 0
    for aid in agent_ids:
        with ui.spin(f"Removing {aid}..."):
            result = mcp_exec("hive-mind_leave", {"agentId": aid})
        if result.get("success"):
            ui.success(f"{aid} left hive")
            left += 1
        else:
            ui.error(f"{aid} leave failed")

    if left > 0:
        ui.success(f"{left} agent(s) left hive")


def _handle_hive_mind_status(args: dict):
    """Multi-tool aggregation: hive-mind_status + agent_list, filtered to
    hive agents only, displayed as KV table + agent list table.

    Ported from h-hive.zsh status handler.
    """
    # 1. Fetch hive-mind status
    with ui.spin("Loading hive..."):
        hm = mcp_exec("hive-mind_status")
    # 2. Fetch agent list
    with ui.spin("Loading agents..."):
        pool = mcp_exec("agent_list")

    ui.console.print()

    # 3. Display hive status as KV table
    if hm:
        kv: dict = {}
        for key, label in [
            ("swarmId", "Hive"), ("status", "Status"),
            ("topology", "Topology"), ("agentCount", "Agents"),
        ]:
            val = hm.get(key, "")
            if val is not None and val != "":
                kv[label] = str(val)
        if kv:
            ui.show_kv("Hive-Mind Status", kv)
            ui.console.print()

    # 4. Display agents, filtering out unknown/worker ghosts
    all_agents = pool.get("agents", [])
    agents = [
        a for a in all_agents
        if not (a.get("status", "") == "unknown"
                and a.get("agentType", a.get("type", "")) == "worker")
    ]
    if agents:
        rows = [
            [
                str(a.get("status", "?")),
                a.get("agentType", a.get("type", "?")),
                a.get("agentId", a.get("id", "?")),
            ]
            for a in agents
        ]
        ui.show_table("Hive Agents", ["Status", "Type", "ID"], rows)
    else:
        ui.info("  (no agents)")


def _handle_hive_mind_consensus(args: dict):
    """Run consensus protocol on a topic and display Decision/Votes/Confidence.

    Ported from h-hive2.zsh consensus handler.
    """
    topic = args.get("topic") or Prompt.ask("Consensus topic")
    if not topic:
        ui.error("No topic provided")
        return

    ui.info(f"Running consensus on: {topic}")
    with ui.spin("Running consensus..."):
        result = mcp_exec("hive-mind_consensus", {"topic": topic})

    if not result:
        ui.error("No response from consensus")
        return

    kv: dict = {}
    decision = result.get("decision", result.get("result", "pending"))
    kv["Decision"] = str(decision)
    votes = result.get("votes", result.get("participants", "?"))
    kv["Votes"] = str(votes)
    confidence = result.get("confidence", result.get("agreement", ""))
    if confidence:
        kv["Confidence"] = str(confidence)

    ui.show_kv("Consensus Result", kv)


def _handle_hive_mind_memory(args: dict):
    """List hive shared memory as Key/Value table.

    Ported from h-hive2.zsh memory handler.
    """
    ui.console.print()
    with ui.spin("Loading hive memory..."):
        result = mcp_exec("hive-mind_memory", {"action": "list"})

    if not result:
        ui.info("  (empty)")
        return

    mems = result.get("memories", result.get("items", result.get("entries", [])))
    if not mems:
        ui.info("  (empty)")
        return

    rows: list[list[str]] = []
    for m in mems:
        if isinstance(m, dict):
            k = m.get("key", m.get("id", "?"))
            v = str(m.get("value", m.get("content", "")))[:80]
            rows.append([k, v])
        else:
            rows.append([str(m), ""])

    if rows:
        ui.show_table("Hive Memory", ["Key", "Value"], rows)
    else:
        ui.info("  (empty)")


def _handle_hive_mind_optimize_memory(args: dict):
    """Optimize hive shared memory.

    Ported from h-hive2.zsh optimize-memory handler.
    """
    with ui.spin("Optimizing hive memory..."):
        result = mcp_exec("hive-mind_memory", {"action": "optimize"})
    if result.get("success"):
        ui.success("Hive memory optimized")
    else:
        ui.error(result.get("error", "Optimization failed"))


def _handle_hive_mind_shutdown(args: dict):
    """Shut down the hive-mind after user confirmation.

    Ported from h-hive2.zsh shutdown handler.
    """
    if not ui.confirm("Shut down hive-mind?", default=False):
        return
    with ui.spin("Shutting down hive-mind..."):
        result = mcp_exec("hive-mind_shutdown")
    if result.get("success"):
        ui.success("Hive-mind shut down")
    else:
        ui.error(result.get("error", "Shutdown failed"))


# ── Neural ─────────────────────────────────────────────────────────────────

def _handle_neural_train(args: dict):
    """Custom neural train with correct params: type, epochs, batchSize, learningRate."""
    MODEL_TYPES = ["transformer", "moe", "classifier", "embedding"]
    mtype = args.get("type") or ui.choose("Model type", MODEL_TYPES)
    if not mtype:
        return
    epochs = args.get("epochs") or Prompt.ask("Epochs", default="10")
    batch_size = args.get("batchSize") or Prompt.ask("Batch size", default="32")
    lr = args.get("learningRate") or Prompt.ask("Learning rate", default="0.001")
    params: dict = {
        "type": mtype,
        "epochs": int(epochs),
        "batchSize": int(batch_size),
        "learningRate": float(lr),
    }
    with ui.spin(f"Training {mtype} ({epochs} epochs)..."):
        result = mcp_exec("neural_train", params)
    if result.get("success") or result.get("modelId"):
        ui.success(f"Training started: {result.get('modelId', 'n/a')}")
        ui.show_kv("Training", result)
    else:
        ui.error(result.get("error", "Training failed"))


# ── Security ───────────────────────────────────────────────────────────────

def _handle_security_scan(args: dict):
    """Custom security scan with target prompt."""
    target = args.get("target") or Prompt.ask("Target path", default=".")
    with ui.spin(f"Scanning {target}..."):
        result = mcp_exec("aidefence_scan", {"target": target})
    _auto_display("security", "scan", result)


# ── Embeddings ─────────────────────────────────────────────────────────────

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


# ── Config ─────────────────────────────────────────────────────────────────

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


# ── Hooks ──────────────────────────────────────────────────────────────────

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


# ── Doctor ─────────────────────────────────────────────────────────────────

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
# Handler registry -- maps "cmd_sub" to custom handler function
# ---------------------------------------------------------------------------

CUSTOM_HANDLERS: dict[str, Callable[..., None]] = {
    # Swarm
    "swarm_init":              _handle_swarm_init,
    "swarm_start":             _handle_swarm_start,
    # Agent
    "agent_spawn":             _handle_agent_spawn,
    "agent_status":            _handle_agent_status,
    "agent_stop":              _handle_agent_stop,
    "agent_metrics":           _handle_agent_metrics,
    "agent_logs":              _handle_agent_logs,
    "agent_health":            _handle_agent_health,
    # Task
    "task_create":             _handle_task_create,
    "task_status":             _handle_task_status,
    "task_cancel":             _handle_task_cancel,
    "task_retry":              _handle_task_retry,
    "task_complete":           _handle_task_complete,
    "task_assign":             _handle_task_assign,
    # Session
    "session_restore":         _handle_session_restore,
    "session_delete":          _handle_session_delete,
    "session_export":          _handle_session_export,
    # Memory
    "memory_store":            _handle_memory_store,
    "memory_search":           _handle_memory_search,
    # Hive-mind
    "hive-mind_init":          _handle_hive_mind_init,
    "hive-mind_start":         _handle_hive_mind_init,
    "hive-mind_spawn":         _handle_hive_mind_spawn,
    "hive-mind_status":        _handle_hive_mind_status,
    "hive-mind_task":          _handle_hive_mind_task,
    "hive-mind_broadcast":     _handle_hive_mind_broadcast,
    "hive-mind_join":          _handle_hive_mind_join,
    "hive-mind_leave":         _handle_hive_mind_leave,
    "hive-mind_consensus":     _handle_hive_mind_consensus,
    "hive-mind_memory":        _handle_hive_mind_memory,
    "hive-mind_optimize-memory": _handle_hive_mind_optimize_memory,
    "hive-mind_shutdown":      _handle_hive_mind_shutdown,
    # Neural
    "neural_train":            _handle_neural_train,
    # Security — handled by CLI passthrough, but keep audit as custom
    # "security_scan" and "security_audit" routed via _CLI_PASSTHROUGH
    # Embeddings
    "embeddings_compare":      _handle_embeddings_compare,
    # Config
    "config_set":              _handle_config_set,
    # Hooks
    "hooks_route":             _handle_hooks_route,
    "hooks_coverage-route":    _handle_hooks_route,
    "hooks_model-route":       _handle_hooks_route,
    # Doctor — handled by CLI passthrough
    # "doctor_run" and "doctor_--fix" routed via _CLI_PASSTHROUGH
}
