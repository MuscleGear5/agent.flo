# Handler Interface Contract

Every handler module (`rfl.d/h-*.zsh`) MUST follow this contract.

## File Convention

- **Filename**: `h-<domain>.zsh` (e.g., `h-agent.zsh`, `h-neural.zsh`)
- **Entry function**: `_rfl_run_<domain>` (e.g., `_rfl_run_agent`, `_rfl_run_neural`)
- **Arguments**: `$1` = subcommand, `$@` shifted = remaining args

## Registration

1. `handlers.zsh` MUST source the file: `source "${_hdir}/h-<domain>.zsh"`
2. `handlers.zsh` `_rfl_run` MUST have a case entry: `<domain>) _rfl_run_<domain> "$sub" "$@" ;;`

## Python Inline Scripts

All inline Python blocks MUST:
1. Inject `${_RFL_PYLIB}` as the first line of the Python script
2. Use `pj(sys.stdin.read())` for JSON extraction (not manual brace-matching)
3. Use `sc(status_string)` for status colorization
4. Use `tbl(cols, rows)` for table rendering

```zsh
# CORRECT
echo "$data" | python3 -c "
${_RFL_PYLIB}
d = pj(sys.stdin.read())
# ... use d, sc(), tbl()
" 2>/dev/null

# WRONG — inline brace-matching
echo "$data" | python3 -c "
import sys, json
txt = sys.stdin.read()
i = txt.rindex('}'); n = 0
for k in range(i, -1, -1):
    ...
"
```

## Table Rendering

- **gum tables**: `gum table --separator '|' --border thick --print`
- **Python tables**: `tbl(cols, rows)` from pylib (box-drawing output)
- **Empty state**: `print -P "  %F{245}(none)%f"` or `print('  (none)')`

## Color Convention

- Status words: Use `sc()` or `SC` dict — never hardcode ANSI for statuses
- IDs/keys: `%F{96}` (standard bright cyan)
- Labels/metadata: `%F{245}` (grey)
- Success tags: `%F{48}[OK]%f`, `%F{48}[+]%f`, `%F{48}[-]%f`
- Error tags: `%F{196}[ERROR]%f`, `%F{196}[x]%f`
- Headers: `print -P "%B<Title>%b"` (plain bold, no gum style)

## Error Handling

- MCP failures: Show `[ERROR]` + brief message, not raw output
- Empty results: Show `(none)` or `(no data)`
- Python exceptions: Caught by `except:` with fallback output, stderr to `/dev/null`
- Missing args: `print -P "%F{196}[ERROR] No <field>%f"; return 1`

## Destructive Operations

Commands that modify state (stop, delete, cancel, shutdown, reset) MUST:
```zsh
gum confirm "Stop agent $aid?" --affirmative "Yes" --negative "No" || return 0
```
