# Quickstart: Verifying rfl TUI Fixes

**Branch**: `001-fix-rfl-rewire` | **Date**: 2026-03-25

## Prerequisites

- `ruflo` CLI installed (`npm i -g ruflo` or `npx ruflo`)
- `gum` >= 0.13 (`brew install gum` or `go install github.com/charmbracelet/gum@latest`)
- `fzf` >= 0.40 (`sudo apt install fzf` or `brew install fzf`)
- `python3` >= 3.10 in PATH
- `rfl` symlinked to repo: `ln -sf ~/Workspaces/claude-code/agent.flo/rfl/rfl ~/.config/zsh/bin/ai/rfl`

## Verification Checklist

### 1. Dependency Check (FR-001)

```bash
# Should show error naming ruflo
PATH=/usr/bin rfl            # Expect: "Error: ruflo not found"

# Should launch normally
rfl                           # Expect: fzf menu appears
```

### 2. Neural Handler Wiring (FR-002)

```bash
rfl neural status             # Should show neural status table (not raw ruflo output)
rfl neural patterns           # Should show formatted patterns
```

### 3. Shared Pylib Usage (FR-003, FR-013, FR-014)

```bash
# These should all show box-drawing tables, not raw JSON
rfl agent list
rfl task list
rfl session list
rfl workflow list
rfl memory list
```

### 4. Topology Consistency (FR-004, FR-005)

```bash
# Interactive swarm init should use hierarchical-mesh
rfl swarm init
# Verify:
cat .claude-flow/swarm/swarm-state.json | grep topology
# Expect: "hierarchical-mesh"
```

### 5. API Key Security (FR-006, FR-007)

```bash
# Set key via env var
export DEEPSEEK_API_KEY="test-key"
rfl agent list                # Run any command, check suggestions appear

# Verify no file path references
grep -r '~/.keys' rfl/rfl.d/  # Should return nothing

# Verify key not in process args
ps aux | grep deepseek        # Key should NOT appear in args
```

### 6. Table Consistency (FR-010)

```bash
# All should use pipe separator + thick borders
rfl agent list
rfl task list
rfl session list
rfl hooks metrics
```

### 7. Integration Test

```bash
rfl --test-all                # All commands should PASS or WARN (no FAIL)
```

## Expected Output Styles

**Tables**: Box-drawing characters (`┏━┳┓┃┣╋┫┗┻┛`), thick gum borders
**Headers**: Plain bold text (`%B...%b`), no gum style boxes
**Colors**: Status-semantic only (green=active, yellow=idle, red=error, grey=done)
**IDs/Keys**: Standard cyan (`%F{96}`), not neon cyan (`%F{51}`)
**fzf menus**: Neutral palette (`border:7, pointer:48, hl:48`)
