# rfl.d/build-args.zsh — interactive argument builder (build_args)
# Sourced by rfl main script
# Extended commands in build-args-ext.zsh

source "${0:A:h}/build-args-ext.zsh"

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
# Primary commands handled here; all others delegate to _rfl_build_args_ext
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
      local action=$(gum choose --header="Pool action" --header.foreground=7 \
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
      local ttype=$(gum choose --header="Task type" --header.foreground=7 \
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
      local filter=$(gum choose --header="Filter" --header.foreground=7 \
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
      local setting=$(gum choose --header="Memory setting" --header.foreground=7 \
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
      local topo=$(gum choose --header="Topology" --header.foreground=7 \
        hierarchical-mesh mesh hierarchical hybrid)
      [[ -n "$topo" ]] && args="--topology $topo"
      ;;
    swarm:start)
      local obj=$(gum input --placeholder "swarm objective (what should agents do?)" \
        --header "Objective" --header.foreground=7 --width 70)
      [[ -z "$obj" ]] && return 1
      # Pick agent types (multi-select)
      local -a types=($(_rfl_agent_types))
      (( ${#types} == 0 )) && types=(coder researcher tester reviewer architect coordinator analyst optimizer security-architect security-auditor memory-specialist swarm-specialist performance-engineer core-architect test-architect)
      local -a selected_types
      selected_types=($(gum choose --no-limit \
        --header="Select agent types (space to toggle)" --header.foreground=7 \
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
      local strategy=$(gum choose --header="Coordination strategy" --header.foreground=7 \
        "round-robin" "load-balanced" "priority" "consensus")
      [[ -n "$strategy" ]] && args="--strategy $strategy"
      ;;

    # ── start ──
    start:*)
      local -a opts=()
      opts=($(gum choose --no-limit --header="Options (space to toggle)" --header.foreground=7 \
        -- "--daemon" "--skip-mcp" "--topology hierarchical-mesh" "--topology mesh" "--topology hierarchical"))
      args="${(j: :)opts}"
      ;;

    # ── neural ──
    neural:status|neural:list)
      ;; # no args needed
    neural:patterns)
      local filter=$(gum input --placeholder "pattern filter (optional)" \
        --header "Filter patterns" --header.foreground=245 --width 50)
      [[ -n "$filter" ]] && args="${filter// /__RFL_SP__}"
      ;;
    neural:train)
      local mtype=$(gum choose --header="Model type" --header.foreground=7 \
        -- "transformer" "moe" "classifier" "embedding")
      [[ -n "$mtype" ]] && args="--type $mtype"
      local epochs=$(gum input --placeholder "10" --value "10" \
        --header "Epochs" --header.foreground=245 --width 30)
      [[ -n "$epochs" ]] && args+=" --epochs $epochs"
      local batch=$(gum input --placeholder "32" --value "32" \
        --header "Batch size" --header.foreground=245 --width 30)
      [[ -n "$batch" ]] && args+=" --batch-size $batch"
      local lr=$(gum input --placeholder "0.001" --value "0.001" \
        --header "Learning rate" --header.foreground=245 --width 30)
      [[ -n "$lr" ]] && args+=" --learning-rate $lr"
      ;;
    neural:predict)
      local input=$(gum input --placeholder "input data or pattern" \
        --header "Prediction input" --header.foreground=245 --width 60)
      [[ -n "$input" ]] && args="${input// /__RFL_SP__}"
      ;;
    neural:optimize)
      local -a opts=()
      opts=($(gum choose --no-limit --header="Optimization targets" --header.foreground=7 \
        -- "latency" "throughput" "memory" "accuracy"))
      (( ${#opts} > 0 )) && args="--target ${(j:,:)opts}"
      ;;
    neural:benchmark)
      local -a opts=()
      opts=($(gum choose --no-limit --header="Benchmark options" --header.foreground=7 \
        -- "--iterations 10" "--warmup 3" "--verbose"))
      (( ${#opts} > 0 )) && args="${(j: :)opts}"
      ;;
    neural:export)
      local model=$(gum input --placeholder "model name or ID" \
        --header "Export model" --header.foreground=245 --width 50)
      [[ -n "$model" ]] && args="$model"
      ;;
    neural:import)
      local cid=$(gum input --placeholder "IPFS CID or model path" \
        --header "Import from" --header.foreground=245 --width 50)
      [[ -n "$cid" ]] && args="$cid"
      ;;

    # ── workflow ──
    workflow:run)
      local -a templates=()
      local tpl_out
      tpl_out=$(ruflo workflow template 2>&1)
      if echo "$tpl_out" | grep -q '{'; then
        templates=("${(@f)$(echo "$tpl_out" | python3 -c "
${_RFL_PYLIB}
try:
  data = pj(sys.stdin.read())
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
        --header "Hive task" --header.foreground 7 --width 60 --height 4)
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
        --header.foreground=7 "${agents[@]}" < /dev/tty)
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
        --header "Message" --header.foreground 7 --width 60 --height 4)
      [[ -z "$msg" ]] && return 1
      args="${msg// /__RFL_SP__}"
      ;;
    hive-mind:consensus)
      local topic=$(gum input --placeholder "consensus topic" \
        --header "Topic" --header.foreground=245 --width 50)
      [[ -z "$topic" ]] && return 1
      args="${topic// /__RFL_SP__}"
      ;;

    # ── Delegate to extended args builder ──
    *)
      _rfl_build_args_ext "$cmd" "$sub"
      return $?
      ;;
  esac

  echo "$args"
  return 0
}
