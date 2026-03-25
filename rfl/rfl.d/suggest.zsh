# rfl.d/suggest.zsh — AI-powered next-step suggestions
# Sourced by rfl main script

# ── API config for background suggestions ───────────────────
_RFL_DEEPSEEK_KEY="${DEEPSEEK_API_KEY:-}"
_RFL_DEEPSEEK_URL="https://api.deepseek.com/chat/completions"
_RFL_SUGGEST_FILE="/tmp/rfl-suggestions-$$.txt"
_RFL_SUGGEST_DETAIL="/tmp/rfl-suggest-detail-$$.json"
_RFL_HISTORY_FILE="/tmp/rfl-session-history-$$.txt"
_RFL_SUGGEST_PID=""
_RFL_SUGGEST_FLAG="${XDG_CONFIG_HOME:-$HOME/.config}/rfl/suggest-off"
mkdir -p "${_RFL_SUGGEST_FLAG:h}"
export _RFL_SUGGEST_FLAG

# Log a command execution to session history
_rfl_log_cmd() {
  echo "[$(date +%H:%M)] ruflo $*" >> "$_RFL_HISTORY_FILE"
}

# Last command output captured for suggestion context
_RFL_LAST_OUTPUT=""

# Fire a background API call for next-step suggestions
_rfl_suggest_bg() {
  local last_cmd="$1" last_sub="$2"
  [[ -n "$_RFL_SUGGEST_PID" ]] && kill "$_RFL_SUGGEST_PID" 2>/dev/null
  rm -f "$_RFL_SUGGEST_FILE" "$_RFL_SUGGEST_DETAIL"
  [[ -f "$_RFL_SUGGEST_FLAG" ]] && return
  [[ -z "$_RFL_DEEPSEEK_KEY" ]] && return

  local history=""
  # Strip all IDs from history so AI can't use stale ones — only commands matter for context
  [[ -f "$_RFL_HISTORY_FILE" ]] && history=$(tail -20 "$_RFL_HISTORY_FILE" | sed 's/\(task\|agent\|swarm\|session\)-[a-z0-9_-]*/<id>/g')
  # Strip box chars AND all IDs from output — AI must use ONLY live state IDs
  local last_output=$(printf '%s' "${_RFL_LAST_OUTPUT:0:500}" | sed 's/[┃┏┗┣┳┻╋━┓┛┫╸─]//g; s/  */ /g; s/\(task\|agent\|swarm\|session\)-[a-z0-9_-]*/<id>/g')

  (
    # Gather LIVE state inside subshell so it doesn't block the UI
    local live_agents live_tasks live_swarm
    live_agents=$(ruflo mcp exec --tool agent_list -p '{}' 2>&1 | sed -n '/Result:/,$ p' | tail -n +2 | jq -r '.agents[] | "\(.agentId) (\(.agentType), \(.status))"' 2>/dev/null || echo "none")
    live_tasks=$(ruflo mcp exec --tool task_list -p '{}' 2>&1 | sed -n '/Result:/,$ p' | tail -n +2 | jq -r '.tasks[] | "\(.taskId) [\(.status)] \(.type): \(.description)"' 2>/dev/null | head -10 || echo "none")
    live_swarm=$(ruflo mcp exec --tool swarm_status -p '{}' 2>&1 | sed -n '/Result:/,$ p' | tail -n +2 | jq -r '"swarm: \(.swarmId) status=\(.status) topology=\(.topology) agents=\(.agentCount) tasks=\(.taskCount)"' 2>/dev/null || echo "none")

    local rf=$(mktemp)
    jq -n \
      --arg sys "You are a ruflo workflow advisor. Output ONLY a valid JSON array, nothing else.

FORMAT: [{\"cmd\":\"ruflo <cmd> <sub> [args]\",\"reason\":\"short reason (5-10 words)\",\"detail\":\"2-3 sentence justification explaining WHY this is the right next step based on the current state, what ran, and the output\"}]

VALID commands: agent(spawn list status stop metrics), task(create list status cancel assign), swarm(init start status stop), memory(store search list), session(list save restore), hooks(list metrics)

RULES:
- Output ONLY the JSON array. No markdown fences, no commentary.
- ONLY use IDs from LIVE STATE sections below. IDs in SESSION history may be STALE/DELETED.
- If 'Task not found' or similar error: the ID is gone. Suggest task list or task create.
- If error in output: suggest the FIX, never repeat failed command
- Never repeat the command that was just run
- If no tasks exist: suggest task create FIRST (not task assign)
- Do NOT suggest task assign just because agents are idle — idle agents are normal
- Focus suggestions on the command just run, not on agent utilization
- detail field: reference specific state (agent IDs, task counts, errors) to justify the suggestion" \
      --arg usr "JUST RAN: ruflo $last_cmd $last_sub

OUTPUT (truncated): $last_output

SESSION (for context only, IDs here may be STALE): $history

=== LIVE STATE (use ONLY these IDs) ===
AGENTS: $live_agents

TASKS: $live_tasks

SWARM: $live_swarm

Suggest 3-5 next steps using ONLY IDs from LIVE STATE above." \
      '{
        model: "deepseek-chat",
        messages: [
          {role: "system", content: $sys},
          {role: "user", content: $usr}
        ],
        temperature: 0.3
      }' > "$rf.req"

    local _curlrc=$(mktemp)
    chmod 600 "$_curlrc"
    printf 'header = "Authorization: Bearer %s"\n' "$_RFL_DEEPSEEK_KEY" > "$_curlrc"
    curl -s --max-time 25 "$_RFL_DEEPSEEK_URL" \
      -H "Content-Type: application/json" \
      -K "$_curlrc" \
      -d @"$rf.req" > "$rf"
    rm -f "$rf.req" "$_curlrc"

    if jq empty "$rf" 2>/dev/null; then
      local _raw_content
      _raw_content=$(jq -r '.choices[0].message.content // empty' "$rf")
      # Parse JSON suggestions → labels file + details JSON
      printf '%s' "$_raw_content" | python3 -c "
import sys,json,re
raw=sys.stdin.read().strip()
# Strip markdown code fences if AI wraps output
raw=re.sub(r'^\`\`\`(?:json)?\s*','',raw)
raw=re.sub(r'\s*\`\`\`\$','',raw)
try:
    data=json.loads(raw)
    if not isinstance(data,list): raise ValueError
except:
    # Fallback: treat as plain bullet lines (old format)
    with open(sys.argv[1],'w') as f: f.write(raw)
    sys.exit(0)
labels=[]
for item in data:
    cmd=item.get('cmd','').strip()
    reason=item.get('reason','').strip()
    if cmd:
        labels.append(f'\u2022 {cmd} \u2014 {reason}')
with open(sys.argv[1],'w') as f:
    f.write('\n'.join(labels)+'\n')
with open(sys.argv[2],'w') as f:
    json.dump(data,f)
" "$_RFL_SUGGEST_FILE" "$_RFL_SUGGEST_DETAIL" 2>/dev/null
    fi
    rm -f "$rf"
  ) &
  _RFL_SUGGEST_PID=$!
}

# ── Deterministic workflow hints (no AI needed) ──────────────
# Returns bullet lines based on last cmd/sub and output patterns
_rfl_workflow_hints() {
  local cmd="$1" sub="$2" out="$_RFL_LAST_OUTPUT"
  local -a hints=()

  # Extract IDs from output for use in hints
  local new_task_id=$(echo "$out" | grep -oP 'task-[\w-]+' | head -1)
  local new_agent_id=$(echo "$out" | grep -oP 'agent-[\w-]+' | head -1)
  local new_swarm_id=$(echo "$out" | grep -oP 'swarm-[\w-]+' | head -1)

  # Get live idle agents (quick, from last output or cache)
  local idle_agent=$(echo "$out" | grep -i 'idle' | grep -oP '(rfl-[\w-]+|agent-[\w-]+)' | head -1)

  case "${cmd}:${sub}" in
    task:create)
      if [[ -n "$new_task_id" ]]; then
        # Check if task was created with empty/short description
        if echo "$out" | grep -qiP '(description|desc).*("")|^\s*$'; then
          hints+=("• ruflo task update --task $new_task_id — add description to empty task")
        fi
        if [[ -n "$idle_agent" ]]; then
          hints+=("• ruflo task assign --task $new_task_id --agent $idle_agent — assign to idle agent")
        else
          hints+=("• ruflo task assign --task $new_task_id — assign to an available agent")
        fi
        hints+=("• ruflo task status --task $new_task_id — check task details")
      fi
      ;;
    task:assign)
      if echo "$out" | grep -qi 'not found\|failed\|error'; then
        hints+=("• ruflo task list — check which tasks actually exist")
        hints+=("• ruflo agent list — verify agent IDs")
        hints+=("• ruflo task create — create a new task instead")
      elif [[ -n "$new_task_id" ]]; then
        hints+=("• ruflo task status --task $new_task_id — monitor assignment")
      fi
      ;;
    task:list|task:status)
      # If there are pending/unassigned tasks, suggest assign
      if echo "$out" | grep -qi 'pending\|unassigned'; then
        hints+=("• ruflo task assign — assign pending tasks to idle agents")
      fi
      hints+=("• ruflo task create — add more work")
      ;;
    agent:spawn)
      if [[ -n "$new_agent_id" ]]; then
        hints+=("• ruflo task create — create work for the new agent")
        hints+=("• ruflo task assign --agent $new_agent_id — assign existing task to new agent")
      fi
      ;;
    agent:list)
      ;;
    swarm:init)
      hints+=("• ruflo agent spawn — add agents to the swarm")
      ;;
    swarm:start)
      hints+=("• ruflo agent spawn — add workers")
      hints+=("• ruflo task create — create tasks for the swarm")
      ;;
    swarm:status)
      if echo "$out" | grep -qP '0 active.*0 pending.*0 completed'; then
        hints+=("• ruflo task create — no tasks exist, create some work")
      fi
      ;;
    *:*)
      if echo "$out" | grep -qi 'not found\|failed\|error'; then
        hints+=("• ruflo doctor — diagnose system issues")
      fi
      ;;
  esac

  # Always offer back to menu if we have hints
  (( ${#hints} > 0 )) && printf '%s\n' "${hints[@]}"
}

# Show suggestions if ready, then wait for keypress
_rfl_pause() {
  local last_cmd="${1:-}" last_sub="${2:-}"

  # Log what was run
  [[ -n "$last_cmd" ]] && _rfl_log_cmd "$last_cmd" "$last_sub"

  # Fire suggestions if not already running (handles non-capture paths)
  if [[ -n "$last_cmd" && -z "$_RFL_SUGGEST_PID" ]]; then
    _rfl_suggest_bg "$last_cmd" "$last_sub"
  fi
  echo ""
  if [[ -f "$_RFL_SUGGEST_FLAG" ]]; then
    print -P "%F{245}▸ Press any key to return  %F{196}AI suggestions OFF%f %F{245}(ctrl-s in menu to enable)%f"
    read -sk1 < /dev/tty
    [[ -n "$_RFL_SUGGEST_PID" ]] && kill "$_RFL_SUGGEST_PID" 2>/dev/null
    _RFL_SUGGEST_PID=""
    return
  fi
  print -P "%F{245}▸ Press any key to return to menu%f"
  read -sk1 < /dev/tty

  # Wait briefly for suggestions if still running
  if [[ -n "$_RFL_SUGGEST_PID" ]] && kill -0 "$_RFL_SUGGEST_PID" 2>/dev/null; then
    print -P "%F{245}Loading suggestions...%f"
    local _wait=0
    while (( _wait < 20 )) && kill -0 "$_RFL_SUGGEST_PID" 2>/dev/null; do
      sleep 0.5
      ((_wait++))
    done
    printf "\033[1A\033[2K"  # clear "Loading..." line
  fi

  # Suggestion loop — pick → run → get new suggestions → repeat
  while true; do
    [[ ! -s "$_RFL_SUGGEST_FILE" ]] && break

    local -a valid_labels=()
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      local _line_cmd="${line%%—*}"
      [[ "$_line_cmd" == "$line" ]] && _line_cmd="${line%% -- *}"
      local extracted=$(echo "$_line_cmd" | grep -oP 'ruflo\s+\S+(\s+\S+)*' | head -1)
      if [[ -n "$extracted" ]]; then
        local _rcmd=$(echo "$extracted" | awk '{print $2}')
        local _rsub=$(echo "$extracted" | awk '{print $3}')
        if [[ -n "${SUBCMDS[$_rcmd]+x}" ]]; then
          if [[ -z "$_rsub" ]] || [[ " ${SUBCMDS[$_rcmd]} " == *" $_rsub "* ]]; then
            valid_labels+=("$line")
          fi
        fi
      fi
    done < "$_RFL_SUGGEST_FILE"
    rm -f "$_RFL_SUGGEST_FILE"

    (( ${#valid_labels} == 0 )) && break

    echo ""
    valid_labels+=("(back to menu)")
    local picked
    # Build preview command — reads detail from JSON by matching command
    local _detail_file="$_RFL_SUGGEST_DETAIL"
    local _preview_cmd="python3 -c \"
import sys,json,re,textwrap,os
line=sys.argv[1]
if 'back to menu' in line:
    print('\x1b[38;5;245mReturn to main menu\x1b[0m')
    sys.exit(0)
m=re.search(r'ruflo\s+\S+(\s+\S+)*',line)
if not m:
    print('No detail available')
    sys.exit(0)
cmd=m.group().strip()
detail_file='$_detail_file'
found=False
if os.path.isfile(detail_file):
    try:
        with open(detail_file) as f: data=json.load(f)
        for s in data:
            if s.get('cmd','').strip()==cmd:
                print('\x1b[1;38;5;51m' + s.get('cmd','') + '\x1b[0m')
                print()
                print('\x1b[38;5;141mWhy this command?\x1b[0m')
                print()
                detail=s.get('detail','No detail available.')
                for wl in textwrap.wrap(detail,width=48):
                    print('  '+wl)
                found=True
                break
    except: pass
if not found:
    # Fallback: show the reason from after the em dash
    print('\x1b[1;38;5;51m' + cmd + '\x1b[0m')
    print()
    parts=line.split('\u2014',1)
    if len(parts)>1:
        reason=parts[1].strip()
        for wl in textwrap.wrap(reason,width=48):
            print('  '+wl)
    else:
        print('  (press ? to toggle detail)')
\" {}"

    picked=$(printf '%s\n' "${valid_labels[@]}" | fzf \
      --prompt="suggest > " \
      --border=bold \
      --border-label=" Suggested next steps " \
      --border-label-pos=3 \
      --preview="$_preview_cmd" \
      --preview-window=right:45%:wrap:hidden \
      --preview-label=" Why? " \
      --preview-label-pos=3 \
      --height=50% \
      --margin=1,2 \
      --no-sort \
      --color="border:7,label:7:bold,preview-border:7,preview-label:7:bold,prompt:7:bold,pointer:48,hl:48,hl+:48:bold,header:245" \
      --header="  enter select  │  ? detail  │  esc back" \
      --header-first \
      --pointer=">" \
      --bind "?:toggle-preview" \
      < /dev/tty)

    [[ -z "$picked" || "$picked" == "(back to menu)" ]] && break

    # Strip description after — (em dash) or -- before extracting command
    local _before_dash="${picked%%—*}"
    [[ "$_before_dash" == "$picked" ]] && _before_dash="${picked%% -- *}"
    local run_cmd=$(echo "$_before_dash" | grep -oP 'ruflo\s+\S+(\s+\S+)*' | head -1)
    [[ -z "$run_cmd" ]] && break

    # Parse cmd+sub+args from "ruflo cmd sub arg1 arg2 ..." and run through _rfl_run
    local _scmd=$(echo "$run_cmd" | awk '{print $2}')
    local _ssub=$(echo "$run_cmd" | awk '{print $3}')
    local _sargs=$(echo "$run_cmd" | awk '{for(i=4;i<=NF;i++) printf "%s ", $i}' | sed 's/ *$//')
    echo ""
    print -P "%F{48}▸ ruflo $_scmd $_ssub $_sargs%f"

    # Route through _rfl_run_capture with args from suggestion (no re-prompting)
    if [[ -n "$_sargs" ]]; then
      _rfl_run_capture "$_scmd" "$_ssub" ${=_sargs}
    else
      _rfl_run_capture "$_scmd" "$_ssub"
    fi

    _rfl_log_cmd "$_scmd" "$_ssub"
    # Update last_cmd/last_sub so workflow hints use the latest command
    last_cmd="$_scmd"
    last_sub="$_ssub"
    # _rfl_run_capture already fires _rfl_suggest_bg with $_scmd/$_ssub

    echo ""
    print -P "%F{245}▸ Press any key for next suggestions%f"
    read -sk1 < /dev/tty

    # Wait for new suggestions
    if [[ -n "$_RFL_SUGGEST_PID" ]] && kill -0 "$_RFL_SUGGEST_PID" 2>/dev/null; then
      print -P "%F{245}Loading...%f"
      local _w=0
      while (( _w < 20 )) && kill -0 "$_RFL_SUGGEST_PID" 2>/dev/null; do
        sleep 0.5; ((_w++))
      done
      printf "\033[1A\033[2K"
    fi
  done

  [[ -n "$_RFL_SUGGEST_PID" ]] && kill "$_RFL_SUGGEST_PID" 2>/dev/null
  _RFL_SUGGEST_PID=""
}
