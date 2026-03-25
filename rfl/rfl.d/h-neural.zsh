# rfl.d/h-neural.zsh — neural handlers
# Sourced by handlers.zsh

_rfl_run_neural() {
  local sub="$1"; shift
  case "$sub" in
    status)
      echo ""
      print -P "%BNeural Status%b"
      echo ""
      local _out
      _out=$(_rfl_spin "Loading..." ruflo mcp exec --tool neural_status -p "{\"detailed\":true}")
      if [[ "$_out" == *'{'* ]]; then
        echo "$_out" | python3 -c "
${_RFL_PYLIB}
try:
  txt=sys.stdin.read(); d=pj(txt)
  for k,v in d.items():
    if k not in ('success',) and v not in (None,''):
      print(f'  {k}: {v}')
except Exception as e: print(f'  [error] {e}')
" 2>/dev/null
      else
        echo "$_out"
      fi
      echo ""
      ;;
    patterns)
      echo ""
      print -P "%BNeural Patterns%b"
      echo ""
      local _out
      _out=$(_rfl_spin "Loading patterns..." ruflo mcp exec --tool neural_patterns -p "{\"action\":\"list\"}")
      if [[ "$_out" == *'{'* ]]; then
        echo "$_out" | python3 -c "
${_RFL_PYLIB}
try:
  txt=sys.stdin.read(); d=pj(txt)
  pats=d.get('patterns', d.get('items', d.get('results',[])))
  if not pats:
    print('  (none)')
  else:
    for p in pats:
      if isinstance(p,dict):
        pid=p.get('id',p.get('name','?'))
        ptype=p.get('type','')
        print(f'  {pid}' + (f'  ({ptype})' if ptype else ''))
      else:
        print(f'  {p}')
except Exception as e: print(f'  [error] {e}')
" 2>/dev/null
      else
        echo "$_out"
      fi
      echo ""
      ;;
    predict)
      local input="${*//\"/}"
      input="${input//__RFL_SP__/ }"
      [[ -z "$input" ]] && { print -P "%F{196}[ERROR] No input provided%f"; return 1; }
      local _out
      _out=$(_rfl_spin "Predicting..." ruflo mcp exec --tool neural_predict -p "{\"input\":\"$(_rfl_json_esc "$input")\"}")
      if [[ "$_out" == *'{'* ]]; then
        echo ""
        echo "$_out" | python3 -c "
${_RFL_PYLIB}
try:
  txt=sys.stdin.read(); d=pj(txt)
  preds=d.get('predictions', d.get('results', d.get('output',[])))
  if isinstance(preds,list):
    for p in preds:
      if isinstance(p,dict):
        label=p.get('label',p.get('class','?'))
        conf=p.get('confidence',p.get('score',''))
        print(f'  {label}' + (f'  ({conf})' if conf else ''))
      else:
        print(f'  {p}')
  elif preds:
    print(f'  {preds}')
  else:
    for k,v in d.items():
      if k not in ('success',) and v not in (None,''):
        print(f'  {k}: {v}')
except Exception as e: print(f'  [error] {e}')
" 2>/dev/null
      else
        echo "$_out"
      fi
      echo ""
      ;;
    train)
      local mtype="transformer"
      local -a flags=()
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --epochs)        shift; flags+=('"epochs":'$1) ;;
          --batch-size)    shift; flags+=('"batchSize":'$1) ;;
          --learning-rate) shift; flags+=('"learningRate":'$1) ;;
          --type)          shift; mtype="${1//\"/}" ;;
          *)               [[ "$1" == *=* ]] || mtype="${1//\"/}" ;;
        esac
        shift
      done
      local pj="{\"modelType\":\"$mtype\""
      for f in "${flags[@]}"; do pj+=",$f"; done
      pj+="}"
      local _out
      _out=$(_rfl_spin "Training ($mtype)..." ruflo mcp exec --tool neural_train -p "$pj")
      if [[ "$_out" == *'"success"'*true* ]]; then
        print -P "%F{48}[OK]%f Training started (%F{245}$mtype%f)"
        echo ""
        echo "$_out" | python3 -c "
${_RFL_PYLIB}
try:
  txt=sys.stdin.read(); d=pj(txt)
  rows=[]
  for k in ('modelId','type','status','accuracy','epochs','trainedAt'):
    v=d.get(k,'')
    if v not in (None,'',True):
      if isinstance(v,float): v=f'{v:.4f}'
      rows.append(f'{k}|{v}')
  if rows:
    print('Field|Value')
    for r in rows: print(r)
except Exception as e: print(f'  [error] {e}')
" 2>/dev/null | gum table --separator '|' --border thick --print
      else
        print -P "%F{196}[x] Training failed%f"; echo "$_out"
      fi
      ;;
    optimize)
      local target="${1//__RFL_SP__/ }"
      target="${target//\"/}"
      [[ -z "$target" ]] && target="balanced"
      local _out
      _out=$(_rfl_spin "Optimizing ($target)..." ruflo mcp exec --tool neural_optimize -p "{\"target\":\"$target\"}")
      if [[ "$_out" == *'{'* ]]; then
        echo "$_out" | python3 -c "
${_RFL_PYLIB}
try:
  txt=sys.stdin.read(); d=pj(txt)
  for k,v in d.items():
    if k not in ('success',) and v not in (None,''):
      print(f'  {k}: {v}')
except Exception as e: print(f'  [error] {e}')
" 2>/dev/null
      else
        echo "$_out"
      fi
      ;;
    *) return 1 ;;
  esac
}
