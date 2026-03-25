# rfl.d/handlers.zsh — dispatch to domain handler modules
# Sourced by rfl main script

# ── Source domain modules ─────────────────────────────────
_hdir="${0:A:h}"
source "${_hdir}/h-swarm.zsh"
source "${_hdir}/h-hive.zsh"
source "${_hdir}/h-hive2.zsh"
source "${_hdir}/h-agent.zsh"
source "${_hdir}/h-task.zsh"
source "${_hdir}/h-session.zsh"
source "${_hdir}/h-workflow.zsh"
source "${_hdir}/h-memory.zsh"
source "${_hdir}/h-neural.zsh"
source "${_hdir}/h-misc.zsh"

_rfl_run() {
  local cmd="$1" sub="$2"; shift 2
  case "$cmd" in
    swarm)     _rfl_run_swarm   "$sub" "$@" ;;
    hive-mind) _rfl_run_hive    "$sub" "$@" ;;
    agent)     _rfl_run_agent   "$sub" "$@" ;;
    task)      _rfl_run_task    "$sub" "$@" ;;
    session)   _rfl_run_session "$sub" "$@" ;;
    workflow)  _rfl_run_wf      "$sub" "$@" ;;
    memory)    _rfl_run_memory  "$sub" "$@" ;;
    neural)    _rfl_run_neural  "$sub" "$@" ;;
    status|mcp|config|hooks|progress)
      _rfl_run_misc "$cmd" "$sub" "$@" && return
      _rfl_run_default "$cmd" "$sub" "$@"
      ;;
    *)         _rfl_run_default "$cmd" "$sub" "$@" ;;
  esac
}

_rfl_run_default() {
  local cmd="$1" sub="$2"; shift 2
  local -a _decoded=()
  for _a in "$@"; do
    _decoded+=("${_a//__RFL_SP__/ }")
  done
  echo ""
  print -P "%B$cmd $sub%b"
  echo ""
  local _out
  _out=$(_rfl_spin "Running..." ruflo "$cmd" "$sub" "${_decoded[@]}")
  echo "$_out" | _rfl_colorize
}
