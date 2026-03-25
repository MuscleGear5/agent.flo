# rfl.d/h-memory.zsh — memory handlers
# Sourced by handlers.zsh

_rfl_run_memory() {
  local sub="$1"; shift
  case "$sub" in

    list)
      echo ""
      print -P "%BMemory%b"
      echo ""
      local _ml_data
      _ml_data=$(_rfl_spin "Loading memory..." ruflo mcp exec --tool memory_list)
      local _table
      _table=$(echo "$_ml_data" | python3 -c "
${_RFL_PYLIB}
d=pj(sys.stdin.read())
ml=d.get('memories', d.get('items', d.get('entries',[])))
if ml:
    print('Key|Value')
    for m in ml:
        if isinstance(m,dict):
            k=m.get('key',m.get('id','?'))
            v=str(m.get('value',m.get('content','')))[:80].replace('|',' ')
            print(f'{k}|{v}')
        else: print(f'{str(m)[:40]}|')
" 2>/dev/null)
      if [[ -n "$_table" && $(echo "$_table" | wc -l) -gt 1 ]]; then
        echo "$_table" | gum table --separator '|' --border bold --print
      else
        print -P "  %F{245}(empty)%f"
      fi
      echo ""
      ;;

    search)
      local query=""
      while [[ $# -gt 0 ]]; do
        case "$1" in -q|--query) shift; query="${1//__RFL_SP__/ }" ;; *) [[ -z "$query" ]] && query="${1//__RFL_SP__/ }" ;; esac; shift
      done
      query="${query//\"/}"
      [[ -z "$query" ]] && { print -P "%F{196}[ERROR] No query%f"; return 1; }
      echo ""
      local _ms_data
      _ms_data=$(_rfl_spin "Searching..." ruflo mcp exec --tool memory_search -p "{\"query\":\"$(_rfl_json_esc "$query")\"}")
      local _table
      _table=$(echo "$_ms_data" | python3 -c "
${_RFL_PYLIB}
d=pj(sys.stdin.read())
rs=d.get('results', d.get('items', []))
total=d.get('total',len(rs)); st=d.get('searchTime','')
print(f'Results: {total}  ({st})')
if rs:
    print('Key|Value|Score')
    for r in rs:
        if isinstance(r,dict):
            k=r.get('key',r.get('id','?'))
            v=str(r.get('value',r.get('content','')))[:60].replace('|',' ')
            s=r.get('score',r.get('similarity',''))
            print(f'{k}|{v}|{s}')
" 2>/dev/null)
      if [[ -n "$_table" ]]; then
        local header=$(echo "$_table" | head -1)
        local body=$(echo "$_table" | tail -n +2)
        print -P "  %F{245}$header%f"
        if [[ -n "$body" && $(echo "$body" | wc -l) -gt 1 ]]; then
          echo "$body" | gum table --separator '|' --border bold --print
        else
          print -P "  %F{245}(no matches)%f"
        fi
      else
        print -P "  %F{245}(no results)%f"
      fi
      echo ""
      ;;

    store)
      local key="" val=""
      while [[ $# -gt 0 ]]; do
        case "$1" in
          -k|--key)   shift; key="${1//__RFL_SP__/ }" ;;
          -v|--value) shift; val="${1//__RFL_SP__/ }" ;;
        esac; shift
      done
      key="${key//\"/}"; val="${val//\"/}"
      [[ -z "$key" ]] && { print -P "%F{196}[ERROR] No key%f"; return 1; }
      [[ -z "$val" ]] && { print -P "%F{196}[ERROR] No value%f"; return 1; }
      local _ms_out
      _ms_out=$(_rfl_spin "Storing..." ruflo mcp exec --tool memory_store -p "{\"key\":\"$(_rfl_json_esc "$key")\",\"value\":\"$(_rfl_json_esc "$val")\"}")
      if [[ "$_ms_out" == *'"success"'*true* ]]; then
        print -P "%F{48}[+]%f Stored: %F{96}$key%f"
      else
        print -P "%F{196}[x] Store failed%f"; echo "$_ms_out"
      fi
      ;;

    retrieve)
      local key=""
      while [[ $# -gt 0 ]]; do
        case "$1" in -k|--key) shift; key="${1//__RFL_SP__/ }" ;; *) [[ -z "$key" ]] && key="${1//__RFL_SP__/ }" ;; esac; shift
      done
      key="${key//\"/}"
      [[ -z "$key" ]] && { print -P "%F{196}[ERROR] No key%f"; return 1; }
      local _mr_out
      _mr_out=$(_rfl_spin "Retrieving..." ruflo mcp exec --tool memory_retrieve -p "{\"key\":\"$(_rfl_json_esc "$key")\"}")
      if [[ "$_mr_out" == *'{'* ]]; then
        echo ""
        print -P "%B$key%b"
        echo "$_mr_out" | python3 -c "
${_RFL_PYLIB}
d=pj(sys.stdin.read())
print(f'  {d.get(\"value\", d.get(\"content\", d.get(\"data\",\"\")))}')
" 2>/dev/null
        echo ""
      else
        print -P "%F{245}(not found)%f"
      fi
      ;;

    delete)
      local key=""
      while [[ $# -gt 0 ]]; do
        case "$1" in -k|--key) shift; key="${1//__RFL_SP__/ }" ;; *) [[ -z "$key" ]] && key="${1//__RFL_SP__/ }" ;; esac; shift
      done
      key="${key//\"/}"
      [[ -z "$key" ]] && { print -P "%F{196}[ERROR] No key%f"; return 1; }
      gum confirm "Delete memory '$key'?" --affirmative "Yes" --negative "No" || return 0
      local _md_out
      _md_out=$(_rfl_spin "Deleting..." ruflo mcp exec --tool memory_delete -p "{\"key\":\"$(_rfl_json_esc "$key")\"}")
      if [[ "$_md_out" == *'"success"'*true* ]]; then
        print -P "%F{48}[-]%f Deleted: %F{96}$key%f"
      else
        print -P "%F{196}[x] Delete failed%f"
      fi
      ;;

    stats)
      local _out
      _out=$(_rfl_spin "Loading stats..." ruflo mcp exec --tool memory_stats -p "{}")
      echo ""
      print -P "%BMemory Stats%b"
      if [[ "$_out" == *'{'* ]]; then
        echo "$_out" | python3 -c "
${_RFL_PYLIB}
d=pj(sys.stdin.read())
for k,v in d.items():
    if k not in ('success',): print(f'  {k}: {v}')
" 2>/dev/null
      else
        print -P "  %F{245}(no data)%f"
      fi
      echo ""
      ;;

    *) return 1 ;;
  esac
}
