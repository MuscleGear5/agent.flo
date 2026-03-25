# rfl.d/preview.zsh — preview cache generation and fzf scripts
# Sourced by rfl main script

# ── Interactive: dual-panel category drill-down ────────────

# Build preview cache (static, no ruflo calls needed)
PREVIEW_DIR=$(mktemp -d)
trap "rm -rf \"$PREVIEW_DIR\"; rm -f \"$_RFL_SUGGEST_FILE\" \"$_RFL_SUGGEST_DETAIL\" \"$_RFL_HISTORY_FILE\"; [[ -n \$_RFL_SUGGEST_PID ]] && kill \$_RFL_SUGGEST_PID 2>/dev/null" EXIT

for cat in ${(ko)CATEGORIES}; do
  {
    for cmd in ${=CATEGORIES[$cat]}; do
      echo "--- $cmd ---"
      for sub in ${=SUBCMDS[$cmd]}; do
        echo "    $sub"
      done
      echo
    done
  } > "$PREVIEW_DIR/cat_$cat"
done
echo "Fuzzy search all ruflo commands
Type to filter, live help on the right." > "$PREVIEW_DIR/cat_Search_All"
echo "AI-powered ruflo tutor

  Browse all commands with explanations
  Browse 91 project agents
  Browse 30 project skills
  Browse slash commands
  Quiz yourself
  Ask free-form questions" > "$PREVIEW_DIR/cat_Tutor"

# Write a tiny preview helper (avoids quoting hell in --preview)
cat > "$PREVIEW_DIR/cat_preview.sh" <<'PREV'
#!/bin/sh
line="$1"
name="${line%%  *}"
name="$(echo "$name" | sed 's/^ *//')"
safe="$(echo "$name" | tr ' ' '_')"
dir="$2"
if [ -f "$dir/cat_$safe" ]; then
  cat "$dir/cat_$safe"
else
  echo "No preview for: $name"
fi
PREV
chmod +x "$PREVIEW_DIR/cat_preview.sh"

# cmd_preview.sh created below with rfl-managed previews

# Step 1: Build unified list — categories + all commands
typeset -a unified=()

# Category entries (prefixed so we can tell them apart)
for cat in ${(ko)CATEGORIES}; do
  typeset count=0
  for cmd in ${=CATEGORIES[$cat]}; do
    for sub in ${=SUBCMDS[$cmd]}; do ((count++)); done
  done
  unified+=("$(printf '[+]%-14s  %3d cmds  │  %s' "$cat" "$count" "${CATEGORIES[$cat]}")")
done
unified+=("$(printf '[?]%-14s        │  %s' "Tutor" "ask questions, browse, quiz")")

# All commands (searchable)
for cmd in ${(ko)SUBCMDS}; do
  for sub in ${=SUBCMDS[$cmd]}; do
    unified+=("$(printf '   %-14s        │  %s %s' "" "$cmd" "$sub")")
  done
done

# Preview script that handles both categories and commands
cat > "$PREVIEW_DIR/unified_preview.sh" <<'PREV'
#!/bin/sh
line="$1"
dir="$2"
first="$(echo "$line" | sed 's/^[[:space:]]*//' | cut -c1-2)"
if echo "$first" | grep -q '\[+\]'; then
  name="$(echo "$line" | sed 's/^[^[:alpha:]]*//' | sed 's/  .*//')"
  safe="$(echo "$name" | tr ' ' '_')"
  cat "$dir/cat_$safe" 2>/dev/null || echo "No preview"
elif echo "$first" | grep -q '\[?\]'; then
  cat "$dir/cat_Tutor" 2>/dev/null
else
  right="$(echo "$line" | sed 's/.*│[[:space:]]*//')"
  cmd="$(echo "$right" | awk '{print $1}')"
  sub="$(echo "$right" | awk '{print $2}')"
  if [ -n "$cmd" ] && [ -n "$sub" ]; then
    # Check for rfl-managed commands (show real help, not broken CLI)
    if [ -f "$dir/rfl_${cmd}_${sub}" ]; then
      cat "$dir/rfl_${cmd}_${sub}"
    else
      echo "--- $cmd $sub ---"
      echo
      ruflo "$cmd" "$sub" --help 2>&1 | head -30
    fi
  fi
fi
PREV
chmod +x "$PREVIEW_DIR/unified_preview.sh"

# ── RFL-managed command previews (bypass broken CLI help) ──
cat > "$PREVIEW_DIR/rfl_hive-mind_init" <<'HLP'
--- hive-mind init ---
Initialize a new hive-mind collective.

Prompts for topology (mesh/star/ring) then offers
to spawn and auto-join agents via multi-select.

Uses MCP: hive-mind_init, agent_spawn, hive-mind_join
HLP
cat > "$PREVIEW_DIR/rfl_hive-mind_spawn" <<'HLP'
--- hive-mind spawn ---
Spawn a new agent and join it to the hive.

Shows agent type picker (coder, researcher, tester, etc.)
Spawns via MCP and auto-joins to the active hive.

Uses MCP: agent_spawn, hive-mind_join
HLP
cat > "$PREVIEW_DIR/rfl_hive-mind_status" <<'HLP'
--- hive-mind status ---
Show full hive-mind status dashboard.

Displays: topology, total agents, hive members,
agent list with types/status, and active tasks.

Uses MCP: hive-mind_status, agent_list, task_list
HLP
cat > "$PREVIEW_DIR/rfl_hive-mind_task" <<'HLP'
--- hive-mind task ---
Broadcast a task to all hive members.

Prompts for task description, then broadcasts
to all joined agents for execution.

Uses MCP: hive-mind_broadcast (type: task)
HLP
cat > "$PREVIEW_DIR/rfl_hive-mind_join" <<'HLP'
--- hive-mind join ---
Add existing agents to the hive.

Multi-select picker (spacebar to toggle) shows all
agents with type and status. Selected agents are
joined to the active hive.

Uses MCP: hive-mind_join (per agent)
HLP
cat > "$PREVIEW_DIR/rfl_hive-mind_leave" <<'HLP'
--- hive-mind leave ---
Remove agents from the hive.

Multi-select picker shows all agents. Selected
agents are removed from the active hive.

Uses MCP: hive-mind_leave (per agent)
HLP
cat > "$PREVIEW_DIR/rfl_hive-mind_broadcast" <<'HLP'
--- hive-mind broadcast ---
Send a message to all hive members.

Prompts for message text, broadcasts to all
joined agents in the hive.

Uses MCP: hive-mind_broadcast
HLP
cat > "$PREVIEW_DIR/rfl_hive-mind_consensus" <<'HLP'
--- hive-mind consensus ---
Run consensus vote on a topic.

Prompts for topic, initiates vote among hive
members. Shows decision, votes, confidence.

Uses MCP: hive-mind_consensus
HLP
cat > "$PREVIEW_DIR/rfl_hive-mind_memory" <<'HLP'
--- hive-mind memory ---
View shared hive memory.

Lists all key-value entries stored in the
hive's collective memory.

Uses MCP: hive-mind_memory (action: list)
HLP
cat > "$PREVIEW_DIR/rfl_hive-mind_optimize-memory" <<'HLP'
--- hive-mind optimize-memory ---
Optimize hive memory storage.

Compacts and optimizes the hive's shared
memory for better performance.

Uses MCP: hive-mind_memory (action: optimize)
HLP
cat > "$PREVIEW_DIR/rfl_hive-mind_shutdown" <<'HLP'
--- hive-mind shutdown ---
Shut down the active hive-mind.

Terminates the hive collective. Agents remain
spawned but are no longer coordinated.

Uses MCP: hive-mind_shutdown
HLP
cat > "$PREVIEW_DIR/rfl_swarm_start" <<'HLP'
--- swarm start ---
Initialize a swarm with real agents.

Prompts for objective, then multi-select agent
types to spawn. Creates MCP swarm + tasks.

Uses MCP: swarm_init, agent_spawn, task_create
HLP

# Also update the cmd_preview.sh for category submenus
cat > "$PREVIEW_DIR/cmd_preview.sh" <<'PREV'
#!/bin/sh
cmd="$1"
sub="$2"
dir="$(dirname "$0")"
if [ -f "$dir/rfl_${cmd}_${sub}" ]; then
  cat "$dir/rfl_${cmd}_${sub}"
else
  echo "--- $cmd $sub ---"
  echo
  ruflo "$cmd" --help 2>&1 | sed "s/^  $sub /> $sub/"
fi
PREV
chmod +x "$PREVIEW_DIR/cmd_preview.sh"

