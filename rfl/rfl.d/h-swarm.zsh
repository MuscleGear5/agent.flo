# rfl.d/h-swarm.zsh — swarm handlers
# Sourced by handlers.zsh

_rfl_run_swarm() {
  local sub="$1"; shift
  case "$sub" in
    start)
      # Extract objective + types from args (spaces encoded as __RFL_SP__)
      local obj="" types_csv=""
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --objective) shift; obj="${1//__RFL_SP__/ }" ;;
          --types)     shift; types_csv="$1" ;;
        esac
        shift
      done
      [[ -z "$obj" ]] && { print -P "%F{196}[ERROR] No objective provided%f"; return 1; }
      _rfl_swarm_start "$obj" "$types_csv"
      ;;
    status)
      echo ""
      print -P "%BSwarm Status%b"
      echo ""
      { _rfl_spin "Loading swarm..." ruflo mcp exec --tool swarm_status; echo "---S---"
        _rfl_spin "Loading agents..." ruflo mcp exec --tool agent_list;   echo "---S---"
        _rfl_spin "Loading tasks..." ruflo mcp exec --tool task_list; } | python3 -c "
${_RFL_PYLIB}
parts=sys.stdin.read().split('---S---')
if len(parts) < 3: parts += ['{}'] * (3 - len(parts))
sw=pj(parts[0] if len(parts)>0 else '')
pool=pj(parts[1] if len(parts)>1 else '')
td=pj(parts[2] if len(parts)>2 else '')
agents=pool.get('agents',[])
tl=td.get('tasks',[])
n_a=len([a for a in agents if a.get('status') in ('active','running','in_progress')])
n_i=len([a for a in agents if a.get('status')=='idle'])
n_tp=len([t for t in tl if t.get('status') in ('in_progress','running','active')])
n_pe=len([t for t in tl if t.get('status') in ('pending','queued')])
n_do=len([t for t in tl if t.get('status')=='completed'])
srows=[
  ['Agents', f'{GR}{n_a}{R} active  {YL}{n_i}{R} idle  {GY}{len(agents)-n_a-n_i}{R} other'],
  ['Tasks',  f'{GR}{n_tp}{R} active  {OR}{n_pe}{R} pending  {GY}{n_do}{R} done'],
]
print(tbl(['','Summary'], srows))
print()
if agents:
    print(tbl(['Status','Type','ID'],[[sc(a.get('status','?')),a.get('agentType',a.get('type','?')),a.get('agentId',a.get('id','?'))] for a in agents]))
    print()
if tl:
    rows=[]
    for t in tl:
        ass=t.get('assignedTo','')
        if isinstance(ass,list): ass=','.join(ass)
        rows.append([sc(t.get('status','?')),t.get('taskId',t.get('id','?'))[:28],ass[:20] or '-',t.get('description',t.get('type',''))[:36]])
    print(tbl(['Status','ID','Assignee','Description'],rows))
" 2>/dev/null
      echo ""
      ;;
    init)
      local topo="mesh"
      while [[ $# -gt 0 ]]; do
        case "$1" in --topology) shift; topo="$1" ;; esac; shift
      done
      local _si_out
      _si_out=$(_rfl_spin "Initializing swarm ($topo)..." ruflo mcp exec --tool swarm_init -p "{\"topology\":\"$topo\"}")
      local sid
      sid=$(echo "$_si_out" | grep -oP '"swarmId"\s*:\s*"\K[^"]+' | head -1)
      if [[ -n "$sid" ]]; then
        print -P "%F{48}[OK]%f Swarm: %F{96}$sid%f (topology: $topo)"
      else
        print -P "%F{196}[x] Swarm init failed%f"; echo "$_si_out"
      fi
      ;;
    stop)
      gum confirm "Stop swarm?" --affirmative "Yes" --negative "No" || return 0
      local _sst_out
      _sst_out=$(_rfl_spin "Stopping swarm..." ruflo mcp exec --tool swarm_stop -p "{}")
      if [[ "$_sst_out" == *'"success"'*true* ]]; then
        print -P "%F{48}[OK]%f Swarm stopped"
      else
        print -P "%F{196}[x] Stop failed%f"; echo "$_sst_out"
      fi
      ;;
    *) return 1 ;;
  esac
}
