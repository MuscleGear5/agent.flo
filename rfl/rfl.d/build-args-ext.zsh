# rfl.d/build-args-ext.zsh — extended argument builder (overflow from build-args.zsh)
# Sourced by build-args.zsh

_rfl_build_args_ext() {
  local cmd="$1" sub="$2"
  local args=""

  case "$cmd:$sub" in

    # ── init ──
    init:hooks)
      local -a opts=()
      opts=($(gum choose --no-limit --header="Options (space to toggle)" --header.foreground=7 \
        -- "--all" "--minimal"))
      args="${(j: :)opts}"
      ;;
    init:wizard|init:check|init:skills|init:upgrade)
      local -a opts=()
      opts=($(gum choose --no-limit --header="Options (space to toggle)" --header.foreground=7 \
        -- "--force" "--minimal" "--full" "--skip-claude" "--start-all" "--start-daemon" "--with-embeddings"))
      args="${(j: :)opts}"
      ;;

    # ── mcp ──
    mcp:exec)
      local -a tools=($(_rfl_mcp_tools))
      local tool=$(_rfl_pick "MCP tool to exec" "tool-name" "${tools[@]}")
      [[ -z "$tool" ]] && return 1
      args="$tool"
      ;;
    mcp:toggle|mcp:restart|mcp:stop|mcp:start)
      local -a servers=($(_rfl_mcp_servers))
      local server=$(_rfl_pick "MCP server" "server-name" "${servers[@]}")
      [[ -n "$server" ]] && args="$server"
      ;;
    mcp:tools)
      local -a tools=($(_rfl_mcp_tools))
      local tool=$(_rfl_pick "MCP tool (optional filter)" "tool-name" "${tools[@]}")
      [[ -n "$tool" ]] && args="$tool"
      ;;

    # ── config ──
    config:get)
      local -a keys=($(_rfl_config_keys))
      local key=$(_rfl_pick "Config key" "swarm.topology" "${keys[@]}")
      [[ -z "$key" ]] && return 1
      args="$key"
      ;;
    config:set)
      local -a keys=($(_rfl_config_keys))
      local key=$(_rfl_pick "Config key" "swarm.topology" "${keys[@]}")
      [[ -z "$key" ]] && return 1
      local val=$(gum input --placeholder "new value" \
        --header "Value for $key" --header.foreground=245 --width 40)
      [[ -z "$val" ]] && return 1
      args="$key $val"
      ;;
    config:providers)
      local -a provs=($(_rfl_providers))
      local prov=$(_rfl_pick "Select provider" "anthropic" "${provs[@]}")
      [[ -n "$prov" ]] && args="${prov%%  *}"
      ;;
    config:export)
      local path=$(gum file .)
      [[ -n "$path" ]] && args="$path"
      ;;
    config:import)
      local path=$(gum file .)
      [[ -n "$path" ]] && args="$path"
      ;;

    # ── doctor ──
    doctor:run)
      local check=$(gum choose --header="Check category" --header.foreground=7 \
        "all" "version" "node" "npm" "config" "daemon" "memory" "api" "git" "mcp" "claude")
      [[ "$check" != "all" && -n "$check" ]] && args="-c $check"
      ;;
    doctor:--fix|doctor:--install)
      ;; # no args needed

    # ── ruvector ──
    ruvector:status|ruvector:benchmark|ruvector:optimize|ruvector:backup|ruvector:setup|ruvector:import|ruvector:migrate)
      local db=$(gum input --placeholder "database name (required)" \
        --header "Database (--database)" --header.foreground=7 --width 40)
      [[ -z "$db" ]] && return 1
      args="--database $db"
      ;;
    ruvector:init)
      local db=$(gum input --placeholder "database name" \
        --header "Database name" --header.foreground=7 --width 40)
      [[ -z "$db" ]] && return 1
      local driver=$(gum choose --header="Database driver" --header.foreground=7 \
        "postgresql" "sqlite" "mysql")
      [[ -z "$driver" ]] && return 1
      args="--database $db --driver $driver"
      ;;

    # ── embeddings ──
    embeddings:generate|embeddings:search)
      local text=$(gum input --placeholder "text or query" \
        --header "Input text" --header.foreground=245 --width 60)
      [[ -n "$text" ]] && args="${text// /__RFL_SP__}"
      ;;
    embeddings:compare)
      local text1=$(gum input --placeholder "first text" \
        --header "Text A" --header.foreground=245 --width 60)
      [[ -z "$text1" ]] && return 1
      local text2=$(gum input --placeholder "second text" \
        --header "Text B" --header.foreground=245 --width 60)
      [[ -z "$text2" ]] && return 1
      args="${text1// /__RFL_SP__} ${text2// /__RFL_SP__}"
      ;;
    embeddings:collections)
      local -a cols=($(_rfl_collections))
      local col=$(_rfl_pick "Collection" "collection-name" "${cols[@]}")
      [[ -n "$col" ]] && args="$col"
      ;;
    embeddings:index|embeddings:chunk)
      local target=$(gum input --placeholder "file or directory" \
        --header "Target" --header.foreground=245 --width 50)
      [[ -n "$target" ]] && args="$target"
      ;;
    embeddings:providers)
      local action=$(gum choose --header="Action" --header.foreground=7 \
        "list" "add" "remove" "test")
      [[ -n "$action" ]] && args="$action"
      ;;

    # ── performance ──
    performance:metrics)
      local -a opts=()
      opts=($(gum choose --no-limit --header="Metrics options" --header.foreground=7 \
        -- "--format json" "--format table" "--period 1h" "--period 24h" "--period 7d"))
      (( ${#opts} > 0 )) && args="${(j: :)opts}"
      ;;
    performance:benchmark)
      local -a opts=()
      opts=($(gum choose --no-limit --header="Benchmark options" --header.foreground=7 \
        -- "--iterations 10" "--warmup 3" "--format json" "--format table"))
      (( ${#opts} > 0 )) && args="${(j: :)opts}"
      ;;
    performance:profile)
      local target=$(gum input --placeholder "file or directory to profile" \
        --header "Profile target" --header.foreground=245 --width 50)
      [[ -n "$target" ]] && args="$target"
      ;;
    performance:optimize)
      local -a targets=()
      targets=($(gum choose --no-limit --header="Optimization targets" --header.foreground=7 \
        -- "memory" "cpu" "io" "network" "all"))
      (( ${#targets} > 0 )) && args="--target ${(j:,:)targets}"
      ;;
    performance:bottleneck)
      local target=$(gum input --placeholder "component or path (default: all)" \
        --header "Bottleneck target" --header.foreground=245 --width 50)
      [[ -n "$target" ]] && args="$target"
      ;;

    # ── security ──
    security:scan|security:audit)
      local target=$(gum input --placeholder "path or target (default: .)" \
        --header "Scan target" --header.foreground=245 --width 50)
      [[ -n "$target" ]] && args="$target"
      ;;
    security:cve)
      local cve=$(gum input --placeholder "CVE ID or search query" \
        --header "CVE lookup" --header.foreground=245 --width 50)
      [[ -n "$cve" ]] && args="$cve"
      ;;
    security:threats)
      local scope=$(gum choose --header="Threat scope" --header.foreground=7 \
        "all" "critical" "high" "medium" "low")
      [[ -n "$scope" && "$scope" != "all" ]] && args="--severity $scope"
      ;;
    security:secrets)
      local target=$(gum input --placeholder "path to scan (default: .)" \
        --header "Scan path" --header.foreground=245 --width 50)
      [[ -n "$target" ]] && args="$target"
      ;;

    # ── analyze ──
    analyze:diff)
      local target=$(gum input --placeholder "commit range or file" \
        --header "Diff target" --header.foreground=245 --width 50)
      [[ -n "$target" ]] && args="$target"
      ;;
    analyze:code|analyze:complexity|analyze:deps|analyze:imports|analyze:circular)
      local target=$(gum input --placeholder "file or directory (default: .)" \
        --header "Target path" --header.foreground=245 --width 50)
      [[ -n "$target" ]] && args="$target"
      ;;
    analyze:ast|analyze:symbols)
      local target=$(gum input --placeholder "file path" \
        --header "Target file" --header.foreground=245 --width 50)
      [[ -n "$target" ]] && args="$target"
      ;;
    analyze:boundaries|analyze:modules|analyze:dependencies)
      local target=$(gum input --placeholder "directory (default: .)" \
        --header "Target directory" --header.foreground=245 --width 50)
      [[ -n "$target" ]] && args="$target"
      ;;

    # ── deployment ──
    deployment:deploy|deployment:status|deployment:logs)
      local -a envs=($(_rfl_deploy_envs))
      (( ${#envs} == 0 )) && envs=(development staging production)
      local env=$(_rfl_pick "Environment" "production" "${envs[@]}")
      [[ -n "$env" ]] && args="--env $env"
      ;;
    deployment:rollback)
      local -a deploys=($(_rfl_deploy_ids))
      local did=$(_rfl_pick "Rollback deployment" "dep-123" "${deploys[@]}")
      [[ -n "$did" ]] && args="$did"
      ;;
    deployment:history)
      local -a envs=($(_rfl_deploy_envs))
      (( ${#envs} == 0 )) && envs=(development staging production)
      local env=$(_rfl_pick "Environment" "all" "${envs[@]}")
      [[ -n "$env" && "$env" != "all" ]] && args="--env $env"
      ;;

    # ── plugins ──
    plugins:uninstall|plugins:upgrade|plugins:info|plugins:toggle|plugins:rate)
      local -a plist=("${(@f)$(_rfl_plugins)}")
      local plugin=$(_rfl_pick "Select plugin" "plugin-name" "${plist[@]}")
      [[ -z "$plugin" ]] && return 1
      args="${plugin%%  *}"
      ;;
    plugins:install|plugins:search)
      local query=$(gum input --placeholder "plugin name, URL, or search query" \
        --header "Plugin" --header.foreground=7 --width 50)
      [[ -z "$query" ]] && return 1
      args="$query"
      ;;
    plugins:create)
      local name=$(gum input --placeholder "plugin name" \
        --header "Plugin name" --header.foreground=7 --width 40)
      [[ -z "$name" ]] && return 1
      args="$name"
      ;;

    # ── providers ──
    providers:configure|providers:test|providers:models|providers:usage)
      local -a provs=($(_rfl_providers))
      local prov=$(_rfl_pick "Select provider" "anthropic" "${provs[@]}")
      [[ -n "$prov" ]] && args="${prov%%  *}"
      ;;

    # ── claims ──
    claims:check|claims:grant|claims:revoke)
      local -a claim_list=()
      local cl_out
      cl_out=$(ruflo mcp exec --tool claims_list 2>&1)
      if echo "$cl_out" | grep -q '{'; then
        claim_list=("${(@f)$(echo "$cl_out" | python3 -c "
${_RFL_PYLIB}
try:
  data = pj(sys.stdin.read())
  for c in data.get('claims', data.get('roles', data.get('items', []))):
    name = c.get('name', c.get('claim', c.get('role', '')))
    if name: print(name)
except: pass
" 2>/dev/null)}")
      fi
      (( ${#claim_list} == 0 )) && claim_list=("${(@f)$(ruflo claims list 2>&1 | _rfl_table_col 2)}")
      local raw=$(_rfl_pick "Select claim/role" "claim name" "${claim_list[@]}")
      [[ -z "$raw" ]] && return 1
      args="${raw%%  *}"
      ;;
    claims:roles)
      local action=$(gum choose --header="Roles action" --header.foreground=7 \
        "list" "create" "delete")
      [[ -n "$action" ]] && args="$action"
      ;;
    claims:policies)
      local action=$(gum choose --header="Policies action" --header.foreground=7 \
        "list" "create" "delete" "evaluate")
      [[ -n "$action" ]] && args="$action"
      ;;

    # ── hooks ──
    hooks:route|hooks:explain|hooks:pretrain|hooks:intelligence|hooks:pre-edit|hooks:post-edit|hooks:pre-command|hooks:post-command|hooks:pre-task|hooks:post-task)
      local -a hks=($(_rfl_hooks))
      local hk=$(_rfl_pick "Select hook" "hook-name" "${hks[@]}")
      [[ -n "$hk" ]] && args="$hk"
      ;;
    hooks:notify)
      local msg=$(gum input --placeholder "notification message" \
        --header "Message" --header.foreground=7 --width 60)
      [[ -z "$msg" ]] && return 1
      args="${msg// /__RFL_SP__}"
      ;;
    hooks:transfer)
      local -a agents=("${(@f)$(_rfl_agents)}")
      local raw=$(_rfl_pick "Transfer to agent" "agent-001" "${agents[@]}")
      [[ -z "$raw" ]] && return 1
      args="${raw%%  *}"
      ;;
    hooks:worker-dispatch|hooks:worker-cancel|hooks:worker-status)
      local wid=$(gum input --placeholder "worker ID" \
        --header "Worker" --header.foreground=245 --width 40)
      [[ -n "$wid" ]] && args="$wid"
      ;;
    hooks:model-route)
      local model=$(gum choose --header="Route to model" --header.foreground=7 \
        "opus" "sonnet" "haiku" "auto")
      [[ -n "$model" ]] && args="$model"
      ;;
    hooks:token-optimize)
      local -a opts=()
      opts=($(gum choose --no-limit --header="Optimization" --header.foreground=7 \
        -- "--aggressive" "--conservative" "--analyze-only"))
      (( ${#opts} > 0 )) && args="${(j: :)opts}"
      ;;
    hooks:coverage-route|hooks:coverage-suggest|hooks:coverage-gaps)
      local target=$(gum input --placeholder "file or directory" \
        --header "Coverage target" --header.foreground=245 --width 50)
      [[ -n "$target" ]] && args="$target"
      ;;

    # ── issues ──
    issues:claim|issues:release|issues:status|issues:handoff)
      local -a issue_list=()
      local issue_out
      issue_out=$(ruflo mcp exec --tool claims_list 2>&1)
      if echo "$issue_out" | grep -q '{'; then
        issue_list=("${(@f)$(echo "$issue_out" | python3 -c "
${_RFL_PYLIB}
try:
  data = pj(sys.stdin.read())
  for i in data.get('claims', data.get('issues', data.get('items', []))):
    iid = i.get('id', i.get('issueId', ''))
    desc = i.get('description', i.get('name', i.get('status', '')))
    if iid: print(f\"{iid}  ({desc})\")
except: pass
" 2>/dev/null)}")
      fi
      (( ${#issue_list} == 0 )) && issue_list=("${(@f)$(ruflo issues list 2>&1 | _rfl_table_col 2)}")
      local raw=$(_rfl_pick "Select issue" "issue-001" "${issue_list[@]}")
      [[ -z "$raw" ]] && return 1
      args="${raw%%  *}"
      ;;
    issues:steal)
      local -a stealable=("${(@f)$(ruflo issues stealable 2>&1 | _rfl_table_col 2)}")
      local raw=$(_rfl_pick "Stealable issue" "issue-001" "${stealable[@]}")
      [[ -z "$raw" ]] && return 1
      args="${raw%%  *}"
      ;;
    issues:load|issues:rebalance)
      local -a agents=("${(@f)$(_rfl_agents)}")
      local raw=$(_rfl_pick "Target agent" "agent-001" "${agents[@]}")
      [[ -n "$raw" ]] && args="${raw%%  *}"
      ;;

    # ── guidance ──
    guidance:compile|guidance:retrieve)
      local query=$(gum input --placeholder "guidance query or path" \
        --header "Input" --header.foreground=245 --width 50)
      [[ -n "$query" ]] && args="${query// /__RFL_SP__}"
      ;;
    guidance:gates)
      local gate=$(gum input --placeholder "gate name" \
        --header "Gate" --header.foreground=245 --width 40)
      [[ -n "$gate" ]] && args="$gate"
      ;;
    guidance:ab-test)
      local test_name=$(gum input --placeholder "A/B test name" \
        --header "Test name" --header.foreground=245 --width 40)
      [[ -n "$test_name" ]] && args="$test_name"
      ;;

    # ── route ──
    route:task)
      local -a agents=("${(@f)$(_rfl_agents)}")
      local raw=$(_rfl_pick "Route to agent" "agent-001" "${agents[@]}")
      [[ -n "$raw" ]] && args="--agent ${raw%%  *}"
      ;;
    route:feedback)
      local -a agents=("${(@f)$(_rfl_agents)}")
      local raw=$(_rfl_pick "Agent for feedback" "agent-001" "${agents[@]}")
      [[ -z "$raw" ]] && return 1
      local score=$(gum choose --header="Feedback score" --header.foreground=7 \
        "1" "2" "3" "4" "5")
      [[ -z "$score" ]] && return 1
      args="${raw%%  *} --score $score"
      ;;

    # ── progress ──
    progress:check|progress:watch)
      local -a tasks=("${(@f)$(_rfl_tasks)}")
      local raw=$(_rfl_pick "Track task" "task-123" "${tasks[@]}")
      [[ -n "$raw" ]] && args="${raw%%  *}"
      ;;

    # ── migrate ──
    migrate:run|migrate:verify|migrate:rollback)
      local -a migrations=("${(@f)$(ruflo migrate status 2>&1 | _rfl_table_col 2)}")
      local ver=$(_rfl_pick "Select migration" "migration version" "${migrations[@]}")
      [[ -n "$ver" ]] && args="${ver%%  *}"
      ;;

    # ── process ──
    process:workers)
      local action=$(gum choose --header="Workers action" --header.foreground=7 \
        "list" "scale" "drain" "restart")
      [[ -n "$action" ]] && args="$action"
      ;;
    process:signals)
      local sig=$(gum choose --header="Signal" --header.foreground=7 \
        "SIGTERM" "SIGINT" "SIGHUP" "SIGUSR1" "SIGUSR2")
      [[ -z "$sig" ]] && return 1
      local -a agents=("${(@f)$(_rfl_agents)}")
      local raw=$(_rfl_pick "Target process" "agent-001" "${agents[@]}")
      [[ -n "$raw" ]] && args="$sig ${raw%%  *}"
      ;;

    # ── appliance ──
    appliance:build)
      local name=$(gum input --placeholder "appliance name" \
        --header "Name" --header.foreground=7 --width 40)
      [[ -z "$name" ]] && return 1
      local ver=$(gum input --placeholder "version (e.g. 1.0.0)" \
        --header "Version" --header.foreground=245 --width 20)
      args="$name"
      [[ -n "$ver" ]] && args="$args --version $ver"
      ;;
    appliance:inspect|appliance:verify|appliance:extract|appliance:run|appliance:sign|appliance:publish)
      local -a apps=("${(@f)$(ruflo appliance list 2>&1 | _rfl_table_col 2)}")
      local app=$(_rfl_pick "Select appliance" "appliance-name" "${apps[@]}")
      [[ -z "$app" ]] && return 1
      args="${app%%  *}"
      ;;
    appliance:update)
      local -a apps=("${(@f)$(ruflo appliance list 2>&1 | _rfl_table_col 2)}")
      local app=$(_rfl_pick "Select appliance" "appliance-name" "${apps[@]}")
      [[ -z "$app" ]] && return 1
      local ver=$(gum input --placeholder "target version" \
        --header "Update to version" --header.foreground=245 --width 20)
      args="${app%%  *}"
      [[ -n "$ver" ]] && args="$args --version $ver"
      ;;

    # ── daemon ──
    daemon:trigger)
      local event=$(gum input --placeholder "event name" \
        --header "Trigger event" --header.foreground=245 --width 40)
      [[ -n "$event" ]] && args="$event"
      ;;
    daemon:enable)
      local svc=$(gum choose --header="Service" --header.foreground=7 \
        "mcp" "hooks" "neural" "embeddings" "hive-mind" "all")
      [[ -n "$svc" ]] && args="$svc"
      ;;

    # ── update ──
    update:rollback)
      local -a versions=("${(@f)$(ruflo update history 2>&1 | _rfl_table_col 2)}")
      local ver=$(_rfl_pick "Rollback to version" "v1.0.0" "${versions[@]}")
      [[ -n "$ver" ]] && args="${ver%%  *}"
      ;;

    # ── memory cleanup ──
    memory:cleanup)
      gum confirm "Run memory cleanup?" || return 1
      local -a opts=()
      opts=($(gum choose --no-limit --header="Cleanup options" --header.foreground=7 \
        -- "--force" "--dry-run" "--older-than 30d"))
      args="${(j: :)opts}"
      ;;

    # ── Not handled ──
    *)
      ;;
  esac

  echo "$args"
  return 0
}
