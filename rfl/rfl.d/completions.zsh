# rfl.d/completions.zsh — live data fetchers and completion helpers
# Sourced by rfl main script

# ── Live data fetchers ────────────────────────────────────
# Parse ruflo table rows: extract non-header data rows
# ruflo tables use ┃ as column separator
_rfl_table_col() {
  local col="$1"
  awk -F'┃' -v c="$col" '
    /┣/ { next }
    /┗/ { next }
    /┏/ { next }
    /┃/ {
      gsub(/^[ \t]+|[ \t]+$/, "", $c)
      if ($c != "" && $c !~ /^(ID|Type|Status|Name|Key|Tool|Created|Last|Count|Priority|Description)/)
        print $c
    }
  '
}

_rfl_agents() {
  # Use MCP tool for full agent IDs + type labels
  ruflo mcp exec --tool agent_list 2>&1 | python3 -c "
${_RFL_PYLIB}
try:
  txt = sys.stdin.read()
  data = pj(txt)
  for a in data.get('agents', []):
    print(f\"{a['agentId']}  ({a['agentType']} / {a['status']})\")
except: pass
" 2>/dev/null
}
_rfl_tasks() {
  ruflo mcp exec --tool task_list 2>&1 | python3 -c "
${_RFL_PYLIB}
try:
  txt = sys.stdin.read()
  data = pj(txt)
  for t in data.get('tasks', []):
    print(f\"{t.get('taskId', t.get('id',''))}  ({t.get('status','')})\")
except: pass
" 2>/dev/null
}
_rfl_sessions() {
  ruflo mcp exec --tool session_list 2>&1 | python3 -c "
${_RFL_PYLIB}
try:
  txt = sys.stdin.read()
  data = pj(txt)
  for s in data.get('sessions', []):
    print(f\"{s.get('sessionId', s.get('id',''))}  ({s.get('name','')})\")
except: pass
" 2>/dev/null
}
_rfl_memory_keys() { ruflo memory list 2>&1 | _rfl_table_col 2; }
_rfl_agent_types() { ruflo agent spawn -t __invalid__ 2>&1 | grep -oP 'Must be one of: \K.*' | tr ', ' '\n' | grep -v '^$'; }
_rfl_mcp_tools() { ruflo mcp tools 2>&1 | awk '/^  [a-z_]/ {print $1}'; }
_rfl_mcp_servers() { ruflo mcp status 2>&1 | _rfl_table_col 2; }
_rfl_plugins() { ruflo plugins list 2>&1 | _rfl_table_col 2; }
_rfl_config_keys() { ruflo config get 2>&1 | _rfl_table_col 2; }
_rfl_hooks() { ruflo hooks list 2>&1 | _rfl_table_col 2; }
_rfl_workflows() {
  # Try MCP first for full workflow IDs, fallback to table parse
  local mcp_out
  mcp_out=$(ruflo mcp exec --tool workflow_list 2>&1)
  if echo "$mcp_out" | grep -q '{'; then
    echo "$mcp_out" | python3 -c "
${_RFL_PYLIB}
try:
  txt = sys.stdin.read()
  data = pj(txt)
  for w in data.get('workflows', data.get('items', [])):
    wid = w.get('workflowId', w.get('id', ''))
    name = w.get('name', w.get('template', ''))
    status = w.get('status', '')
    label = ' / '.join(filter(None, [name, status]))
    if wid: print(f\"{wid}  ({label})\")
except: pass
" 2>/dev/null
  else
    ruflo workflow list 2>&1 | _rfl_table_col 2
  fi
}
_rfl_deploy_envs() { ruflo deployment environments 2>&1 | _rfl_table_col 2; }
_rfl_deploy_ids() { ruflo deployment history 2>&1 | _rfl_table_col 2; }
_rfl_providers() { ruflo providers list 2>&1 | _rfl_table_col 2; }
_rfl_collections() { ruflo embeddings collections 2>&1 | _rfl_table_col 2; }

