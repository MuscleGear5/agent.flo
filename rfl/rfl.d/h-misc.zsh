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

    *) return 1 ;;
  esac
}
