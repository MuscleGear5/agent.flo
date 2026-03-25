"""rfl_lib — Interactive TUI entry point for ruflo CLI.

Usage:
    python3 -m rfl_lib              Interactive fzf menu
    python3 -m rfl_lib --list       Dump all command paths
    python3 -m rfl_lib --test-all   Test every command (dry-run)
"""
from __future__ import annotations
import os, sys, subprocess, tempfile, re

from rfl_lib.commands import SUBCMDS, CATEGORIES  # pyright: ignore[reportMissingImports]
from rfl_lib import ui, suggest, preview, build_args as ba  # pyright: ignore[reportMissingImports]


def _list_all() -> None:
    """Print all command paths."""
    for cmd in sorted(SUBCMDS):
        for sub in SUBCMDS[cmd].split():
            print(f'ruflo {cmd} {sub}')


def _test_all() -> None:
    """Test each command with --help (dry-run sanity check)."""
    ok = fail = 0
    for cmd in sorted(SUBCMDS):
        for sub in SUBCMDS[cmd].split():
            try:
                r = subprocess.run(
                    ['ruflo', cmd, sub, '--help'],
                    capture_output=True, text=True, timeout=10)
                if r.returncode == 0:
                    print(f'  {ui.GR}✓{ui.R} ruflo {cmd} {sub}')
                    ok += 1
                else:
                    print(f'  {ui.RD}✗{ui.R} ruflo {cmd} {sub}')
                    fail += 1
            except Exception:
                print(f'  {ui.RD}✗{ui.R} ruflo {cmd} {sub} (timeout)')
                fail += 1
    print(f'\n{ok} passed, {fail} failed')


def _run_command(cmd: str, sub: str, extra_args: str = '') -> None:
    """Run a command via ruflo tui, falling back to ruflo directly."""
    args = ['ruflo', 'tui', cmd, sub]
    if extra_args:
        # Decode __RFL_SP__ back to spaces for individual args
        for part in extra_args.split():
            args.append(part.replace('__RFL_SP__', ' '))

    suggest.log_cmd(cmd, sub)
    stdout, rc = ui.spin(f'ruflo {cmd} {sub}', args)
    suggest.last_output = stdout

    # Print output with colorized status words
    for line in stdout.splitlines():
        print(ui.colorize_line(line))

    if rc != 0 and not stdout.strip():
        # Fallback to direct ruflo if tui handler not found
        args2 = ['ruflo', cmd, sub]
        if extra_args:
            for part in extra_args.split():
                args2.append(part.replace('__RFL_SP__', ' '))
        r = subprocess.run(args2, timeout=30)


def _show_suggestions(cmd: str, sub: str) -> None:
    """Show AI suggestions and deterministic hints after a command."""
    # Deterministic workflow hints
    hints = suggest.workflow_hints(cmd, sub)
    for h in hints:
        print(f'{ui.GY}{h}{ui.R}')

    # AI suggestions (if available)
    suggest.wait_for_suggestions(timeout=8)
    suggestions = suggest.get_suggestions()
    if suggestions:
        print(f'\n{ui.CY}  Next steps:{ui.R}')
        for s in suggestions[:5]:
            print(f'  {ui.GY}{s}{ui.R}')
        print()

        # Let user pick a suggestion
        query, selected, rc = ui.fzf(
            suggestions,
            header='Pick a suggestion or press Esc',
            height='8',
            reverse=True,
        )
        if rc == 0 and selected:
            m = re.search(r'ruflo\s+(\S+)\s+(\S+)(.*)$', selected)
            if m:
                _run_command(m.group(1), m.group(2), m.group(3).strip())


def _interactive() -> None:
    """Main interactive loop: fzf menu → select → build args → run → loop."""
    tmpdir = tempfile.mkdtemp(prefix='rfl-preview-')
    try:
        preview.generate(tmpdir)
    except Exception:
        pass

    preview_script = os.path.join(tmpdir, 'unified_preview.sh')
    items = preview.build_unified_list()

    while True:
        preview_cmd = f'{preview_script} {{}} {tmpdir}' if os.path.isfile(preview_script) else ''
        fzf_kwargs = {
            'header': 'ruflo ─ arrow keys / type to filter / enter / esc',
            'height': '100%',
            'reverse': True,
            'ansi': True,
        }
        if preview_cmd:
            fzf_kwargs['preview'] = preview_cmd
            fzf_kwargs['preview_window'] = 'right:40%:wrap'

        query, selected, rc = ui.fzf(items, **fzf_kwargs)

        if rc == 130 or rc == 1:
            # Esc or no match
            break

        if not selected:
            continue

        selected = selected.strip()

        # Category selected: [+]CategoryName
        if selected.startswith('[+]'):
            cat_name = re.sub(r'\s.*', '', selected[3:])
            cat_items = preview.build_category_list(cat_name)
            if not cat_items:
                continue

            cmd_preview = os.path.join(tmpdir, 'cmd_preview.sh')
            cat_preview = f'{cmd_preview} {{1}} {{2}}' if os.path.isfile(cmd_preview) else ''
            cat_kwargs = {
                'header': f'{cat_name} ─ select a command',
                'height': '100%',
                'reverse': True,
            }
            if cat_preview:
                cat_kwargs['preview'] = cat_preview
                cat_kwargs['preview_window'] = 'right:40%:wrap'

            _, cat_sel, cat_rc = ui.fzf(cat_items, **cat_kwargs)
            if cat_rc != 0 or not cat_sel:
                continue

            parts = cat_sel.strip().split()
            cmd, sub = parts[0], parts[1] if len(parts) > 1 else ''
        elif selected.startswith('[?]'):
            # Tutor mode
            os.execvp('rft', ['rft'])
            break
        else:
            # Direct command: extract from right side of │
            right = selected.split('│')[-1].strip() if '│' in selected else selected.strip()
            parts = right.split()
            if len(parts) < 2:
                continue
            cmd, sub = parts[0], parts[1]

        if cmd not in SUBCMDS:
            continue

        # Build interactive args
        args = ba.build_args(cmd, sub)
        if args is None:
            continue  # User cancelled

        # Fire AI suggestions in background
        suggest.fire_bg(cmd, sub)

        # Run the command
        _run_command(cmd, sub, args)

        # Show suggestions
        _show_suggestions(cmd, sub)


def main() -> None:
    if len(sys.argv) > 1:
        flag = sys.argv[1]
        if flag == '--list':
            _list_all()
            return
        if flag == '--test-all':
            _test_all()
            return
        # Unknown flag — pass through to ruflo
        os.execvp('ruflo', ['ruflo'] + sys.argv[1:])
        return

    _interactive()


if __name__ == '__main__':
    main()
