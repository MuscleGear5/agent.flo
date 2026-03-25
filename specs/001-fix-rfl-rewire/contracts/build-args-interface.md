# Build Args Interface Contract

The `build_args` function in `build-args.zsh` maps `cmd:sub` pairs to interactive argument prompts.

## Function Signature

```zsh
build_args "$cmd" "$sub"
# Returns: argument string via echo (empty string for no-arg commands)
# Exit code: 0 on success, 1 on user cancel
```

## Case Handler Rules

1. Every `cmd:sub` pair in `commands.zsh` SUBCMDS SHOULD have a case entry
2. Read-only commands (list, status, metrics) MAY fall through to `*) ;;` default
3. Commands requiring user input MUST have an explicit case with gum prompts
4. Multi-word values MUST be encoded as `${val// /__RFL_SP__}` for safe word-splitting

## Prompt Convention

- Selection from known list: `gum filter` or `gum choose`
- Free text input: `gum input --placeholder "..." --header "..." --header.foreground=245`
- Multi-line input: `gum write --placeholder "..." --header "..." --header.foreground 245`
- File selection: `gum file .`
- Multi-select: `gum choose --no-limit --header="..." --header.foreground=7`
- Confirmation: `gum confirm "...?" --affirmative "Yes" --negative "No"`

## Dynamic Lists

Completion fetchers from `completions.zsh` provide live data:
- `_rfl_agents` → agent IDs with type/status labels
- `_rfl_tasks` → task IDs with status labels
- `_rfl_sessions` → session IDs with name labels
- `_rfl_agent_types` → available agent type names
- `_rfl_mcp_tools` → registered MCP tool names
- `_rfl_memory_keys` → stored memory key names
