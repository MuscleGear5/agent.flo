"""Command handlers — dispatch and interactive argument collection."""

from __future__ import annotations

import importlib
import sys

_pkg = __name__.rsplit(".", 1)[0]
ui = importlib.import_module(".ui", _pkg)
_mcp = importlib.import_module(".mcp", _pkg)
ruflo_run = _mcp.ruflo_run


def run_command(cmd: str, sub: str, extra_args: list[str] | None = None):
    """Execute a ruflo command, prompting for args if needed in interactive mode."""
    args = extra_args or []

    # If no extra args provided, try to collect them interactively
    if not args:
        args = _collect_args(cmd, sub)
        if args is None:
            # User cancelled
            return

    with ui.spin(f"Running ruflo {cmd} {sub}..."):
        result = ruflo_run(cmd, sub, *args)

    if not result.get("success", False):
        err = result.get("error", "Unknown error")
        ui.error(err)
        raw = result.get("raw", "")
        if raw:
            ui.show_raw(raw)
        return

    # Display result
    raw = result.get("raw", "")
    if raw:
        ui.show_raw(raw)
    else:
        # Filter out meta keys and display structured data
        display = {k: v for k, v in result.items() if k not in ("success", "raw")}
        if display:
            ui.show_kv(f"ruflo {cmd} {sub}", display)
        else:
            ui.success(f"{cmd} {sub} completed")


def _collect_args(cmd: str, sub: str) -> list[str] | None:
    """Interactively collect arguments for a command. Returns None on cancel."""
    key = f"{cmd}:{sub}"

    # ── agent ──
    if key == "agent:spawn":
        types = ["coder", "researcher", "tester", "reviewer", "architect",
                 "coordinator", "analyst", "optimizer", "security-architect",
                 "security-auditor", "memory-specialist", "swarm-specialist",
                 "performance-engineer", "core-architect", "test-architect"]
        atype = ui.choose("Agent type", types)
        if not atype:
            return None
        args = ["-t", atype]
        name = ui.prompt("Agent name (optional, enter to skip)", default="")
        if name:
            args += ["--name", name]
        return args

    if key in ("agent:status", "agent:stop", "agent:metrics", "agent:logs"):
        agent_id = ui.prompt("Agent ID")
        return [agent_id] if agent_id else None

    if key == "agent:pool":
        action = ui.choose("Pool action", ["scale", "status", "drain"])
        if not action:
            return None
        if action == "scale":
            n = ui.prompt("Scale to (number)")
            return [action, n] if n else [action]
        return [action]

    # ── task ──
    if key == "task:create":
        types = ["implementation", "testing", "review", "research",
                 "debugging", "documentation", "optimization"]
        ttype = ui.choose("Task type", types)
        if not ttype:
            return None
        desc = ui.prompt("Task description")
        if not desc:
            return None
        return ["-t", ttype, "-d", desc]

    if key in ("task:status", "task:cancel", "task:retry", "task:complete"):
        tid = ui.prompt("Task ID")
        return [tid] if tid else None

    if key == "task:assign":
        tid = ui.prompt("Task ID")
        if not tid:
            return None
        agent = ui.prompt("Assign to agent")
        if not agent:
            return None
        return [tid, "--agent", agent]

    if key == "task:list":
        choices = ["all", "pending", "running", "completed", "failed"]
        filt = ui.choose("Filter", choices)
        if filt == "all":
            return ["--all"]
        elif filt:
            return ["--status", filt]
        return []

    # ── memory ──
    if key == "memory:store":
        k = ui.prompt("Key")
        if not k:
            return None
        v = ui.prompt("Value")
        if not v:
            return None
        return ["-k", k, "-v", v]

    if key in ("memory:retrieve", "memory:delete"):
        k = ui.prompt("Key")
        return ["-k", k] if k else None

    if key == "memory:search":
        q = ui.prompt("Search query")
        return ["-q", q] if q else None

    if key == "memory:configure":
        settings = ["backend", "max-size", "ttl", "compression", "encryption"]
        setting = ui.choose("Setting", settings)
        if not setting:
            return None
        val = ui.prompt(f"Value for {setting}")
        return [setting, val] if val else None

    # ── session ──
    if key in ("session:restore", "session:delete", "session:export"):
        sid = ui.prompt("Session ID")
        return [sid] if sid else None

    if key == "session:save":
        name = ui.prompt("Session name (optional)", default="")
        return ["--name", name] if name else []

    # ── swarm ──
    if key == "swarm:init":
        topos = ["hierarchical-mesh", "mesh", "hierarchical", "hybrid"]
        topo = ui.choose("Topology", topos)
        return ["--topology", topo] if topo else []

    if key == "swarm:start":
        obj = ui.prompt("Swarm objective")
        if not obj:
            return None
        types = ["coder", "researcher", "tester", "reviewer", "architect",
                 "coordinator", "analyst", "optimizer"]
        selected = ui.multi_choose("Select agent types", types)
        if not selected:
            return None
        return ["--objective", obj, "--types", ",".join(selected)]

    if key == "swarm:scale":
        n = ui.prompt("Scale to (number)")
        return [n] if n else None

    if key == "swarm:coordinate":
        strats = ["round-robin", "load-balanced", "priority", "consensus"]
        strat = ui.choose("Coordination strategy", strats)
        return ["--strategy", strat] if strat else None

    # ── init ──
    if key in ("init:wizard", "init:check", "init:skills", "init:upgrade"):
        opts = ["--force", "--minimal", "--full", "--skip-claude",
                "--start-all", "--start-daemon", "--with-embeddings"]
        selected = ui.multi_choose("Options (or none)", opts)
        return selected

    if key == "init:hooks":
        opts = ["--all", "--minimal"]
        selected = ui.multi_choose("Options (or none)", opts)
        return selected

    # ── neural ──
    if key == "neural:train":
        mtypes = ["transformer", "moe", "classifier", "embedding"]
        mtype = ui.choose("Model type", mtypes)
        if not mtype:
            return None
        args = ["--type", mtype]
        epochs = ui.prompt("Epochs", default="10")
        args += ["--epochs", epochs]
        batch = ui.prompt("Batch size", default="32")
        args += ["--batch-size", batch]
        lr = ui.prompt("Learning rate", default="0.001")
        args += ["--learning-rate", lr]
        return args

    if key == "neural:predict":
        inp = ui.prompt("Prediction input")
        return [inp] if inp else None

    if key == "neural:optimize":
        targets = ["latency", "throughput", "memory", "accuracy"]
        selected = ui.multi_choose("Optimization targets", targets)
        return ["--target", ",".join(selected)] if selected else []

    # ── hive-mind ──
    if key == "hive-mind:spawn":
        types = ["coder", "researcher", "tester", "reviewer", "architect",
                 "coordinator", "analyst"]
        atype = ui.choose("Agent type", types)
        return ["--type", atype] if atype else None

    if key == "hive-mind:task":
        desc = ui.prompt("Hive task description")
        return [desc] if desc else None

    if key == "hive-mind:broadcast":
        msg = ui.prompt("Broadcast message")
        return [msg] if msg else None

    if key == "hive-mind:consensus":
        topic = ui.prompt("Consensus topic")
        return [topic] if topic else None

    if key in ("hive-mind:join", "hive-mind:leave"):
        agents = ui.prompt("Agent IDs (comma-separated)")
        return [agents] if agents else None

    # ── security ──
    if key in ("security:scan", "security:audit"):
        target = ui.prompt("Target path", default=".")
        return [target] if target else ["."]

    if key == "security:cve":
        cve = ui.prompt("CVE ID or search query")
        return [cve] if cve else None

    if key == "security:threats":
        sevs = ["all", "critical", "high", "medium", "low"]
        sev = ui.choose("Severity", sevs)
        if sev and sev != "all":
            return ["--severity", sev]
        return []

    if key == "security:secrets":
        target = ui.prompt("Scan path", default=".")
        return [target] if target else ["."]

    # ── config ──
    if key == "config:get":
        k = ui.prompt("Config key")
        return [k] if k else None

    if key == "config:set":
        k = ui.prompt("Config key")
        if not k:
            return None
        v = ui.prompt(f"Value for {k}")
        return [k, v] if v else None

    # ── doctor ──
    if key == "doctor:run":
        checks = ["all", "version", "node", "npm", "config", "daemon",
                   "memory", "api", "git", "mcp", "claude"]
        check = ui.choose("Check category", checks)
        if check and check != "all":
            return ["-c", check]
        return []

    # ── analyze ──
    if key in ("analyze:code", "analyze:complexity", "analyze:deps",
               "analyze:imports", "analyze:circular", "analyze:boundaries",
               "analyze:modules", "analyze:dependencies"):
        target = ui.prompt("Target path", default=".")
        return [target] if target else ["."]

    if key in ("analyze:ast", "analyze:symbols"):
        target = ui.prompt("Target file")
        return [target] if target else None

    if key == "analyze:diff":
        target = ui.prompt("Commit range or file")
        return [target] if target else None

    # ── mcp ──
    if key == "mcp:exec":
        tool = ui.prompt("MCP tool name")
        return [tool] if tool else None

    # ── workflow ──
    if key == "workflow:run":
        wf = ui.prompt("Workflow name or template")
        return [wf] if wf else None

    if key == "workflow:validate":
        path = ui.prompt("Workflow file path")
        return [path] if path else None

    # ── plugins ──
    if key in ("plugins:install", "plugins:search"):
        query = ui.prompt("Plugin name or search query")
        return [query] if query else None

    if key in ("plugins:uninstall", "plugins:upgrade", "plugins:info",
               "plugins:toggle", "plugins:rate"):
        plugin = ui.prompt("Plugin name")
        return [plugin] if plugin else None

    if key == "plugins:create":
        name = ui.prompt("Plugin name")
        return [name] if name else None

    # ── deployment ──
    if key in ("deployment:deploy", "deployment:status", "deployment:logs"):
        envs = ["development", "staging", "production"]
        env = ui.choose("Environment", envs)
        return ["--env", env] if env else []

    if key == "deployment:rollback":
        did = ui.prompt("Deployment ID")
        return [did] if did else None

    # ── providers ──
    if key in ("providers:configure", "providers:test", "providers:models",
               "providers:usage"):
        prov = ui.prompt("Provider name")
        return [prov] if prov else None

    # ── ruvector ──
    if key == "ruvector:init":
        db = ui.prompt("Database name")
        if not db:
            return None
        drivers = ["postgresql", "sqlite", "mysql"]
        driver = ui.choose("Database driver", drivers)
        if not driver:
            return None
        return ["--database", db, "--driver", driver]

    if key in ("ruvector:status", "ruvector:benchmark", "ruvector:optimize",
               "ruvector:backup", "ruvector:setup", "ruvector:import",
               "ruvector:migrate"):
        db = ui.prompt("Database name")
        return ["--database", db] if db else None

    # ── embeddings ──
    if key in ("embeddings:generate", "embeddings:search"):
        text = ui.prompt("Input text or query")
        return [text] if text else None

    if key == "embeddings:compare":
        t1 = ui.prompt("Text A")
        if not t1:
            return None
        t2 = ui.prompt("Text B")
        return [t1, t2] if t2 else None

    # ── hooks with text input ──
    if key == "hooks:notify":
        msg = ui.prompt("Notification message")
        return [msg] if msg else None

    if key == "hooks:model-route":
        models = ["opus", "sonnet", "haiku", "auto"]
        model = ui.choose("Route to model", models)
        return [model] if model else None

    if key == "hooks:token-optimize":
        opts = ["--aggressive", "--conservative", "--analyze-only"]
        selected = ui.multi_choose("Optimization mode", opts)
        return selected

    # ── daemon ──
    if key == "daemon:trigger":
        event = ui.prompt("Event name")
        return [event] if event else None

    if key == "daemon:enable":
        svcs = ["mcp", "hooks", "neural", "embeddings", "hive-mind", "all"]
        svc = ui.choose("Service", svcs)
        return [svc] if svc else None

    # ── performance ──
    if key == "performance:profile":
        target = ui.prompt("Profile target")
        return [target] if target else None

    if key == "performance:optimize":
        targets = ["memory", "cpu", "io", "network", "all"]
        selected = ui.multi_choose("Optimization targets", targets)
        return ["--target", ",".join(selected)] if selected else []

    if key == "performance:bottleneck":
        target = ui.prompt("Component or path", default="")
        return [target] if target else []

    # ── claims ──
    if key in ("claims:check", "claims:grant", "claims:revoke"):
        claim = ui.prompt("Claim or role name")
        return [claim] if claim else None

    if key == "claims:roles":
        actions = ["list", "create", "delete"]
        action = ui.choose("Action", actions)
        return [action] if action else None

    if key == "claims:policies":
        actions = ["list", "create", "delete", "evaluate"]
        action = ui.choose("Action", actions)
        return [action] if action else None

    # ── issues ──
    if key in ("issues:claim", "issues:release", "issues:handoff", "issues:status"):
        iid = ui.prompt("Issue ID")
        return [iid] if iid else None

    if key == "issues:steal":
        iid = ui.prompt("Issue ID to steal")
        return [iid] if iid else None

    if key in ("issues:load", "issues:rebalance"):
        agent = ui.prompt("Target agent")
        return [agent] if agent else []

    # ── guidance ──
    if key in ("guidance:compile", "guidance:retrieve"):
        query = ui.prompt("Guidance query or path")
        return [query] if query else None

    if key == "guidance:gates":
        gate = ui.prompt("Gate name")
        return [gate] if gate else None

    if key == "guidance:ab-test":
        name = ui.prompt("A/B test name")
        return [name] if name else None

    # ── appliance ──
    if key == "appliance:build":
        name = ui.prompt("Appliance name")
        if not name:
            return None
        ver = ui.prompt("Version (optional)", default="")
        args = [name]
        if ver:
            args += ["--version", ver]
        return args

    if key in ("appliance:inspect", "appliance:verify", "appliance:extract",
               "appliance:run", "appliance:sign", "appliance:publish"):
        app = ui.prompt("Appliance name")
        return [app] if app else None

    if key == "appliance:update":
        app = ui.prompt("Appliance name")
        if not app:
            return None
        ver = ui.prompt("Target version (optional)", default="")
        args = [app]
        if ver:
            args += ["--version", ver]
        return args

    # ── Default: no args needed ──
    return []
