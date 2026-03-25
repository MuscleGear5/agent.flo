#!/bin/zsh
# rfl-wave2-dispatch.sh — Ruflo-coordinated parallel pylib migration
# Spawns 6 headless claude -p workers, one per handler file
# Each worker edits its assigned file to replace inline brace-matching with pj()

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="/tmp/rfl-wave2-$$"
mkdir -p "$LOG_DIR"

echo "=== Wave 2: Pylib Migration (6 parallel workers) ==="
echo "Repo: $REPO_ROOT"
echo "Logs: $LOG_DIR"
echo ""

# ── Worker 1: h-agent.zsh ──────────────────────────────────
(
  echo "[w-hagent] Starting..."
  ruflo mcp exec --tool task_update -p '{"taskId":"task-1774408137710-u5aarz","status":"in_progress"}' >/dev/null 2>&1
  claude -p "You are editing $REPO_ROOT/rfl/rfl.d/h-agent.zsh to replace ALL inline JSON brace-matching with pj() from pylib.

RULES:
- pylib.py defines: pj(raw) which extracts JSON from noisy MCP output. It also defines R, GR, YL, RD, OR, GY, CY, SC, sc(), tbl(), vl().
- \${_RFL_PYLIB} injects all of pylib's code. It already does 'import sys, json, re'.

EDITS NEEDED (4 instances):

1. In 'list' function: The block starting with 'try:' has 6 lines of inline brace-matching (txt.rindex, for k in range..., json.loads). Replace those 6 lines with just: txt=sys.stdin.read(); d=pj(txt). Keep the try: wrapper and everything after d=...

2. In 'status' function: Replace 'try: d=json.loads(txt[txt.index(...)...' with just 'd=pj(txt)'. The \${_RFL_PYLIB} is already injected.

3. In 'pool' function: This block starts with 'import sys,json' instead of \${_RFL_PYLIB}. Replace 'import sys,json' with '\${_RFL_PYLIB}' (literally the string \\\${_RFL_PYLIB} in the zsh heredoc), then replace the 6-line brace-matching with 'd=pj(sys.stdin.read())'.

4. In 'health' function: Replace the 6-line brace-matching block (txt.rindex, for k in range, json.loads) with just 'd=pj(txt)'. pylib is already injected.

Read the file first, make all 4 edits, verify no inline brace-matching remains." \
    --allowedTools "Edit,Read" \
    > "$LOG_DIR/w-hagent.log" 2>&1
  ruflo mcp exec --tool task_update -p '{"taskId":"task-1774408137710-u5aarz","status":"completed"}' >/dev/null 2>&1
  echo "[w-hagent] Done"
) &
PID1=$!

# ── Worker 2: h-session.zsh ────────────────────────────────
(
  echo "[w-hsession] Starting..."
  ruflo mcp exec --tool task_update -p '{"taskId":"task-1774408142690-mi2nm0","status":"in_progress"}' >/dev/null 2>&1
  claude -p "You are editing $REPO_ROOT/rfl/rfl.d/h-session.zsh to replace inline JSON parsing with pj() from pylib.

CONTEXT: pylib.py defines pj(raw) which extracts JSON from noisy output. \${_RFL_PYLIB} injects all pylib code including 'import sys, json, re' and constants R, GR, SC, sc(), etc.

EDITS NEEDED (2 instances):

1. In 'list' function (around line 14-31): The python3 block starts with 'import sys,json'. Replace 'import sys,json' with '\${_RFL_PYLIB}' (literally the zsh variable reference). Then replace the 6-line brace-matching (txt.rindex, for k in range..., json.loads) with 'txt=sys.stdin.read(); d=pj(txt)'. Also change the table separator from comma to pipe: change print('ID,Name') to print('ID|Name') and change f'{sid},{name}' to f'{sid}|{name}'. And update the gum table call from --separator ',' to --separator '|'.

2. In 'current' function (around line 87-100): Same pattern. Replace 'import sys,json' with '\${_RFL_PYLIB}'. Replace the 6-line brace-matching with 'txt=sys.stdin.read(); d=pj(txt)'.

Read the file first, make both edits." \
    --allowedTools "Edit,Read" \
    > "$LOG_DIR/w-hsession.log" 2>&1
  ruflo mcp exec --tool task_update -p '{"taskId":"task-1774408142690-mi2nm0","status":"completed"}' >/dev/null 2>&1
  echo "[w-hsession] Done"
) &
PID2=$!

# ── Worker 3: h-workflow.zsh ───────────────────────────────
(
  echo "[w-hworkflow] Starting..."
  ruflo mcp exec --tool task_update -p '{"taskId":"task-1774408145522-qqhuau","status":"in_progress"}' >/dev/null 2>&1
  claude -p "You are editing $REPO_ROOT/rfl/rfl.d/h-workflow.zsh to replace inline JSON parsing with pj() from pylib.

CONTEXT: pylib.py defines pj(raw). \${_RFL_PYLIB} injects all pylib code.

EDITS NEEDED (3 instances):

1. In 'list' function (around line 14-32): Replace 'import sys,json' with '\${_RFL_PYLIB}'. Replace 6-line brace-matching with 'txt=sys.stdin.read(); d=pj(txt)'. Change separator from comma to pipe: print('ID,Name,Status') to print('ID|Name|Status'), and f-string commas to pipes. Update gum table from --separator ',' to --separator '|'.

2. In 'status' function (around line 62-84): Already has \${_RFL_PYLIB}. Replace the 6-line brace-matching (lines 66-70) with 'txt=sys.stdin.read(); d=pj(txt)'.

3. In 'template' function (around line 109-125): Replace 'import sys,json' with '\${_RFL_PYLIB}'. Replace the 6-line brace-matching with 'txt=sys.stdin.read(); d=pj(txt)'.

Read the file first, make all 3 edits." \
    --allowedTools "Edit,Read" \
    > "$LOG_DIR/w-hworkflow.log" 2>&1
  ruflo mcp exec --tool task_update -p '{"taskId":"task-1774408145522-qqhuau","status":"completed"}' >/dev/null 2>&1
  echo "[w-hworkflow] Done"
) &
PID3=$!

# ── Worker 4: h-misc.zsh ──────────────────────────────────
(
  echo "[w-hmisc] Starting..."
  ruflo mcp exec --tool task_update -p '{"taskId":"task-1774408147610-b7j1s6","status":"in_progress"}' >/dev/null 2>&1
  claude -p "You are editing $REPO_ROOT/rfl/rfl.d/h-misc.zsh to replace inline JSON parsing and local ANSI code declarations with pj()/SC from pylib.

CONTEXT: pylib.py defines pj(raw), sc(s), and ANSI constants R, GR, YL, RD, OR, GY, CY, B plus the SC dict. \${_RFL_PYLIB} injects all of this.

EDITS NEEDED (5 instances):

1. mcp:status (around line 15-26): Replace 'import sys,json' and the local ANSI declarations (R, GR, RD, CY) with '\${_RFL_PYLIB}'. Replace 'd=json.loads(txt[txt.index(...)...])' with 'd=pj(txt)'. Use the existing SC/R constants from pylib instead of local GR/RD/CY. Keep run=d.get('running',False) check but use GR and RD from pylib.

2. config:get (around line 39-47): Replace 'import sys,json' and 'CY=...; R=...' with '\${_RFL_PYLIB}'. Replace json.loads line with 'd=pj(txt)'.

3. hooks:list (around line 85-97): Replace 'import sys,json' with '\${_RFL_PYLIB}'. Replace json.loads line with 'd=pj(txt)'.

4. hooks:metrics (around line 111-118): Replace 'import sys,json' and 'CY=...; R=...' with '\${_RFL_PYLIB}'. Replace json.loads line with 'd=pj(txt)'.

5. progress (around line 134-151): Already has \${_RFL_PYLIB}. Just replace 'try: d=json.loads(txt[txt.index(...)...])' with 'd=pj(txt)'.

Read the file first, make all 5 edits." \
    --allowedTools "Edit,Read" \
    > "$LOG_DIR/w-hmisc.log" 2>&1
  ruflo mcp exec --tool task_update -p '{"taskId":"task-1774408147610-b7j1s6","status":"completed"}' >/dev/null 2>&1
  echo "[w-hmisc] Done"
) &
PID4=$!

# ── Worker 5: h-neural.zsh ────────────────────────────────
(
  echo "[w-hneural] Starting..."
  ruflo mcp exec --tool task_update -p '{"taskId":"task-1774408150134-9i676z","status":"in_progress"}' >/dev/null 2>&1
  claude -p "You are editing $REPO_ROOT/rfl/rfl.d/h-neural.zsh to replace ALL inline JSON parsing with pj() from pylib.

CONTEXT: pylib.py defines pj(raw). \${_RFL_PYLIB} injects all pylib code including 'import sys, json, re'.

EDITS NEEDED (4 python3 blocks with inline brace-matching):

1. status (around line 14-27): Replace 'import sys,json' with '\${_RFL_PYLIB}'. Replace the 6-line brace-matching (txt.rindex, for k in range...) with 'txt=sys.stdin.read(); d=pj(txt)'.

2. patterns (around line 40-60): Same. Replace 'import sys,json' with '\${_RFL_PYLIB}'. Replace brace-matching with 'd=pj(txt)'.

3. predict (around line 75-99): Same. Replace 'import sys,json' with '\${_RFL_PYLIB}'. Replace brace-matching with 'd=pj(txt)'.

4. optimize (around line 137-149): Same. Replace 'import sys,json' with '\${_RFL_PYLIB}'. Replace brace-matching with 'd=pj(txt)'.

Read the file first, make all 4 edits. After editing, verify no 'txt.rindex' remains in the file." \
    --allowedTools "Edit,Read" \
    > "$LOG_DIR/w-hneural.log" 2>&1
  ruflo mcp exec --tool task_update -p '{"taskId":"task-1774408150134-9i676z","status":"completed"}' >/dev/null 2>&1
  echo "[w-hneural] Done"
) &
PID5=$!

# ── Worker 6: completions.zsh ─────────────────────────────
(
  echo "[w-completions] Starting..."
  ruflo mcp exec --tool task_update -p '{"taskId":"task-1774408152334-6ca2rt","status":"in_progress"}' >/dev/null 2>&1
  claude -p "You are editing $REPO_ROOT/rfl/rfl.d/completions.zsh to replace inline JSON parsing with pj() from pylib.

CONTEXT: pylib.py defines pj(raw). \${_RFL_PYLIB} injects all pylib code.

EDITS NEEDED (4 fetcher functions):

1. _rfl_agents (around line 23-32): Replace 'import sys,json' with '\${_RFL_PYLIB}'. Replace 'start = txt.index(\"{\"); data = json.loads(txt[start:txt.rindex(\"}\")+1])' with 'data = pj(txt)'. Remove the 'start' variable.

2. _rfl_tasks (around line 35-44): Same pattern. Replace 'import sys,json' with '\${_RFL_PYLIB}'. Replace start/json.loads with 'data = pj(txt)'.

3. _rfl_sessions (around line 47-56): Same pattern.

4. _rfl_workflows (around line 70-83): Same pattern.

Read the file first, make all 4 edits." \
    --allowedTools "Edit,Read" \
    > "$LOG_DIR/w-completions.log" 2>&1
  ruflo mcp exec --tool task_update -p '{"taskId":"task-1774408152334-6ca2rt","status":"completed"}' >/dev/null 2>&1
  echo "[w-completions] Done"
) &
PID6=$!

# ── Wait for all workers ──────────────────────────────────
echo "Dispatched 6 workers: PIDs $PID1 $PID2 $PID3 $PID4 $PID5 $PID6"
echo "Waiting for completion..."
echo ""

FAILURES=0
for pid in $PID1 $PID2 $PID3 $PID4 $PID5 $PID6; do
  if ! wait $pid; then
    echo "[FAIL] Worker PID $pid exited non-zero"
    ((FAILURES++))
  fi
done

echo ""
echo "=== Wave 2 Complete ==="
echo "Workers: 6 dispatched, $((6 - FAILURES)) succeeded, $FAILURES failed"
echo "Logs: $LOG_DIR/"
ruflo swarm status 2>&1 | head -15
