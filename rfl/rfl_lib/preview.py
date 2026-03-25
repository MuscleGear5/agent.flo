"""Preview cache generation for fzf menus."""
from __future__ import annotations
import os, stat
from rfl_lib.commands import SUBCMDS, CATEGORIES  # pyright: ignore[reportMissingImports]

# Static hive-mind command previews
_HIVE_PREVIEWS = {
    'hive-mind_init': 'Initialize a new hive-mind collective.\nPrompts for topology then offers to spawn and auto-join agents.',
    'hive-mind_spawn': 'Spawn a new agent and join it to the hive.\nShows agent type picker.',
    'hive-mind_status': 'Show full hive-mind status dashboard.\nDisplays: topology, agents, tasks.',
    'hive-mind_task': 'Broadcast a task to all hive members.\nPrompts for description, then broadcasts.',
    'hive-mind_join': 'Add existing agents to the hive.\nMulti-select picker shows all agents.',
    'hive-mind_leave': 'Remove agents from the hive.',
    'hive-mind_broadcast': 'Send a message to all hive members.',
    'hive-mind_consensus': 'Run consensus vote on a topic.',
    'hive-mind_memory': 'View shared hive memory entries.',
    'hive-mind_optimize-memory': 'Optimize hive memory storage.',
    'hive-mind_shutdown': 'Shut down the active hive-mind.',
    'swarm_start': 'Initialize a swarm with real agents.\nPrompts for objective, then multi-select agent types.',
}


def generate(preview_dir: str) -> None:
    """Generate preview cache files in the given directory."""
    # Category previews
    for cat, cmds_str in sorted(CATEGORIES.items()):
        lines = []
        for cmd in cmds_str.split():
            if cmd in SUBCMDS:
                lines.append(f'--- {cmd} ---')
                for sub in SUBCMDS[cmd].split():
                    lines.append(f'    {sub}')
                lines.append('')
        with open(os.path.join(preview_dir, f'cat_{cat}'), 'w') as f:
            f.write('\n'.join(lines))

    with open(os.path.join(preview_dir, 'cat_Search_All'), 'w') as f:
        f.write('Fuzzy search all ruflo commands\nType to filter, live help on the right.\n')

    with open(os.path.join(preview_dir, 'cat_Tutor'), 'w') as f:
        f.write('AI-powered ruflo tutor\n\n  Browse all commands with explanations\n  Browse agents and skills\n  Quiz yourself\n  Ask free-form questions\n')

    # Hive-mind / swarm previews
    for key, text in _HIVE_PREVIEWS.items():
        parts = key.split('_', 1)
        cmd, sub = parts[0], parts[1] if len(parts) > 1 else ''
        fname = f'rfl_{cmd}_{sub}'
        with open(os.path.join(preview_dir, fname), 'w') as f:
            f.write(f'--- {cmd} {sub} ---\n{text}\n')

    # unified_preview.sh — handles categories + commands
    script = r'''#!/bin/sh
line="$1"
dir="$2"
first="$(echo "$line" | sed 's/^[[:space:]]*//' | cut -c1-3)"
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
    if [ -f "$dir/rfl_${cmd}_${sub}" ]; then
      cat "$dir/rfl_${cmd}_${sub}"
    else
      echo "--- $cmd $sub ---"
      echo
      ruflo "$cmd" "$sub" --help 2>&1 | head -30
    fi
  fi
fi
'''
    _write_script(os.path.join(preview_dir, 'unified_preview.sh'), script)

    # cmd_preview.sh — for category submenus
    script2 = r'''#!/bin/sh
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
'''
    _write_script(os.path.join(preview_dir, 'cmd_preview.sh'), script2)


def build_unified_list() -> list[str]:
    """Build the unified fzf menu list: categories + all commands."""
    items: list[str] = []
    for cat in sorted(CATEGORIES):
        count = sum(len(SUBCMDS.get(cmd, '').split()) for cmd in CATEGORIES[cat].split())
        cmds = CATEGORIES[cat]
        items.append(f'[+]{cat:<14s}  {count:3d} cmds  │  {cmds}')
    items.append(f'[?]{"Tutor":<14s}        │  ask questions, browse, quiz')
    for cmd in sorted(SUBCMDS):
        for sub in SUBCMDS[cmd].split():
            items.append(f'   {"":14s}        │  {cmd} {sub}')
    return items


def build_category_list(category: str) -> list[str]:
    """Build command list for a category submenu."""
    items: list[str] = []
    for cmd in CATEGORIES.get(category, '').split():
        if cmd in SUBCMDS:
            for sub in SUBCMDS[cmd].split():
                items.append(f'{cmd} {sub}')
    return items


def _write_script(path: str, content: str) -> None:
    with open(path, 'w') as f:
        f.write(content)
    os.chmod(path, stat.S_IRWXU | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH)
