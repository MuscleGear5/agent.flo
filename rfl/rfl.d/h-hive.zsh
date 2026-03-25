# rfl.d/h-hive.zsh — hive-mind handlers (init/spawn/status/task)
# Sourced by handlers.zsh

_rfl_run_hive() {
  local sub="$1"; shift
  case "$sub" in
    init)
      _rfl_hive_start "$@"
      ;;
    spawn)
      local atype=""
      while [[ $# -gt 0 ]]; do
        case "$1" in --type) shift; atype="$1" ;; esac; shift
      done
      [[ -z "$atype" ]] && { print -P "%F{196}[ERROR] No agent type%f"; return 1; }
      _rfl_hive_spawn "$atype"
      ;;
    status)
      echo ""
      print -P "%BHive-Mind Status%b"
      echo ""
      { _rfl_spin "Loading hive..." ruflo mcp exec --tool hive-mind_status; echo "---S---"
        _rfl_spin "Loading agents..." ruflo mcp exec --tool agent_list; } | python3 -c "
${_RFL_PYLIB}
parts=sys.stdin.read().split('---S---')
hm=pj(parts[0] if len(parts)>0 else '')
pool=pj(parts[1] if len(parts)>1 else '')
all_agents=pool.get('agents',[])
agents=[a for a in all_agents if not (a.get('status','')=='unknown' and a.get('agentType','')=='worker')]
if hm:
    hrows=[]
    for k,label in [('swarmId','Hive'),('status','Status'),('topology','Topology'),('agentCount','Agents')]:
        v=hm.get(k,'')
        if v is not None and v!='': hrows.append([label, sc(str(v))])
    if hrows: print(tbl(['Field','Value'], hrows))
    print()
if agents:
    rows=[[sc(a.get('status','?')),a.get('agentType',a.get('type','?')),a.get('agentId',a.get('id','?'))] for a in agents]
    print(tbl(['Status','Type','ID'],rows))
else:
    print('  (no agents)')
" 2>/dev/null
      echo ""
      ;;
    task)
      local desc="${*//\"/}"
      desc="${desc//__RFL_SP__/ }"
      [[ -z "$desc" ]] && { print -P "%F{196}[ERROR] No task description%f"; return 1; }
      local esc_desc=$(_rfl_json_esc "$desc")
      local task_out
      task_out=$(_rfl_spin "Creating task..." ruflo mcp exec --tool task_create -p "{\"type\":\"feature\",\"description\":\"$esc_desc\",\"priority\":\"high\"}")
      local tid
      tid=$(echo "$task_out" | grep -oP '"taskId"\s*:\s*"\K[^"]+' | head -1)
      if [[ -z "$tid" ]]; then
        print -P "%F{196}[x] Task creation failed%f"; echo "$task_out"; return 1
      fi
      print -P "  %F{48}[+]%f Task: $tid"
      local agent_out
      agent_out=$(_rfl_spin "Finding agents..." ruflo mcp exec --tool agent_list)
      local assignee
      assignee=$(echo "$agent_out" | python3 -c "
${_RFL_PYLIB}
try:
  d=pj(sys.stdin.read())
  for a in d.get('agents',[]):
    if a.get('status') in ('idle','active'):
      print(a.get('agentId',a.get('id',''))); break
except: pass
" 2>/dev/null)
      if [[ -n "$assignee" ]]; then
        print -P "%F{96}Assigning to $assignee...%f"
        ruflo mcp exec --tool task_assign -p "{\"taskId\":\"$tid\",\"agentIds\":[\"$(_rfl_json_esc "$assignee")\"]}" 2>&1 >/dev/null
        print -P "  %F{48}[+]%f Assigned to: $assignee"
      fi
      ruflo mcp exec --tool hive-mind_broadcast -p "{\"message\":\"task: $esc_desc\",\"taskId\":\"$tid\",\"type\":\"task\"}" 2>&1 >/dev/null
      print -P "  %F{48}[+]%f Broadcast to hive"
      local orch_out
      orch_out=$(_rfl_spin "Orchestrating..." ruflo mcp exec --tool coordination_orchestrate -p "{\"taskId\":\"$tid\",\"strategy\":\"auto\",\"description\":\"$esc_desc\"}")
      if [[ "$orch_out" == *'"success"'*true* ]]; then
        print -P "  %F{48}[+]%f Orchestration started"
      else
        print -P "  %F{245}[~]%f Orchestration queued"
      fi
      echo ""
      print -P "%F{48}Task $tid dispatched%f"
      print -P "  %F{245}$desc%f"
      ;;
    join|leave|consensus|broadcast|memory|optimize-memory|shutdown)
      _rfl_run_hive2 "$sub" "$@"
      ;;
    *) return 1 ;;
  esac
}
