# rfl.d/helpers.zsh — utility functions
# Sourced by rfl main script

# Escape string for safe JSON embedding (prevents injection)
_rfl_json_esc() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

# ── Shared Python library (loaded once from pylib.py) ──────
_RFL_DIR="${0:A:h}"
_RFL_PYLIB=$(<"${_RFL_DIR}/pylib.py")

# ── Undulating rainbow wave — sine-modulated color ripple ──
# Usage: out=$(_rfl_spin "Loading..." ruflo mcp exec --tool agent_list)
_rfl_spin() {
  local title="$1"; shift
  local _sf=$(mktemp)
  local _timeout=15  # seconds before giving up

  timeout "$_timeout" "$@" > "$_sf" 2>&1 &
  local pid=$!

  local bw=16                     # bar width
  local nc=$'\e[0m'
  local tx=$'\e[38;5;245m'        # grey title
  local ok=$'\e[38;5;48m'         # green flash on finish
  # neon palette: pink → purple → blue → cyan → green → yellow → orange
  local -a wave=(
    $'\e[38;5;198m' $'\e[38;5;171m' $'\e[38;5;141m' $'\e[38;5;105m'
    $'\e[38;5;69m'  $'\e[38;5;39m'  $'\e[38;5;51m'  $'\e[38;5;49m'
    $'\e[38;5;48m'  $'\e[38;5;84m'  $'\e[38;5;226m' $'\e[38;5;208m'
  )
  local wlen=${#wave[@]}

  # pre-compute a 64-entry sine lookup (values 0–wlen scaled by sine)
  # sin approximated as integer table — avoids calling bc/python per frame
  local -a sintab
  local -i k
  for (( k=0; k<64; k++ )); do
    # sine values ×1000: maps 0–63 → one full cycle (0 → 2π)
    # using integer-only quarter-wave table, mirrored
    local -i q=$(( k % 16 ))  half=$(( k / 16 ))
    local -i val
    case $q in
      0) val=0;; 1) val=98;; 2) val=195;; 3) val=290;;
      4) val=383;; 5) val=471;; 6) val=556;; 7) val=634;;
      8) val=707;; 9) val=773;; 10) val=831;; 11) val=882;;
      12) val=924;; 13) val=957;; 14) val=981;; 15) val=995;;
    esac
    # mirror for quadrants 2-4
    case $half in
      1) val=$(( 1000 - val + 1000 ));; # 1000..2000 (descending from peak)
      2) val=$(( -val ));;               # 0..-1000
      3) val=$(( -(1000 - val + 1000) ));; # -1000..-2000
      *) ;;                              # 0..1000 (ascending)
    esac
    # shift from [-2000,2000] → [0, wlen-1]
    sintab+=( $(( (val + 2000) * (wlen - 1) / 4000 )) )
  done

  local -i i=0 stlen=${#sintab[@]}

  # animation output → /dev/tty so $() captures don't swallow it
  printf '\e[?25l' > /dev/tty 2>/dev/null

  while kill -0 "$pid" 2>/dev/null; do
    local bar=""
    for (( j=0; j<bw; j++ )); do
      # sine-modulated index: position + time → undulating wave
      local -i si=$(( (j * 5 + i * 3) % stlen ))
      local -i ci=$(( sintab[si + 1] % wlen + 1 ))
      bar+="${wave[$ci]}━"
    done

    printf "\r  ${bar}${nc}  ${tx}${title}${nc} " > /dev/tty 2>/dev/null
    (( i++ ))
    sleep 0.06
  done

  wait "$pid"
  local _rc=$?

  if (( _rc == 124 )); then
    # timeout — red bar + X
    local rd=$'\e[38;5;196m'
    printf "\r  ${rd}" > /dev/tty 2>/dev/null
    for (( j=0; j<bw; j++ )); do printf '━' > /dev/tty 2>/dev/null; done
    printf "${nc}  ${rd}✗${nc} ${tx}${title} (timeout)${nc} " > /dev/tty 2>/dev/null
    sleep 0.5
    printf '\r\e[K\e[?25h' > /dev/tty 2>/dev/null
    rm -f "$_sf"
    return 1
  fi

  # completion flash — full green bar + checkmark
  printf "\r  ${ok}" > /dev/tty 2>/dev/null
  for (( j=0; j<bw; j++ )); do printf '━' > /dev/tty 2>/dev/null; done
  printf "${nc}  ${ok}✓${nc} ${tx}${title}${nc} " > /dev/tty 2>/dev/null
  sleep 0.3
  printf '\r\e[K\e[?25h' > /dev/tty 2>/dev/null

  cat "$_sf"
  rm -f "$_sf"
}

# ── Colorize ruflo CLI output ─────────────────────────────
_rfl_colorize() {
  python3 -c "
import sys, re
I=re.IGNORECASE
R='\x1b[0m'; B='\x1b[1m'
GR='\x1b[92m'; YL='\x1b[93m'; RD='\x1b[91m'
CY='\x1b[96m'; GY='\x1b[90m'; OR='\x1b[33m'

def colorize(line):
    # Multi-word negations first (before single-word catches them)
    line = re.sub(r'\bnot (loaded|running|available|configured|initialized|installed|connected)\b', YL+r'\g<0>'+R, line, flags=I)
    # Green: positive / active states (skip if preceded by 'not ')
    line = re.sub(r'(?<!not )\b(active|running|available|loaded|enabled|ready|healthy|configured|initialized|connected|installed|online|verified|valid|passed|success|open|started|synced|optimized)\b', GR+r'\g<0>'+R, line, flags=I)
    # Yellow: idle / waiting states
    line = re.sub(r'\b(idle|standby|waiting|paused|suspended|degraded|partial|stale)\b', YL+r'\g<0>'+R, line, flags=I)
    # Orange: pending / queued
    line = re.sub(r'\b(pending|queued|retrying|migrating|upgrading)\b', OR+r'\g<0>'+R, line, flags=I)
    # Grey: completed / done / skipped
    line = re.sub(r'\b(completed|done|skipped|closed|archived|deprecated)\b', GY+r'\g<0>'+R, line, flags=I)
    # Red: errors / stopped / negative states
    line = re.sub(r'\b(failed|error|unknown|stopped|disabled|critical|disconnected|offline|invalid|rejected|denied|expired|broken|timeout|crashed|missing)\b', RD+r'\g<0>'+R, line, flags=I)
    # Tags
    line = re.sub(r'\[OK\]',    GR+'[OK]'+R,    line)
    line = re.sub(r'\[INFO\]',  CY+'[INFO]'+R,  line)
    line = re.sub(r'\[WARN\]',  OR+'[WARN]'+R,  line)
    line = re.sub(r'\[ERROR\]', RD+'[ERROR]'+R, line)
    line = re.sub(r'✓',         GR+'✓'+R,        line)
    line = re.sub(r'Queen:',    OR+'Queen:'+R,   line)
    return line

for line in sys.stdin:
    line = line.rstrip('\n')
    if re.search(r'[┏┗┣┳┻]', line):
        print(line)
    elif '┃' in line:
        print(colorize(line))
    elif re.search(r'^[\s─━]{3,}$', line):
        print(GY+line+R)
    else:
        print(colorize(line))
" 2>/dev/null
}

