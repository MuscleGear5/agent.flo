# rfl.d/swarm.zsh — swarm and hive-mind orchestration
# Sourced by rfl main script

# ── Real swarm start (bypasses broken CLI, uses MCP) ─────
_rfl_swarm_start() {
  local objective="$1" types_csv="$2"
  local -a agent_types=(${${(s:,:)types_csv}## })
  local agent_count=${#agent_types}

  echo ""
  local init_out
  init_out=$(_rfl_spin "Initializing swarm ($agent_count agents)..." ruflo mcp exec --tool swarm_init -p "{\"topology\":\"hierarchical-mesh\",\"maxAgents\":$agent_count,\"strategy\":\"specialized\"}")
  local swarm_id
  swarm_id=$(echo "$init_out" | grep -oP '"swarmId"\s*:\s*"\K[^"]+' | head -1)
  if [[ -z "$swarm_id" ]]; then
    print -P "%F{196}[ERROR] Swarm init failed%f"
    echo "$init_out"
    return 1
  fi
  print -P "%F{48}[OK]%f Swarm: $swarm_id"

  local spawned=0
  local tag="${swarm_id##*-}"
  for atype in "${agent_types[@]}"; do
    local aid="swarm-${tag}-${atype}"
    local spawn_out
    spawn_out=$(_rfl_spin "Spawning $atype..." ruflo mcp exec --tool agent_spawn -p "{\"agentType\":\"$atype\",\"agentId\":\"$aid\",\"task\":\"$(_rfl_json_esc "$objective")\"}")
    if echo "$spawn_out" | grep -q '"success".*true'; then
      print -P "  %F{48}[+]%f $aid ($atype)"
      ((spawned++))
    else
      print -P "  %F{196}[x]%f $atype failed"
    fi
  done

  local task_out
  task_out=$(_rfl_spin "Creating task..." ruflo mcp exec --tool task_create -p "{\"type\":\"feature\",\"description\":\"$(_rfl_json_esc "$objective")\",\"priority\":\"high\"}")
  local tid
  tid=$(echo "$task_out" | grep -oP '"taskId"\s*:\s*"\K[^"]+' | head -1)
  [[ -n "$tid" ]] && print -P "  %F{48}[OK]%f Task: $tid"

  echo ""
  print -P "%F{48}Swarm ready: $spawned/$agent_count agents deployed%f"
  print -P "%F{245}Monitor: ruflo swarm status%f"
  print -P "%F{245}Agents:  ruflo agent list%f"
}

# ── Real hive-mind start (bypasses broken CLI, uses MCP) ──
_rfl_hive_start() {
  local topo="${1:-hierarchical-mesh}"

  echo ""
  local init_out
  init_out=$(_rfl_spin "Initializing hive-mind ($topo)..." ruflo mcp exec --tool hive-mind_init -p "{\"topology\":\"$topo\"}")
  if echo "$init_out" | grep -q '"success".*true'; then
    print -P "%F{48}[OK]%f Hive-mind initialized (topology: $topo)"
  else
    print -P "%F{196}[ERROR] Hive-mind init failed%f"
    echo "$init_out"
    return 1
  fi

  # Spawn agents
  local -a types=($(_rfl_agent_types))
  (( ${#types} == 0 )) && types=(coder researcher tester reviewer architect coordinator analyst)
  local -a selected
  selected=($(gum choose --no-limit \
    --header="Spawn agents into hive? (space to toggle, enter to confirm)" \
    --header.foreground=7 "${types[@]}"))

  if (( ${#selected} > 0 )); then
    local spawned=0 queen_id=""
    for atype in "${selected[@]}"; do
      local aid
      aid=$(_rfl_hive_spawn "$atype")
      if [[ -n "$aid" ]]; then
        ((spawned++))
        # First coordinator/architect becomes queen
        if [[ -z "$queen_id" && ("$atype" == "coordinator" || "$atype" == "architect") ]]; then
          queen_id="$aid"
        fi
      fi
    done
    # If no coordinator was picked, first agent is queen
    if [[ -z "$queen_id" && $spawned -gt 0 ]]; then
      queen_id=$(ruflo mcp exec --tool agent_list 2>&1 | python3 -c "
${_RFL_PYLIB}
try:
  d=pj(sys.stdin.read())
  agents=[a for a in d.get('agents',[]) if a.get('agentId','').startswith('hive-')]
  if agents: print(agents[-1].get('agentId',''))
except: pass
" 2>/dev/null)
    fi
    # Designate queen via coordination
    if [[ -n "$queen_id" ]]; then
      ruflo mcp exec --tool coordination_node -p "{\"nodeId\":\"$queen_id\",\"role\":\"queen\",\"capabilities\":[\"coordinate\",\"assign\",\"monitor\"]}" 2>&1 >/dev/null
      print -P "%F{208}Queen:%f %F{96}$queen_id%f"
    fi
    # Sync coordination topology
    ruflo mcp exec --tool coordination_topology -p "{\"topology\":\"$topo\",\"queen\":\"$queen_id\"}" 2>&1 >/dev/null
    ruflo mcp exec --tool coordination_sync -p "{\"action\":\"sync\"}" 2>&1 >/dev/null
    echo ""
    print -P "%F{48}Hive ready: $spawned agents, queen assigned%f"
  else
    print -P "%F{245}Hive initialized, no agents. Use hive-mind spawn/join.%f"
  fi
}

_rfl_hive_spawn() {
  local atype="$1"
  local aid="hive-${atype}-$(date +%s)-$(head -c4 /dev/urandom | od -An -tx1 | tr -d ' ')"
  local spawn_out
  spawn_out=$(_rfl_spin "Spawning $atype..." ruflo mcp exec --tool agent_spawn -p "{\"agentType\":\"$atype\",\"agentId\":\"$aid\"}")
  if echo "$spawn_out" | grep -q '"success".*true'; then
    # Join hive + register coordination
    ruflo mcp exec --tool hive-mind_join -p "{\"agentId\":\"$aid\"}" 2>&1 >/dev/null
    ruflo mcp exec --tool coordination_node -p "{\"nodeId\":\"$aid\",\"role\":\"worker\",\"capabilities\":[\"$atype\"]}" 2>&1 >/dev/null
    print -P "  %F{48}[+]%f $aid ($atype)" >&2
    echo "$aid"
    return 0
  else
    print -P "  %F{196}[x]%f $atype spawn failed" >&2
    return 1
  fi
}

# ── Command runner (intercepts broken CLI commands) ───────
# Wrapper that captures output and fires suggestions immediately
_rfl_run_capture() {
  local _cap_file=$(mktemp)
  _rfl_run "$@" 2>&1 | tee "$_cap_file"
  _RFL_LAST_OUTPUT=$(tail -30 "$_cap_file" 2>/dev/null)
  rm -f "$_cap_file"
  # Fire suggestion fetch NOW so it runs while user reads output
  _rfl_suggest_bg "$1" "$2"
}
