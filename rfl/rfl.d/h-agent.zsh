# rfl.d/h-agent.zsh — agent handlers
# Sourced by handlers.zsh

_rfl_run_agent() {
  local sub="$1"; shift
  case "$sub" in
    list)
      echo ""
      local _al_data
      _al_data=$(_rfl_spin "Loading agents..." ruflo mcp exec --tool agent_list)
      local _table
      _table=$(echo "$_al_data" | python3 -c "
${_RFL_PYLIB}
try:
  txt=sys.stdin.read(); d=pj(txt)
  print('Status|Type|ID')
  for a in d.get('agents',[]):
    at=a.get('agentType','?'); aid=a.get('agentId',a.get('id','?')); st=a.get('status','?')
    st_c=(SC.get(st,'')+st+R) if SC.get(st) else st
    print(f'{st_c}|{at}|{aid}')
except: pass
" 2>/dev/null)
      if [[ -n "$_table" && $(echo "$_table" | wc -l) -gt 1 ]]; then
        echo "$_table" | gum table --separator '|' --border thick --print
      else
        print -P "  %F{245}(none)%f"
      fi
      echo ""
      ;;
    status)
      local aid="${1//\"/}"
      [[ -z "$aid" ]] && { print -P "%F{196}[ERROR] No agent ID%f"; return 1; }
      echo ""
      local _as_raw _table
      _as_raw=$(_rfl_spin "Loading..." ruflo mcp exec --tool agent_list)
      _table=$(printf '%s' "$_as_raw" | AID="$aid" python3 -c "
${_RFL_PYLIB}
import os; aid=os.environ['AID']
txt=sys.stdin.read()
try: d=pj(txt)
except: d={}
a=next((x for x in d.get('agents',[]) if x.get('agentId',x.get('id',''))==aid),None)
if a:
    print('Field|Value')
    for k,v in a.items():
        if v in (None,''): continue
        if isinstance(v,list): v=','.join(str(x) for x in v)
        s=str(v); c=SC.get(s.lower().split()[0] if s else '','')
        if k=='status' and c: s=c+s+R
        print(f'{k}|{s}')
" 2>/dev/null)
      if [[ -n "$_table" && $(echo "$_table" | wc -l) -gt 1 ]]; then
        echo "$_table" | gum table --separator '|' --border thick --print
      else
        print -P "  %F{245}(not found: $aid)%f"
      fi
      echo ""
      ;;
    spawn)
      local atype="" _aname=""
      while [[ $# -gt 0 ]]; do
        case "$1" in
          -t|--type) shift; atype="${1//\"/}" ;;
          --name)    shift; _aname="${1//\"/}" ;;
          *)         [[ -z "$atype" ]] && atype="${1//\"/}" ;;
        esac
        shift
      done
      [[ -z "$atype" ]] && atype="coder"
      local aid="agent-$(date +%s)-$(head -c3 /dev/urandom | od -An -tx1 | tr -d ' ')"
      local _sp_out
      _sp_out=$(_rfl_spin "Spawning $atype..." ruflo mcp exec --tool agent_spawn -p "{\"agentType\":\"$atype\",\"agentId\":\"$aid\"}")
      if [[ "$_sp_out" == *'"success"'*true* ]]; then
        print -P "%F{48}[+]%f %F{96}$aid%f (%F{245}$atype%f)"
      else
        print -P "%F{196}[x] Spawn failed%f"
      fi
      ;;
    stop)
      local aid="${1//\"/}"
      [[ -z "$aid" ]] && { print -P "%F{196}[ERROR] No agent ID%f"; return 1; }
      gum confirm "Stop agent $aid?" --affirmative "Yes" --negative "No" || return 0
      local _st_out
      _st_out=$(_rfl_spin "Stopping $aid..." ruflo mcp exec --tool agent_terminate -p "{\"agentId\":\"$aid\"}")
      if [[ "$_st_out" == *'"success"'*true* ]]; then
        print -P "%F{48}[-]%f %F{96}$aid%f stopped"
      else
        print -P "%F{196}[x] Stop failed%f"
      fi
      ;;
    pool)
      local action="${1//\"/}" count="${2//\"/}"
      [[ -z "$action" ]] && action="status"
      local _ap_out
      if [[ "$action" == "scale" && -n "$count" ]]; then
        _ap_out=$(_rfl_spin "Scaling pool to $count..." ruflo mcp exec --tool agent_pool -p "{\"action\":\"scale\",\"count\":$count}")
      else
        _ap_out=$(_rfl_spin "Pool $action..." ruflo mcp exec --tool agent_pool -p "{\"action\":\"$action\"}")
      fi
      if [[ "$_ap_out" == *'{'* ]]; then
        echo "$_ap_out" | python3 -c "
${_RFL_PYLIB}
try:
  d=pj(sys.stdin.read())
  rows=[]
  for k,v in d.items():
    if k not in ('success',) and v not in (None,''):
      if isinstance(v,float): v=f'{v:.4f}'
      rows.append([k, sc(str(v))])
  if rows: print(tbl(['Field','Value'], rows))
  else: print('  (no data)')
except: pass
" 2>/dev/null
      else
        echo "$_ap_out"
      fi
      ;;
    health)
      local aid="${1//\"/}"
      [[ -z "$aid" ]] && { print -P "%F{196}[ERROR] No agent ID%f"; return 1; }
      echo ""
      local _ah_out _table
      _ah_out=$(_rfl_spin "Checking health..." ruflo mcp exec --tool agent_list)
      _table=$(echo "$_ah_out" | AID="$aid" python3 -c "
${_RFL_PYLIB}
import os; aid=os.environ['AID']
txt=sys.stdin.read()
d=pj(txt)
a=next((x for x in d.get('agents',[]) if x.get('agentId',x.get('id',''))==aid),None)
if a:
    print('Field|Value')
    for k,v in a.items():
        if v is None or v=='': continue
        if isinstance(v,list): v=','.join(str(x) for x in v)
        s=str(v)
        if k=='status':
            c=SC.get(s.lower().split()[0] if s else '','')
            s=c+s+R if c else s
        print(f'{k}|{s}')
" 2>/dev/null)
      if [[ -n "$_table" && $(echo "$_table" | wc -l) -gt 1 ]]; then
        echo "$_table" | gum table --separator '|' --border thick --print
      else
        print -P "  %F{245}(no data)%f"
      fi
      echo ""
      ;;
    *) return 1 ;;
  esac
}
