#!/bin/sh
# pyrfl — Python TUI wrapper for ruflo CLI (v3-mode)
# Symlinked from ~/bin/pyrfl for live-edit reflection
PYRFL_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
PYTHONPATH="$PYRFL_DIR${PYTHONPATH:+:$PYTHONPATH}" exec python3 -m pyrfl "$@"
