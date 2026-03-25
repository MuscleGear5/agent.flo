# rfl.d/h-task.zsh — task handlers
# Sourced by handlers.zsh

_rfl_run_task() {
  local sub="$1"; shift
  case "$sub" in
    list)
      echo ""
      local _tl_data
      _tl_data=$(_rfl_spin "Loading tasks..." ruflo mcp exec --tool task_list)
      echo "$_tl_data" | python3 -c "
${_RFL_PYLIB}
try:
    txt=sys.stdin.read(); d=pj(txt)
    tasks=d.get('tasks',[])
    if not tasks: print('  (none)'); sys.exit(0)
    rows=[]
    for t in tasks:
        tid=str(t.get('taskId',t.get('id','?')) or '?')
        st=str(t.get('status','?') or '?')
        ass=t.get('assignedTo','') or ''
        if isinstance(ass,list): ass=','.join(str(a) for a in ass)
        desc=str(t.get('description','') or t.get('type','') or '(none)')[:40]
        rows.append([sc(st), tid, ass[:18] or '-', desc])
    print(tbl(['Status','ID','Assignee','Description'],rows))
except Exception as e: print('  (error: '+str(e)+')')
" 2>/dev/null
      echo ""
      ;;
    status)
      local tid="${1//\"/}"
      [[ -z "$tid" ]] && { print -P "%F{196}[ERROR] No task ID%f"; return 1; }
      echo ""
      local _ts_raw _table
      _ts_raw=$(_rfl_spin "Loading..." ruflo mcp exec --tool task_list)
      _table=$(printf '%s' "$_ts_raw" | python3 -c "
${_RFL_PYLIB}
d=pj(sys.stdin.read())
t=next((x for x in d.get('tasks',[]) if x.get('taskId',x.get('id',''))=='$tid'),None)
if t:
    print('Field|Value')
    for k,v in t.items():
        if v in (None,''): continue
        if isinstance(v,list): v=','.join(str(x) for x in v)
        s=str(v)
        if k=='status': s=sc(s)
        print(f'{k}|{s}')
" 2>/dev/null)
      if [[ -n "$_table" && $(echo "$_table" | wc -l) -gt 1 ]]; then
        echo "$_table" | gum table --separator '|' --border bold --print
      else
        print -P "  %F{245}(not found: $tid)%f"
      fi
      echo ""
      ;;
    create)
      # Parse -t type -d description flags OR treat all args as description
      local ttype="feature" desc=""
      while [[ $# -gt 0 ]]; do
        case "$1" in
          -t|--type)        shift; ttype="${1//__RFL_SP__/ }" ;;
          -d|--description) shift; desc="${1//__RFL_SP__/ }" ;;
          *)                desc="${desc:+$desc }${1//__RFL_SP__/ }" ;;
        esac
        shift
      done
      desc="${desc//\"/}"
      [[ -z "$desc" ]] && { print -P "%F{196}[ERROR] No description%f"; return 1; }
      local _tc_out
      _tc_out=$(_rfl_spin "Creating task..." ruflo mcp exec --tool task_create -p "{\"type\":\"$ttype\",\"description\":\"$(_rfl_json_esc "$desc")\",\"priority\":\"high\"}")
      local tid
      tid=$(echo "$_tc_out" | grep -oP '"taskId"\s*:\s*"\K[^"]+' | head -1)
      if [[ -n "$tid" ]]; then
        print -P "%F{48}[+]%f Task: %F{96}$tid%f (%F{245}$ttype%f)"
        print -P "  %F{245}$desc%f"
        # Auto-assign to first idle agent
        local _idle_agent _al_raw
        _al_raw=$(_rfl_spin "Finding agent..." ruflo mcp exec --tool agent_list)
        _idle_agent=$(echo "$_al_raw" | python3 -c "
${_RFL_PYLIB}
d=pj(sys.stdin.read())
for a in d.get('agents',[]):
    if a.get('status') in ('idle','active'):
        print(a.get('agentId',a.get('id',''))); break
" 2>/dev/null)
        if [[ -n "$_idle_agent" ]]; then
          ruflo mcp exec --tool task_assign -p "{\"taskId\":\"$tid\",\"agentIds\":[\"$_idle_agent\"]}" 2>&1 >/dev/null
          print -P "  %F{48}[+]%f Assigned to: %F{96}$_idle_agent%f"
        fi
      else
        print -P "%F{196}[x] Task creation failed%f"
      fi
      ;;
    assign)
      # Parse: tid aid | tid to aid | tid --agent aid
      local tid="" aid=""
      while [[ $# -gt 0 ]]; do
        case "$1" in
          to|--agent|-a) shift; aid="${1//\"/}" ;;
          task-*)        tid="${1//\"/}" ;;
          *)
            if [[ -z "$tid" ]]; then tid="${1//\"/}"
            elif [[ -z "$aid" ]]; then aid="${1//\"/}"
            fi ;;
        esac
        shift
      done
      [[ -z "$tid" ]] && { print -P "%F{196}[ERROR] No task ID%f"; return 1; }
      # Auto-pick first idle agent if none specified
      if [[ -z "$aid" ]]; then
        local _al_raw
        _al_raw=$(_rfl_spin "Finding agent..." ruflo mcp exec --tool agent_list)
        aid=$(echo "$_al_raw" | python3 -c "
${_RFL_PYLIB}
try:
  d=pj(sys.stdin.read())
  for a in d.get('agents',[]):
    if a.get('status') in ('idle','active'):
      print(a.get('agentId',a.get('id',''))); break
except: pass
" 2>/dev/null)
      fi
      [[ -z "$aid" ]] && { print -P "%F{196}[ERROR] No agents available%f"; return 1; }
      local _ta_out
      _ta_out=$(_rfl_spin "Assigning task..." timeout 10 ruflo mcp exec --tool task_assign -p "{\"taskId\":\"$tid\",\"agentIds\":[\"$aid\"]}")
      if [[ "$_ta_out" == *'"assignedTo"'* && "$_ta_out" != *'"error"'* ]]; then
        print -P "%F{48}[+]%f %F{245}$tid%f -> %F{96}$aid%f"
      else
        print -P "%F{196}[x] Assign failed%f"
        echo "$_ta_out"
      fi
      ;;
    cancel)
      local tid="${1//\"/}"
      [[ -z "$tid" ]] && { print -P "%F{196}[ERROR] No task ID%f"; return 1; }
      gum confirm "Cancel task $tid?" --affirmative "Yes" --negative "No" || return 0
      local _tcl_out
      _tcl_out=$(_rfl_spin "Cancelling..." ruflo mcp exec --tool task_cancel -p "{\"taskId\":\"$tid\"}")
      if [[ "$_tcl_out" == *'"success"'*true* ]]; then
        print -P "%F{48}[-]%f Task %F{245}$tid%f cancelled"
      else
        print -P "%F{196}[x] Cancel failed%f"; echo "$_tcl_out"
      fi
      ;;
    complete)
      local tid="${1//\"/}"
      [[ -z "$tid" ]] && { print -P "%F{196}[ERROR] No task ID%f"; return 1; }
      local _tco_out
      _tco_out=$(_rfl_spin "Completing task..." ruflo mcp exec --tool task_complete -p "{\"taskId\":\"$tid\"}")
      if [[ "$_tco_out" == *'"success"'*true* || "$_tco_out" == *'"status"'*"completed"* ]]; then
        print -P "%F{48}[✓]%f Task %F{245}$tid%f marked complete"
      else
        print -P "%F{196}[x] Complete failed%f"; echo "$_tco_out"
      fi
      ;;
    *) return 1 ;;
  esac
}
