# rfl.d/h-workflow.zsh — workflow handlers
# Sourced by handlers.zsh

_rfl_run_wf() {
  local sub="$1"; shift
  case "$sub" in
    list)
      echo ""
      print -P "%BWorkflows%b"
      echo ""
      local _wl_data
      _wl_data=$(_rfl_spin "Loading workflows..." ruflo mcp exec --tool workflow_list)
      local _table
      _table=$(echo "$_wl_data" | python3 -c "
${_RFL_PYLIB}
try:
  txt=sys.stdin.read(); d=pj(txt)
  wl=d.get('workflows', d.get('items',[]))
  if not wl: pass
  else:
    print('ID|Name|Status')
    for w in wl:
      wid=w.get('workflowId',w.get('id','?'))
      name=w.get('name',w.get('template',''))
      st=w.get('status','')
      print(f'{wid}|{name}|{st}')
except Exception as e: print(f'ERR: {e}',file=sys.stderr)
" 2>/dev/null)
      if [[ -n "$_table" && $(echo "$_table" | wc -l) -gt 1 ]]; then
        echo "$_table" | gum table --separator '|' --border bold --print
      else
        print -P "  %F{245}(none)%f"
      fi
      echo ""
      ;;
    run)
      local template="${*//\"/}"
      template="${template//__RFL_SP__/ }"
      [[ -z "$template" ]] && { print -P "%F{196}[ERROR] No template%f"; return 1; }
      local _wr_out
      _wr_out=$(_rfl_spin "Running workflow..." ruflo mcp exec --tool workflow_run -p "{\"template\":\"$(_rfl_json_esc "$template")\"}")
      local wid
      wid=$(echo "$_wr_out" | grep -oP '"workflowId"\s*:\s*"\K[^"]+' | head -1)
      if [[ -n "$wid" ]]; then
        print -P "%F{48}[+]%f Workflow started: %F{96}$wid%f"
        print -P "  %F{245}Template: $template%f"
      else
        print -P "%F{196}[x] Workflow run failed%f"; echo "$_wr_out"
      fi
      ;;
    status)
      local wid="${1//\"/}"
      [[ -z "$wid" ]] && { print -P "%F{196}[ERROR] No workflow ID%f"; return 1; }
      echo ""
      local _wst_out _table
      _wst_out=$(_rfl_spin "Loading..." ruflo mcp exec --tool workflow_list)
      _table=$(echo "$_wst_out" | python3 -c "
${_RFL_PYLIB}
wid='$wid'
txt=sys.stdin.read(); d=pj(txt)
items=d.get('workflows',d.get('items',[]))
w=next((x for x in items if x.get('workflowId',x.get('id',''))==wid),None)
if w:
    print('Field|Value')
    for k,v in w.items():
        if v is None or v=='': continue
        if isinstance(v,(dict,)): continue
        if isinstance(v,list): v=','.join(str(x) for x in v)
        s=str(v)
        if k=='status':
            c=SC.get(s.lower().split()[0] if s else '','')
            s=c+s+R if c else s
        print(f'{k}|{s}')
" 2>/dev/null)
      if [[ -n "$_table" && $(echo "$_table" | wc -l) -gt 1 ]]; then
        echo "$_table" | gum table --separator '|' --border bold --print
      else
        print -P "  %F{245}(not found)%f"
      fi
      echo ""
      ;;
    stop)
      local wid="${1//\"/}"
      [[ -z "$wid" ]] && { print -P "%F{196}[ERROR] No workflow ID%f"; return 1; }
      gum confirm "Cancel workflow $wid?" --affirmative "Yes" --negative "No" || return 0
      local _wcs_out
      _wcs_out=$(_rfl_spin "Cancelling..." ruflo mcp exec --tool workflow_cancel -p "{\"workflowId\":\"$wid\"}")
      if [[ "$_wcs_out" == *'"success"'*true* ]]; then
        print -P "%F{48}[-]%f Workflow cancelled: %F{245}$wid%f"
      else
        print -P "%F{196}[x] Cancel failed%f"; echo "$_wcs_out"
      fi
      ;;
    template)
      local _wt_out
      _wt_out=$(_rfl_spin "Loading templates..." ruflo mcp exec --tool workflow_template -p "{}")
      local _table
      _table=$(echo "$_wt_out" | python3 -c "
${_RFL_PYLIB}
try:
  txt=sys.stdin.read(); d=pj(txt)
  tpls=d.get('templates', d.get('items', []))
  if tpls:
    print('Name|Description')
    for t in tpls:
      n=t.get('name',t.get('id','?'))
      desc=str(t.get('description',''))[:60].replace('|',' ')
      print(f'{n}|{desc}')
except: pass
" 2>/dev/null)
      echo ""
      if [[ -n "$_table" && $(echo "$_table" | wc -l) -gt 1 ]]; then
        print -P "%BWorkflow Templates%b"
        echo ""
        echo "$_table" | gum table --separator '|' --border bold --print
      else
        print -P "  %F{245}(no templates)%f"
      fi
      echo ""
      ;;
    *) return 1 ;;
  esac
}
