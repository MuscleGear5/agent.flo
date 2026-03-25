# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This directory contains Claude Code configurations for multiple AI providers. Each provider has its own settings file that specifies API endpoints, authentication, plugin enablement, and Claude Code behavior flags.

## Provider Configurations

| Provider | Config File | API Endpoint |
|----------|-------------|--------------|
| DeepSeek | `providers/deepseek.json` | `https://api.deepseek.com/anthropic` |
| GLM (Zhipu) | `providers/glm.json` | `https://api.z.ai/api/anthropic` |
| MiniMax | `providers/minimax.json` | `https://api.minimax.io/anthropic` |

## Provider Switching

Use the scripts in the parent `bin/` directory:

```bash
# Switch Claude Code between providers
provider-switch zai        # Use ZAI proxy (GLM)
provider-switch copilot   # Use Copilot OAuth proxy
provider-switch status    # Show current provider

# Switch between GLM and normal Claude Code settings
claude-switch glm     # Use GLM settings
claude-switch normal  # Use normal settings
```

## Environment Variables

API keys are stored in `.env` (gitignored). Copy from `.env.example`:

```bash
ZAI_API_KEY=your-zai-key
DEEPSEEK_API_KEY=your-deepseek-key
MINIMAX_API_KEY=your-minimax-key
```

## Security

- Never commit `.env` - it contains live API keys
- The `.gitignore` prevents `.env` from being tracked
- Provider configs reference keys via environment variable substitution (e.g., `${DEEPSEEK_API_KEY}`)

## Quick Start Commands

Start Claude Code with a specific provider:

```bash
cczai   # ZAI (GLM) provider
ccmm    # MiniMax provider
ccds    # DeepSeek provider
```

All use `--dangerously-skip-permissions` and their respective provider settings file.

## Architecture

Each provider JSON configures:
- **env**: API base URL, auth token, timeout settings
- **enabledPlugins**: Which Claude Code plugins to enable/disable
- **model**: Default model selection (opus/sonnet/haiku)
- **effortLevel**: Claude Code effort level setting
