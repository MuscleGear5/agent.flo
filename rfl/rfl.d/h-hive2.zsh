# rfl.d/h-hive2.zsh — hive-mind handlers (join/leave/consensus/broadcast/memory)
# Sourced by handlers.zsh

_rfl_run_hive2() {
  local sub="$1"; shift
  case "$sub" in
    join)
      local -a aids=("${(s:,:)${*//\"/}}")
      (( ${#aids} == 0 )) && { print -P "%F{196}[ERROR] No agent ID%f"; return 1; }
      local joined=0 out
      for aid in "${aids[@]}"; do
        out=$(_rfl_spin "Joining $aid..." ruflo mcp exec --tool hive-mind_join -p "{\"agentId\":\"$(_rfl_json_esc "$aid")\"}")
        if [[ "$out" == *'"success"'*true* ]]; then
          ruflo mcp exec --tool coordination_node -p "{\"nodeId\":\"$aid\",\"role\":\"worker\"}" 2>&1 >/dev/null
          print -P "  %F{48}[+]%f %F{96}$aid%f joined hive + coordination"
          ((joined++))
        else
          print -P "  %F{196}[x]%f $aid join failed"
        fi
      done
      if (( joined > 0 )); then
        ruflo mcp exec --tool coordination_sync -p "{\"action\":\"sync\"}" 2>&1 >/dev/null
        print -P "%F{48}$joined agent(s) joined hive, coordination synced%f"
      fi
      ;;
    leave)
      local -a aids=("${(s:,:)${*//\"/}}")
      (( ${#aids} == 0 )) && { print -P "%F{196}[ERROR] No agent ID%f"; return 1; }
      local left=0 out
      for aid in "${aids[@]}"; do
        out=$(_rfl_spin "Removing $aid..." ruflo mcp exec --tool hive-mind_leave -p "{\"agentId\":\"$(_rfl_json_esc "$aid")\"}")
        if [[ "$out" == *'"success"'*true* ]]; then
          print -P "  %F{48}[-]%f %F{96}$aid%f left hive"
          ((left++))
        else
          print -P "  %F{196}[x]%f $aid leave failed"
        fi
      done
      (( left > 0 )) && print -P "%F{48}$left agent(s) left hive%f"
      ;;
    consensus)
      local topic="${*//\"/}"
      topic="${topic//__RFL_SP__/ }"
      [[ -z "$topic" ]] && { print -P "%F{196}[ERROR] No topic%f"; return 1; }
      print -P "%F{96}Running consensus on:%f $topic"
      local out
      out=$(_rfl_spin "Running consensus..." ruflo mcp exec --tool hive-mind_consensus -p "{\"topic\":\"$(_rfl_json_esc "$topic")\"}")
      if [[ "$out" == *'{'* ]]; then
        echo "$out" | python3 -c "
${_RFL_PYLIB}
try:
  d=pj(sys.stdin.read())
  rows=[]
  rows.append(['Decision', sc(str(d.get('decision',d.get('result','pending'))))])
  rows.append(['Votes', str(d.get('votes',d.get('participants','?')))])
  c=d.get('confidence',d.get('agreement',''))
  if c: rows.append(['Confidence', str(c)])
  print(tbl(['Field','Value'], rows))
except Exception as e: print(f'  [parse error] {e}')
" 2>/dev/null
      else
        echo "$out"
      fi
      ;;
    broadcast)
      local msg="${*//\"/}"
      msg="${msg//__RFL_SP__/ }"
      [[ -z "$msg" ]] && { print -P "%F{196}[ERROR] No message%f"; return 1; }
      local esc_msg=$(_rfl_json_esc "$msg")
      local out
      out=$(_rfl_spin "Broadcasting..." ruflo mcp exec --tool hive-mind_broadcast -p "{\"message\":\"$esc_msg\"}")
      if [[ "$out" == *'"success"'*true* ]]; then
        print -P "%F{48}[+]%f Broadcast sent to hive"
      else
        print -P "%F{196}[x] Broadcast failed%f"; echo "$out"; return 1
      fi
      ruflo mcp exec --tool hive-mind_memory -p "{\"action\":\"store\",\"key\":\"broadcast-$(date +%s)\",\"value\":\"$esc_msg\"}" 2>&1 >/dev/null
      ruflo mcp exec --tool coordination_sync -p "{\"action\":\"broadcast\",\"message\":\"$esc_msg\"}" 2>&1 >/dev/null
      print -P "%F{48}[+]%f Stored in hive memory + coordination synced"
      print -P "  %F{245}$msg%f"
      ;;
    memory)
      echo ""
      print -P "%BHive Memory%b"
      local out
      out=$(_rfl_spin "Loading hive memory..." ruflo mcp exec --tool hive-mind_memory -p "{\"action\":\"list\"}")
      if [[ "$out" == *'{'* ]]; then
        echo "$out" | python3 -c "
${_RFL_PYLIB}
try:
  d=pj(sys.stdin.read())
  mems=d.get('memories', d.get('items', d.get('entries',[])))
  if not mems: print('  (empty)')
  else:
    rows=[]
    for m in mems:
      if isinstance(m, dict):
        k=m.get('key',m.get('id','?')); v=str(m.get('value',m.get('content','')))[:80]
        rows.append([k, sc(v)])
      else: rows.append([str(m), ''])
    if rows: print(tbl(['Key','Value'], rows))
    else: print('  (empty)')
except Exception as e: print(f'  [parse error] {e}')
" 2>/dev/null
      else
        print -P "  %F{245}(empty)%f"
      fi
      echo ""
      ;;
    optimize-memory)
      local out
      out=$(_rfl_spin "Optimizing hive memory..." ruflo mcp exec --tool hive-mind_memory -p "{\"action\":\"optimize\"}")
      if [[ "$out" == *'"success"'*true* ]]; then
        print -P "%F{48}[OK]%f Hive memory optimized"
      else
        echo "$out"
      fi
      ;;
    shutdown)
      gum confirm "Shut down hive-mind?" --affirmative "Yes" --negative "No" || return 0
      local out
      out=$(_rfl_spin "Shutting down hive-mind..." ruflo mcp exec --tool hive-mind_shutdown)
      if [[ "$out" == *'"success"'*true* ]]; then
        print -P "%F{48}[OK]%f Hive-mind shut down"
      else
        print -P "%F{196}[x] Shutdown failed%f"; echo "$out"
      fi
      ;;
    *) return 1 ;;
  esac
}
