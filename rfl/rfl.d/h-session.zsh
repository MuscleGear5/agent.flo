# rfl.d/h-session.zsh — session handlers
# Sourced by handlers.zsh

_rfl_run_session() {
  local sub="$1"; shift
  case "$sub" in
    list)
      echo ""
      gum style --border thick --border-foreground 7 --padding "0 2" \
        --foreground 141 --bold "Sessions"
      echo ""
      local _sl_data
      _sl_data=$(_rfl_spin "Loading sessions..." ruflo mcp exec --tool session_list)
      local _table
      _table=$(echo "$_sl_data" | python3 -c "
import sys,json
try:
  txt=sys.stdin.read(); i=txt.rindex('}'); n=0
  for k in range(i,-1,-1):
    if txt[k]=='}': n+=1
    elif txt[k]=='{': n-=1
    if n==0: break
  d=json.loads(txt[k:i+1])
  sl=d.get('sessions',[])
  if not sl: pass
  else:
    print('ID,Name')
    for s in sl:
      sid=s.get('sessionId',s.get('id','?'))
      name=s.get('name','')
      print(f'{sid},{name}')
except Exception as e: print(f'ERR: {e}',file=sys.stderr)
" 2>/dev/null)
      if [[ -n "$_table" && $(echo "$_table" | wc -l) -gt 1 ]]; then
        echo "$_table" | gum table --separator ',' --border rounded --border.foreground 7 --print
      else
        print -P "  %F{245}(none)%f"
      fi
      echo ""
      ;;
    save)
      local name=""
      while [[ $# -gt 0 ]]; do
        case "$1" in --name) shift; name="${1//\"/}" ;; *) [[ -z "$name" ]] && name="${1//\"/}" ;; esac; shift
      done
      local pj="{}"
      [[ -n "$name" ]] && pj="{\"name\":\"$(_rfl_json_esc "$name")\"}"
      local _ssv_out
      _ssv_out=$(_rfl_spin "Saving session..." ruflo mcp exec --tool session_save -p "$pj")
      local sid
      sid=$(echo "$_ssv_out" | grep -oP '"sessionId"\s*:\s*"\K[^"]+' | head -1)
      if [[ -n "$sid" ]]; then
        print -P "%F{48}[+]%f Session saved: %F{51}$sid%f"
        [[ -n "$name" ]] && print -P "  %F{245}Name: $name%f"
      else
        print -P "%F{196}[x] Save failed%f"; echo "$_ssv_out"
      fi
      ;;
    restore)
      local sid="${1//\"/}"
      [[ -z "$sid" ]] && { print -P "%F{196}[ERROR] No session ID%f"; return 1; }
      local _srs_out
      _srs_out=$(_rfl_spin "Restoring..." ruflo mcp exec --tool session_restore -p "{\"sessionId\":\"$sid\"}")
      if [[ "$_srs_out" == *'"success"'*true* ]]; then
        print -P "%F{48}[OK]%f Session restored: %F{51}$sid%f"
      else
        print -P "%F{196}[x] Restore failed%f"; echo "$_srs_out"
      fi
      ;;
    delete)
      local sid="${1//\"/}"
      [[ -z "$sid" ]] && { print -P "%F{196}[ERROR] No session ID%f"; return 1; }
      gum confirm "Delete session $sid?" --affirmative "Yes" --negative "No" || return 0
      local _sdl_out
      _sdl_out=$(_rfl_spin "Deleting..." ruflo mcp exec --tool session_delete -p "{\"sessionId\":\"$sid\"}")
      if [[ "$_sdl_out" == *'"success"'*true* ]]; then
        print -P "%F{48}[-]%f Session deleted: %F{245}$sid%f"
      else
        print -P "%F{196}[x] Delete failed%f"
      fi
      ;;
    current)
      local _scr_out
      _scr_out=$(_rfl_spin "Loading..." ruflo mcp exec --tool session_current -p "{}")
      echo ""
      gum style --border rounded --border-foreground 7 --padding "0 2" --foreground 141 --bold "Current Session"
      if [[ "$_scr_out" == *'{'* ]]; then
        echo "$_scr_out" | python3 -c "
import sys,json
try:
  txt=sys.stdin.read(); i=txt.rindex('}'); n=0
  for k in range(i,-1,-1):
    if txt[k]=='}': n+=1
    elif txt[k]=='{': n-=1
    if n==0: break
  d=json.loads(txt[k:i+1])
  for k in ('sessionId','name','status','createdAt','agentCount','taskCount'):
    v=d.get(k,'')
    if v: print(f'  {k}: {v}')
except: pass
" 2>/dev/null
      else
        print -P "  %F{245}(no active session)%f"
      fi
      echo ""
      ;;
    *) return 1 ;;
  esac
}
