# rfl.d/h-misc.zsh — status/mcp/config/hooks/progress handlers
# Sourced by handlers.zsh

_rfl_run_misc() {
  local cmd="$1" sub="$2"; shift 2
  case "$cmd:$sub" in
    status:agents)  _rfl_run_agent "list" "$@" ;;
    status:tasks)   _rfl_run_task "list" "$@" ;;
    status:memory)  _rfl_run_memory "list" "$@" ;;

    mcp:status)
      echo ""
      local _out
      _out=$(_rfl_spin "Checking MCP..." ruflo mcp exec --tool mcp_status -p "{}")
      echo "$_out" | python3 -c "
${_RFL_PYLIB}
txt=sys.stdin.read(); d=pj(txt)
if d:
  rows=[]
  run=d.get('running',False)
  rows.append(['status', (GR+'running'+R) if run else (RD+'stopped'+R)])
  for k,v in d.items():
    if k=='running': continue
    if v is not None: rows.append([k, sc(str(v))])
  if rows: print(tbl(['Field','Value'], rows))
" 2>/dev/null
      echo ""
      ;;

    config:get)
      local key="${1//\"/}"
      local _out
      if [[ -n "$key" ]]; then
        _out=$(_rfl_spin "Getting config..." ruflo mcp exec --tool config_get -p "{\"key\":\"$(_rfl_json_esc "$key")\"}")
      else
        _out=$(_rfl_spin "Getting config..." ruflo mcp exec --tool config_get -p "{}")
      fi
      echo ""
      echo "$_out" | python3 -c "
${_RFL_PYLIB}
txt=sys.stdin.read(); d=pj(txt)
if d:
  rows=[]
  for k,v in d.items():
    if v is not None: rows.append([k, sc(str(v))])
  if rows: print(tbl(['Field','Value'], rows))
" 2>/dev/null
      echo ""
      ;;
    config:set)
      local key="" val=""
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --key|-k)   shift; key="${1//__RFL_SP__/ }" ;;
          --value|-v) shift; val="${1//__RFL_SP__/ }" ;;
          *) [[ -z "$key" ]] && key="${1//__RFL_SP__/ }" || [[ -z "$val" ]] && val="${1//__RFL_SP__/ }" ;;
        esac; shift
      done
      key="${key//\"/}"; val="${val//\"/}"
      [[ -z "$key" ]] && { print -P "%F{196}[ERROR] No key%f"; return 1; }
      local _out
      _out=$(_rfl_spin "Setting..." ruflo mcp exec --tool config_set -p "{\"key\":\"$(_rfl_json_esc "$key")\",\"value\":\"$(_rfl_json_esc "$val")\"}")
      if [[ "$_out" == *'"success"'*true* ]]; then
        print -P "%F{48}[OK]%f Set %F{96}$key%f = %F{245}$val%f"
      else
        print -P "%F{196}[x] Set failed%f"
      fi
      ;;
    config:reset)
      gum confirm "Reset all config to defaults?" --affirmative "Yes" --negative "No" || return 0
      local _out
      _out=$(_rfl_spin "Resetting..." ruflo mcp exec --tool config_reset -p "{}")
      if [[ "$_out" == *'"success"'*true* ]]; then
        print -P "%F{48}[OK]%f Config reset to defaults"
      else
        print -P "%F{196}[x] Reset failed%f"
      fi
      ;;

    hooks:list)
      echo ""
      local _out
      _out=$(_rfl_spin "Loading hooks..." ruflo mcp exec --tool hooks_list -p "{}")
      local _table
      _table=$(echo "$_out" | python3 -c "
${_RFL_PYLIB}
txt=sys.stdin.read(); d=pj(txt)
hooks=d.get('hooks', d.get('items', []))
if hooks:
  print('Name|Type|Status')
  for h in hooks:
    n=h.get('name',h.get('id','?'))
    t=h.get('type',h.get('event','?'))
    s=h.get('status','active')
    print(f'{n}|{t}|{s}')
" 2>/dev/null)
      if [[ -n "$_table" && $(echo "$_table" | wc -l) -gt 1 ]]; then
        echo "$_table" | gum table --separator '|' --border thick --print
      else
        print -P "  %F{245}(no hooks)%f"
      fi
      echo ""
      ;;
    hooks:metrics)
      echo ""
      local _out
      _out=$(_rfl_spin "Loading metrics..." ruflo mcp exec --tool hooks_metrics -p "{}")
      print -P "%BHook Metrics%b"
      echo "$_out" | python3 -c "
${_RFL_PYLIB}
txt=sys.stdin.read(); d=pj(txt)
if d:
  rows=[]
  for k,v in d.items():
    if k not in ('success',) and v is not None:
      if isinstance(v,float): v=f'{v:.4f}'
      rows.append([k, sc(str(v))])
  if rows: print(tbl(['Metric','Value'], rows))
" 2>/dev/null
      echo ""
      ;;

    progress:watch)
      echo ""
      print -P "%Bprogress watch%b  %F{245}(ctrl-c to stop)%f"
      echo ""
      ruflo progress watch 2>&1 | _rfl_colorize
      ;;
    progress:check|progress:sync|progress:summary)
      echo ""
      local _out
      _out=$(_rfl_spin "Loading progress..." ruflo mcp exec --tool progress_$sub)
      local _table
      _table=$(printf '%s' "$_out" | python3 -c "
${_RFL_PYLIB}
txt=sys.stdin.read()
d=pj(txt)
if not d: print('(no data)')
else:
    rows=[]
    for k,v in d.items():
        if v in (None,''): continue
        if isinstance(v,dict):
            for sk,sv in v.items(): rows.append(f'{k}.{sk}|{sc(str(sv))}')
        elif isinstance(v,list):
            rows.append(f'{k}|{sc(\", \".join(str(x) for x in v))}')
        else: rows.append(f'{k}|{sc(str(v))}')
    if rows:
        print('Field|Value')
        for r in rows: print(r)
" 2>/dev/null)
      if [[ -n "$_table" && $(echo "$_table" | wc -l) -gt 1 ]]; then
        echo "$_table" | gum table --separator '|' --border thick --print
      else
        echo "$_out" | _rfl_colorize
      fi
      echo ""
      ;;

    config:init)
      local _out
      _out=$(_rfl_spin "Initializing config..." ruflo config init --force)
      if [[ "$_out" == *success* || "$_out" == *initialized* || "$_out" == *created* ]]; then
        print -P "%F{48}[OK]%f Config initialized"
      else
        print -P "%F{196}[x] Config init failed%f"
      fi
      echo "$_out" | _rfl_colorize
      ;;
    config:providers)
      echo ""
      print -P "%BProviders%b"
      echo ""
      local _out
      _out=$(_rfl_spin "Loading providers..." ruflo mcp exec --tool config_get -p "{\"key\":\"providers\"}")
      if [[ "$_out" == *'{'* ]]; then
        echo "$_out" | python3 -c "
${_RFL_PYLIB}
try:
  d=pj(sys.stdin.read())
  ps=d.get('providers',d.get('value',d))
  if isinstance(ps,dict):
    rows=[]
    for k,v in ps.items():
      if isinstance(v,dict):
        st=v.get('enabled','?')
        rows.append([k, sc(str(st)), str(v.get('model',v.get('endpoint','')))[:40]])
      else:
        rows.append([k, sc(str(v)), ''])
    if rows: print(tbl(['Provider','Status','Detail'], rows))
    else: print('  (no providers)')
  elif isinstance(ps,list):
    rows=[[str(p.get('name','?')), sc(str(p.get('status','?')))] for p in ps if isinstance(p,dict)]
    if rows: print(tbl(['Provider','Status'], rows))
  else: print(f'  {ps}')
except Exception as e: print(f'  [error] {e}')
" 2>/dev/null
      else
        print -P "  %F{245}(no provider data)%f"
      fi
      echo ""
      ;;
    config:export)
      local path="${1//__RFL_SP__/ }"
      path="${path//\"/}"
      local _out
      _out=$(_rfl_spin "Exporting config..." ruflo mcp exec --tool config_export -p "{}")
      if [[ "$_out" == *'{'* ]]; then
        if [[ -n "$path" ]]; then
          echo "$_out" > "$path"
          print -P "%F{48}[OK]%f Config exported to %F{96}$path%f"
        else
          echo ""
          print -P "%BConfig Export%b"
          echo "$_out" | python3 -c "
${_RFL_PYLIB}
try:
  d=pj(sys.stdin.read())
  rows=[]
  for k,v in d.items():
    if v not in (None,''):
      if isinstance(v,dict): v='{...}'
      if isinstance(v,list): v=f'[{len(v)} items]'
      if isinstance(v,float): v=f'{v:.4f}'
      rows.append([k, str(v)[:60]])
  if rows: print(tbl(['Key','Value'], rows))
except Exception as e: print(f'  [error] {e}')
" 2>/dev/null
        fi
      else
        echo "$_out" | _rfl_colorize
      fi
      echo ""
      ;;
    config:import)
      local source="${1//__RFL_SP__/ }"
      source="${source//\"/}"
      [[ -z "$source" ]] && { print -P "%F{196}[ERROR] No source path%f"; return 1; }
      [[ ! -f "$source" ]] && { print -P "%F{196}[ERROR] File not found: $source%f"; return 1; }
      gum confirm "Import config from '$source'?" --affirmative "Yes" --negative "No" || return 0
      local _out
      _out=$(_rfl_spin "Importing..." ruflo mcp exec --tool config_import -p "{\"path\":\"$(_rfl_json_esc "$source")\"}")
      if [[ "$_out" == *'"success"'*true* ]]; then
        print -P "%F{48}[OK]%f Config imported from %F{96}$source%f"
      else
        print -P "%F{196}[x] Import failed%f"; echo "$_out"
      fi
      ;;

    mcp:start)
      local _out
      _out=$(_rfl_spin "Starting MCP server..." ruflo mcp start)
      if [[ "$_out" == *started* || "$_out" == *running* || "$_out" == *success* ]]; then
        print -P "%F{48}[OK]%f MCP server started"
      else
        print -P "%F{196}[x] MCP start failed%f"
      fi
      echo "$_out" | _rfl_colorize
      ;;
    mcp:stop)
      gum confirm "Stop MCP server?" --affirmative "Yes" --negative "No" || return 0
      local _out
      _out=$(_rfl_spin "Stopping MCP server..." ruflo mcp stop)
      if [[ "$_out" == *stopped* || "$_out" == *success* ]]; then
        print -P "%F{48}[OK]%f MCP server stopped"
      else
        print -P "%F{196}[x] MCP stop failed%f"
      fi
      echo "$_out" | _rfl_colorize
      ;;
    mcp:health)
      echo ""
      print -P "%BMCP Health%b"
      echo ""
      local _out
      _out=$(_rfl_spin "Checking health..." ruflo mcp exec --tool mcp_status -p "{}")
      if [[ "$_out" == *'{'* ]]; then
        echo "$_out" | python3 -c "
${_RFL_PYLIB}
try:
  d=pj(sys.stdin.read())
  rows=[]
  run=d.get('running',False)
  rows.append(['status', (GR+'healthy'+R) if run else (RD+'unhealthy'+R)])
  for k in ('uptime','connections','toolCount','memoryUsage','version'):
    v=d.get(k,'')
    if v not in (None,''): rows.append([k, str(v)])
  if rows: print(tbl(['Check','Result'], rows))
  else: print('  (no data)')
except Exception as e: print(f'  [error] {e}')
" 2>/dev/null
      else
        print -P "  %F{245}(no data)%f"
      fi
      echo ""
      ;;
    mcp:restart)
      gum confirm "Restart MCP server?" --affirmative "Yes" --negative "No" || return 0
      local _out
      _out=$(_rfl_spin "Restarting MCP server..." ruflo mcp restart)
      if [[ "$_out" == *started* || "$_out" == *running* || "$_out" == *success* || "$_out" == *restarted* ]]; then
        print -P "%F{48}[OK]%f MCP server restarted"
      else
        print -P "%F{196}[x] MCP restart failed%f"
      fi
      echo "$_out" | _rfl_colorize
      ;;
    mcp:tools)
      echo ""
      print -P "%BMCP Tools%b"
      echo ""
      local _out
      _out=$(_rfl_spin "Loading tools..." ruflo mcp exec --tool mcp_status -p "{}")
      if [[ "$_out" == *'{'* ]]; then
        echo "$_out" | python3 -c "
${_RFL_PYLIB}
try:
  d=pj(sys.stdin.read())
  tools=d.get('tools',d.get('availableTools',[]))
  if isinstance(tools,list) and tools:
    rows=[]
    for t in tools:
      if isinstance(t,dict):
        rows.append([t.get('name','?'), str(t.get('description',''))[:50]])
      else:
        rows.append([str(t), ''])
    print(tbl(['Tool','Description'], rows))
  elif isinstance(tools,int):
    print(f'  {tools} tools available')
  else:
    tc=d.get('toolCount',d.get('totalTools','?'))
    print(f'  {tc} tools registered')
except Exception as e: print(f'  [error] {e}')
" 2>/dev/null
      else
        print -P "  %F{245}(no data)%f"
      fi
      echo ""
      ;;
    mcp:toggle)
      local tool="${1//\"/}"
      [[ -z "$tool" ]] && { print -P "%F{196}[ERROR] No tool name%f"; return 1; }
      local _out
      _out=$(_rfl_spin "Toggling $tool..." ruflo mcp toggle "$tool")
      if [[ "$_out" == *enabled* || "$_out" == *disabled* || "$_out" == *success* ]]; then
        print -P "%F{48}[OK]%f Toggled: %F{96}$tool%f"
      else
        print -P "%F{196}[x] Toggle failed%f"
      fi
      echo "$_out" | _rfl_colorize
      ;;
    mcp:exec)
      local tool="" params="{}"
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --tool|-t) shift; tool="${1//__RFL_SP__/ }" ;;
          -p|--params) shift; params="${1//__RFL_SP__/ }" ;;
          *) [[ -z "$tool" ]] && tool="${1//__RFL_SP__/ }" ;;
        esac; shift
      done
      tool="${tool//\"/}"
      [[ -z "$tool" ]] && { print -P "%F{196}[ERROR] No tool name%f"; return 1; }
      local _out
      _out=$(_rfl_spin "Executing $tool..." ruflo mcp exec --tool "$tool" -p "$params")
      echo ""
      if [[ "$_out" == *'{'* ]]; then
        echo "$_out" | python3 -c "
${_RFL_PYLIB}
try:
  d=pj(sys.stdin.read())
  rows=[]
  for k,v in d.items():
    if v in (None,''): continue
    if isinstance(v,dict): v='{...}'
    if isinstance(v,list): v=f'[{len(v)} items]'
    if isinstance(v,float): v=f'{v:.4f}'
    rows.append([k, sc(str(v)[:60])])
  if rows: print(tbl(['Field','Value'], rows))
  else: print('  (empty response)')
except Exception as e: print(f'  [error] {e}')
" 2>/dev/null
      else
        echo "$_out" | _rfl_colorize
      fi
      echo ""
      ;;
    mcp:logs)
      echo ""
      print -P "%BMCP Logs%b"
      echo ""
      local _out
      _out=$(ruflo mcp logs 2>&1 | tail -30)
      if [[ -n "$_out" ]]; then
        echo "$_out" | _rfl_colorize
      else
        print -P "  %F{245}(no logs)%f"
      fi
      echo ""
      ;;

    *) return 1 ;;
  esac
}
