# rfl.d/build-args.zsh — interactive argument builder (build_args)
# Sourced by rfl main script

_rfl_pick() {
  local header="$1" placeholder="$2"; shift 2
  local -a items=("$@")
  if (( ${#items} == 0 )); then
    gum input --placeholder "$placeholder" --header "$header" --header.foreground=245 --width 60
  else
    gum filter --header "$header" --header.foreground=245 \
      --indicator=">" --placeholder="type to filter..." \
      --height=12 -- "${items[@]}"
  fi
}

# ── Smart args builder ────────────────────────────────────
# Returns args string; caller word-splits with ${=...}
build_args() {
  local cmd="$1" sub="$2"
  local args=""

  case "$cmd:$sub" in
    # ── agent ──
    agent:spawn)
      local -a types=($(_rfl_agent_types))
      (( ${#types} == 0 )) && types=(coder researcher tester reviewer architect coordinator analyst optimizer security-architect security-auditor memory-specialist swarm-specialist performance-engineer core-architect test-architect)
      local atype=$(_rfl_pick "Agent type (-t)" "coder" "${types[@]}")
      [[ -z "$atype" ]] && return 1
      args="-t $atype"
      local name=$(gum input --placeholder "agent name (optional)" \
        --header "Agent name" --header.foreground=245 --width 40)
      [[ -n "$name" ]] && args="$args --name $name"
      ;;
    agent:status|agent:stop|agent:metrics|agent:logs)
      local -a agents=("${(@f)$(_rfl_agents)}")
      local raw=$(_rfl_pick "Select agent" "agent-001" "${agents[@]}")
      [[ -z "$raw" ]] && return 1
      args="${raw%%  *}"  # strip label after double-space
      ;;
    agent:pool)
      local action=$(gum choose --header="Pool action" --header.foreground=51 \
        scale status drain)
      [[ -z "$action" ]] && return 1
      args="$action"
      if [[ "$action" == "scale" ]]; then
        local n=$(gum input --placeholder "number of agents" \
          --header "Scale to" --header.foreground=245 --width 20)
        [[ -n "$n" ]] && args="$action $n"
      fi
      ;;

    # ── task ──
    task:create)
      local ttype=$(gum choose --header="Task type" --header.foreground=51 \
        implementation testing review research debugging documentation optimization)
      [[ -z "$ttype" ]] && return 1
      local desc=$(gum write --placeholder "task description" \
        --header "Description (-d)" --header.foreground 245 --width 60 --height 4)
      [[ -z "$desc" ]] && return 1
      args="-t $ttype -d ${desc// /__RFL_SP__}"
      ;;
    task:status|task:cancel|task:retry|task:complete)
      local -a tasks=("${(@f)$(_rfl_tasks)}")
      local raw=$(_rfl_pick "Select task" "task-123" "${tasks[@]}")
      [[ -z "$raw" ]] && return 1
      args="${raw%%  *}"
      ;;
    task:assign)
      local -a tasks=("${(@f)$(_rfl_tasks)}")
      local raw=$(_rfl_pick "Select task" "task-123" "${tasks[@]}")
      [[ -z "$raw" ]] && return 1
      local tid="${raw%%  *}"
      local -a agents=("${(@f)$(_rfl_agents)}")
      raw=$(_rfl_pick "Assign to agent" "agent-001" "${agents[@]}")
      [[ -z "$raw" ]] && return 1
      args="$tid --agent ${raw%%  *}"
      ;;
    task:list)
      local filter=$(gum choose --header="Filter" --header.foreground=51 \
        "all" "pending" "running" "completed" "failed")
      if [[ "$filter" == "all" ]]; then
        args="--all"
      elif [[ -n "$filter" ]]; then
        args="--status $filter"
      fi
      ;;

    # ── memory ──
    memory:store)
      local key=$(gum input --placeholder "key name" \
        --header "Key (-k)" --header.foreground=245 --width 40)
      [[ -z "$key" ]] && return 1
      local val=$(gum write --placeholder "value" \
        --header "Value (-v)" --header.foreground 245 --width 60 --height 4)
      [[ -z "$val" ]] && return 1
      args="-k ${key// /__RFL_SP__} -v ${val// /__RFL_SP__}"
      ;;
    memory:retrieve|memory:delete)
      local -a keys=($(_rfl_memory_keys))
      local key=$(_rfl_pick "Select key" "key name" "${keys[@]}")
      [[ -z "$key" ]] && return 1
      args="-k ${key// /__RFL_SP__}"
      ;;
    memory:search)
      local query=$(gum input --placeholder "search query" \
        --header "Search (-q)" --header.foreground=245 --width 60)
      [[ -z "$query" ]] && return 1
      args="-q ${query// /__RFL_SP__}"
      ;;
    memory:configure)
      local setting=$(gum choose --header="Memory setting" --header.foreground=51 \
        "backend" "max-size" "ttl" "compression" "encryption")
      [[ -z "$setting" ]] && return 1
      local val=$(gum input --placeholder "new value" \
        --header "Value for $setting" --header.foreground=245 --width 40)
      [[ -z "$val" ]] && return 1
      args="$setting $val"
      ;;
    memory:export)
      local path=$(gum file .)
      [[ -n "$path" ]] && args="$path"
      ;;
    memory:import)
      local path=$(gum file .)
      [[ -n "$path" ]] && args="$path"
      ;;

    # ── session ──
    session:restore|session:delete|session:export)
      local -a sessions=("${(@f)$(_rfl_sessions)}")
      local raw=$(_rfl_pick "Select session" "session-id" "${sessions[@]}")
      [[ -z "$raw" ]] && return 1
      args="${raw%%  *}"
      ;;
    session:save)
      local name=$(gum input --placeholder "session name (optional)" \
        --header "Session name" --header.foreground=245 --width 40)
      [[ -n "$name" ]] && args="--name $name"
      ;;
    session:import)
      local path=$(gum file .)
      [[ -n "$path" ]] && args="$path"
      ;;

    # ── swarm ──
    swarm:init)
      local topo=$(gum choose --header="Topology" --header.foreground=51 \
        mesh hierarchical hybrid)
      [[ -n "$topo" ]] && args="--topology $topo"
      ;;
    swarm:start)
      local obj=$(gum input --placeholder "swarm objective (what should agents do?)" \
        --header "Objective" --header.foreground=51 --width 70)
      [[ -z "$obj" ]] && return 1
      # Pick agent types (multi-select)
      local -a types=($(_rfl_agent_types))
      (( ${#types} == 0 )) && types=(coder researcher tester reviewer architect coordinator analyst optimizer security-architect security-auditor memory-specialist swarm-specialist performance-engineer core-architect test-architect)
      local -a selected_types
      selected_types=($(gum choose --no-limit \
        --header="Select agent types (space to toggle)" --header.foreground=51 \
        "${types[@]}"))
      (( ${#selected_types} == 0 )) && return 1
      # Encode for _rfl_run
      args="--objective ${obj// /__RFL_SP__} --types ${(j:,:)selected_types}"
      ;;
    swarm:scale)
      local n=$(gum input --placeholder "number of agents" \
        --header "Scale to" --header.foreground=245 --width 20)
      [[ -n "$n" ]] && args="$n"
      ;;
    swarm:coordinate)
      local strategy=$(gum choose --header="Coordination strategy" --header.foreground=51 \
        "round-robin" "load-balanced" "priority" "consensus")
      [[ -n "$strategy" ]] && args="--strategy $strategy"
      ;;

    # ── start ──
    start:*)
      local -a opts=()
      opts=($(gum choose --no-limit --header="Options (space to toggle)" --header.foreground=51 \
        -- "--daemon" "--skip-mcp" "--topology mesh" "--topology hierarchical"))
      args="${(j: :)opts}"
      ;;

    # ── init ──
    init:hooks)
      local -a opts=()
      opts=($(gum choose --no-limit --header="Options (space to toggle)" --header.foreground=51 \
        -- "--all" "--minimal"))
      args="${(j: :)opts}"
      ;;
    init:wizard|init:check|init:skills|init:upgrade)
      local -a opts=()
      opts=($(gum choose --no-limit --header="Options (space to toggle)" --header.foreground=51 \
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
      local check=$(gum choose --header="Check category" --header.foreground=51 \
        "all" "version" "node" "npm" "config" "daemon" "memory" "api" "git" "mcp" "claude")
      [[ "$check" != "all" && -n "$check" ]] && args="-c $check"
      ;;
    doctor:--fix|doctor:--install)
      ;; # no args needed

    # ── ruvector ──
    ruvector:status|ruvector:benchmark|ruvector:optimize|ruvector:backup|ruvector:setup|ruvector:import|ruvector:migrate)
      local db=$(gum input --placeholder "database name (required)" \
        --header "Database (--database)" --header.foreground=51 --width 40)
      [[ -z "$db" ]] && return 1
      args="--database $db"
      ;;
    ruvector:init)
      local db=$(gum input --placeholder "database name" \
        --header "Database name" --header.foreground=51 --width 40)
      [[ -z "$db" ]] && return 1
      local driver=$(gum choose --header="Database driver" --header.foreground=51 \
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
      local action=$(gum choose --header="Action" --header.foreground=51 \
        "list" "add" "remove" "test")
      [[ -n "$action" ]] && args="$action"
      ;;

    # ── neural ──
    neural:train)
      local -a opts=()
      opts=($(gum choose --no-limit --header="Training options" --header.foreground=51 \
        -- "--epochs 10" "--batch-size 32" "--learning-rate 0.001"))
      args="${(j: :)opts}"
      ;;
    neural:predict)
      local input=$(gum input --placeholder "input data or pattern" \
        --header "Prediction input" --header.foreground=245 --width 60)
      [[ -n "$input" ]] && args="${input// /__RFL_SP__}"
      ;;
    neural:optimize)
      local -a opts=()
      opts=($(gum choose --no-limit --header="Optimization targets" --header.foreground=51 \
        -- "latency" "throughput" "memory" "accuracy"))
      (( ${#opts} > 0 )) && args="--target ${(j:,:)opts}"
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
      local scope=$(gum choose --header="Threat scope" --header.foreground=51 \
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

    # ── workflow ──
    workflow:run)
      local -a templates=()
      local tpl_out
      tpl_out=$(ruflo workflow template 2>&1)
      if echo "$tpl_out" | grep -q '{'; then
        templates=("${(@f)$(echo "$tpl_out" | python3 -c "
import sys,json
try:
  txt = sys.stdin.read()
  start = txt.index('{')
  data = json.loads(txt[start:txt.rindex('}')+1])
  for t in data.get('templates', data.get('items', [])):
    print(t.get('name', t.get('id', '')))
except: pass
" 2>/dev/null)}")
      fi
      (( ${#templates} == 0 )) && templates=("${(@f)$(ruflo workflow template 2>&1 | _rfl_table_col 2)}")
      local wf=$(_rfl_pick "Workflow to run" "workflow-name" "${templates[@]}")
      [[ -n "$wf" ]] && args="${wf%%  *}"
      ;;
    workflow:status|workflow:stop)
      local -a wfs=("${(@f)$(_rfl_workflows)}")
      local raw=$(_rfl_pick "Select workflow" "no workflows found" "${wfs[@]}")
      [[ -z "$raw" ]] && return 1
      args="${raw%%  *}"
      ;;
    workflow:validate)
      local wf_file=$(gum file .)
      [[ -n "$wf_file" ]] && args="$wf_file"
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
        --header "Plugin" --header.foreground=51 --width 50)
      [[ -z "$query" ]] && return 1
      args="$query"
      ;;
    plugins:create)
      local name=$(gum input --placeholder "plugin name" \
        --header "Plugin name" --header.foreground=51 --width 40)
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
import sys,json
try:
  txt = sys.stdin.read()
  start = txt.index('{')
  data = json.loads(txt[start:txt.rindex('}')+1])
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
      local action=$(gum choose --header="Roles action" --header.foreground=51 \
        "list" "create" "delete")
      [[ -n "$action" ]] && args="$action"
      ;;
    claims:policies)
      local action=$(gum choose --header="Policies action" --header.foreground=51 \
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
        --header "Message" --header.foreground=51 --width 60)
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
      local model=$(gum choose --header="Route to model" --header.foreground=51 \
        "opus" "sonnet" "haiku" "auto")
      [[ -n "$model" ]] && args="$model"
      ;;
    hooks:token-optimize)
      local -a opts=()
      opts=($(gum choose --no-limit --header="Optimization" --header.foreground=51 \
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
import sys,json
try:
  txt = sys.stdin.read()
  start = txt.index('{')
  data = json.loads(txt[start:txt.rindex('}')+1])
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

    # ── hive-mind ──
    hive-mind:spawn)
      local -a types=($(_rfl_agent_types))
      (( ${#types} == 0 )) && types=(coder researcher tester reviewer architect coordinator analyst)
      local atype=$(_rfl_pick "Agent type" "coder" "${types[@]}")
      [[ -z "$atype" ]] && return 1
      args="--type $atype"
      ;;
    hive-mind:task)
      local desc=$(gum write --placeholder "task description" \
        --header "Hive task" --header.foreground 51 --width 60 --height 4)
      [[ -z "$desc" ]] && return 1
      args="${desc// /__RFL_SP__}"
      ;;
    hive-mind:join|hive-mind:leave)
      local -a agents=("${(@f)$(_rfl_agents)}")
      if (( ${#agents} == 0 )); then
        print -P "%F{245}No agents found%f"
        return 1
      fi
      local -a selected=()
      local _sel_line
      while IFS= read -r _sel_line; do
        [[ -n "$_sel_line" ]] && selected+=("$_sel_line")
      done < <(gum choose --no-limit \
        --header="Select agents (space to toggle)" \
        --header.foreground=51 "${agents[@]}" < /dev/tty)
      (( ${#selected} == 0 )) && return 1
      # Extract IDs (before first double-space), join with commas
      local -a ids=()
      for s in "${selected[@]}"; do
        ids+=("${${s%% \(*}%% }")
      done
      args="${(j:,:)ids}"
      ;;
    hive-mind:broadcast)
      local msg=$(gum write --placeholder "broadcast message" \
        --header "Message" --header.foreground 51 --width 60 --height 4)
      [[ -z "$msg" ]] && return 1
      args="${msg// /__RFL_SP__}"
      ;;
    hive-mind:consensus)
      local topic=$(gum input --placeholder "consensus topic" \
        --header "Topic" --header.foreground=245 --width 50)
      [[ -z "$topic" ]] && return 1
      args="${topic// /__RFL_SP__}"
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
      local score=$(gum choose --header="Feedback score" --header.foreground=51 \
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
      local action=$(gum choose --header="Workers action" --header.foreground=51 \
        "list" "scale" "drain" "restart")
      [[ -n "$action" ]] && args="$action"
      ;;
    process:signals)
      local sig=$(gum choose --header="Signal" --header.foreground=51 \
        "SIGTERM" "SIGINT" "SIGHUP" "SIGUSR1" "SIGUSR2")
      [[ -z "$sig" ]] && return 1
      local -a agents=("${(@f)$(_rfl_agents)}")
      local raw=$(_rfl_pick "Target process" "agent-001" "${agents[@]}")
      [[ -n "$raw" ]] && args="$sig ${raw%%  *}"
      ;;

    # ── appliance ──
    appliance:build)
      local name=$(gum input --placeholder "appliance name" \
        --header "Name" --header.foreground=51 --width 40)
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
      local svc=$(gum choose --header="Service" --header.foreground=51 \
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
      opts=($(gum choose --no-limit --header="Cleanup options" --header.foreground=51 \
        -- "--force" "--dry-run" "--older-than 30d"))
      args="${(j: :)opts}"
      ;;

    # ── Default: no args needed (list, status, etc.) ──
    *)
      ;;
  esac

  echo "$args"
  return 0
}
